-- Mise à jour « goutte » (version 1.28) — à exécuter UNE FOIS dans Supabase (SQL Editor → New query → Run).
-- Sans danger si exécutée plusieurs fois. À lancer EN DERNIER (après « stats » et « grotte-reprise »).
--
-- Ce qu'elle apporte :
--   1. « Ma goutte » : la goutte guerrière de chaque élève grandit avec son EFFORT (parties terminées, jours de jeu, séances,
--      records personnels battus). Le serveur recompte tout depuis les parties qu'il a déjà reçues : impossible de tricher.
--      On garde seulement l'apparence choisie (des objets d'une liste, un nom choisi dans une liste : jamais de texte libre),
--      le nombre de friandises données, et le plus haut des compteurs (les parties de plus de 400 jours sont effacées).
--   2. L'équipe de la classe pour le combat final : prénoms + gouttes, visibles par la classe et ses enseignants seulement.
--   3. L'historique de la grotte, jour par jour, pour la courbe d'évolution de la créature.

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

-- ───────────── Indicateur de version ─────────────

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

revoke all on function public.server_version() from public, anon;
grant execute on function public.server_version() to authenticated;

insert into private.schema_migrations (id) values ('2026-11-goutte') on conflict (id) do nothing;
