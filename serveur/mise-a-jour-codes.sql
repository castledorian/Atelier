-- Mise à jour « codes » (version 1.13) — à exécuter UNE FOIS dans Supabase (SQL Editor → New query → Run).
-- Sans danger si exécutée plusieurs fois. À exécuter APRÈS mise-a-jour-fiabilite.sql (et donc après toutes les autres).
-- Une installation neuve avec schema.sql est déjà à jour.
--
-- Ce qu'elle apporte :
--   1. Les codes des élèves ne sont plus stockés en clair : seule une empreinte (SHA-256 salée d'un secret du serveur) est conservée.
--      Le code n'est montré qu'à la création de l'élève ou quand on le régénère (fiche à imprimer à ce moment-là).
--   2. « Nouveaux codes pour toute la classe » (réimpression des fiches).
--   3. Registre des mises à jour appliquées (private.schema_migrations), affiché par public.server_version().
--
-- TRANSITION SANS RISQUE : les codes déjà distribués continuent de fonctionner, et les codes existants restent LISIBLES
-- dans l'espace enseignant tant que vous n'avez pas exécuté, volontairement, l'étape finale de ce fichier :
--     select private.wipe_plain_codes();
-- (à lancer quand les enseignants ont imprimé leurs fiches ; irréversible : il faudra alors régénérer les codes pour les revoir).

-- Registre des mises à jour appliquées : chaque fichier « mise-a-jour-*.sql » récent s'y inscrit en fin d'exécution.
create table if not exists private.schema_migrations (
  id         text primary key,
  applied_at timestamptz not null default now()
);
alter table private.schema_migrations enable row level security;

-- ───────────────────────── 1. Empreinte des codes ─────────────────────────

create table if not exists private.app_settings (
  key   text primary key,
  value text not null
);
alter table private.app_settings enable row level security;

-- Secret du serveur (« poivre ») mêlé à chaque code avant l'empreinte : une copie de la seule table des élèves ne permet pas de retrouver les codes.
insert into private.app_settings (key, value)
values ('code_pepper', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''))
on conflict (key) do nothing;

create or replace function private.code_hash(p text) returns text
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  return encode(sha256(convert_to((select value from private.app_settings where key = 'code_pepper') || ':' || private.norm_code(p), 'UTF8')), 'hex');
end $$;

alter table public.students add column if not exists code_hash text;
update public.students set code_hash = private.code_hash(access_code) where code_hash is null and access_code is not null;
alter table public.students alter column code_hash set not null;
create unique index if not exists students_code_hash_key on public.students (code_hash);
alter table public.students alter column access_code drop not null;

-- Étape finale, À LANCER VOLONTAIREMENT : efface les codes encore lisibles (élèves créés avant cette mise à jour).
create or replace function private.wipe_plain_codes() returns bigint
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_n bigint;
begin
  update public.students set access_code = null where access_code is not null;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- ───────────────────────── 2. Fonctions qui lisent ou créent les codes ─────────────────────────

create or replace function public.student_login(p_code text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  hdr     text := nullif(current_setting('request.headers', true), '');
  v_ip    text := coalesce(nullif(btrim(split_part(coalesce(hdr::json ->> 'x-forwarded-for', ''), ',', 1)), ''), 'local');
  v_s     public.students%rowtype;
  v_token text;
begin
  delete from private.login_attempts where at < now() - interval '1 day';
  -- limites : 30 refus / 10 min par adresse, 1 500 refus / 10 min au total (la devinette est ainsi impraticable)
  if (select count(*) from private.login_attempts where ip = v_ip and at > now() - interval '10 minutes') >= 30
     or (select count(*) from private.login_attempts where at > now() - interval '10 minutes') >= 1500 then
    return jsonb_build_object('error', 'rate_limited');
  end if;

  select * into v_s from public.students where code_hash = private.code_hash(p_code);
  if not found then
    insert into private.login_attempts (ip) values (v_ip);
    return jsonb_build_object('error', 'invalid_code');
  end if;

  -- on garde au plus 20 connexions par élève
  delete from public.student_sessions
  where student_id = v_s.id
    and (expires_at < now() or token_hash in (
      select token_hash from public.student_sessions where student_id = v_s.id
      order by created_at desc offset 19));

  v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  insert into public.student_sessions (token_hash, student_id, expires_at)
  values (private.hash_token(v_token), v_s.id, now() + interval '30 days');

  return jsonb_build_object(
    'token', v_token,
    'student', jsonb_build_object('id', v_s.id, 'name', v_s.name),
    'class',   (select jsonb_build_object('id', c.id, 'name', c.name, 'session_config', c.session_config)
                from public.classes c where c.id = v_s.class_id),
    'school',  (select jsonb_build_object('id', sc.id, 'name', sc.name)
                from public.schools sc where sc.id = v_s.school_id));
end $$;

-- Ajoute des élèves (un prénom ou pseudo par ligne) et renvoie leurs codes UNE SEULE FOIS. Les doublons de la classe sont ignorés.
create or replace function public.add_students(p_class uuid, p_names text[]) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_c     public.classes%rowtype;
  v_raw   text;
  v_n     text;
  v_code  text;
  v_id    uuid;
  v_out   jsonb := '[]'::jsonb;
  v_tries int;
begin
  select * into v_c from public.classes where id = p_class;
  if not found then raise exception 'forbidden' using errcode = '42501'; end if;
  perform private.assert_member(v_c.school_id);
  if coalesce(array_length(p_names, 1), 0) > 60 then raise exception 'too_many' using errcode = '54000'; end if;

  foreach v_raw in array coalesce(p_names, array[]::text[]) loop
    v_n := left(private.clean_name(v_raw), 24);
    continue when v_n = '';
    continue when exists (select 1 from public.students s where s.class_id = p_class and lower(s.name) = lower(v_n));
    if (select count(*) from public.students where school_id = v_c.school_id) >= 1500 then
      raise exception 'limit_reached' using errcode = '54000';
    end if;
    v_tries := 0;
    loop
      v_tries := v_tries + 1;
      v_code := private.new_code();
      begin
        insert into public.students (school_id, class_id, name, code_hash)
        values (v_c.school_id, p_class, v_n, private.code_hash(v_code)) returning id into v_id;
        exit;
      exception when unique_violation then
        if v_tries >= 10 then raise; end if;
      end;
    end loop;
    v_out := v_out || jsonb_build_object('id', v_id, 'name', v_n, 'access_code', v_code);
  end loop;
  return v_out;
end $$;

-- Nouveau code pour un élève (code perdu ou partagé) : l'ancien code et les connexions en cours cessent de fonctionner. Le code n'est montré qu'ici.
create or replace function public.reset_student_code(p_student uuid) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_s    public.students%rowtype;
  v_code text;
  v_tries int := 0;
begin
  select * into v_s from public.students where id = p_student;
  if not found then raise exception 'forbidden' using errcode = '42501'; end if;
  perform private.assert_member(v_s.school_id);
  loop
    v_tries := v_tries + 1;
    v_code := private.new_code();
    begin
      update public.students set code_hash = private.code_hash(v_code), access_code = null where id = p_student;
      exit;
    exception when unique_violation then
      if v_tries >= 10 then raise; end if;
    end;
  end loop;
  delete from public.student_sessions where student_id = p_student;
  return v_code;
end $$;

-- Nouveaux codes pour TOUTE une classe (pour réimprimer les fiches) : les anciens codes et les connexions en cours cessent de fonctionner.
create or replace function public.reset_class_codes(p_class uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_c     public.classes%rowtype;
  v_st    record;
  v_code  text;
  v_tries int;
  v_out   jsonb := '[]'::jsonb;
begin
  select * into v_c from public.classes where id = p_class;
  if not found then raise exception 'forbidden' using errcode = '42501'; end if;
  perform private.assert_member(v_c.school_id);
  for v_st in select id, name from public.students where class_id = p_class order by lower(name) loop
    v_tries := 0;
    loop
      v_tries := v_tries + 1;
      v_code := private.new_code();
      begin
        update public.students set code_hash = private.code_hash(v_code), access_code = null where id = v_st.id;
        exit;
      exception when unique_violation then
        if v_tries >= 10 then raise; end if;
      end;
    end loop;
    v_out := v_out || jsonb_build_object('id', v_st.id, 'name', v_st.name, 'access_code', v_code);
  end loop;
  delete from public.student_sessions where student_id in (select id from public.students where class_id = p_class);
  return v_out;
end $$;

-- ───────────────────────── 3. Version du serveur ─────────────────────────

create or replace function public.server_version() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_run  text := coalesce((select pg_get_functiondef(p.oid) from pg_proc p
                           where p.pronamespace = 'public'::regnamespace and p.proname = 'submit_run' and p.pronargs = 13), '');
  v_ses  text := coalesce((select pg_get_functiondef(p.oid) from pg_proc p
                           where p.pronamespace = 'public'::regnamespace and p.proname = 'submit_session_run' and p.pronargs = 11), '');
  v_ov   text := coalesce((select pg_get_functiondef(p.oid) from pg_proc p
                           where p.pronamespace = 'public'::regnamespace and p.proname = 'class_overview'), '');
  v_login text := coalesce((select pg_get_functiondef(p.oid) from pg_proc p
                            where p.pronamespace = 'public'::regnamespace and p.proname = 'student_login'), '');
  v_cron boolean := false;
  f      jsonb;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if to_regclass('cron.job') is not null then
    execute 'select exists (select 1 from cron.job where jobname = ''atelier-purge'')' into v_cron;
  end if;
  f := jsonb_build_object(
    'seances',     to_regclass('public.class_sessions') is not null and v_run <> '' and v_ses <> '',
    'securite',    to_regprocedure('private.run_violation(text,integer,integer,numeric,numeric,integer,integer)') is not null
                   and v_run like '%check_run%' and v_ses like '%check_run%',
    'fiabilite',   exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'runs' and column_name = 'received_at')
                   and v_run like '%too_many_runs%' and v_ses like '%too_many_runs%',
    'exercices',   to_regclass('public.item_stats') is not null,
    'admin',       to_regclass('public.site_admins') is not null,
    'classement',  exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'classes' and column_name = 'hide_board'),
    'compte',      to_regprocedure('public.delete_my_account(text)') is not null,
    'niveau',      exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'classes' and column_name = 'grade'),
    'orthographe', exists (select 1 from pg_constraint where conname = 'class_sessions_game_check' and pg_get_constraintdef(oid) like '%spelling%'),
    'memoire',     v_ov like '%best_memory%',
    'invitations', to_regclass('private.invitations') is not null and to_regprocedure('public.redeem_invitation(text)') is not null,
    'nettoyage',   to_regprocedure('private.purge_old_data()') is not null,
    'sessions',    v_login like '%30 days%' and v_run like '%student_sessions%' and v_ses like '%student_sessions%',
    'codes',       exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'students' and column_name = 'code_hash')
                   and v_login like '%code_hash%',
    'nettoyage_auto', v_cron
  );
  return jsonb_build_object(
    'version', 12,
    'features', f,
    'migrations', coalesce((select jsonb_agg(id order by id) from private.schema_migrations), '[]'::jsonb),
    'plain_codes', (select count(*) from public.students where access_code is not null),
    'missing', coalesce((select jsonb_agg(k order by k) from jsonb_each(f) as e(k, v) where v = 'false'::jsonb), '[]'::jsonb));
end $$;

-- ───────────────────────── Droits d'accès ─────────────────────────

revoke all on function private.code_hash(text)        from public, anon, authenticated;
revoke all on function private.wipe_plain_codes()     from public, anon, authenticated;
revoke all on function public.reset_class_codes(uuid) from public, anon;
revoke all on function public.server_version()        from public, anon;
grant execute on function public.reset_class_codes(uuid) to authenticated;
grant execute on function public.server_version()        to authenticated;
-- les fonctions réécrites ci-dessus gardent leurs droits (create or replace) ; on les rappelle par prudence :
grant execute on function public.student_login(text)          to anon, authenticated;
grant execute on function public.add_students(uuid, text[])   to authenticated;
grant execute on function public.reset_student_code(uuid)     to authenticated;

insert into private.schema_migrations (id) values ('2026-11-codes') on conflict (id) do nothing;
