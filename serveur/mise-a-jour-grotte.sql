-- Mise à jour « grotte et observation » (version 1.18) — à exécuter UNE FOIS dans Supabase (SQL Editor → New query → Run).
-- Sans danger si exécutée plusieurs fois. À exécuter APRÈS mise-a-jour-codes.sql (et donc après toutes les autres).
-- Une installation neuve avec schema.sql est déjà à jour.
--
-- Ce qu'elle apporte :
--   1. La grotte devient celle de la CLASSE : le serveur additionne les fautes et réussites des parties libres de la classe depuis la rentrée
--      (compteurs anonymes, lignes de parties déjà existantes). Tous les appareils d'une classe voient le même monstre.
--   2. Observation en lecture seule pour l'administrateur du site : voir l'espace d'un enseignant ou l'écran d'un élève, sans pouvoir
--      modifier ni jouer. C'est le SERVEUR qui l'interdit : les fonctions qui écrivent refusent l'administrateur (il n'est pas membre de l'école)
--      et refusent le jeton d'observation. Chaque observation est notée dans le journal de l'administration.
--   3. Les colonnes secrètes des élèves (code, empreinte) ne sont plus lisibles depuis le navigateur, même par les enseignants.


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

create or replace function private.cave_state(p_classes uuid[]) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_start timestamptz := private.cave_start();
  v_ink   bigint;
  v_pow   bigint;
  v_games bigint;
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
  select count(*), max(c.won_at) into v_won, v_at
  from public.class_cave c where c.class_id = any(p_classes) and c.won_at >= v_start;
  return jsonb_build_object(
    'ink', greatest(0, v_ink), 'power', greatest(0, v_pow), 'games', v_games,
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

-- ───────────────────────── Fonctions de lecture ouvertes à l'observation ─────────────────────────

create or replace function public.class_leaderboard(
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

create or replace function public.my_runs(p_token text, p_game text default null, p_limit integer default 200) returns jsonb
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

-- ───────────────────────── Version du serveur (détecte cette mise à jour) ─────────────────────────

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
    'grotte',      to_regprocedure('public.cave_get(text)') is not null and to_regprocedure('public.admin_observe(text,uuid)') is not null,
    'nettoyage_auto', v_cron
  );
  return jsonb_build_object(
    'version', 13,
    'features', f,
    'migrations', coalesce((select jsonb_agg(id order by id) from private.schema_migrations), '[]'::jsonb),
    'plain_codes', (select count(*) from public.students where access_code is not null),
    'missing', coalesce((select jsonb_agg(k order by k) from jsonb_each(f) as e(k, v) where v = 'false'::jsonb), '[]'::jsonb));
end $$;

-- ───────────────────────── Droits d'accès ─────────────────────────

revoke select on public.students from authenticated;
grant select (id, school_id, class_id, name, created_at) on public.students to authenticated;

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

revoke all on function private.is_site_admin()                  from public, anon, authenticated;
revoke all on function private.is_member(uuid)                  from public, anon, authenticated;
revoke all on function private.assert_reader(uuid)              from public, anon, authenticated;
revoke all on function private.student_from_token_ro(text)      from public, anon, authenticated;
revoke all on function private.cave_start()                     from public, anon, authenticated;
revoke all on function private.cave_state(uuid[])               from public, anon, authenticated;
revoke all on function public.cave_report(text, text, integer, integer) from public;
revoke all on function public.cave_get(text)                    from public;
revoke all on function public.cave_win(text)                    from public;
revoke all on function public.teacher_cave(uuid[])              from public, anon;
revoke all on function public.teacher_cave_win(uuid[])          from public, anon;
revoke all on function public.teacher_cave_reset(uuid[])        from public, anon;
revoke all on function public.admin_observe(text, uuid)         from public, anon;
revoke all on function public.server_version()                  from public, anon;
grant execute on function public.cave_report(text, text, integer, integer) to anon, authenticated;
grant execute on function public.cave_get(text)                 to anon, authenticated;
grant execute on function public.cave_win(text)                 to anon, authenticated;
grant execute on function public.teacher_cave(uuid[])           to authenticated;
grant execute on function public.teacher_cave_win(uuid[])       to authenticated;
grant execute on function public.teacher_cave_reset(uuid[])     to authenticated;
grant execute on function public.admin_observe(text, uuid)      to authenticated;
grant execute on function public.server_version()               to authenticated;

insert into private.schema_migrations (id) values ('2026-11-grotte') on conflict (id) do nothing;
