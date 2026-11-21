-- Mise à jour « statistiques » (version 1.27) — à exécuter UNE FOIS dans Supabase (SQL Editor → New query → Run).
-- Sans danger si exécutée plusieurs fois ; aucune donnée n'est modifiée. À lancer EN DERNIER (après « facteur »).
--
-- Ce qu'elle apporte :
--   1. Le suivi anonyme des exercices accepte « Le facteur » : quels mots sont ratés, et quelles boîtes sont touchées à tort.
--   2. public.admin_game_stats(jours) : les vraies statistiques des parties, pour l'administrateur du site seulement :
--      par jeu, mode et NIVEAU DE LA CLASSE (réussite, scores, durées, abandons), par classe (seulement les groupes d'au moins
--      3 élèves : jamais un élève isolé), par semaine, par heure, fidélité des joueurs, parties refusées par l'anti-triche.
--      Rien de nominatif : des comptes et des moyennes. Chaque consultation est notée dans le journal de l'administration.

alter table public.item_stats drop constraint if exists item_stats_game_check;
alter table public.item_stats add constraint item_stats_game_check check (game in ('math', 'spelling', 'facteur'));

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

revoke all on function public.submit_item_stats(text, text, text, text, integer, jsonb) from public;
grant execute on function public.submit_item_stats(text, text, text, text, integer, jsonb) to anon, authenticated;
revoke all on function public.admin_game_stats(integer) from public, anon;
grant execute on function public.admin_game_stats(integer) to authenticated;

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
                   and exists (select 1 from pg_constraint where conname = 'item_stats_game_check' and pg_get_constraintdef(oid) like '%facteur%'),
    'nettoyage_auto', v_cron
  );
  return jsonb_build_object(
    'version', 17,
    'features', f,
    'migrations', coalesce((select jsonb_agg(id order by id) from private.schema_migrations), '[]'::jsonb),
    'plain_codes', (select count(*) from public.students where access_code is not null),
    'missing', coalesce((select jsonb_agg(k order by k) from jsonb_each(f) as e(k, v) where v = 'false'::jsonb), '[]'::jsonb));
end $$;

revoke all on function public.server_version() from public, anon;
grant execute on function public.server_version() to authenticated;

insert into private.schema_migrations (id) values ('2026-11-stats') on conflict (id) do nothing;
