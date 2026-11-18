-- Mise à jour « fiabilité » (version 1.11) — à exécuter UNE FOIS dans Supabase (SQL Editor → New query → Run).
-- Sans danger si exécutée plusieurs fois. À exécuter APRÈS toutes les autres mises à jour (elle remplace les deux fonctions d'envoi
-- des parties dans leur version définitive : ne rejouez PAS mise-a-jour-seances.sql ni mise-a-jour-securite.sql ensuite).
-- Une installation neuve avec schema.sql est déjà à jour.
--
-- Ce qu'elle apporte :
--   1. Quotas d'envoi calculés avec l'heure de RÉCEPTION (received_at), plus avec l'heure envoyée par le navigateur.
--   2. public.server_version() : dit quelles mises à jour SQL manquent (le site affiche l'avertissement aux administrateurs).
--   3. Inscription des enseignants sur invitation (code à donner à chaque enseignant, géré dans l'espace administrateur).
--   4. Conservation limitée : nettoyage automatique des anciennes données d'élèves (13 mois).
--   5. Sessions élèves de 30 jours (au lieu de 60), prolongées tant que l'élève joue.

-- ───────────────────────── 1. Heure de réception des parties ─────────────────────────

alter table public.runs add column if not exists received_at timestamptz;
update public.runs set received_at = played_at where received_at is null;
alter table public.runs alter column received_at set default now();
alter table public.runs alter column received_at set not null;
create index if not exists runs_received_idx on public.runs (student_id, received_at desc);

-- Parties libres. Le navigateur peut dater sa partie (jeu hors ligne), mais cette date ne sert qu'à l'affichage et au temps
-- de jeu cumulé : les limites d'envoi (par minute, par heure, par jour) se comptent sur l'heure de réception.
create or replace function public.submit_run(
  p_token text, p_client_id text, p_game text, p_mode text, p_kind text,
  p_score integer, p_wave integer, p_wpm numeric, p_acc numeric, p_correct integer, p_duration integer,
  p_played_ms bigint default null, p_balance jsonb default null
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_sid uuid := private.student_from_token(p_token);
  v_s   public.students%rowtype;
  v_at  timestamptz := now();
  v_n   integer;
begin
  if v_sid is null then return jsonb_build_object('error', 'invalid_session'); end if;
  if p_client_id !~ '^[A-Za-z0-9_-]{6,40}$' or p_game !~ '^[a-z0-9_-]{1,20}$' or p_mode !~ '^[a-z0-9_-]{1,20}$'
     or p_kind not in ('game', 'drill') then
    return jsonb_build_object('error', 'invalid_data');
  end if;
  select * into v_s from public.students where id = v_sid for update;   -- deux envois simultanés ne dépassent pas les limites
  -- la session de l'élève est prolongée tant qu'il joue (30 jours après la dernière partie envoyée)
  update public.student_sessions set expires_at = now() + interval '30 days'
   where token_hash = private.hash_token(p_token) and expires_at < now() + interval '15 days';
  if private.too_many_runs(v_sid) then return jsonb_build_object('error', 'rate_limited'); end if;
  if p_played_ms is not null then
    v_at := least(now(), greatest(now() - interval '30 days', to_timestamp(p_played_ms / 1000.0)));
  end if;
  -- partie déjà enregistrée (renvoi) : rien à vérifier ; sinon elle doit être humainement possible
  if not exists (select 1 from public.runs where student_id = v_sid and client_id = p_client_id)
     and private.check_run(v_sid, p_game, p_mode, v_at, p_score, p_wave, p_wpm, p_acc, p_correct, p_duration) is not null then
    return jsonb_build_object('error', 'cheat');
  end if;
  insert into public.runs (client_id, student_id, class_id, school_id, game, mode, kind,
                           score, wave, wpm, acc, correct, duration, played_at)
  values (p_client_id, v_sid, v_s.class_id, v_s.school_id, p_game, p_mode, p_kind,
          least(10000000, greatest(0, coalesce(p_score, 0))),
          least(999, greatest(0, coalesce(p_wave, 0))),
          round(least(300, greatest(0, coalesce(p_wpm, 0))), 1),
          round(least(100, greatest(0, coalesce(p_acc, 0))), 1),
          least(100000, greatest(0, coalesce(p_correct, 0))),
          least(7200, greatest(0, coalesce(p_duration, 0))),
          v_at)
  on conflict (student_id, client_id) do nothing;
  get diagnostics v_n = row_count;
  if v_n > 0 and p_kind = 'game' and p_balance is not null then
    perform private.store_balance(p_balance, p_mode = 'perso');
  end if;
  return jsonb_build_object('ok', true);
end $$;

-- Limites d'envoi par élève, sur l'heure de réception : 60 par minute, 200 par heure, 1 500 par jour.
create or replace function private.too_many_runs(p_student uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select (select count(*) from public.runs where student_id = p_student and received_at > now() - interval '1 minute') >= 60
      or (select count(*) from public.runs where student_id = p_student and received_at > now() - interval '1 hour') >= 200
      or (select count(*) from public.runs where student_id = p_student and received_at > now() - interval '1 day') >= 1500
$$;

-- Partie jouée dans une séance de classe : refusée quand les essais sont épuisés.
create or replace function public.submit_session_run(
  p_token text, p_session uuid, p_client_id text,
  p_score integer, p_wave integer, p_wpm numeric, p_acc numeric, p_correct integer, p_duration integer,
  p_played_ms bigint default null, p_balance jsonb default null
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_sid  uuid := private.student_from_token(p_token);
  v_s    public.students%rowtype;
  v_x    public.class_sessions%rowtype;
  v_used integer;
  v_at   timestamptz := now();
begin
  if v_sid is null then return jsonb_build_object('error', 'invalid_session'); end if;
  if p_client_id !~ '^[A-Za-z0-9_-]{6,40}$' then return jsonb_build_object('error', 'invalid_data'); end if;
  select * into v_s from public.students where id = v_sid for update;   -- deux envois simultanés ne dépassent pas le quota
  -- la session de l'élève est prolongée tant qu'il joue (30 jours après la dernière partie envoyée)
  update public.student_sessions set expires_at = now() + interval '30 days'
   where token_hash = private.hash_token(p_token) and expires_at < now() + interval '15 days';
  select * into v_x from public.class_sessions where id = p_session and class_id = v_s.class_id;
  if not found then return jsonb_build_object('error', 'unknown_session'); end if;
  if exists (select 1 from public.runs where student_id = v_sid and client_id = p_client_id) then
    return jsonb_build_object('ok', true);   -- même partie envoyée deux fois
  end if;
  if private.too_many_runs(v_sid) then return jsonb_build_object('error', 'rate_limited'); end if;
  if not v_x.active then return jsonb_build_object('error', 'session_closed'); end if;
  select count(*) into v_used from public.runs where student_id = v_sid and session_id = p_session;
  if v_used >= v_x.max_attempts then return jsonb_build_object('error', 'no_attempts_left'); end if;
  if p_played_ms is not null then
    v_at := least(now(), greatest(now() - interval '30 days', to_timestamp(p_played_ms / 1000.0)));
  end if;
  if private.check_run(v_sid, v_x.game, 'seance', v_at, p_score, p_wave, p_wpm, p_acc, p_correct, p_duration) is not null then
    return jsonb_build_object('error', 'cheat');
  end if;
  insert into public.runs (client_id, student_id, class_id, school_id, game, mode, kind, session_id,
                           score, wave, wpm, acc, correct, duration, played_at)
  values (p_client_id, v_sid, v_s.class_id, v_s.school_id, v_x.game, 'seance', 'game', p_session,
          least(10000000, greatest(0, coalesce(p_score, 0))),
          least(999, greatest(0, coalesce(p_wave, 0))),
          round(least(300, greatest(0, coalesce(p_wpm, 0))), 1),
          round(least(100, greatest(0, coalesce(p_acc, 0))), 1),
          least(100000, greatest(0, coalesce(p_correct, 0))),
          least(7200, greatest(0, coalesce(p_duration, 0))),
          v_at);
  return jsonb_build_object('ok', true, 'attempts_used', v_used + 1, 'max_attempts', v_x.max_attempts);
end $$;

-- ───────────────────────── 3. Inscription des enseignants sur invitation ─────────────────────────
-- Tout le monde peut toujours créer un compte (e-mail confirmé), mais sans invitation il ne peut PAS créer d'école :
-- il ne peut donc rien enregistrer ni créer d'élèves. Aucun service tiers (pas de CAPTCHA) : c'est l'administrateur qui donne les codes.

create table if not exists private.app_settings (
  key   text primary key,
  value text not null
);
alter table private.app_settings enable row level security;
insert into private.app_settings (key, value) values ('invite_only', 'on') on conflict (key) do nothing;

create table if not exists private.invitations (
  code       text primary key check (code ~ '^[A-Z0-9]{8}$'),
  label      text not null default '' check (char_length(label) <= 60),
  max_uses   integer not null default 1 check (max_uses between 1 and 200),
  uses       integer not null default 0,
  expires_at timestamptz not null,
  revoked    boolean not null default false,
  created_at timestamptz not null default now()
);
alter table private.invitations enable row level security;

create table if not exists private.teacher_access (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  granted_at timestamptz not null default now()
);
alter table private.teacher_access enable row level security;

create or replace function private.invite_only() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select value from private.app_settings where key = 'invite_only'), 'on') = 'on'
$$;

-- Qui peut créer une école : tout le monde si les invitations sont désactivées ; sinon les enseignants déjà installés,
-- les administrateurs du site et ceux qui ont saisi un code valide.
create or replace function private.can_create_school(p_uid uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select not private.invite_only()
      or exists (select 1 from public.site_admins where user_id = p_uid)
      or exists (select 1 from public.school_members where user_id = p_uid)
      or exists (select 1 from private.teacher_access where user_id = p_uid)
$$;

create or replace function public.create_school(p_name text) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_n   text := private.clean_name(p_name);
  v_id  uuid;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if not private.can_create_school(v_uid) then raise exception 'invitation_required' using errcode = '42501'; end if;
  if char_length(v_n) not between 2 and 80 then raise exception 'invalid_name' using errcode = '22023'; end if;
  if (select count(*) from public.school_members where user_id = v_uid) >= 3 then
    raise exception 'too_many_schools' using errcode = '54000';
  end if;
  insert into public.schools (name) values (v_n) returning id into v_id;
  insert into public.school_members (school_id, user_id, role) values (v_id, v_uid, 'admin');
  return v_id;
end $$;

-- « Puis-je créer une école ? » (pour savoir s'il faut demander un code d'invitation).
create or replace function public.my_teacher_access() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  return jsonb_build_object('invite_only', private.invite_only(), 'allowed', private.can_create_school(auth.uid()));
end $$;

-- Saisie d'un code d'invitation. Renvoie faux si le code est inconnu, expiré, révoqué ou épuisé ; 8 essais ratés par 10 minutes au plus.
create or replace function public.redeem_invitation(p_code text) returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_c   text := private.norm_code(p_code);
  v_i   private.invitations%rowtype;
  v_key text;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  v_key := 'inv:' || v_uid::text;
  if (select count(*) from private.login_attempts where ip = v_key and at > now() - interval '10 minutes') >= 8 then
    raise exception 'rate_limited' using errcode = '54000';
  end if;
  select * into v_i from private.invitations where code = v_c for update;
  if not found or v_i.revoked or v_i.expires_at <= now() or v_i.uses >= v_i.max_uses then
    insert into private.login_attempts (ip) values (v_key);
    return false;
  end if;
  if not exists (select 1 from private.teacher_access where user_id = v_uid) then
    insert into private.teacher_access (user_id) values (v_uid);
    update private.invitations set uses = uses + 1 where code = v_c;
  end if;
  return true;
end $$;

-- Administrateur : liste des invitations et interrupteur « sur invitation ».
create or replace function public.admin_invitations() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform private.assert_site_admin();
  return jsonb_build_object(
    'invite_only', private.invite_only(),
    'items', coalesce((
      select jsonb_agg(to_jsonb(t) order by t.created desc) from (
        select i.code, i.label, i.max_uses, i.uses, i.revoked,
               (extract(epoch from i.expires_at) * 1000)::bigint as expires,
               (extract(epoch from i.created_at) * 1000)::bigint as created
        from private.invitations i order by i.created_at desc limit 100
      ) t), '[]'::jsonb));
end $$;

create or replace function public.admin_create_invitation(p_label text, p_max integer, p_days integer) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_l text := left(private.clean_name(p_label), 60);
  v_code text;
  i integer;
begin
  perform private.assert_site_admin();
  if p_max not between 1 and 200 or p_days not between 1 and 365 then
    raise exception 'invalid_name' using errcode = '22023';
  end if;
  for i in 1..10 loop
    v_code := private.new_code();
    begin
      insert into private.invitations (code, label, max_uses, expires_at)
      values (v_code, v_l, p_max, now() + make_interval(days => p_days));
      insert into private.admin_audit (admin_id, action, target) values (auth.uid(), 'invitation_create', v_l);
      return v_code;
    exception when unique_violation then
      null;   -- code déjà pris : on en tire un autre
    end;
  end loop;
  raise exception 'limit_reached' using errcode = '54000';
end $$;

create or replace function public.admin_revoke_invitation(p_code text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform private.assert_site_admin();
  update private.invitations set revoked = true where code = private.norm_code(p_code);
  insert into private.admin_audit (admin_id, action, target) values (auth.uid(), 'invitation_revoke', private.norm_code(p_code));
end $$;

create or replace function public.admin_set_invite_only(p_on boolean) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform private.assert_site_admin();
  insert into private.app_settings (key, value) values ('invite_only', case when p_on then 'on' else 'off' end)
  on conflict (key) do update set value = excluded.value;
  insert into private.admin_audit (admin_id, action, target) values (auth.uid(), 'invite_only', case when p_on then 'on' else 'off' end);
end $$;

-- ───────────────────────── 4. Conservation limitée des données d'élèves ─────────────────────────
-- Règle écrite dans la page Confidentialité : les parties de plus de 13 mois sont effacées, ainsi que les élèves
-- créés depuis plus de 13 mois qui n'ont plus aucune partie. Les enseignants peuvent aussi tout effacer plus tôt (fin d'année).

create or replace function private.purge_old_data() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_runs integer;
  v_students integer;
begin
  delete from public.runs where received_at < now() - interval '400 days';
  get diagnostics v_runs = row_count;
  delete from public.students s
   where s.created_at < now() - interval '400 days'
     and not exists (select 1 from public.runs r where r.student_id = s.id);
  get diagnostics v_students = row_count;
  delete from public.student_sessions where expires_at < now() - interval '7 days';
  delete from private.login_attempts where at < now() - interval '1 day';
  delete from private.cheat_log where at < now() - interval '90 days';
  delete from private.admin_audit where at < now() - interval '1 year';
  delete from private.invitations where expires_at < now() - interval '30 days';
  return jsonb_build_object('runs', v_runs, 'students', v_students);
end $$;

-- Nettoyage chaque nuit (extension pg_cron de Supabase). Si l'extension n'est pas activable, la mise à jour continue :
-- activez-la dans Supabase → Database → Extensions (« pg_cron »), puis relancez ce fichier.
do $$
begin
  create extension if not exists pg_cron;
  perform cron.schedule('atelier-purge', '17 3 * * *', 'select private.purge_old_data()');
exception when others then
  raise notice 'pg_cron indisponible (%) : activez l''extension « pg_cron » dans Database → Extensions puis relancez ce fichier.', sqlerrm;
end $$;

-- ───────────────────────── 5. Sessions élèves plus courtes ─────────────────────────
-- Le jeton d'un élève, gardé sur l'appareil, vaut 30 jours au lieu de 60 ; il est prolongé à chaque envoi de partie
-- (voir ci-dessus) : un élève qui joue n'a jamais à retaper son code, un appareil oublié finit par se déconnecter.

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

  select * into v_s from public.students where access_code = private.norm_code(p_code);
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

-- ───────────────────────── 2. Version du serveur ─────────────────────────
-- Vérifie, en regardant la base elle-même, que chaque mise à jour a bien été appliquée (rien à mettre à jour à la main).
-- Les fonctions d'envoi des parties sont lues pour s'assurer qu'elles contrôlent bien les parties (une vieille mise à jour
-- rejouée par erreur les remettrait sans protection) et qu'elles utilisent l'heure de réception.

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
    'nettoyage_auto', v_cron
  );
  return jsonb_build_object(
    'version', 11,
    'features', f,
    'missing', coalesce((select jsonb_agg(k order by k) from jsonb_each(f) as e(k, v) where v = 'false'::jsonb), '[]'::jsonb));
end $$;

-- ───────────────────────── Droits d'accès ─────────────────────────

revoke all on function public.submit_run(text, text, text, text, text, integer, integer, numeric, numeric, integer, integer, bigint, jsonb) from public;
revoke all on function public.submit_session_run(text, uuid, text, integer, integer, numeric, numeric, integer, integer, bigint, jsonb) from public;
grant execute on function public.submit_run(text, text, text, text, text, integer, integer, numeric, numeric, integer, integer, bigint, jsonb) to anon, authenticated;
grant execute on function public.submit_session_run(text, uuid, text, integer, integer, numeric, numeric, integer, integer, bigint, jsonb) to anon, authenticated;

revoke all on function public.create_school(text)                 from public, anon;
revoke all on function public.my_teacher_access()                 from public, anon;
revoke all on function public.redeem_invitation(text)             from public, anon;
revoke all on function public.admin_invitations()                 from public, anon;
revoke all on function public.admin_create_invitation(text, integer, integer) from public, anon;
revoke all on function public.admin_revoke_invitation(text)       from public, anon;
revoke all on function public.admin_set_invite_only(boolean)      from public, anon;
revoke all on function public.server_version()                    from public, anon;
revoke all on function private.purge_old_data()                   from public, anon, authenticated;
revoke all on function private.too_many_runs(uuid)                from public, anon, authenticated;
grant execute on function public.create_school(text)                 to authenticated;
grant execute on function public.my_teacher_access()                 to authenticated;
grant execute on function public.redeem_invitation(text)             to authenticated;
grant execute on function public.admin_invitations()                 to authenticated;
grant execute on function public.admin_create_invitation(text, integer, integer) to authenticated;
grant execute on function public.admin_revoke_invitation(text)       to authenticated;
grant execute on function public.admin_set_invite_only(boolean)      to authenticated;
grant execute on function public.server_version()                    to authenticated;
