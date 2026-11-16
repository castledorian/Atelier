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
  -- l'enseignant peut masquer les classements pour sa classe
  hide_board      boolean not null default false,
  -- niveau de la classe fixé par l'enseignant (les élèves de la classe n'ont pas à le choisir)
  grade           text check (grade is null or grade in ('cp', 'ce1', 'ce2', 'cm1', 'cm2')),
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
  -- l'enseignant peut masquer les classements de sa classe
  if (select c.hide_board from public.classes c where c.id = v_s.class_id) then
    return jsonb_build_object('ok', true, 'hidden', true, 'rows', '[]'::jsonb);
  end if;
  return jsonb_build_object('ok', true, 'rows', coalesce((
    select jsonb_agg(to_jsonb(t) order by t.rank) from (
      select row_number() over (order by b.score desc, b.played_at asc) as rank,
             st.name, b.score, b.wave, b.wpm, b.acc, (b.student_id = v_sid) as is_me
      from (
        select distinct on (r.student_id) r.*
        from public.runs r
        where r.game = p_game and r.mode = p_mode and r.mode <> 'perso' and r.session_id is null and r.kind = 'game'
          and ((p_scope = 'school' and r.school_id = v_s.school_id)
            or (p_scope <> 'school' and r.class_id = v_s.class_id))
        order by r.student_id, r.score desc, r.played_at asc
      ) b
      join public.students st on st.id = b.student_id
      order by 1
      limit greatest(1, least(coalesce(p_limit, 10), 50))
    ) t), '[]'::jsonb));
end $$;

-- Objectif collectif : parties jouées par la classe depuis 7 jours (aucun nom, aucun classement individuel).
create or replace function public.class_week(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_sid uuid := private.student_from_token(p_token);
  v_c   uuid;
begin
  if v_sid is null then return jsonb_build_object('error', 'invalid_session'); end if;
  select class_id into v_c from public.students where id = v_sid;
  return jsonb_build_object('ok', true,
    'games', (select count(*) from public.runs r
              where r.class_id = v_c and r.kind = 'game' and r.played_at > now() - interval '7 days'),
    'players', (select count(distinct r.student_id) from public.runs r
                where r.class_id = v_c and r.kind = 'game' and r.played_at > now() - interval '7 days'));
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
-- Supprime l'école et TOUTES ses données (classes, élèves, résultats). Réservé aux administrateurs de l'école.
create function public.delete_school(p_school uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform private.assert_member(p_school, true);
  delete from public.schools where id = p_school;
end $$;

-- Suppression de son propre compte (droit à l'effacement). Voir aussi serveur/mise-a-jour-compte.sql.
-- Aperçu : les écoles de l'enseignant et ce qu'elles contiennent (pour lui montrer ce qui va disparaître).
create function public.account_deletion_preview() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
        'name', s.name,
        'members', (select count(*) from public.school_members x where x.school_id = s.id),
        'classes', (select count(*) from public.classes c where c.school_id = s.id),
        'students', (select count(*) from public.students st where st.school_id = s.id)
      ) order by s.name)
    from public.school_members m
    join public.schools s on s.id = m.school_id
    where m.user_id = auth.uid()
  ), '[]'::jsonb);
end $$;

create function public.delete_my_account(p_email text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid     uuid := auth.uid();
  v_mail    text;
  v_s       record;
  v_next    uuid;
  v_deleted integer := 0;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select lower(email) into v_mail from auth.users where id = v_uid;
  if v_mail is null or lower(btrim(coalesce(p_email, ''))) <> v_mail then
    raise exception 'confirmation_mismatch' using errcode = '22023';
  end if;

  for v_s in select school_id, role from public.school_members where user_id = v_uid loop
    if not exists (select 1 from public.school_members where school_id = v_s.school_id and user_id <> v_uid) then
      -- seul enseignant de l'école : l'école et ses données disparaissent avec lui
      delete from public.schools where id = v_s.school_id;
      v_deleted := v_deleted + 1;
    elsif v_s.role = 'admin'
          and not exists (select 1 from public.school_members where school_id = v_s.school_id and user_id <> v_uid and role = 'admin') then
      -- dernier administrateur : on transmet le rôle au collègue le plus ancien
      select user_id into v_next from public.school_members
        where school_id = v_s.school_id and user_id <> v_uid order by created_at limit 1;
      update public.school_members set role = 'admin' where school_id = v_s.school_id and user_id = v_next;
    end if;
  end loop;

  delete from auth.users where id = v_uid;   -- supprime aussi ses appartenances (cascade)
  return jsonb_build_object('ok', true, 'schools_deleted', v_deleted);
end $$;


-- ───────────────────────── Séances de classe, essais, équilibrage (voir aussi serveur/mise-a-jour-seances.sql) ─────────────────────────

-- ───────────────────────── Tables ─────────────────────────

create table if not exists public.class_sessions (
  id            uuid primary key default gen_random_uuid(),
  class_id      uuid not null references public.classes(id) on delete cascade,
  school_id     uuid not null references public.schools(id) on delete cascade,
  title         text not null check (char_length(title) between 1 and 60),
  game          text not null check (game in ('typing', 'math', 'memory', 'spelling')),
  config        jsonb not null default '{}'::jsonb check (jsonb_typeof(config) = 'object' and octet_length(config::text) < 2000),
  max_attempts  integer not null default 2 check (max_attempts between 1 and 3),
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);
create index if not exists class_sessions_class_idx on public.class_sessions (class_id, created_at desc);

alter table public.runs add column if not exists session_id uuid references public.class_sessions(id) on delete cascade;
create index if not exists runs_session_idx on public.runs (session_id, student_id);

-- Résumé anonyme d'une partie libre, pour régler la difficulté (objectif : environ 85 % de réussite en « standard »).
create table if not exists public.balance_runs (
  id           bigint generated always as identity primary key,
  played_at    timestamptz not null default now(),
  game         text not null check (game in ('typing', 'math', 'memory', 'spelling')),
  level        text check (level is null or level in ('cp', 'ce1', 'ce2', 'cm1', 'cm2')),
  difficulty   text not null check (difficulty ~ '^[a-z0-9_-]{1,20}$'),   -- apprenti / standard / expert, ou le mode (suite / cases)
  custom       boolean not null default false,                            -- réglages personnalisés ou séance : exclus des moyennes
  version      integer not null default 1 check (version between 0 and 999),
  outcome      text not null check (outcome in ('finished', 'lost')),
  score        integer not null check (score between 0 and 10000000),
  wave         integer,
  acc          numeric(4,1),
  wpm          numeric(5,1),
  duration     integer,
  rounds_ok    integer,
  rounds_err   integer,
  pages        jsonb check (pages is null or (jsonb_typeof(pages) = 'array' and jsonb_array_length(pages) <= 12))
);
create index if not exists balance_runs_idx on public.balance_runs (game, level, difficulty, version);

alter table public.class_sessions enable row level security;
alter table public.balance_runs   enable row level security;
revoke all on public.class_sessions, public.balance_runs from anon, authenticated;

-- ───────────────────────── Outils internes ─────────────────────────

-- Enregistre le résumé anonyme. Ne bloque JAMAIS l'enregistrement de la partie : toute erreur est ignorée.
create or replace function private.store_balance(p jsonb, p_custom boolean) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p is null or jsonb_typeof(p) <> 'object' or octet_length(p::text) > 1500 then return; end if;
  insert into public.balance_runs (game, level, difficulty, custom, version, outcome, score, wave, acc, wpm, duration,
                                   rounds_ok, rounds_err, pages)
  values (p->>'game', nullif(p->>'level', ''), p->>'difficulty', p_custom,
          coalesce((p->>'version')::integer, 1), p->>'outcome',
          least(10000000, greatest(0, coalesce((p->>'score')::integer, 0))),
          (p->>'wave')::integer, (p->>'acc')::numeric, (p->>'wpm')::numeric, (p->>'duration')::integer,
          (p->>'rounds_ok')::integer, (p->>'rounds_err')::integer,
          case when jsonb_typeof(p->'pages') = 'array' then p->'pages' end);
exception when others then
  null;
end $$;

-- ───────────────────────── Sécurité des scores ─────────────────────────
-- Le navigateur est entre les mains de l'élève : tout ce qu'il envoie peut être falsifié. La protection est donc ICI, sur le serveur :
-- chaque partie est vérifiée avec les règles réelles des jeux (cadence maximale humaine, points maximaux par réponse, durée),
-- puis le temps de jeu cumulé est contrôlé. Une partie impossible n'est PAS enregistrée et est notée dans private.cheat_log
-- (illisible depuis le navigateur, effacée après 90 jours). Les bornes sont volontairement larges : elles ne visent
-- que ce qu'aucun élève ne peut obtenir en jouant, jamais un excellent joueur.

create table if not exists private.cheat_log (
  id         bigint generated always as identity primary key,
  at         timestamptz not null default now(),
  student_id uuid,
  game       text,
  mode       text,
  reason     text not null,
  values_    jsonb
);
create index if not exists cheat_log_at_idx on private.cheat_log (at);

-- Renvoie la raison pour laquelle une partie est impossible, ou null si elle est plausible.
create or replace function private.run_violation(
  p_game text, p_score integer, p_wave integer, p_wpm numeric, p_acc numeric, p_correct integer, p_duration integer
) returns text
language plpgsql immutable as $$
declare
  s bigint  := coalesce(p_score, 0);
  w bigint  := coalesce(p_wave, 0);
  c bigint  := coalesce(p_correct, 0);
  d bigint  := coalesce(p_duration, 0);
  a numeric := coalesce(p_acc, 0);
  k numeric := coalesce(p_wpm, 0);
begin
  if s < 0 or w < 0 or c < 0 or d < 0 or k < 0 or a < 0 or a > 100 then return 'valeurs hors limites'; end if;
  if s > 0 and d < 1 then return 'score sans durée de jeu'; end if;
  if p_game = 'typing' then
    if k > 200 then return 'vitesse de frappe impossible'; end if;                       -- 200 mots/min = record du monde
    if c > 17 * d + 40 then return 'trop de lettres pour la durée'; end if;               -- 17 lettres/s ≈ 200 mots/min
    if w > d + 5 then return 'trop de vagues pour la durée'; end if;
    if s > 160 * c + 5000 * (w + 1) + 3000 then return 'score supérieur au maximum possible'; end if;  -- ×6 : 60 points/lettre, mots longs, Ratures
  elsif p_game = 'math' then
    if c > 4 * d + 3 then return 'réponses trop rapides'; end if;                         -- une réponse demande au moins 0,25 s
    if w > c then return 'série plus longue que le nombre de réponses'; end if;
    if s > 70 * c + 1500 then return 'score supérieur au maximum possible'; end if;       -- ×5 + 20 de vitesse, + pages parfaites et bonus final
  elsif p_game = 'memory' then
    if c > 30 or w > 30 then return 'plus de manches que le jeu n''en contient'; end if;
    if c > d / 0.5 + 2 then return 'manches trop rapides'; end if;
    if s > 60 * greatest(w, 1) * c + 1000 then return 'score supérieur au maximum possible'; end if;
  elsif p_game = 'spelling' then
    if c > 10 then return 'plus de phrases que le jeu n''en contient'; end if;
    if d < c then return 'phrases trop rapides'; end if;                                  -- lire, toucher et choisir prend au moins 1 s
    if w > c then return 'série plus longue que le nombre de phrases'; end if;
    if s > 25 * c then return 'score supérieur au maximum possible'; end if;              -- 5 + 10 + 10 de série au mieux
  else
    return 'jeu inconnu';
  end if;
  return null;
end $$;

-- Contrôle commun aux deux envois : forme de la partie, puis temps de jeu cumulé (au plus 2 h de jeu par heure : deux appareils).
-- Renvoie la raison du refus, ou null. Note le refus dans le journal.
create or replace function private.check_run(
  p_student uuid, p_game text, p_mode text, p_at timestamptz,
  p_score integer, p_wave integer, p_wpm numeric, p_acc numeric, p_correct integer, p_duration integer
) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_why text := private.run_violation(p_game, p_score, p_wave, p_wpm, p_acc, p_correct, p_duration);
begin
  if v_why is null and coalesce(p_duration, 0) +
       (select coalesce(sum(duration), 0) from public.runs where student_id = p_student and played_at > p_at - interval '1 hour' and played_at <= p_at + interval '1 hour')
       > 7200 then
    v_why := 'plus de temps de jeu que de temps écoulé';
  end if;
  if v_why is not null then
    delete from private.cheat_log where at < now() - interval '90 days';
    insert into private.cheat_log (student_id, game, mode, reason, values_)
    values (p_student, p_game, p_mode, v_why,
            jsonb_build_object('score', p_score, 'wave', p_wave, 'wpm', p_wpm, 'acc', p_acc, 'correct', p_correct, 'duration', p_duration));
  end if;
  return v_why;
end $$;

-- ───────────────────────── Parties (remplace submit_run : ajoute le résumé d'équilibrage) ─────────────────────────

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
  if (select count(*) from public.runs where student_id = v_sid and played_at > now() - interval '1 hour') >= 200 then
    return jsonb_build_object('error', 'rate_limited');
  end if;
  select * into v_s from public.students where id = v_sid;
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
  select * into v_x from public.class_sessions where id = p_session and class_id = v_s.class_id;
  if not found then return jsonb_build_object('error', 'unknown_session'); end if;
  if exists (select 1 from public.runs where student_id = v_sid and client_id = p_client_id) then
    return jsonb_build_object('ok', true);   -- même partie envoyée deux fois
  end if;
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

-- Espace de l'élève : les séances de sa classe, avec ses essais restants et son meilleur score.
create or replace function public.my_sessions(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_sid uuid := private.student_from_token(p_token);
  v_s   public.students%rowtype;
begin
  if v_sid is null then return jsonb_build_object('error', 'invalid_session'); end if;
  select * into v_s from public.students where id = v_sid;
  return jsonb_build_object('ok', true,
    'grade', (select c.grade from public.classes c where c.id = v_s.class_id),
    'sessions', coalesce((
    select jsonb_agg(to_jsonb(t) order by t.created desc) from (
      select x.id, x.title, x.game, x.config, x.max_attempts, x.active,
             (select count(*) from public.runs r where r.session_id = x.id and r.student_id = v_sid)::integer as attempts_used,
             (select max(r.score) from public.runs r where r.session_id = x.id and r.student_id = v_sid) as best_score,
             (extract(epoch from x.created_at) * 1000)::bigint as created
      from public.class_sessions x
      where x.class_id = v_s.class_id
    ) t), '[]'::jsonb));
end $$;

-- ───────────────────────── Enseignants : gérer les séances ─────────────────────────

create or replace function public.list_class_sessions(p_class uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_c public.classes%rowtype;
begin
  select * into v_c from public.classes where id = p_class;
  if not found then raise exception 'forbidden' using errcode = '42501'; end if;
  perform private.assert_member(v_c.school_id);
  return coalesce((
    select jsonb_agg(to_jsonb(t) order by t.created desc) from (
      select x.id, x.title, x.game, x.config, x.max_attempts, x.active,
             (extract(epoch from x.created_at) * 1000)::bigint as created,
             (select count(distinct r.student_id) from public.runs r where r.session_id = x.id)::integer as done,
             (select count(*) from public.students s where s.class_id = p_class)::integer as total
      from public.class_sessions x where x.class_id = p_class
    ) t), '[]'::jsonb);
end $$;

-- Crée (p_id nul) ou modifie une séance. Renvoie son identifiant.
create or replace function public.save_class_session(
  p_class uuid, p_id uuid, p_title text, p_game text, p_config jsonb, p_max integer, p_active boolean
) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_c  public.classes%rowtype;
  v_t  text := private.clean_name(p_title);
  v_id uuid;
begin
  select * into v_c from public.classes where id = p_class;
  if not found then raise exception 'forbidden' using errcode = '42501'; end if;
  perform private.assert_member(v_c.school_id);
  if char_length(v_t) not between 1 and 60 or p_game not in ('typing', 'math', 'memory', 'spelling')
     or p_max not between 1 and 3 or p_config is null or jsonb_typeof(p_config) <> 'object' then
    raise exception 'invalid_name' using errcode = '22023';
  end if;
  if p_id is null then
    if (select count(*) from public.class_sessions where class_id = p_class) >= 30 then
      raise exception 'too_many_sessions' using errcode = '54000';
    end if;
    insert into public.class_sessions (class_id, school_id, title, game, config, max_attempts, active)
    values (p_class, v_c.school_id, v_t, p_game, p_config, p_max, coalesce(p_active, true)) returning id into v_id;
  else
    -- le jeu d'une séance déjà jouée ne change plus : les résultats resteraient incomparables
    update public.class_sessions
       set title = v_t, config = p_config, max_attempts = p_max, active = coalesce(p_active, active),
           game = case when exists (select 1 from public.runs where session_id = p_id) then game else p_game end
     where id = p_id and class_id = p_class returning id into v_id;
    if v_id is null then raise exception 'forbidden' using errcode = '42501'; end if;
  end if;
  return v_id;
end $$;

create or replace function public.delete_class_session(p_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_x public.class_sessions%rowtype;
begin
  select * into v_x from public.class_sessions where id = p_id;
  if not found then raise exception 'forbidden' using errcode = '42501'; end if;
  perform private.assert_member(v_x.school_id);
  delete from public.class_sessions where id = p_id;   -- supprime aussi les essais de cette séance
end $$;

-- Résultats d'une séance : pour chaque élève, tous les essais et le meilleur score (celui qui compte).
create or replace function public.session_results(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_x public.class_sessions%rowtype;
begin
  select * into v_x from public.class_sessions where id = p_id;
  if not found then raise exception 'forbidden' using errcode = '42501'; end if;
  perform private.assert_member(v_x.school_id);
  return coalesce((
    select jsonb_agg(to_jsonb(t) order by lower(t.name)) from (
      select s.id, s.name,
             count(r.id)::integer as attempts,
             max(r.score) as best_score,
             coalesce(jsonb_agg(jsonb_build_object('score', r.score, 'wave', r.wave, 'wpm', r.wpm, 'acc', r.acc,
                        'duration', r.duration, 'at', (extract(epoch from r.played_at) * 1000)::bigint)
                        order by r.played_at) filter (where r.id is not null), '[]'::jsonb) as runs
      from public.students s
      left join public.runs r on r.student_id = s.id and r.session_id = p_id
      where s.class_id = v_x.class_id
      group by s.id
    ) t), '[]'::jsonb);
end $$;

-- Tableau de bord : les parties de séance ne comptent pas dans les « records » libres.
create or replace function public.class_overview(p_class uuid) returns jsonb
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
             max(r.score) filter (where r.kind = 'game' and r.mode <> 'perso' and r.session_id is null and r.game = 'typing') as best_typing,
             max(r.score) filter (where r.kind = 'game' and r.mode <> 'perso' and r.session_id is null and r.game = 'math')   as best_math,
             max(r.score) filter (where r.kind = 'game' and r.mode <> 'perso' and r.session_id is null and r.game = 'memory') as best_memory,
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


-- ───────────────────────── Droits d'accès ─────────────────────────

-- On part de zéro : aucun droit pour le navigateur, puis on accorde le strict nécessaire.
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated, public;
revoke all on all tables    in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;
grant usage on schema public to anon, authenticated;

grant execute on function public.student_login(text)                                   to anon, authenticated;
grant execute on function public.student_logout(text)                                  to anon, authenticated;
grant execute on function public.submit_run(text, text, text, text, text, integer, integer, numeric, numeric, integer, integer, bigint, jsonb) to anon, authenticated;
grant execute on function public.submit_session_run(text, uuid, text, integer, integer, numeric, numeric, integer, integer, bigint, jsonb) to anon, authenticated;
grant execute on function public.my_sessions(text) to anon, authenticated;
grant execute on function public.class_leaderboard(text, text, text, text, integer)    to anon, authenticated;
grant execute on function public.my_runs(text, text, integer)                          to anon, authenticated;
grant execute on function public.class_week(text) to anon, authenticated;

grant execute on function public.create_school(text)               to authenticated;
grant execute on function public.create_class(uuid, text)          to authenticated;
grant execute on function public.add_students(uuid, text[])        to authenticated;
grant execute on function public.reset_student_code(uuid)          to authenticated;
grant execute on function public.delete_school(uuid)               to authenticated;
grant execute on function public.class_overview(uuid)            to authenticated;
grant execute on function public.list_class_sessions(uuid) to authenticated;
grant execute on function public.save_class_session(uuid, uuid, text, text, jsonb, integer, boolean) to authenticated;
grant execute on function public.delete_class_session(uuid) to authenticated;
grant execute on function public.session_results(uuid) to authenticated;
grant execute on function public.account_deletion_preview()   to authenticated;
grant execute on function public.delete_my_account(text)         to authenticated;

grant select on public.schools, public.school_members, public.classes, public.students, public.runs to authenticated;
grant update (name) on public.schools to authenticated;
grant update (name, session_config, hide_board, grade), delete on public.classes  to authenticated;
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
