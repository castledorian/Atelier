-- ════════════════════════════════════════════════════════════════════════════
--  Frappe ! — schéma du serveur (PostgreSQL, prévu pour Supabase)
--  À exécuter UNE SEULE FOIS : Supabase → SQL Editor → coller ce fichier → Run.
--  Voir serveur/GUIDE-SERVEUR.md.
--
--  Principe de sécurité
--   • Les enseignants se connectent avec un vrai compte (e-mail + mot de passe, géré par Supabase Auth).
--     Ils ne voient QUE les données de leur école (sécurité par lignes, « RLS »).
--   • Les élèves n'ont pas de compte : ils tapent un code personnel (8 caractères) donné par
--     l'enseignant. Le navigateur de l'élève ne peut RIEN lire ni écrire directement dans les
--     tables : il appelle uniquement quelques fonctions (student_login, submit_run, …) qui
--     vérifient le code, puis ne renvoient que ce qui concerne sa classe / son école.
--   • Données stockées sur les élèves : un prénom ou pseudo + des résultats de jeu. Rien d'autre.
-- ════════════════════════════════════════════════════════════════════════════

create schema if not exists private;
revoke all on schema private from public;

-- ───────────────────────── Tables ─────────────────────────

create table public.schools (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 2 and 80),
  created_at  timestamptz not null default now()
);

create table public.school_members (
  school_id   uuid not null references public.schools(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        text not null default 'admin' check (role in ('admin', 'teacher')),
  created_at  timestamptz not null default now(),
  primary key (school_id, user_id)
);
create index on public.school_members (user_id);

create table public.classes (
  id              uuid primary key default gen_random_uuid(),
  school_id       uuid not null references public.schools(id) on delete cascade,
  name            text not null check (char_length(name) between 1 and 40),
  -- séance personnalisée de la classe (vitesse, lettres autorisées…), optionnelle
  session_config  jsonb check (session_config is null
                    or (jsonb_typeof(session_config) = 'object' and octet_length(session_config::text) < 2000)),
  created_at      timestamptz not null default now()
);
create index on public.classes (school_id);

create table public.students (
  id           uuid primary key default gen_random_uuid(),
  school_id    uuid not null references public.schools(id) on delete cascade,
  class_id     uuid not null references public.classes(id) on delete cascade,
  name         text not null check (char_length(name) between 1 and 24),
  access_code  text not null unique check (access_code ~ '^[A-Z0-9]{8}$'),
  created_at   timestamptz not null default now()
);
create index on public.students (class_id);
create index on public.students (school_id);

create table public.student_sessions (
  token_hash  text primary key,                 -- empreinte SHA-256 : le jeton lui-même n'est jamais stocké
  student_id  uuid not null references public.students(id) on delete cascade,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null
);
create index on public.student_sessions (student_id, created_at desc);

create table public.runs (
  id          uuid primary key default gen_random_uuid(),
  client_id   text not null check (client_id ~ '^[A-Za-z0-9_-]{6,40}$'),
  student_id  uuid not null references public.students(id) on delete cascade,
  class_id    uuid not null references public.classes(id) on delete cascade,
  school_id   uuid not null references public.schools(id) on delete cascade,
  game        text not null check (game ~ '^[a-z0-9_-]{1,20}$'),
  mode        text not null check (mode ~ '^[a-z0-9_-]{1,20}$'),
  kind        text not null default 'game' check (kind in ('game', 'drill')),
  score       integer not null check (score between 0 and 10000000),
  wave        integer not null check (wave between 0 and 999),
  wpm         numeric(5,1) not null check (wpm between 0 and 300),
  acc         numeric(4,1) not null check (acc between 0 and 100),
  correct     integer not null check (correct between 0 and 100000),
  duration    integer not null check (duration between 0 and 7200),
  played_at   timestamptz not null default now(),
  unique (student_id, client_id)                -- renvoyer deux fois la même partie ne crée pas de doublon
);
create index on public.runs (class_id, game, mode, student_id, score desc);
create index on public.runs (school_id, game, mode, student_id, score desc);
create index on public.runs (student_id, played_at desc);

-- Journal des codes élèves refusés (limite anti-devinette). Jamais accessible depuis le navigateur.
create table private.login_attempts (
  ip  text not null,
  at  timestamptz not null default now()
);
create index on private.login_attempts (ip, at);

alter table public.schools          enable row level security;
alter table public.school_members   enable row level security;
alter table public.classes          enable row level security;
alter table public.students         enable row level security;
alter table public.student_sessions enable row level security;
alter table public.runs             enable row level security;
alter table private.login_attempts  enable row level security;

-- ───────────────────────── Outils internes (schéma « private », non exposé) ─────────────────────────

create function private.norm_code(p text) returns text
language sql immutable as $$ select upper(regexp_replace(coalesce(p, ''), '[^A-Za-z0-9]', '', 'g')) $$;

-- Code élève : 8 caractères parmi 31 (sans I, L, O, 0, 1 pour éviter les confusions) ≈ 8,5·10¹¹ possibilités.
create function private.new_code() returns text
language plpgsql volatile as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  b   bytea := decode(replace(gen_random_uuid()::text, '-', ''), 'hex');
  pos constant int[] := array[0, 1, 2, 3, 4, 5, 9, 10];   -- octets non fixés par le format UUID v4
  out text := '';
  i   int;
begin
  for i in 1..8 loop
    out := out || substr(alphabet, (get_byte(b, pos[i]) % 31) + 1, 1);
  end loop;
  return out;
end $$;

create function private.hash_token(p text) returns text
language sql immutable as $$ select encode(sha256(convert_to(coalesce(p, ''), 'UTF8')), 'hex') $$;

create function private.student_from_token(p_token text) returns uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select s.student_id from public.student_sessions s
  where s.token_hash = private.hash_token(p_token) and s.expires_at > now()
$$;

create function private.assert_member(p_school uuid, p_admin boolean default false) returns void
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if not exists (
    select 1 from public.school_members m
    where m.school_id = p_school and m.user_id = auth.uid() and (not p_admin or m.role = 'admin')
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
end $$;

create function private.clean_name(p text) returns text
language sql immutable as $$
  select btrim(regexp_replace(regexp_replace(coalesce(p, ''), '[\x01-\x1F\x7F\u0080-\u009F]', '', 'g'), '\s+', ' ', 'g'))
$$;

-- ───────────────────────── Élèves (appelables sans compte) ─────────────────────────

create function public.student_login(p_code text) returns jsonb
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
  values (private.hash_token(v_token), v_s.id, now() + interval '60 days');

  return jsonb_build_object(
    'token', v_token,
    'student', jsonb_build_object('id', v_s.id, 'name', v_s.name),
    'class',   (select jsonb_build_object('id', c.id, 'name', c.name, 'session_config', c.session_config)
                from public.classes c where c.id = v_s.class_id),
    'school',  (select jsonb_build_object('id', sc.id, 'name', sc.name)
                from public.schools sc where sc.id = v_s.school_id));
end $$;

create function public.student_logout(p_token text) returns void
language sql security definer set search_path = public, pg_temp as $$
  delete from public.student_sessions where token_hash = private.hash_token(p_token)
$$;

create function public.submit_run(
  p_token text, p_client_id text, p_game text, p_mode text, p_kind text,
  p_score integer, p_wave integer, p_wpm numeric, p_acc numeric, p_correct integer, p_duration integer,
  p_played_ms bigint default null
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_sid uuid := private.student_from_token(p_token);
  v_s   public.students%rowtype;
  v_at  timestamptz := now();
begin
  if v_sid is null then return jsonb_build_object('error', 'invalid_session'); end if;
  if p_client_id !~ '^[A-Za-z0-9_-]{6,40}$' or p_game !~ '^[a-z0-9_-]{1,20}$' or p_mode !~ '^[a-z0-9_-]{1,20}$'
     or p_kind not in ('game', 'drill') then
    return jsonb_build_object('error', 'invalid_data');
  end if;
  if (select count(*) from public.runs where student_id = v_sid and played_at > now() - interval '1 hour') >= 200 then
    return jsonb_build_object('error', 'rate_limited');
  end if;
  select * into v_s from public.students where id = v_sid;
  -- date de la partie : celle du navigateur si elle est plausible (parties jouées hors ligne), sinon maintenant
  if p_played_ms is not null then
    v_at := least(now(), greatest(now() - interval '30 days', to_timestamp(p_played_ms / 1000.0)));
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
  return jsonb_build_object('ok', true);
end $$;

-- Classement : meilleure partie de chaque élève. Portée « class » (sa classe) ou « school » (son école).
create function public.class_leaderboard(
  p_token text, p_game text, p_mode text, p_scope text default 'class', p_limit integer default 10
) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_sid uuid := private.student_from_token(p_token);
  v_s   public.students%rowtype;
begin
  if v_sid is null then return jsonb_build_object('error', 'invalid_session'); end if;
  select * into v_s from public.students where id = v_sid;
  return jsonb_build_object('ok', true, 'rows', coalesce((
    select jsonb_agg(to_jsonb(t) order by t.rank) from (
      select row_number() over (order by b.score desc, b.played_at asc) as rank,
             st.name, b.score, b.wave, b.wpm, b.acc, (b.student_id = v_sid) as is_me
      from (
        select distinct on (r.student_id) r.*
        from public.runs r
        where r.game = p_game and r.mode = p_mode and r.mode <> 'perso' and r.kind = 'game'
          and ((p_scope = 'school' and r.school_id = v_s.school_id)
            or (p_scope <> 'school' and r.class_id = v_s.class_id))
        order by r.student_id, r.score desc, r.played_at asc
      ) b
      join public.students st on st.id = b.student_id
      order by 1
      limit greatest(1, least(coalesce(p_limit, 10), 50))
    ) t), '[]'::jsonb));
end $$;

-- Historique de l'élève (courbe de progression, identique sur tous ses appareils)
create function public.my_runs(p_token text, p_game text default null, p_limit integer default 200) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_sid uuid := private.student_from_token(p_token);
begin
  if v_sid is null then return jsonb_build_object('error', 'invalid_session'); end if;
  return jsonb_build_object('ok', true, 'rows', coalesce((
    select jsonb_agg(to_jsonb(t) order by t.date) from (
      select r.client_id as id, (extract(epoch from r.played_at) * 1000)::bigint as date,
             r.game, r.mode, r.kind, r.score, r.wave, r.wpm, r.acc, r.correct, r.duration
      from public.runs r
      where r.student_id = v_sid and (p_game is null or r.game = p_game)
      order by r.played_at desc
      limit greatest(1, least(coalesce(p_limit, 200), 400))
    ) t), '[]'::jsonb));
end $$;

-- ───────────────────────── Enseignants (compte requis) ─────────────────────────

create function public.create_school(p_name text) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_n   text := private.clean_name(p_name);
  v_id  uuid;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if char_length(v_n) not between 2 and 80 then raise exception 'invalid_name' using errcode = '22023'; end if;
  if (select count(*) from public.school_members where user_id = v_uid) >= 3 then
    raise exception 'too_many_schools' using errcode = '54000';
  end if;
  insert into public.schools (name) values (v_n) returning id into v_id;
  insert into public.school_members (school_id, user_id, role) values (v_id, v_uid, 'admin');
  return v_id;
end $$;

create function public.create_class(p_school uuid, p_name text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_n text := private.clean_name(p_name);
  v_c public.classes%rowtype;
begin
  perform private.assert_member(p_school);
  if char_length(v_n) not between 1 and 40 then raise exception 'invalid_name' using errcode = '22023'; end if;
  if (select count(*) from public.classes where school_id = p_school) >= 60 then
    raise exception 'limit_reached' using errcode = '54000';
  end if;
  insert into public.classes (school_id, name) values (p_school, v_n) returning * into v_c;
  return to_jsonb(v_c);
end $$;

-- Ajoute des élèves (un prénom ou pseudo par ligne) et renvoie leurs codes. Les doublons de la classe sont ignorés.
create function public.add_students(p_class uuid, p_names text[]) returns jsonb
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
        insert into public.students (school_id, class_id, name, access_code)
        values (v_c.school_id, p_class, v_n, v_code) returning id into v_id;
        exit;
      exception when unique_violation then
        if v_tries >= 10 then raise; end if;
      end;
    end loop;
    v_out := v_out || jsonb_build_object('id', v_id, 'name', v_n, 'access_code', v_code);
  end loop;
  return v_out;
end $$;

-- Nouveau code pour un élève (code perdu ou partagé) : l'ancien code et les connexions en cours cessent de fonctionner.
create function public.reset_student_code(p_student uuid) returns text
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
      update public.students set access_code = v_code where id = p_student;
      exit;
    exception when unique_violation then
      if v_tries >= 10 then raise; end if;
    end;
  end loop;
  delete from public.student_sessions where student_id = p_student;
  return v_code;
end $$;

-- Tableau de bord d'une classe : un résumé par élève (calculé côté serveur, quel que soit le nombre de parties).
create function public.class_overview(p_class uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_c public.classes%rowtype;
begin
  select * into v_c from public.classes where id = p_class;
  if not found then raise exception 'forbidden' using errcode = '42501'; end if;
  perform private.assert_member(v_c.school_id);
  return coalesce((
    select jsonb_agg(to_jsonb(t) order by lower(t.name)) from (
      select s.id, s.name, s.access_code,
             count(r.id) filter (where r.kind = 'game')  as games,
             count(r.id) filter (where r.kind = 'drill') as drills,
             max(r.score) filter (where r.kind = 'game' and r.mode <> 'perso' and r.game = 'typing') as best_typing,
             max(r.score) filter (where r.kind = 'game' and r.mode <> 'perso' and r.game = 'math')   as best_math,
             max(r.score) filter (where r.kind = 'game' and r.mode <> 'perso' and r.game = 'memory') as best_memory,
             round(avg(r.wpm) filter (where r.kind = 'game' and r.game = 'typing'), 1) as avg_wpm,
             round(avg(r.acc) filter (where r.kind = 'game' and r.game = 'typing'), 1) as avg_acc,
             coalesce(sum(r.duration), 0)::integer as seconds,
             (extract(epoch from max(r.played_at)) * 1000)::bigint as last_played
      from public.students s
      left join public.runs r on r.student_id = s.id
      where s.class_id = p_class
      group by s.id
    ) t), '[]'::jsonb);
end $$;

-- Supprime l'école et TOUTES ses données (classes, élèves, résultats). Réservé aux administrateurs de l'école.
create function public.delete_school(p_school uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform private.assert_member(p_school, true);
  delete from public.schools where id = p_school;
end $$;

-- ───────────────────────── Droits d'accès ─────────────────────────

-- On part de zéro : aucun droit pour le navigateur, puis on accorde le strict nécessaire.
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated, public;
revoke all on all tables    in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;
grant usage on schema public to anon, authenticated;

grant execute on function public.student_login(text)                                   to anon, authenticated;
grant execute on function public.student_logout(text)                                  to anon, authenticated;
grant execute on function public.submit_run(text, text, text, text, text, integer, integer, numeric, numeric, integer, integer, bigint) to anon, authenticated;
grant execute on function public.class_leaderboard(text, text, text, text, integer)    to anon, authenticated;
grant execute on function public.my_runs(text, text, integer)                          to anon, authenticated;

grant execute on function public.create_school(text)               to authenticated;
grant execute on function public.create_class(uuid, text)          to authenticated;
grant execute on function public.add_students(uuid, text[])        to authenticated;
grant execute on function public.reset_student_code(uuid)          to authenticated;
grant execute on function public.delete_school(uuid)               to authenticated;
grant execute on function public.class_overview(uuid)            to authenticated;

grant select on public.schools, public.school_members, public.classes, public.students, public.runs to authenticated;
grant update (name) on public.schools to authenticated;
grant update (name, session_config), delete on public.classes  to authenticated;
grant update (name), delete on public.students                 to authenticated;
grant delete on public.runs                                    to authenticated;

-- ───────────────────────── Politiques RLS (enseignants) ─────────────────────────

create policy members_read on public.school_members for select to authenticated
  using (user_id = (select auth.uid()));

create policy schools_read on public.schools for select to authenticated
  using (id in (select school_id from public.school_members where user_id = (select auth.uid())));
create policy schools_rename on public.schools for update to authenticated
  using (id in (select school_id from public.school_members where user_id = (select auth.uid()) and role = 'admin'))
  with check (id in (select school_id from public.school_members where user_id = (select auth.uid()) and role = 'admin'));

create policy classes_read on public.classes for select to authenticated
  using (school_id in (select school_id from public.school_members where user_id = (select auth.uid())));
create policy classes_update on public.classes for update to authenticated
  using (school_id in (select school_id from public.school_members where user_id = (select auth.uid())))
  with check (school_id in (select school_id from public.school_members where user_id = (select auth.uid())));
create policy classes_delete on public.classes for delete to authenticated
  using (school_id in (select school_id from public.school_members where user_id = (select auth.uid())));

create policy students_read on public.students for select to authenticated
  using (school_id in (select school_id from public.school_members where user_id = (select auth.uid())));
create policy students_update on public.students for update to authenticated
  using (school_id in (select school_id from public.school_members where user_id = (select auth.uid())))
  with check (school_id in (select school_id from public.school_members where user_id = (select auth.uid())));
create policy students_delete on public.students for delete to authenticated
  using (school_id in (select school_id from public.school_members where user_id = (select auth.uid())));

create policy runs_read on public.runs for select to authenticated
  using (school_id in (select school_id from public.school_members where user_id = (select auth.uid())));
create policy runs_delete on public.runs for delete to authenticated
  using (school_id in (select school_id from public.school_members where user_id = (select auth.uid())));

-- student_sessions et private.login_attempts : RLS activée, aucune politique, aucun droit → inaccessibles depuis le navigateur.
