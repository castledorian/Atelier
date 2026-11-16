-- Mise à jour « Séances de classe, essais limités et données d'équilibrage ».
-- À exécuter UNE SEULE FOIS dans Supabase → SQL Editor → New query → Run (projet déjà installé avec schema.sql).
-- Sans danger pour les données existantes : elle ajoute des tables et des fonctions, et remplace deux fonctions
-- (submit_run, class_overview, class_leaderboard) sans rien effacer.
--
-- Séance de classe : l'enseignant enregistre pour une classe un jeu + ses réglages + un nombre d'essais (1 à 3).
-- L'élève voit la liste dans son espace ; seul son MEILLEUR score compte pour l'évaluation, l'enseignant voit tous les essais.
-- Données d'équilibrage : un résumé ANONYME de chaque partie libre (aucun identifiant d'élève, de classe ni d'école).

-- ───────────────────────── Tables ─────────────────────────

create table if not exists public.class_sessions (
  id            uuid primary key default gen_random_uuid(),
  class_id      uuid not null references public.classes(id) on delete cascade,
  school_id     uuid not null references public.schools(id) on delete cascade,
  title         text not null check (char_length(title) between 1 and 60),
  game          text not null check (game in ('typing', 'math', 'memory')),
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
  game         text not null check (game in ('typing', 'math', 'memory')),
  level        text check (level is null or level in ('cm1', 'cm2')),
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

-- ───────────────────────── Parties (remplace submit_run : ajoute le résumé d'équilibrage) ─────────────────────────

drop function if exists public.submit_run(text, text, text, text, text, integer, integer, numeric, numeric, integer, integer, bigint);

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
  return jsonb_build_object('ok', true, 'sessions', coalesce((
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
  if char_length(v_t) not between 1 and 60 or p_game not in ('typing', 'math', 'memory')
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

-- Classement : les parties de séance n'y figurent jamais.
create or replace function public.class_leaderboard(
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

-- ───────────────────────── Droits ─────────────────────────

revoke all on function public.submit_run(text, text, text, text, text, integer, integer, numeric, numeric, integer, integer, bigint, jsonb) from public;
revoke all on function public.submit_session_run(text, uuid, text, integer, integer, numeric, numeric, integer, integer, bigint, jsonb) from public;
revoke all on function public.my_sessions(text) from public;
revoke all on function public.list_class_sessions(uuid) from public;
revoke all on function public.save_class_session(uuid, uuid, text, text, jsonb, integer, boolean) from public;
revoke all on function public.delete_class_session(uuid) from public;
revoke all on function public.session_results(uuid) from public;
revoke all on function public.class_overview(uuid) from public;
revoke all on function public.class_leaderboard(text, text, text, text, integer) from public;
revoke all on function private.store_balance(jsonb, boolean) from public, anon, authenticated;

grant execute on function public.submit_run(text, text, text, text, text, integer, integer, numeric, numeric, integer, integer, bigint, jsonb) to anon, authenticated;
grant execute on function public.submit_session_run(text, uuid, text, integer, integer, numeric, numeric, integer, integer, bigint, jsonb) to anon, authenticated;
grant execute on function public.my_sessions(text) to anon, authenticated;
grant execute on function public.list_class_sessions(uuid) to authenticated;
grant execute on function public.save_class_session(uuid, uuid, text, text, jsonb, integer, boolean) to authenticated;
grant execute on function public.delete_class_session(uuid) to authenticated;
grant execute on function public.session_results(uuid) to authenticated;
grant execute on function public.class_overview(uuid) to authenticated;
grant execute on function public.class_leaderboard(text, text, text, text, integer) to anon, authenticated;
