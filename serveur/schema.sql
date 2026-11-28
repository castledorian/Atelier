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
  -- classe mixte : plusieurs niveaux (le plus bas est aussi copié dans « grade », valeur par défaut des élèves)
  grades          text[] check (grades is null or grades <@ array['cp', 'ce1', 'ce2', 'cm1', 'cm2']::text[]),
  created_at      timestamptz not null default now()
);
create index on public.classes (school_id);

create table public.students (
  id           uuid primary key default gen_random_uuid(),
  school_id    uuid not null references public.schools(id) on delete cascade,
  class_id     uuid not null references public.classes(id) on delete cascade,
  name         text not null check (char_length(name) between 1 and 24),
  code_hash    text not null unique,            -- empreinte du code (voir private.code_hash) : le code n'est jamais stocké
  access_code  text unique check (access_code is null or access_code ~ '^[A-Z0-9]{8}$'),   -- ancien code lisible (installations migrées) ; vide pour les nouveaux élèves
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
  played_at   timestamptz not null default now(),   -- heure annoncée par le navigateur (affichage, temps de jeu cumulé)
  received_at timestamptz not null default now(),   -- heure de réception : sert aux limites d'envoi
  unique (student_id, client_id)                -- renvoyer deux fois la même partie ne crée pas de doublon
);
create index on public.runs (class_id, game, mode, student_id, score desc);
create index on public.runs (school_id, game, mode, student_id, score desc);
create index on public.runs (student_id, played_at desc);
create index if not exists runs_received_idx on public.runs (student_id, received_at desc);

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

-- Empreinte d'un code élève : SHA-256 du code mêlé à un secret du serveur (« poivre », table app_settings).
create function private.code_hash(p text) returns text
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  return encode(sha256(convert_to((select value from private.app_settings where key = 'code_pepper') || ':' || private.norm_code(p), 'UTF8')), 'hex');
end $$;

-- À lancer volontairement sur une installation migrée : efface les codes encore lisibles (voir mise-a-jour-codes.sql).
create function private.wipe_plain_codes() returns bigint
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_n bigint;
begin
  update public.students set access_code = null where access_code is not null;
  get diagnostics v_n = row_count;
  return v_n;
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
  v_sid uuid := private.student_from_token_ro(p_token);
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
  v_sid uuid := private.student_from_token_ro(p_token);
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
declare v_sid uuid := private.student_from_token_ro(p_token);
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
create function public.reset_class_codes(p_class uuid) returns jsonb
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
  game          text not null check (game in ('typing', 'math', 'memory', 'spelling', 'lexique', 'facteur')),
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
  game         text not null check (game in ('typing', 'math', 'memory', 'spelling', 'lexique', 'facteur')),
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
    if s > 840 * c + 5000 then return 'score supérieur au maximum possible'; end if;      -- (100 + 40 de vitesse) × ×6 = 840 par réponse, + pages parfaites (6 × 400) et bonus final (≤ 1 750)
  elsif p_game = 'memory' then
    if c > 30 or w > 30 then return 'plus de manches que le jeu n''en contient'; end if;
    if c > d / 0.5 + 2 then return 'manches trop rapides'; end if;
    if s > 210 * greatest(w, 1) * c + 6000 then return 'score supérieur au maximum possible'; end if;   -- (25 + 10 de vitesse) × plus longue suite × ×6, + pages parfaites (6 × 400) et bonus final (≤ 2 750)
  elsif p_game = 'spelling' then
    if c > 10 then return 'plus de phrases que le jeu n''en contient'; end if;
    if d < c then return 'phrases trop rapides'; end if;                                  -- lire, toucher et choisir prend au moins 1 s
    if w > c then return 'série plus longue que le nombre de phrases'; end if;
    if s > 1000 * c + 1750 then return 'score supérieur au maximum possible'; end if;     -- 250 × ×4 (10 phrases) au mieux ; une phrase fautive rapporte au plus 175
  elsif p_game = 'lexique' then
    if c > d / 1.2 + 3 then return 'manches trop rapides'; end if;                        -- lire la consigne, repérer le mot et le taper prend plus d'1 s
    if w > c then return 'plus de manches que de bonnes réponses'; end if;
    if s > 840 * c + 100 then return 'score supérieur au maximum possible'; end if;       -- (100 + 40 de vitesse) × série ×6 = 840 au mieux
  elsif p_game = 'facteur' then
    if c > 16 or w > c then return 'plus de colis que le jeu n''en contient'; end if;     -- 16 colis par partie ; premiers essais réussis ≤ colis rangés
    if c > d / 0.8 + 3 then return 'colis rangés trop vite'; end if;                      -- lire trois mots et toucher une boîte prend au moins 1 s (pause de rangement comprise)
    if s > 600 * c + 100 then return 'score supérieur au maximum possible'; end if;       -- 100 × série ×6 = 600 au mieux par colis
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

-- ───────────────────────── Parties (limites sur l'heure de réception) ─────────────────────────

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

-- Espace de l'élève : les séances de sa classe, avec ses essais restants et son meilleur score.
create or replace function public.my_sessions(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_sid uuid := private.student_from_token_ro(p_token);
  v_s   public.students%rowtype;
begin
  if v_sid is null then return jsonb_build_object('error', 'invalid_session'); end if;
  select * into v_s from public.students where id = v_sid;
  return jsonb_build_object('ok', true,
    'grade', (select c.grade from public.classes c where c.id = v_s.class_id),
    'grades', (select c.grades from public.classes c where c.id = v_s.class_id),
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
  perform private.assert_reader(v_c.school_id);
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
  if char_length(v_t) not between 1 and 60 or p_game not in ('typing', 'math', 'memory', 'spelling', 'lexique', 'facteur')
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
  perform private.assert_reader(v_x.school_id);
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
  perform private.assert_reader(v_c.school_id);
  return coalesce((
    select jsonb_agg(to_jsonb(t) order by lower(t.name)) from (
      select s.id, s.name, case when private.is_member(v_c.school_id) then s.access_code end as access_code,
             count(r.id) filter (where r.kind = 'game')  as games,
             count(r.id) filter (where r.kind = 'drill') as drills,
             max(r.score) filter (where r.kind = 'game' and r.mode <> 'perso' and r.session_id is null and r.game = 'typing') as best_typing,
             max(r.score) filter (where r.kind = 'game' and r.mode <> 'perso' and r.session_id is null and r.game = 'math')   as best_math,
             max(r.score) filter (where r.kind = 'game' and r.mode <> 'perso' and r.session_id is null and r.game = 'memory') as best_memory,
             max(r.score) filter (where r.kind = 'game' and r.mode <> 'perso' and r.session_id is null and r.game = 'lexique') as best_lexique,
             max(r.score) filter (where r.kind = 'game' and r.mode <> 'perso' and r.session_id is null and r.game = 'facteur') as best_facteur,
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


-- ───────────────────────── Espace administrateur du site (lecture seule, voir mise-a-jour-admin.sql) ─────────────────────────

-- ───────────────────────── Tables ─────────────────────────

create table if not exists public.site_admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.site_admins enable row level security;   -- aucune politique : illisible depuis le navigateur
revoke all on public.site_admins from anon, authenticated;

create table if not exists private.admin_audit (
  id       bigint generated always as identity primary key,
  at       timestamptz not null default now(),
  admin_id uuid,
  action   text not null,
  target   text
);
create index if not exists admin_audit_at_idx on private.admin_audit (at);
alter table private.admin_audit enable row level security;

-- ───────────────────────── Contrôle d'accès ─────────────────────────

create or replace function private.assert_site_admin() returns void
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if not exists (select 1 from public.site_admins where user_id = auth.uid()) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
end $$;

-- « Suis-je administrateur ? » : sert uniquement à afficher le bouton. Ne lève jamais d'erreur.
create or replace function public.admin_check() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.site_admins where user_id = auth.uid())
$$;

-- ───────────────────────── Vue d'ensemble ─────────────────────────

create or replace function public.admin_overview() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v jsonb;
begin
  perform private.assert_site_admin();
  insert into private.admin_audit (admin_id, action) values (auth.uid(), 'overview');
  delete from private.admin_audit where at < now() - interval '1 year';
  select jsonb_build_object(
    'totals', jsonb_build_object(
      'schools',            (select count(*) from public.schools),
      'teachers',           (select count(distinct user_id) from public.school_members),
      'classes',            (select count(*) from public.classes),
      'students',           (select count(*) from public.students),
      'runs',               (select count(*) from public.runs),
      'runs_7d',            (select count(*) from public.runs where played_at > now() - interval '7 days'),
      'active_students_7d', (select count(distinct student_id) from public.runs where played_at > now() - interval '7 days'),
      'flags_7d',           (select count(*) from private.cheat_log where at > now() - interval '7 days'),
      'signups_7d',         (select count(*) from auth.users where created_at > now() - interval '7 days')
    ),
    'daily', (
      select coalesce(jsonb_agg(jsonb_build_object('day', to_char(d, 'YYYY-MM-DD'), 'runs', coalesce(c.n, 0)) order by d), '[]'::jsonb)
      from generate_series(current_date - 13, current_date, interval '1 day') d
      left join (select played_at::date as day, count(*) as n from public.runs where played_at >= current_date - 13 group by 1) c
        on c.day = d::date
    ),
    'games', (
      select coalesce(jsonb_agg(jsonb_build_object('game', game, 'runs', n) order by n desc), '[]'::jsonb)
      from (select game, count(*) as n from public.runs group by game) g
    ),
    'schools', (
      select coalesce(jsonb_agg(to_jsonb(t) order by t.last_run desc nulls last, t.created desc), '[]'::jsonb)
      from (
        select s.id, s.name,
               (extract(epoch from s.created_at) * 1000)::bigint as created,
               (select coalesce(jsonb_agg(u.email order by u.email), '[]'::jsonb)
                  from public.school_members m join auth.users u on u.id = m.user_id where m.school_id = s.id) as teachers,
               (select count(*) from public.classes c where c.school_id = s.id)  as classes,
               (select count(*) from public.students st where st.school_id = s.id) as students,
               (select count(*) from public.runs r where r.school_id = s.id)      as runs,
               (select (extract(epoch from max(r.played_at)) * 1000)::bigint from public.runs r where r.school_id = s.id) as last_run
        from public.schools s
      ) t
    )
  ) into v;
  return v;
end $$;

-- ───────────────────────── Détail d'une école (sans aucun code d'accès) ─────────────────────────

create or replace function public.admin_school(p_school uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v jsonb;
begin
  perform private.assert_site_admin();
  if not exists (select 1 from public.schools where id = p_school) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  insert into private.admin_audit (admin_id, action, target) values (auth.uid(), 'school', p_school::text);
  select jsonb_build_object(
    'school', (select jsonb_build_object('id', s.id, 'name', s.name, 'created', (extract(epoch from s.created_at) * 1000)::bigint)
               from public.schools s where s.id = p_school),
    'teachers', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'email', u.email, 'role', m.role,
               'since', (extract(epoch from m.created_at) * 1000)::bigint,
               'last_sign_in', (extract(epoch from u.last_sign_in_at) * 1000)::bigint) order by u.email), '[]'::jsonb)
      from public.school_members m join auth.users u on u.id = m.user_id where m.school_id = p_school
    ),
    'classes', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', c.id, 'name', c.name, 'grade', c.grade, 'grades', c.grades, 'hide_board', c.hide_board,
               'created', (extract(epoch from c.created_at) * 1000)::bigint,
               'students', (
                 select coalesce(jsonb_agg(jsonb_build_object(
                          'id', st.id, 'name', st.name,
                          'created', (extract(epoch from st.created_at) * 1000)::bigint,
                          'runs', x.n, 'seconds', x.secs, 'last_played', x.last) order by lower(st.name)), '[]'::jsonb)
                 from public.students st
                 left join lateral (
                   select count(*)::integer as n, coalesce(sum(r.duration), 0)::integer as secs,
                          (extract(epoch from max(r.played_at)) * 1000)::bigint as last
                   from public.runs r where r.student_id = st.id) x on true
                 where st.class_id = c.id)
             ) order by lower(c.name)), '[]'::jsonb)
      from public.classes c where c.school_id = p_school
    ),
    'recent', (
      select coalesce(jsonb_agg(to_jsonb(t) order by t.at desc), '[]'::jsonb)
      from (
        select (extract(epoch from r.played_at) * 1000)::bigint as at,
               st.name as student, c.name as class, r.game, r.mode, r.kind, r.score, r.acc, r.duration
        from public.runs r
        join public.students st on st.id = r.student_id
        join public.classes c on c.id = r.class_id
        where r.school_id = p_school
        order by r.played_at desc limit 60
      ) t
    )
  ) into v;
  return v;
end $$;

-- ───────────────────────── Journal : parties, inscriptions, anomalies, consultations ─────────────────────────

create or replace function public.admin_logs(p_limit integer default 200) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare n integer := least(greatest(coalesce(p_limit, 200), 1), 500);
begin
  perform private.assert_site_admin();
  insert into private.admin_audit (admin_id, action) values (auth.uid(), 'logs');
  return jsonb_build_object(
    'runs', (
      select coalesce(jsonb_agg(to_jsonb(t) order by t.at desc), '[]'::jsonb)
      from (
        select (extract(epoch from r.played_at) * 1000)::bigint as at,
               sc.name as school, c.name as class, st.name as student,
               r.game, r.mode, r.kind, r.score, r.acc, r.duration
        from public.runs r
        join public.students st on st.id = r.student_id
        join public.classes c   on c.id  = r.class_id
        join public.schools sc  on sc.id = r.school_id
        order by r.played_at desc limit n
      ) t),
    'signups', (
      select coalesce(jsonb_agg(to_jsonb(t) order by t.at desc), '[]'::jsonb)
      from (
        select u.email, (extract(epoch from u.created_at) * 1000)::bigint as at,
               (extract(epoch from u.last_sign_in_at) * 1000)::bigint as last_sign_in,
               (u.email_confirmed_at is not null) as confirmed,
               (select count(*) from public.school_members m where m.user_id = u.id) as schools
        from auth.users u order by u.created_at desc limit 50
      ) t),
    'flags', (
      select coalesce(jsonb_agg(to_jsonb(t) order by t.at desc), '[]'::jsonb)
      from (
        select (extract(epoch from f.at) * 1000)::bigint as at, st.name as student, sc.name as school,
               f.game, f.mode, f.reason
        from private.cheat_log f
        left join public.students st on st.id = f.student_id
        left join public.schools sc  on sc.id = st.school_id
        order by f.at desc limit n
      ) t),
    'audit', (
      select coalesce(jsonb_agg(to_jsonb(t) order by t.at desc), '[]'::jsonb)
      from (
        select (extract(epoch from a.at) * 1000)::bigint as at, u.email as admin, a.action, a.target
        from private.admin_audit a left join auth.users u on u.id = a.admin_id
        order by a.at desc limit 50
      ) t)
  );
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
-- secret du serveur mêlé aux codes élèves avant l'empreinte (voir private.code_hash)
insert into private.app_settings (key, value)
values ('code_pepper', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''))
on conflict (key) do nothing;

-- Registre des mises à jour appliquées (affiché par public.server_version()).
create table if not exists private.schema_migrations (
  id         text primary key,
  applied_at timestamptz not null default now()
);
alter table private.schema_migrations enable row level security;
insert into private.schema_migrations (id) values ('2026-11-fiabilite'), ('2026-11-codes'), ('2026-11-grotte'), ('2026-11-lexique'), ('2026-11-bareme'), ('2026-11-facteur'), ('2026-11-stats'), ('2026-11-goutte') on conflict (id) do nothing;

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
  v_rv   text := coalesce((select pg_get_functiondef(p.oid) from pg_proc p
                           where p.pronamespace = 'private'::regnamespace and p.proname = 'run_violation'), '');
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
    'grotte',      to_regprocedure('public.cave_get(text)') is not null and to_regprocedure('public.cave_drop(text,text,integer,integer)') is not null and to_regprocedure('public.admin_observe(text,uuid)') is not null,
    'lexique',     v_ov like '%best_lexique%' and exists (select 1 from pg_constraint where conname = 'class_sessions_game_check' and pg_get_constraintdef(oid) like '%lexique%'),
    'bareme',      v_rv like '%840 * c%',
    'facteur',     v_rv like '%facteur%' and v_ov like '%best_facteur%' and exists (select 1 from pg_constraint where conname = 'class_sessions_game_check' and pg_get_constraintdef(oid) like '%facteur%'),
    'stats',       to_regprocedure('public.admin_game_stats(integer)') is not null
                   and coalesce((select pg_get_functiondef(p.oid) from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'submit_item_stats'), '') like '%facteur%'
                   and exists (select 1 from pg_constraint where conname = 'item_stats_game_check' and pg_get_constraintdef(oid) like '%facteur%'),
    'goutte',      to_regprocedure('public.goutte_get(text)') is not null and to_regprocedure('public.cave_history(text)') is not null,
    'nettoyage_auto', v_cron
  );
  return jsonb_build_object(
    'version', 18,
    'features', f,
    'migrations', coalesce((select jsonb_agg(id order by id) from private.schema_migrations), '[]'::jsonb),
    'plain_codes', (select count(*) from public.students where access_code is not null),
    'missing', coalesce((select jsonb_agg(k order by k) from jsonb_each(f) as e(k, v) where v = 'false'::jsonb), '[]'::jsonb));
end $$;

-- ───────────────────────── Aides : administrateur du site, lecteur, jeton d'observation ─────────────────────────

create or replace function private.is_site_admin() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.site_admins where user_id = auth.uid())
$$;

create or replace function private.is_member(p_school uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.school_members m where m.school_id = p_school and m.user_id = auth.uid())
$$;

-- Lecture : membre de l'école OU administrateur du site (observation en lecture seule). Les fonctions qui MODIFIENT gardent assert_member.
create or replace function private.assert_reader(p_school uuid) returns void
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if not (private.is_member(p_school) or private.is_site_admin()) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
end $$;

-- Jeton d'élève pour les fonctions de LECTURE seulement : « obs:<id> » est accepté pour un administrateur du site connecté.
-- Les fonctions qui écrivent (envoi de parties, etc.) continuent d'utiliser private.student_from_token : un jeton d'observation n'y vaut rien.
create or replace function private.student_from_token_ro(p_token text) returns uuid
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if p_token like 'obs:%' then
    if auth.uid() is not null and private.is_site_admin() and substr(p_token, 5) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      return (select id from public.students where id = substr(p_token, 5)::uuid);
    end if;
    return null;
  end if;
  return private.student_from_token(p_token);
end $$;

-- ───────────────────────── La grotte, par classe ─────────────────────────
-- Chaque partie libre envoie ses fautes et réussites (compteurs anonymes, sans lien avec une personne autre que la ligne de partie déjà
-- existante). Le monstre d'une classe est la somme de ces compteurs depuis la rentrée (1er août), après la dernière remise à zéro.

alter table public.runs add column if not exists cave_ink   integer;
alter table public.runs add column if not exists cave_power integer;

create table if not exists public.class_cave (
  class_id uuid primary key references public.classes(id) on delete cascade,
  reset_at timestamptz,
  won_at   timestamptz
);
alter table public.class_cave enable row level security;   -- aucune politique : inaccessible depuis le navigateur

create or replace function private.cave_start() returns timestamptz
language sql stable as $$
  select make_timestamptz(
    case when extract(month from now() at time zone 'Europe/Paris') >= 8
         then extract(year from now() at time zone 'Europe/Paris')::int
         else extract(year from now() at time zone 'Europe/Paris')::int - 1 end,
    8, 1, 0, 0, 0, 'Europe/Paris')
$$;

-- Compteurs de grotte qui ne passent pas par une ligne de partie : une partie sans aucune bonne réponse (donc non envoyée) mais pleine de fautes,
-- ou une règle revue en duel. Un envoi par identifiant (sans doublon) ; sans lien avec le classement ni les résultats.
create table if not exists public.cave_drops (
  id          bigint generated always as identity primary key,
  class_id    uuid not null references public.classes(id) on delete cascade,
  student_id  uuid not null references public.students(id) on delete cascade,
  client_id   text not null,
  ink         integer not null,
  power       integer not null,
  received_at timestamptz not null default now(),
  unique (student_id, client_id)
);
create index if not exists cave_drops_class_idx on public.cave_drops (class_id, received_at);
alter table public.cave_drops enable row level security;   -- aucune politique : inaccessible depuis le navigateur
revoke all on public.cave_drops from anon, authenticated;

create or replace function public.cave_drop(p_token text, p_client_id text, p_ink integer, p_power integer) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_sid uuid := private.student_from_token(p_token); v_s public.students%rowtype;
begin
  if v_sid is null then return jsonb_build_object('error', 'invalid_session'); end if;
  if p_client_id !~ '^[A-Za-z0-9_-]{6,60}$' then return jsonb_build_object('error', 'invalid_data'); end if;
  if (select count(*) from public.cave_drops where student_id = v_sid and received_at > now() - interval '1 hour') > 120 then
    return jsonb_build_object('error', 'rate_limited');
  end if;
  select * into v_s from public.students where id = v_sid;
  insert into public.cave_drops (class_id, student_id, client_id, ink, power)
  values (v_s.class_id, v_sid, p_client_id, least(500, greatest(-100, coalesce(p_ink, 0))), least(500, greatest(0, coalesce(p_power, 0))))
  on conflict (student_id, client_id) do nothing;
  delete from public.cave_drops where received_at < now() - interval '400 days';
  return jsonb_build_object('ok', true);
end $$;

create or replace function private.cave_state(p_classes uuid[]) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_start timestamptz := private.cave_start();
  v_ink   bigint;
  v_pow   bigint;
  v_games bigint;
  v_dink  bigint;
  v_dpow  bigint;
  v_dn    bigint;
  v_n     integer := coalesce(array_length(p_classes, 1), 0);
  v_won   integer;
  v_at    timestamptz;
begin
  select coalesce(sum(r.cave_ink), 0), coalesce(sum(r.cave_power), 0), count(*) filter (where r.cave_ink >= 0)
    into v_ink, v_pow, v_games
  from public.runs r
  left join public.class_cave c on c.class_id = r.class_id
  where r.class_id = any(p_classes) and r.cave_ink is not null
    and r.received_at >= greatest(v_start, coalesce(c.reset_at, '-infinity'::timestamptz));
  select coalesce(sum(d.ink), 0), coalesce(sum(d.power), 0), count(*) filter (where d.ink >= 0)
    into v_dink, v_dpow, v_dn
  from public.cave_drops d
  left join public.class_cave c on c.class_id = d.class_id
  where d.class_id = any(p_classes)
    and d.received_at >= greatest(v_start, coalesce(c.reset_at, '-infinity'::timestamptz));
  select count(*), max(c.won_at) into v_won, v_at
  from public.class_cave c where c.class_id = any(p_classes) and c.won_at >= v_start;
  return jsonb_build_object(
    'ink', greatest(0, v_ink + v_dink), 'power', greatest(0, v_pow + v_dpow), 'games', v_games + v_dn,
    'won_at', case when v_n > 0 and v_won = v_n then (extract(epoch from v_at) * 1000)::bigint end,
    'classes', v_n);
end $$;

-- Envoi des compteurs d'une partie (après l'envoi de la partie elle-même ; sans effet si déjà fait ou si la partie n'existe pas).
-- Négatif pour l'encre = une règle retravaillée (entraînement réussi) : la créature maigrit.
create or replace function public.cave_report(p_token text, p_client_id text, p_ink integer, p_power integer) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_sid uuid := private.student_from_token(p_token);
begin
  if v_sid is null then return jsonb_build_object('error', 'invalid_session'); end if;
  if p_client_id !~ '^[A-Za-z0-9_-]{6,40}$' then return jsonb_build_object('error', 'invalid_data'); end if;
  update public.runs
     set cave_ink = least(500, greatest(-100, coalesce(p_ink, 0))), cave_power = least(500, greatest(0, coalesce(p_power, 0)))
   where student_id = v_sid and client_id = p_client_id and cave_ink is null and session_id is null;
  return jsonb_build_object('ok', true);
end $$;

-- La grotte de la classe de l'élève (lecture : l'administrateur peut observer avec un jeton « obs: »).
create or replace function public.cave_get(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_sid uuid := private.student_from_token_ro(p_token); v_c uuid;
begin
  if v_sid is null then return jsonb_build_object('error', 'invalid_session'); end if;
  select class_id into v_c from public.students where id = v_sid;
  return private.cave_state(array[v_c]);
end $$;

-- Victoire de fin d'année de la classe (juin à août seulement).
create or replace function public.cave_win(p_token text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_sid uuid := private.student_from_token(p_token); v_c uuid;
begin
  if v_sid is null then return jsonb_build_object('error', 'invalid_session'); end if;
  if extract(month from now() at time zone 'Europe/Paris') not between 6 and 8 then return jsonb_build_object('error', 'too_early'); end if;
  select class_id into v_c from public.students where id = v_sid;
  insert into public.class_cave (class_id, won_at) values (v_c, now())
  on conflict (class_id) do update set won_at = now();
  return jsonb_build_object('ok', true);
end $$;

-- Côté enseignant : la grotte des classes données (toutes ses classes si la liste est vide). Lecture : membre ou administrateur du site.
create or replace function public.teacher_cave(p_classes uuid[] default null) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_list uuid[]; v_c uuid;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if coalesce(array_length(p_classes, 1), 0) = 0 then
    select coalesce(array_agg(c.id), array[]::uuid[]) into v_list
    from public.classes c where private.is_member(c.school_id);
  else
    v_list := p_classes;
    foreach v_c in array v_list loop
      perform private.assert_reader((select school_id from public.classes where id = v_c));
    end loop;
  end if;
  return private.cave_state(v_list);
end $$;

-- Combat final réussi / remise à zéro : réservés aux membres de l'école (jamais à l'administrateur du site).
create or replace function public.teacher_cave_win(p_classes uuid[]) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_c uuid; v_list uuid[];
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  v_list := case when coalesce(array_length(p_classes, 1), 0) = 0
                 then (select coalesce(array_agg(c.id), array[]::uuid[]) from public.classes c where private.is_member(c.school_id))
                 else p_classes end;
  foreach v_c in array v_list loop
    perform private.assert_member((select school_id from public.classes where id = v_c));
    insert into public.class_cave (class_id, won_at) values (v_c, now()) on conflict (class_id) do update set won_at = now();
  end loop;
end $$;

create or replace function public.teacher_cave_reset(p_classes uuid[]) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_c uuid; v_list uuid[];
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  v_list := case when coalesce(array_length(p_classes, 1), 0) = 0
                 then (select coalesce(array_agg(c.id), array[]::uuid[]) from public.classes c where private.is_member(c.school_id))
                 else p_classes end;
  foreach v_c in array v_list loop
    perform private.assert_member((select school_id from public.classes where id = v_c));
    insert into public.class_cave (class_id, reset_at, won_at) values (v_c, now(), null)
    on conflict (class_id) do update set reset_at = now(), won_at = null;
  end loop;
end $$;

-- ───────────────────────── Observation en lecture seule (administrateur du site) ─────────────────────────
-- Début d'une observation : on garde une trace (journal), et on renvoie de quoi afficher l'écran de la personne observée.
create or replace function public.admin_observe(p_kind text, p_target uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v jsonb;
begin
  perform private.assert_site_admin();
  if p_kind = 'student' then
    select jsonb_build_object(
             'student', jsonb_build_object('id', s.id, 'name', s.name),
             'class',   jsonb_build_object('id', c.id, 'name', c.name, 'session_config', c.session_config),
             'school',  jsonb_build_object('id', sc.id, 'name', sc.name))
      into v
    from public.students s join public.classes c on c.id = s.class_id join public.schools sc on sc.id = s.school_id
    where s.id = p_target;
  elsif p_kind = 'school' then
    select jsonb_build_object('school', jsonb_build_object('id', sc.id, 'name', sc.name)) into v from public.schools sc where sc.id = p_target;
  else
    raise exception 'invalid' using errcode = '22023';
  end if;
  if v is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  insert into private.admin_audit (admin_id, action, target) values (auth.uid(), 'observe_' || p_kind, p_target::text);
  return v;
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
grant execute on function public.reset_class_codes(uuid)          to authenticated;
grant execute on function public.delete_school(uuid)               to authenticated;
grant execute on function public.admin_check()                to authenticated;
grant execute on function public.admin_overview()             to authenticated;
grant execute on function public.admin_school(uuid)           to authenticated;
grant execute on function public.admin_logs(integer)          to authenticated;
grant execute on function public.my_teacher_access()                 to authenticated;
grant execute on function public.redeem_invitation(text)             to authenticated;
grant execute on function public.admin_invitations()                 to authenticated;
grant execute on function public.admin_create_invitation(text, integer, integer) to authenticated;
grant execute on function public.admin_revoke_invitation(text)       to authenticated;
grant execute on function public.admin_set_invite_only(boolean)      to authenticated;
grant execute on function public.server_version()                    to authenticated;
grant execute on function public.class_overview(uuid)            to authenticated;
grant execute on function public.list_class_sessions(uuid) to authenticated;
grant execute on function public.save_class_session(uuid, uuid, text, text, jsonb, integer, boolean) to authenticated;
grant execute on function public.delete_class_session(uuid) to authenticated;
grant execute on function public.session_results(uuid) to authenticated;
grant execute on function public.account_deletion_preview()   to authenticated;
grant execute on function public.delete_my_account(text)         to authenticated;

grant select on public.schools, public.school_members, public.classes, public.runs to authenticated;
grant select (id, school_id, class_id, name, created_at) on public.students to authenticated;
grant update (name) on public.schools to authenticated;
grant update (name, session_config, hide_board, grade, grades), delete on public.classes  to authenticated;
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

-- L'administrateur du site lit (sans jamais modifier) les écoles, classes, élèves et parties pour l'observation en lecture seule.
-- Les colonnes secrètes des élèves (code, empreinte du code) ne sont lisibles par personne depuis le navigateur.
drop policy if exists schools_admin_read on public.schools;
drop policy if exists classes_admin_read on public.classes;
drop policy if exists students_admin_read on public.students;
drop policy if exists runs_admin_read on public.runs;
create policy schools_admin_read  on public.schools  for select to authenticated using ((select public.admin_check()));
create policy classes_admin_read  on public.classes  for select to authenticated using ((select public.admin_check()));
create policy students_admin_read on public.students for select to authenticated using ((select public.admin_check()));
create policy runs_admin_read     on public.runs     for select to authenticated using ((select public.admin_check()));

-- student_sessions et private.login_attempts : RLS activée, aucune politique, aucun droit → inaccessibles depuis le navigateur.


-- ═══════════════════ Suivi des exercices (identique à mise-a-jour-exercices.sql) ═══════════════════
-- ───────────────────────── Table ─────────────────────────

create table if not exists public.item_stats (
  game        text    not null check (game in ('math', 'spelling', 'facteur')),
  level       text    not null check (level in ('cp', 'ce1', 'ce2', 'cm1', 'cm2')),
  difficulty  text    not null check (difficulty ~ '^[a-z0-9_-]{1,20}$'),
  version     integer not null default 1 check (version between 0 and 999),
  kind        text    not null check (kind in ('rule', 'item')),        -- rule = famille de calcul ou règle d'orthographe ; item = un calcul ou une phrase précis
  item        text    not null check (char_length(item) between 1 and 80),
  label       text    not null check (char_length(label) between 1 and 160),
  shown       bigint  not null default 0,                                -- fois où l'exercice a été posé
  wrong       bigint  not null default 0,                                -- fois où il a été raté (au premier essai)
  picks       jsonb   not null default '{}'::jsonb check (jsonb_typeof(picks) = 'object'),   -- mauvaises réponses choisies : { "réponse": nombre }
  updated_at  timestamptz not null default now(),
  primary key (game, level, difficulty, version, kind, item)
);
alter table public.item_stats enable row level security;     -- aucune politique : illisible depuis le navigateur
revoke all on public.item_stats from anon, authenticated;

-- Anti-abus : un petit journal des envois (sans contenu), effacé au fil de l'eau.
create table if not exists private.item_stats_calls (
  student_id uuid not null,
  at         timestamptz not null default now()
);
create index if not exists item_stats_calls_idx on private.item_stats_calls (student_id, at);
alter table private.item_stats_calls enable row level security;

-- ───────────────────────── Outils internes ─────────────────────────

-- Additionne deux tableaux { réponse: nombre } et garde les 8 réponses les plus fréquentes.
create or replace function private.merge_picks(a jsonb, b jsonb) returns jsonb
language sql immutable set search_path = public, pg_temp as $$
  select coalesce(jsonb_object_agg(t.k, t.n), '{}'::jsonb)
  from (
    select u.k, sum(u.n)::integer as n
    from (
      select key as k, value::integer as n from jsonb_each_text(coalesce(a, '{}'::jsonb))
      union all
      select key, value::integer from jsonb_each_text(coalesce(b, '{}'::jsonb))
    ) u
    group by u.k order by sum(u.n) desc, u.k limit 8
  ) t
$$;

-- Enregistre les compteurs. Chaque entrée : { k: 'rule'|'item', i: identifiant, l: libellé, n: posé, e: raté, p: { réponse: nombre } }.
-- Les entrées invalides sont ignorées une à une ; ne lève jamais d'erreur vers le jeu.
create or replace function private.store_items(p_game text, p_level text, p_diff text, p_version integer, p_items jsonb) returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  e     jsonb;
  v_n   integer;
  v_e   integer;
  v_k   text;
  v_i   text;
  v_l   text;
  v_p   jsonb;
  v_cnt integer := 0;
begin
  for e in select value from jsonb_array_elements(p_items) limit 120 loop
    begin
      v_k := e->>'k';
      v_i := left(btrim(coalesce(e->>'i', '')), 80);
      v_l := left(btrim(coalesce(e->>'l', '')), 160);
      v_n := (e->>'n')::integer;
      v_e := (e->>'e')::integer;
      continue when v_k not in ('rule', 'item') or v_i = '' or v_l = '' or v_n is null or v_e is null
                    or v_n < 1 or v_n > (case when v_k = 'rule' then 100 else 5 end) or v_e < 0 or v_e > v_n;
      -- au plus 3 000 exercices précis par jeu et niveau : la table ne peut pas grossir sans limite
      if v_k = 'item'
         and not exists (select 1 from public.item_stats s where s.game = p_game and s.level = p_level and s.difficulty = p_diff
                         and s.version = p_version and s.kind = 'item' and s.item = v_i)
         and (select count(*) from public.item_stats s where s.game = p_game and s.level = p_level and s.kind = 'item') >= 3000 then
        continue;
      end if;
      v_p := '{}'::jsonb;
      if jsonb_typeof(e->'p') = 'object' then
        select coalesce(jsonb_object_agg(left(x.key, 40), least(5, greatest(1, x.value::integer))), '{}'::jsonb)
          into v_p from (select key, value from jsonb_each_text(e->'p') limit 3) x;
      end if;
      insert into public.item_stats (game, level, difficulty, version, kind, item, label, shown, wrong, picks)
      values (p_game, p_level, p_diff, p_version, v_k, v_i, v_l, v_n, v_e, v_p)
      on conflict (game, level, difficulty, version, kind, item) do update
        set shown = public.item_stats.shown + excluded.shown,
            wrong = public.item_stats.wrong + excluded.wrong,
            picks = private.merge_picks(public.item_stats.picks, excluded.picks),
            label = excluded.label,
            updated_at = now();
      v_cnt := v_cnt + 1;
    exception when others then
      null;   -- une entrée mal formée n'empêche pas les autres
    end;
  end loop;
  return v_cnt;
end $$;

-- ───────────────────────── Envoi par le jeu (élève connecté) ─────────────────────────

create or replace function public.submit_item_stats(
  p_token text, p_game text, p_level text, p_difficulty text, p_version integer, p_items jsonb
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_sid uuid := private.student_from_token(p_token);
  v_n   integer;
begin
  if v_sid is null then return jsonb_build_object('error', 'invalid_session'); end if;
  if p_game not in ('math', 'spelling', 'facteur') or p_level not in ('cp', 'ce1', 'ce2', 'cm1', 'cm2')
     or (p_game = 'facteur' and (p_level <> 'cp' or p_difficulty !~ '^n[1-9]$'))
     or p_difficulty is null or p_difficulty !~ '^[a-z0-9_-]{1,20}$'
     or p_difficulty = 'perso'
     or p_version is null or p_version < 0 or p_version > 999
     or p_items is null or jsonb_typeof(p_items) <> 'array' or octet_length(p_items::text) > 12000 then
    return jsonb_build_object('error', 'invalid_data');
  end if;
  -- l'élève doit venir de jouer une partie libre de ce jeu (le compteur ne peut pas être alimenté « à vide »)
  if not exists (select 1 from public.runs r
                 where r.student_id = v_sid and r.game = p_game and r.kind = 'game' and r.session_id is null
                   and r.played_at > now() - interval '30 minutes') then
    return jsonb_build_object('error', 'invalid_data');
  end if;
  -- 60 envois par heure et par élève (une partie dure au moins une minute)
  delete from private.item_stats_calls where at < now() - interval '1 day';
  if (select count(*) from private.item_stats_calls where student_id = v_sid and at > now() - interval '1 hour') >= 60 then
    return jsonb_build_object('error', 'rate_limited');
  end if;
  insert into private.item_stats_calls (student_id) values (v_sid);
  v_n := private.store_items(p_game, p_level, p_difficulty, coalesce(p_version, 1), p_items);
  return jsonb_build_object('ok', true, 'stored', v_n);
end $$;

-- ───────────────────────── Lecture réservée à l'administrateur du site ─────────────────────────

-- Taux de réussite par jeu, niveau et difficulté, à comparer à l'objectif (apprenti ≈ 95 %, standard ≈ 85 %, expert ≈ 65 %).
create or replace function public.admin_balance() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform private.assert_site_admin();
  insert into private.admin_audit (admin_id, action) values (auth.uid(), 'balance');
  delete from private.admin_audit where at < now() - interval '1 year';
  return jsonb_build_object(
    'levels', (
      select coalesce(jsonb_agg(to_jsonb(t) order by t.game, t.level, t.difficulty, t.version), '[]'::jsonb)
      from (
        select b.game, coalesce(b.level, '-') as level, b.difficulty, b.version,
               count(*)::integer as runs,
               coalesce(sum(b.rounds_ok), 0)::bigint as ok,
               coalesce(sum(b.rounds_err), 0)::bigint as err,
               round(100.0 * sum(b.rounds_ok) / nullif(sum(b.rounds_ok + b.rounds_err), 0), 1) as success_pct,
               round(100.0 * count(*) filter (where b.outcome = 'finished') / count(*), 1) as finished_pct,
               round(avg(b.score))::integer as avg_score,
               round(avg(b.duration))::integer as avg_duration
        from public.balance_runs b
        where not b.custom
        group by b.game, b.level, b.difficulty, b.version
      ) t)
  );
end $$;

-- Les familles et les exercices les plus ratés. Les exercices vus moins de 3 fois sont ignorés (trop peu fiables).
create or replace function public.admin_item_stats(p_game text default null, p_level text default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform private.assert_site_admin();
  insert into private.admin_audit (admin_id, action, target) values (auth.uid(), 'item_stats', left(coalesce(p_game, '') || ' ' || coalesce(p_level, ''), 40));
  delete from private.admin_audit where at < now() - interval '1 year';
  return jsonb_build_object(
    'rules', (
      select coalesce(jsonb_agg(to_jsonb(t) order by t.game, t.level, t.difficulty, t.err_pct desc nulls last), '[]'::jsonb)
      from (
        select s.game, s.level, s.difficulty, s.version, s.item, s.label, s.shown, s.wrong,
               round(100.0 * s.wrong / nullif(s.shown, 0), 1) as err_pct, s.picks
        from public.item_stats s
        where s.kind = 'rule' and (p_game is null or s.game = p_game) and (p_level is null or s.level = p_level)
      ) t),
    'items', (
      select coalesce(jsonb_agg(to_jsonb(t) order by t.err_pct desc, t.shown desc), '[]'::jsonb)
      from (
        select s.game, s.level, s.difficulty, s.version, s.item, s.label, s.shown, s.wrong,
               round(100.0 * s.wrong / nullif(s.shown, 0), 1) as err_pct, s.picks
        from public.item_stats s
        where s.kind = 'item' and s.shown >= 3 and (p_game is null or s.game = p_game) and (p_level is null or s.level = p_level)
        order by 100.0 * s.wrong / s.shown desc, s.shown desc
        limit 600
      ) t)
  );
end $$;

-- Statistiques des parties pour l'équilibrage (administrateur du site seulement). p_days : période étudiée (7 à 400 jours).
-- Parties libres = ni séance de classe, ni entraînement. Le « niveau » est celui de la CLASSE (fixé par l'enseignant), « ? » s'il n'est pas fixé.
create or replace function public.admin_game_stats(p_days integer default 90) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_days integer := least(400, greatest(7, coalesce(p_days, 90)));
  v_from timestamptz := now() - make_interval(days => least(400, greatest(7, coalesce(p_days, 90))));
begin
  perform private.assert_site_admin();
  insert into private.admin_audit (admin_id, action, target) values (auth.uid(), 'game_stats', v_days::text);
  delete from private.admin_audit where at < now() - interval '1 year';
  return jsonb_build_object(
    'days', v_days,
    'totals', (
      select jsonb_build_object(
        'runs', count(*), 'players', count(distinct r.student_id), 'classes', count(distinct r.class_id), 'schools', count(distinct r.school_id),
        'session_runs', count(*) filter (where r.session_id is not null), 'drills', count(*) filter (where r.kind = 'drill'),
        'minutes', coalesce(round(sum(r.duration) / 60.0), 0))
      from public.runs r where r.played_at >= v_from),
    'by_grade', (
      select coalesce(jsonb_agg(to_jsonb(t) order by t.game, t.grade, t.mode), '[]'::jsonb)
      from (
        select r.game, r.mode, coalesce(c.grade, '?') as grade,
               count(*)::integer as runs,
               count(distinct r.student_id)::integer as players,
               count(distinct r.class_id)::integer as classes,
               round(avg(r.acc), 1) as acc,
               round(percentile_cont(0.5) within group (order by r.acc)::numeric, 1) as acc_med,
               round(percentile_cont(0.25) within group (order by r.score)::numeric)::integer as score_p25,
               round(percentile_cont(0.5) within group (order by r.score)::numeric)::integer as score_med,
               round(percentile_cont(0.75) within group (order by r.score)::numeric)::integer as score_p75,
               round(percentile_cont(0.5) within group (order by r.duration)::numeric)::integer as dur_med,
               round(avg(r.correct), 1) as correct,
               round(avg(r.wave), 1) as wave,
               round(100.0 * count(*) filter (where r.acc < 60) / count(*), 1) as low_pct,
               round(100.0 * count(*) filter (where r.acc >= 95) / count(*), 1) as high_pct,
               round(100.0 * count(*) filter (where r.duration < 30) / count(*), 1) as short_pct
        from public.runs r join public.classes c on c.id = r.class_id
        where r.played_at >= v_from and r.session_id is null and r.kind = 'game'
        group by r.game, r.mode, coalesce(c.grade, '?')
      ) t),
    'by_class', (
      select coalesce(jsonb_agg(to_jsonb(t) order by t.runs desc), '[]'::jsonb)
      from (
        select s.name as school, c.name as class, coalesce(c.grade, '?') as grade, r.game,
               count(*)::integer as runs,
               count(distinct r.student_id)::integer as players,
               count(*) filter (where r.session_id is not null)::integer as session_runs,
               round(avg(r.acc), 1) as acc,
               round(percentile_cont(0.5) within group (order by r.score)::numeric)::integer as score_med,
               round(percentile_cont(0.5) within group (order by r.duration)::numeric)::integer as dur_med,
               (extract(epoch from max(r.played_at)) * 1000)::bigint as last_at
        from public.runs r join public.classes c on c.id = r.class_id join public.schools s on s.id = r.school_id
        where r.played_at >= v_from and r.kind = 'game'
        group by s.name, c.id, c.name, c.grade, r.game
        having count(distinct r.student_id) >= 3
        order by count(*) desc
        limit 400
      ) t),
    'weekly', (
      select coalesce(jsonb_agg(to_jsonb(t) order by t.week, t.game), '[]'::jsonb)
      from (
        select to_char(date_trunc('week', r.played_at at time zone 'Europe/Paris'), 'YYYY-MM-DD') as week, r.game,
               count(*)::integer as runs, count(distinct r.student_id)::integer as players
        from public.runs r where r.played_at >= v_from
        group by 1, 2
      ) t),
    'hours', (
      select coalesce(jsonb_agg(to_jsonb(t) order by t.dow, t.hour), '[]'::jsonb)
      from (
        select extract(isodow from r.played_at at time zone 'Europe/Paris')::integer as dow,
               extract(hour from r.played_at at time zone 'Europe/Paris')::integer as hour,
               count(*)::integer as runs
        from public.runs r where r.played_at >= v_from
        group by 1, 2
      ) t),
    'loyalty', (
      select coalesce(jsonb_agg(to_jsonb(t) order by t.game), '[]'::jsonb)
      from (
        select p.game, count(*)::integer as players,
               round(avg(p.n), 1) as runs_per_player,
               round(100.0 * count(*) filter (where p.days >= 2) / count(*), 1) as back_pct,
               round(100.0 * count(*) filter (where p.n >= 10) / count(*), 1) as ten_pct,
               round(100.0 * count(*) filter (where p.n = 1) / count(*), 1) as once_pct
        from (
          select r.game, r.student_id, count(*) as n, count(distinct (r.played_at at time zone 'Europe/Paris')::date) as days
          from public.runs r where r.played_at >= v_from and r.kind = 'game'
          group by r.game, r.student_id
        ) p
        group by p.game
      ) t),
    'cheats', (
      select coalesce(jsonb_agg(to_jsonb(t) order by t.n desc), '[]'::jsonb)
      from (
        select coalesce(l.game, '?') as game, l.reason, count(*)::integer as n, count(distinct l.student_id)::integer as players
        from private.cheat_log l where l.at >= v_from
        group by 1, 2
      ) t),
    'balance', (
      select coalesce(jsonb_agg(to_jsonb(t) order by t.game, t.level, t.difficulty), '[]'::jsonb)
      from (
        select b.game, coalesce(b.level, '-') as level, b.difficulty,
               count(*)::integer as runs,
               coalesce(sum(b.rounds_ok), 0)::bigint as ok,
               coalesce(sum(b.rounds_err), 0)::bigint as err,
               round(100.0 * sum(b.rounds_ok) / nullif(sum(b.rounds_ok + b.rounds_err), 0), 1) as success_pct,
               round(100.0 * count(*) filter (where b.outcome = 'finished') / count(*), 1) as finished_pct,
               round(100.0 * count(*) filter (where b.outcome = 'lost' and coalesce(b.duration, 0) < 45) / count(*), 1) as early_loss_pct,
               round(percentile_cont(0.5) within group (order by b.duration)::numeric)::integer as dur_med,
               round(percentile_cont(0.5) within group (order by b.wave)::numeric, 1) as wave_med
        from public.balance_runs b
        where not b.custom and b.played_at >= v_from
        group by b.game, coalesce(b.level, '-'), b.difficulty
      ) t)
  );
end $$;

revoke all on function private.merge_picks(jsonb, jsonb) from public, anon, authenticated;
revoke all on function private.is_site_admin()                  from public, anon, authenticated;
revoke all on function private.is_member(uuid)                  from public, anon, authenticated;
revoke all on function private.assert_reader(uuid)              from public, anon, authenticated;
revoke all on function private.student_from_token_ro(text)      from public, anon, authenticated;
revoke all on function private.cave_start()                     from public, anon, authenticated;
revoke all on function private.cave_state(uuid[])               from public, anon, authenticated;
revoke all on function public.cave_report(text, text, integer, integer) from public;
revoke all on function public.cave_get(text)                    from public;
revoke all on function public.cave_drop(text, text, integer, integer) from public;
revoke all on function public.cave_win(text)                    from public;
revoke all on function public.teacher_cave(uuid[])              from public, anon;
revoke all on function public.teacher_cave_win(uuid[])          from public, anon;
revoke all on function public.teacher_cave_reset(uuid[])        from public, anon;
revoke all on function public.admin_observe(text, uuid)         from public, anon;
grant execute on function public.cave_report(text, text, integer, integer) to anon, authenticated;
grant execute on function public.cave_get(text)                 to anon, authenticated;
grant execute on function public.cave_drop(text, text, integer, integer) to anon, authenticated;
grant execute on function public.cave_win(text)                 to anon, authenticated;
grant execute on function public.teacher_cave(uuid[])           to authenticated;
grant execute on function public.teacher_cave_win(uuid[])       to authenticated;
grant execute on function public.teacher_cave_reset(uuid[])     to authenticated;
grant execute on function public.admin_observe(text, uuid)      to authenticated;
revoke all on function private.code_hash(text) from public, anon, authenticated;
revoke all on function private.wipe_plain_codes() from public, anon, authenticated;
revoke all on function private.store_items(text, text, text, integer, jsonb) from public, anon, authenticated;
revoke all on function public.submit_item_stats(text, text, text, text, integer, jsonb) from public;
revoke all on function public.admin_balance() from public;
revoke all on function public.admin_item_stats(text, text) from public;
grant execute on function public.submit_item_stats(text, text, text, text, integer, jsonb) to anon, authenticated;
grant execute on function public.admin_balance()                to authenticated;
grant execute on function public.admin_item_stats(text, text)   to authenticated;
revoke all on function public.admin_game_stats(integer) from public, anon;
grant execute on function public.admin_game_stats(integer) to authenticated;

-- ───────────────────────── Ma goutte, équipe de la classe, historique de la grotte (version 1.28) ─────────────────────────

create table if not exists public.goutte (
  student_id uuid primary key references public.students(id) on delete cascade,
  look       jsonb   not null default '{}'::jsonb check (jsonb_typeof(look) = 'object' and octet_length(look::text) <= 600),
  fed        integer not null default 0 check (fed between 0 and 1000000),
  best       jsonb   not null default '{}'::jsonb check (jsonb_typeof(best) = 'object' and octet_length(best::text) <= 600),
  updated_at timestamptz not null default now()
);
alter table public.goutte enable row level security;
revoke all on table public.goutte from anon, authenticated;
-- aucune politique : pas d'accès direct, seulement les fonctions ci-dessous

-- Compteurs d'effort d'un élève, recalculés depuis ses parties (au moins 20 secondes ; séances et entraînements compris).
create or replace function private.goutte_counts(p_sid uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  with r as (
    select id, game, mode, score, session_id, duration, played_at
    from public.runs where student_id = p_sid and duration >= 20
      and game in ('typing', 'math', 'spelling', 'memory', 'lexique', 'facteur')
  ), rec as (
    select count(*) as n from (
      select score, max(score) over (partition by game, mode order by played_at, id rows between unbounded preceding and 1 preceding) as prev
      from r where session_id is null
    ) x where prev is not null and score > prev
  )
  select jsonb_build_object(
    'runs',     coalesce((select jsonb_object_agg(g.game, g.n) from (select game, count(*) as n from r group by game) g), '{}'::jsonb),
    'days',     (select count(distinct (played_at at time zone 'Europe/Paris')::date) from r),
    'records',  (select n from rec),
    'sessions', (select count(distinct session_id) from r where session_id is not null),
    'minutes',  (select coalesce(sum(duration), 0) / 60 from r),
    'last',     (select coalesce((extract(epoch from max(played_at)) * 1000)::bigint, 0) from r))
$$;

-- Le plus haut de deux jeux de compteurs (rien ne recule, même quand les vieilles parties sont effacées).
create or replace function private.goutte_merge(a jsonb, b jsonb) returns jsonb
language sql immutable as $$
  select jsonb_build_object(
    'runs', coalesce((select jsonb_object_agg(k, v) from (
              select k, max(v) as v from (
                select key as k, value::bigint as v from jsonb_each_text(coalesce(a->'runs', '{}'::jsonb))
                union all
                select key, value::bigint from jsonb_each_text(coalesce(b->'runs', '{}'::jsonb))
              ) u group by k) m), '{}'::jsonb),
    'days',     greatest(coalesce((a->>'days')::bigint, 0), coalesce((b->>'days')::bigint, 0)),
    'records',  greatest(coalesce((a->>'records')::bigint, 0), coalesce((b->>'records')::bigint, 0)),
    'sessions', greatest(coalesce((a->>'sessions')::bigint, 0), coalesce((b->>'sessions')::bigint, 0)),
    'minutes',  greatest(coalesce((a->>'minutes')::bigint, 0), coalesce((b->>'minutes')::bigint, 0)),
    'last',     greatest(coalesce((a->>'last')::bigint, 0), coalesce((b->>'last')::bigint, 0)))
$$;

-- Expérience et friandises : MÊMES formules que src/game/goutte/rules.ts (xpOf, treatsEarned).
create or replace function private.goutte_runs(c jsonb) returns bigint
language sql immutable as $$ select coalesce(sum(value::bigint), 0)::bigint from jsonb_each_text(coalesce(c->'runs', '{}'::jsonb)) $$;
create or replace function private.goutte_xp(c jsonb) returns bigint
language sql immutable as $$
  select 10 * private.goutte_runs(c) + 25 * coalesce((c->>'days')::bigint, 0) + 15 * coalesce((c->>'records')::bigint, 0) + 20 * coalesce((c->>'sessions')::bigint, 0)
$$;
create or replace function private.goutte_treats(c jsonb) returns bigint
language sql immutable as $$
  select private.goutte_runs(c) + 2 * coalesce((c->>'records')::bigint, 0) + coalesce((c->>'days')::bigint, 0)
$$;

-- Apparence acceptée : seulement ces clés ; nom fait de lettres et d'espaces ; objets = identifiants courts (ou rien).
create or replace function private.goutte_look_ok(p jsonb) returns boolean
language sql immutable as $$
  select p is not null and jsonb_typeof(p) = 'object' and octet_length(p::text) <= 600
     and not exists (select 1 from jsonb_object_keys(p) k where k not in ('name', 'color', 'hat', 'weapon', 'shield', 'acc'))
     -- nom : un mot de chaque liste (les mêmes que NAME_FIRST et NAME_SECOND dans src/game/goutte/rules.ts)
     and (p->>'name' is null or exists (
           select 1 from unnest(array['Plume', 'Pixel', 'Bulle', 'Perle', 'Virgule', 'Tampon', 'Zigzag', 'Gribouille', 'Encrine', 'Pâtou', 'Mouchette', 'Grain']) a, unnest(array['la Brave', 'le Brave', 'la Rapide', 'le Rapide', 'l’Intrépide', 'la Malicieuse', 'le Malicieux', 'la Sage', 'le Sage', 'la Rieuse', 'le Rieur', 'la Vaillante', 'le Vaillant', 'la Curieuse', 'le Curieux']) b
           where a || ' ' || b = p->>'name'))
     and not exists (select 1 from jsonb_each(p) e where e.key <> 'name' and jsonb_typeof(e.value) <> 'null'
                       and (jsonb_typeof(e.value) <> 'string' or (e.value #>> '{}') !~ '^[a-z0-9-]{1,20}$'))
$$;

create or replace function private.goutte_answer(p_sid uuid, p_save boolean) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_row public.goutte%rowtype; v_c jsonb;
begin
  select * into v_row from public.goutte where student_id = p_sid;
  v_c := private.goutte_merge(private.goutte_counts(p_sid), coalesce(v_row.best, '{}'::jsonb));
  if p_save then
    insert into public.goutte (student_id, best) values (p_sid, v_c)
    on conflict (student_id) do update set best = excluded.best
      where public.goutte.best is distinct from excluded.best;
  end if;
  return jsonb_build_object('look', coalesce(v_row.look, '{}'::jsonb), 'fed', coalesce(v_row.fed, 0), 'counters', v_c,
                            'xp', private.goutte_xp(v_c), 'treats', private.goutte_treats(v_c));
end $$;

-- La goutte de l'élève connecté (l'administrateur peut la regarder avec un jeton « obs: », sans rien enregistrer).
create or replace function public.goutte_get(p_token text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_sid uuid := private.student_from_token_ro(p_token);
begin
  if v_sid is null then return jsonb_build_object('error', 'invalid_session'); end if;
  return private.goutte_answer(v_sid, p_token not like 'obs:%');
end $$;

-- Enregistre l'apparence et les friandises données (jamais plus de friandises que celles gagnées).
create or replace function public.goutte_save(p_token text, p_look jsonb, p_fed integer) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_sid uuid := private.student_from_token(p_token); v_ans jsonb;
begin
  if v_sid is null then return jsonb_build_object('error', 'invalid_session'); end if;
  if not private.goutte_look_ok(p_look) or p_fed is null or p_fed < 0 then return jsonb_build_object('error', 'invalid_data'); end if;
  v_ans := private.goutte_answer(v_sid, true);
  update public.goutte
     set look = p_look,
         fed = least((v_ans->>'treats')::bigint, greatest(fed, p_fed))::integer,
         updated_at = now()
   where student_id = v_sid;
  return private.goutte_answer(v_sid, false);
end $$;

-- L'équipe : tous les élèves des classes données, avec leur goutte (élèves sans goutte : apparence par défaut, niveau 1).
create or replace function private.goutte_team(p_classes uuid[]) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'look', t.look, 'xp', t.xp) order by t.name), '[]'::jsonb)
  from (
    select s.id, s.name, coalesce(g.look, '{}'::jsonb) as look, private.goutte_xp(coalesce(g.best, '{}'::jsonb)) as xp
    from public.students s left join public.goutte g on g.student_id = s.id
    where s.class_id = any(p_classes)
    order by s.name
    limit 120
  ) t
$$;

create or replace function public.goutte_team(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_sid uuid := private.student_from_token_ro(p_token); v_c uuid;
begin
  if v_sid is null then return jsonb_build_object('error', 'invalid_session'); end if;
  select class_id into v_c from public.students where id = v_sid;
  return jsonb_build_object('me', v_sid, 'team', private.goutte_team(array[v_c]));
end $$;

create or replace function public.teacher_goutte_team(p_classes uuid[] default null) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_list uuid[]; v_c uuid;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if coalesce(array_length(p_classes, 1), 0) = 0 then
    select coalesce(array_agg(c.id), array[]::uuid[]) into v_list from public.classes c where private.is_member(c.school_id);
  else
    v_list := p_classes;
    foreach v_c in array v_list loop
      perform private.assert_reader((select school_id from public.classes where id = v_c));
    end loop;
  end if;
  return jsonb_build_object('me', null, 'team', private.goutte_team(v_list));
end $$;

-- Historique de la grotte : fautes et réussites de la classe, jour par jour, depuis la rentrée (ou la dernière remise à zéro).
create or replace function private.cave_series(p_classes uuid[]) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object('d', to_char(y.d, 'YYYY-MM-DD'), 'ink', y.ink, 'power', y.pw) order by y.d), '[]'::jsonb)
  from (
    select x.d, sum(x.ink)::bigint as ink, sum(x.pw)::bigint as pw from (
      select (r.received_at at time zone 'Europe/Paris')::date as d, r.cave_ink as ink, coalesce(r.cave_power, 0) as pw
      from public.runs r left join public.class_cave c on c.class_id = r.class_id
      where r.class_id = any(p_classes) and r.cave_ink is not null
        and r.received_at >= greatest(private.cave_start(), coalesce(c.reset_at, '-infinity'::timestamptz))
      union all
      select (d.received_at at time zone 'Europe/Paris')::date, d.ink, d.power
      from public.cave_drops d left join public.class_cave c on c.class_id = d.class_id
      where d.class_id = any(p_classes)
        and d.received_at >= greatest(private.cave_start(), coalesce(c.reset_at, '-infinity'::timestamptz))
    ) x group by x.d
  ) y
$$;

create or replace function public.cave_history(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_sid uuid := private.student_from_token_ro(p_token); v_c uuid;
begin
  if v_sid is null then return jsonb_build_object('error', 'invalid_session'); end if;
  select class_id into v_c from public.students where id = v_sid;
  return jsonb_build_object('days', private.cave_series(array[v_c]));
end $$;

create or replace function public.teacher_cave_history(p_classes uuid[] default null) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_list uuid[]; v_c uuid;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if coalesce(array_length(p_classes, 1), 0) = 0 then
    select coalesce(array_agg(c.id), array[]::uuid[]) into v_list from public.classes c where private.is_member(c.school_id);
  else
    v_list := p_classes;
    foreach v_c in array v_list loop
      perform private.assert_reader((select school_id from public.classes where id = v_c));
    end loop;
  end if;
  return jsonb_build_object('days', private.cave_series(v_list));
end $$;

revoke all on function private.goutte_counts(uuid) from public, anon, authenticated;
revoke all on function private.goutte_answer(uuid, boolean) from public, anon, authenticated;
revoke all on function private.goutte_team(uuid[]) from public, anon, authenticated;
revoke all on function private.cave_series(uuid[]) from public, anon, authenticated;
revoke all on function public.goutte_get(text) from public;
revoke all on function public.goutte_save(text, jsonb, integer) from public;
revoke all on function public.goutte_team(text) from public;
revoke all on function public.cave_history(text) from public;
revoke all on function public.teacher_goutte_team(uuid[]) from public, anon;
revoke all on function public.teacher_cave_history(uuid[]) from public, anon;
grant execute on function public.goutte_get(text) to anon, authenticated;
grant execute on function public.goutte_save(text, jsonb, integer) to anon, authenticated;
grant execute on function public.goutte_team(text) to anon, authenticated;
grant execute on function public.cave_history(text) to anon, authenticated;
grant execute on function public.teacher_goutte_team(uuid[]) to authenticated;
grant execute on function public.teacher_cave_history(uuid[]) to authenticated;


-- ───────────────────────── Fiche élève : erreurs par élève, aperçu de classe (version 1.30) ─────────────────────────

create table if not exists public.student_items (
  student_id uuid    not null references public.students(id) on delete cascade,
  game       text    not null check (game in ('math', 'spelling', 'facteur')),
  level      text    not null check (level in ('cp', 'ce1', 'ce2', 'cm1', 'cm2')),
  difficulty text    not null default '' check (difficulty ~ '^[a-z0-9_-]{0,20}$'),
  kind       text    not null check (kind in ('rule', 'item')),
  item       text    not null check (char_length(item) between 1 and 80),
  label      text    not null check (char_length(label) between 1 and 160),
  shown      integer not null default 0 check (shown between 0 and 1000000),
  wrong      integer not null default 0 check (wrong between 0 and 1000000),
  picks      jsonb   not null default '{}'::jsonb check (jsonb_typeof(picks) = 'object'),
  updated_at timestamptz not null default now(),
  primary key (student_id, game, level, difficulty, kind, item)
);
-- table créée par la première version de ce fichier : on y ajoute la difficulté (les compteurs déjà reçus gardent une difficulté vide)
alter table public.student_items add column if not exists difficulty text not null default '' check (difficulty ~ '^[a-z0-9_-]{0,20}$');
do $$
begin
  if exists (select 1 from pg_constraint where conname = 'student_items_pkey' and pg_get_constraintdef(oid) not like '%difficulty%') then
    alter table public.student_items drop constraint student_items_pkey;
    alter table public.student_items add primary key (student_id, game, level, difficulty, kind, item);
  end if;
end $$;
alter table public.student_items enable row level security;     -- aucune politique : illisible depuis le navigateur
revoke all on public.student_items from anon, authenticated;
create index if not exists student_items_updated_idx on public.student_items (updated_at);
create index if not exists student_items_spread_idx on public.student_items (game, level, difficulty, kind, item);

-- Erreurs des essais de séance, séance par séance (une ligne par élève et par exercice). Effacées avec la séance ou l'élève.
create table if not exists public.session_items (
  session_id uuid    not null references public.class_sessions(id) on delete cascade,
  student_id uuid    not null references public.students(id) on delete cascade,
  kind       text    not null check (kind in ('rule', 'item')),
  item       text    not null check (char_length(item) between 1 and 80),
  label      text    not null check (char_length(label) between 1 and 160),
  shown      integer not null default 0 check (shown between 0 and 100000),
  wrong      integer not null default 0 check (wrong between 0 and 100000),
  picks      jsonb   not null default '{}'::jsonb check (jsonb_typeof(picks) = 'object'),
  primary key (session_id, student_id, kind, item)
);
alter table public.session_items enable row level security;     -- aucune politique : illisible depuis le navigateur
revoke all on public.session_items from anon, authenticated;
create index if not exists session_items_student_idx on public.session_items (student_id);

create table if not exists private.student_items_calls (
  student_id uuid not null,
  at         timestamptz not null default now()
);
create index if not exists student_items_calls_idx on private.student_items_calls (student_id, at);
alter table private.student_items_calls enable row level security;

-- Parties dont les erreurs ont déjà été reçues : un renvoi (réseau revenu, double envoi) n'est jamais compté deux fois.
create table if not exists private.student_items_done (
  student_id uuid not null,
  client_id  text not null,
  at         timestamptz not null default now(),
  primary key (student_id, client_id)
);
alter table private.student_items_done enable row level security;

-- Enregistre les compteurs d'un élève. Mêmes entrées que le suivi anonyme : { k, i, l, n, e, p }. Les entrées invalides sont ignorées.
drop function if exists private.store_student_items(uuid, text, text, jsonb);
create or replace function private.store_student_items(p_sid uuid, p_game text, p_level text, p_diff text, p_items jsonb) returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  e     jsonb;
  v_n   integer;
  v_e   integer;
  v_k   text;
  v_i   text;
  v_l   text;
  v_p   jsonb;
  v_cnt integer := 0;
begin
  for e in select value from jsonb_array_elements(p_items) limit 120 loop
    begin
      v_k := e->>'k';
      v_i := left(btrim(coalesce(e->>'i', '')), 80);
      v_l := left(btrim(coalesce(e->>'l', '')), 160);
      v_n := (e->>'n')::integer;
      v_e := (e->>'e')::integer;
      continue when v_k not in ('rule', 'item') or v_i = '' or v_l = '' or v_n is null or v_e is null
                    or v_n < 1 or v_n > (case when v_k = 'rule' then 100 else 5 end) or v_e < 0 or v_e > v_n;
      -- au plus 250 exercices précis par élève : la table ne peut pas grossir sans limite
      if v_k = 'item'
         and not exists (select 1 from public.student_items s where s.student_id = p_sid and s.game = p_game and s.level = p_level
                         and s.difficulty = p_diff and s.kind = 'item' and s.item = v_i)
         and (select count(*) from public.student_items s where s.student_id = p_sid and s.kind = 'item') >= 250 then
        continue;
      end if;
      v_p := '{}'::jsonb;
      if jsonb_typeof(e->'p') = 'object' then
        select coalesce(jsonb_object_agg(left(x.key, 40), least(5, greatest(1, x.value::integer))), '{}'::jsonb)
          into v_p from (select key, value from jsonb_each_text(e->'p') limit 3) x;
      end if;
      insert into public.student_items (student_id, game, level, difficulty, kind, item, label, shown, wrong, picks)
      values (p_sid, p_game, p_level, p_diff, v_k, v_i, v_l, v_n, v_e, v_p)
      on conflict (student_id, game, level, difficulty, kind, item) do update
        set shown = least(1000000, public.student_items.shown + excluded.shown),
            wrong = least(1000000, public.student_items.wrong + excluded.wrong),
            picks = private.merge_picks(public.student_items.picks, excluded.picks),
            label = excluded.label,
            updated_at = now();
      v_cnt := v_cnt + 1;
    exception when others then
      null;
    end;
  end loop;
  return v_cnt;
end $$;

-- Recopie les compteurs d'un essai de séance dans la table de la séance (mêmes entrées, mêmes contrôles ; 120 exercices au plus par élève).
create or replace function private.store_session_items(p_sess uuid, p_sid uuid, p_items jsonb) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  e   jsonb;
  v_n integer;
  v_e integer;
  v_k text;
  v_i text;
  v_l text;
  v_p jsonb;
begin
  for e in select value from jsonb_array_elements(p_items) limit 120 loop
    begin
      v_k := e->>'k';
      v_i := left(btrim(coalesce(e->>'i', '')), 80);
      v_l := left(btrim(coalesce(e->>'l', '')), 160);
      v_n := (e->>'n')::integer;
      v_e := (e->>'e')::integer;
      continue when v_k not in ('rule', 'item') or v_i = '' or v_l = '' or v_n is null or v_e is null
                    or v_n < 1 or v_n > (case when v_k = 'rule' then 100 else 5 end) or v_e < 0 or v_e > v_n;
      continue when not exists (select 1 from public.session_items s where s.session_id = p_sess and s.student_id = p_sid and s.kind = v_k and s.item = v_i)
                    and (select count(*) from public.session_items s where s.session_id = p_sess and s.student_id = p_sid) >= 120;
      v_p := '{}'::jsonb;
      if jsonb_typeof(e->'p') = 'object' then
        select coalesce(jsonb_object_agg(left(x.key, 40), least(5, greatest(1, x.value::integer))), '{}'::jsonb)
          into v_p from (select key, value from jsonb_each_text(e->'p') limit 3) x;
      end if;
      insert into public.session_items (session_id, student_id, kind, item, label, shown, wrong, picks)
      values (p_sess, p_sid, v_k, v_i, v_l, v_n, v_e, v_p)
      on conflict (session_id, student_id, kind, item) do update
        set shown = least(100000, public.session_items.shown + excluded.shown),
            wrong = least(100000, public.session_items.wrong + excluded.wrong),
            picks = private.merge_picks(public.session_items.picks, excluded.picks),
            label = excluded.label;
    exception when others then
      null;
    end;
  end loop;
end $$;

-- Contrôles communs aux deux façons d'envoyer. Renvoie null si tout va bien, sinon le code d'erreur.
create or replace function private.student_items_check(p_sid uuid, p_game text, p_level text, p_diff text, p_items jsonb) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_game not in ('math', 'spelling', 'facteur') or p_level not in ('cp', 'ce1', 'ce2', 'cm1', 'cm2')
     or (p_game = 'facteur' and p_level <> 'cp')
     or p_diff is null or p_diff !~ '^[a-z0-9_-]{0,20}$'
     or p_items is null or jsonb_typeof(p_items) <> 'array' or octet_length(p_items::text) > 12000 then
    return 'invalid_data';
  end if;
  delete from private.student_items_calls where at < now() - interval '1 day';
  if (select count(*) from private.student_items_calls where student_id = p_sid and at > now() - interval '1 hour') >= 60 then
    return 'rate_limited';
  end if;
  return null;
end $$;

-- Envoi rattaché à une partie (version actuelle du site). p_client_id : l'identifiant de la partie, déjà envoyée ou encore en attente.
--   no_run    : la partie n'est pas (encore) arrivée → le site réessaiera plus tard ;
--   duplicate : ces erreurs ont déjà été reçues → rien n'est compté deux fois.
create or replace function public.submit_student_items(p_token text, p_client_id text, p_game text, p_level text, p_difficulty text, p_items jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_sid  uuid := private.student_from_token(p_token);
  v_err  text;
  v_n    integer;
  v_sess uuid;
begin
  if v_sid is null then return jsonb_build_object('error', 'invalid_session'); end if;
  if p_client_id is null or p_client_id !~ '^[A-Za-z0-9_-]{6,40}$' then return jsonb_build_object('error', 'invalid_data'); end if;
  v_err := private.student_items_check(v_sid, p_game, p_level, coalesce(p_difficulty, ''), p_items);
  if v_err is not null then return jsonb_build_object('error', v_err); end if;
  if not exists (select 1 from public.runs r where r.student_id = v_sid and r.client_id = p_client_id and r.game = p_game) then
    return jsonb_build_object('error', 'no_run');
  end if;
  insert into private.student_items_done (student_id, client_id) values (v_sid, p_client_id) on conflict do nothing;
  get diagnostics v_n = row_count;
  if v_n = 0 then return jsonb_build_object('ok', true, 'duplicate', true); end if;
  insert into private.student_items_calls (student_id) values (v_sid);
  v_n := private.store_student_items(v_sid, p_game, p_level, coalesce(p_difficulty, ''), p_items);
  -- essai de séance : la séance garde aussi ses propres compteurs (questions les plus ratées de la séance)
  select r.session_id into v_sess from public.runs r where r.student_id = v_sid and r.client_id = p_client_id and r.game = p_game limit 1;
  if v_sess is not null then perform private.store_session_items(v_sess, v_sid, p_items); end if;
  return jsonb_build_object('ok', true, 'stored', v_n);
end $$;

-- Ancienne façon d'envoyer (site resté en cache sur un appareil) : acceptée seulement juste après une partie de ce jeu.
create or replace function public.submit_student_items(p_token text, p_game text, p_level text, p_items jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_sid uuid := private.student_from_token(p_token);
  v_err text;
  v_n   integer;
begin
  if v_sid is null then return jsonb_build_object('error', 'invalid_session'); end if;
  v_err := private.student_items_check(v_sid, p_game, p_level, '', p_items);
  if v_err is not null then return jsonb_build_object('error', v_err); end if;
  if not exists (select 1 from public.runs r where r.student_id = v_sid and r.game = p_game and r.played_at > now() - interval '30 minutes') then
    return jsonb_build_object('error', 'invalid_data');
  end if;
  insert into private.student_items_calls (student_id) values (v_sid);
  v_n := private.store_student_items(v_sid, p_game, p_level, '', p_items);
  return jsonb_build_object('ok', true, 'stored', v_n);
end $$;

-- Fiche d'un élève : ses parties (400 dernières, de la plus ancienne à la plus récente) et ses compteurs d'exercices.
create or replace function public.student_detail(p_student uuid, p_days integer default 365) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_s    public.students%rowtype;
  v_c    public.classes%rowtype;
  v_from timestamptz := now() - make_interval(days => least(400, greatest(7, coalesce(p_days, 365))));
begin
  select * into v_s from public.students where id = p_student;
  if not found then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into v_c from public.classes where id = v_s.class_id;
  perform private.assert_reader(v_c.school_id);
  if not private.is_member(v_c.school_id) then
    insert into private.admin_audit (admin_id, action, target) values (auth.uid(), 'student_detail', left(p_student::text, 40));
  end if;
  return jsonb_build_object(
    'student', jsonb_build_object('id', v_s.id, 'name', v_s.name, 'class_id', v_c.id, 'class_name', v_c.name, 'grade', v_c.grade),
    'runs', coalesce((
      select jsonb_agg(to_jsonb(t) order by t.at)
      from (
        select (extract(epoch from r.played_at) * 1000)::bigint as at, r.game, r.mode, r.kind, (r.session_id is not null) as session,
               r.score, r.wave, r.wpm, r.acc, r.correct, r.duration
        from public.runs r
        where r.student_id = p_student and r.played_at >= v_from
        order by r.played_at desc
        limit 400
      ) t), '[]'::jsonb),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object('game', i.game, 'level', i.level, 'difficulty', i.difficulty, 'k', i.kind, 'item', i.item,
                                          'label', i.label, 'shown', i.shown, 'wrong', i.wrong, 'picks', i.picks))
      from public.student_items i where i.student_id = p_student), '[]'::jsonb));
end $$;

-- Aperçu de chaque élève d'une classe : dernière partie, parties du mois, et JEU PAR JEU la réussite de ses 5 dernières parties (n)
-- comparée aux 5 d'avant (n_prev), sur 120 jours ; enfin son point faible principal.
create or replace function public.class_insights(p_class uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_c public.classes%rowtype;
begin
  select * into v_c from public.classes where id = p_class;
  if not found then raise exception 'forbidden' using errcode = '42501'; end if;
  perform private.assert_reader(v_c.school_id);
  return coalesce((
    select jsonb_agg(to_jsonb(t) order by lower(t.name))
    from (
      select s.id, s.name,
        (select (extract(epoch from max(r.played_at)) * 1000)::bigint from public.runs r where r.student_id = s.id) as last_played,
        (select count(*) from public.runs r where r.student_id = s.id and r.kind = 'game' and r.played_at > now() - interval '30 days')::integer as runs_30d,
        coalesce((
          select jsonb_agg(jsonb_build_object('game', g.game, 'n', g.n, 'n_prev', g.n_prev, 'acc_recent', g.acc_recent, 'acc_prev', g.acc_prev) order by g.game)
          from (
            select x.game,
                   count(*) filter (where x.rn <= 5)::integer as n,
                   count(*) filter (where x.rn > 5)::integer as n_prev,
                   round(avg(x.acc) filter (where x.rn <= 5), 1) as acc_recent,
                   round(avg(x.acc) filter (where x.rn > 5), 1) as acc_prev
            from (
              select r.game, r.acc, row_number() over (partition by r.game order by r.played_at desc) as rn
              from public.runs r
              where r.student_id = s.id and r.kind = 'game' and r.played_at > now() - interval '120 days'
            ) x
            where x.rn <= 10
            group by x.game
          ) g), '[]'::jsonb) as games,
        (select to_jsonb(w) from (
           select i.game, i.label, round(100.0 * sum(i.wrong) / sum(i.shown))::integer as err
           from public.student_items i
           where i.student_id = s.id and i.kind = 'rule'
           group by i.game, i.label
           having sum(i.shown) >= 8 and 100.0 * sum(i.wrong) / sum(i.shown) >= 30
           order by sum(i.wrong)::numeric / sum(i.shown) desc, sum(i.shown) desc
           limit 1) w) as weak
      from public.students s
      where s.class_id = p_class
    ) t), '[]'::jsonb);
end $$;

-- Enseignant : les questions les plus ratées d'une séance (familles et exercices posés au moins 3 fois), et le nombre d'élèves concernés.
create or replace function public.session_items(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_s public.class_sessions%rowtype;
begin
  select * into v_s from public.class_sessions where id = p_id;
  if not found then raise exception 'forbidden' using errcode = '42501'; end if;
  perform private.assert_reader(v_s.school_id);
  return coalesce((
    select jsonb_agg(to_jsonb(t) order by t.err desc, t.shown desc)
    from (
      select i.kind, i.item, max(i.label) as label,
             count(*)::integer as players,
             sum(i.shown)::integer as shown,
             sum(i.wrong)::integer as wrong,
             round(100.0 * sum(i.wrong) / sum(i.shown), 1) as err,
             coalesce((
               select jsonb_object_agg(p.k, p.n)
               from (
                 select x.key as k, sum(x.value::integer)::integer as n
                 from public.session_items i2
                 cross join lateral jsonb_each_text(i2.picks) x
                 where i2.session_id = p_id and i2.kind = i.kind and i2.item = i.item
                 group by x.key
                 order by sum(x.value::integer) desc, x.key
                 limit 3
               ) p), '{}'::jsonb) as picks
      from public.session_items i
      where i.session_id = p_id
      group by i.kind, i.item
      having sum(i.shown) >= 3
      order by 100.0 * sum(i.wrong) / sum(i.shown) desc
      limit 60
    ) t), '[]'::jsonb);
end $$;

-- Administrateur : combien d'élèves différents derrière chaque exercice (par jeu, niveau, difficulté), et de quoi mesurer la dispersion
-- de leurs résultats (sommes et sommes de produits par élève). Aucun nom, aucune classe : seulement des comptes.
create or replace function public.admin_item_spread() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform private.assert_site_admin();
  insert into private.admin_audit (admin_id, action, target) values (auth.uid(), 'item_spread', '');
  return coalesce((
    select jsonb_agg(to_jsonb(t))
    from (
      select i.game, i.level, i.difficulty, i.kind, i.item,
             count(*)::integer as players,
             sum(i.shown)::bigint as shown,
             sum(i.wrong)::bigint as wrong,
             sum(i.wrong::numeric * i.wrong) as ww,
             sum(i.wrong::numeric * i.shown) as wn,
             sum(i.shown::numeric * i.shown) as nn
      from public.student_items i
      where i.difficulty <> ''
      group by i.game, i.level, i.difficulty, i.kind, i.item
    ) t), '[]'::jsonb);
end $$;

-- Enseignant : ce que la classe rate le plus. Familles (kind = rule) et exercices précis (kind = item), toutes difficultés confondues ;
-- seulement ce qui a été posé au moins 10 fois à au moins 2 élèves (jamais le détail d'un seul élève : sa fiche est faite pour ça).
create or replace function public.class_items(p_class uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_c public.classes%rowtype;
begin
  select * into v_c from public.classes where id = p_class;
  if not found then raise exception 'forbidden' using errcode = '42501'; end if;
  perform private.assert_reader(v_c.school_id);
  return coalesce((
    select jsonb_agg(to_jsonb(t) order by t.err desc, t.shown desc)
    from (
      select i.game, i.kind, i.item, max(i.label) as label,
             count(distinct i.student_id)::integer as players,
             sum(i.shown)::integer as shown,
             sum(i.wrong)::integer as wrong,
             round(100.0 * sum(i.wrong) / sum(i.shown), 1) as err,
             coalesce((
               select jsonb_object_agg(p.k, p.n)
               from (
                 select x.key as k, sum(x.value::integer)::integer as n
                 from public.student_items i2
                 join public.students s2 on s2.id = i2.student_id
                 cross join lateral jsonb_each_text(i2.picks) x
                 where s2.class_id = p_class and i2.game = i.game and i2.kind = i.kind and i2.item = i.item
                 group by x.key
                 order by sum(x.value::integer) desc, x.key
                 limit 3
               ) p), '{}'::jsonb) as picks
      from public.student_items i
      join public.students s on s.id = i.student_id
      where s.class_id = p_class
      group by i.game, i.kind, i.item
      having sum(i.shown) >= 10 and count(distinct i.student_id) >= 2
      order by 100.0 * sum(i.wrong) / sum(i.shown) desc
      limit 60
    ) t), '[]'::jsonb);
end $$;

revoke all on function private.store_student_items(uuid, text, text, text, jsonb) from public, anon, authenticated;
revoke all on function private.student_items_check(uuid, text, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.submit_student_items(text, text, text, text, text, jsonb) from public;
revoke all on function public.submit_student_items(text, text, text, jsonb) from public;
revoke all on function public.student_detail(uuid, integer) from public, anon;
revoke all on function public.class_insights(uuid) from public, anon;
revoke all on function public.admin_item_spread() from public, anon;
revoke all on function public.class_items(uuid) from public, anon;
revoke all on function private.store_session_items(uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.session_items(uuid) from public, anon;
grant execute on function public.session_items(uuid) to authenticated;
grant execute on function public.class_items(uuid) to authenticated;
grant execute on function public.submit_student_items(text, text, text, text, text, jsonb) to anon, authenticated;
grant execute on function public.submit_student_items(text, text, text, jsonb) to anon, authenticated;
grant execute on function public.student_detail(uuid, integer) to authenticated;
grant execute on function public.class_insights(uuid) to authenticated;
grant execute on function public.admin_item_spread() to authenticated;

-- Nettoyage nocturne : on y ajoute les compteurs d'exercices des élèves (400 jours, comme les parties).
create or replace function private.purge_old_data() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_runs integer;
  v_students integer;
begin
  delete from public.runs where received_at < now() - interval '400 days';
  get diagnostics v_runs = row_count;
  delete from public.student_items where updated_at < now() - interval '400 days';
  delete from public.students s
   where s.created_at < now() - interval '400 days'
     and not exists (select 1 from public.runs r where r.student_id = s.id);
  get diagnostics v_students = row_count;
  delete from public.student_sessions where expires_at < now() - interval '7 days';
  delete from private.login_attempts where at < now() - interval '1 day';
  delete from private.cheat_log where at < now() - interval '90 days';
  delete from private.admin_audit where at < now() - interval '1 year';
  delete from private.invitations where expires_at < now() - interval '30 days';
  delete from private.student_items_calls where at < now() - interval '1 day';
  delete from private.student_items_done where at < now() - interval '30 days';
  return jsonb_build_object('runs', v_runs, 'students', v_students);
end $$;

-- Version du serveur : 22 (fonctionnalités « eleves », « eleves_fiable », « eleves_classe », « eleves_seance »).
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
  v_rv   text := coalesce((select pg_get_functiondef(p.oid) from pg_proc p
                           where p.pronamespace = 'private'::regnamespace and p.proname = 'run_violation'), '');
  v_ins  text := coalesce((select pg_get_functiondef(p.oid) from pg_proc p
                           where p.pronamespace = 'public'::regnamespace and p.proname = 'class_insights'), '');
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
    'grotte',      to_regprocedure('public.cave_get(text)') is not null and to_regprocedure('public.cave_drop(text,text,integer,integer)') is not null and to_regprocedure('public.admin_observe(text,uuid)') is not null,
    'lexique',     v_ov like '%best_lexique%' and exists (select 1 from pg_constraint where conname = 'class_sessions_game_check' and pg_get_constraintdef(oid) like '%lexique%'),
    'bareme',      v_rv like '%840 * c%',
    'facteur',     v_rv like '%facteur%' and v_ov like '%best_facteur%' and exists (select 1 from pg_constraint where conname = 'class_sessions_game_check' and pg_get_constraintdef(oid) like '%facteur%'),
    'stats',       to_regprocedure('public.admin_game_stats(integer)') is not null
                   and coalesce((select pg_get_functiondef(p.oid) from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'submit_item_stats'), '') like '%facteur%'
                   and exists (select 1 from pg_constraint where conname = 'item_stats_game_check' and pg_get_constraintdef(oid) like '%facteur%'),
    'goutte',      to_regprocedure('public.goutte_get(text)') is not null and to_regprocedure('public.cave_history(text)') is not null,
    'eleves',      to_regprocedure('public.student_detail(uuid,integer)') is not null and to_regprocedure('public.class_insights(uuid)') is not null,
    'eleves_fiable', to_regprocedure('public.submit_student_items(text,text,text,text,text,jsonb)') is not null
                   and to_regprocedure('public.admin_item_spread()') is not null and v_ins like '%n_prev%',
    'eleves_classe', to_regprocedure('public.class_items(uuid)') is not null,
    'eleves_seance', to_regprocedure('public.session_items(uuid)') is not null,
    'niveaux',     exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'classes' and column_name = 'grades'),
    'nettoyage_auto', v_cron
  );
  return jsonb_build_object(
    'version', 23,
    'features', f,
    'migrations', coalesce((select jsonb_agg(id order by id) from private.schema_migrations), '[]'::jsonb),
    'plain_codes', (select count(*) from public.students where access_code is not null),
    'missing', coalesce((select jsonb_agg(k order by k) from jsonb_each(f) as e(k, v) where v = 'false'::jsonb), '[]'::jsonb));
end $$;

revoke all on function public.server_version() from public, anon;
grant execute on function public.server_version() to authenticated;

insert into private.schema_migrations (id) values ('2026-11-eleves') on conflict (id) do nothing;
insert into private.schema_migrations (id) values ('2026-11-eleves-fiable') on conflict (id) do nothing;
insert into private.schema_migrations (id) values ('2026-11-eleves-classe') on conflict (id) do nothing;
insert into private.schema_migrations (id) values ('2026-11-eleves-seance') on conflict (id) do nothing;
