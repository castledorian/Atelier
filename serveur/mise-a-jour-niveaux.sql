-- Mise à jour « classes mixtes » (version 1.35) — à exécuter dans Supabase (SQL Editor → New query → Run).
-- Sans danger si exécutée plusieurs fois ; aucune donnée existante n'est perdue. À lancer APRÈS « fiche élève ».
--
-- Une classe peut avoir plusieurs niveaux (ex. CM1 et CM2). L'enseignant les coche dans les réglages de la classe ;
-- chaque élève choisit le sien parmi ceux-là. La colonne « grade » garde le niveau le plus bas (valeur par défaut) :
-- tout ce qui la lit continue de marcher. Les classes qui avaient un niveau passent à une liste d'un seul niveau.

alter table public.classes add column if not exists grades text[];
alter table public.classes drop constraint if exists classes_grades_check;
alter table public.classes add constraint classes_grades_check
  check (grades is null or grades <@ array['cp', 'ce1', 'ce2', 'cm1', 'cm2']::text[]);
grant update (grades) on public.classes to authenticated;
update public.classes set grades = array[grade] where grade is not null and grades is null;

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

revoke all on function public.my_sessions(text) from public;
grant execute on function public.my_sessions(text) to anon, authenticated;

-- Indicateur de version : le site prévient l'administrateur tant que cette mise à jour manque.
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

insert into private.schema_migrations (id) values ('2026-11-niveaux') on conflict (id) do nothing;
