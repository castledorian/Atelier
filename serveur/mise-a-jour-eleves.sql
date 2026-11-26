-- Mise à jour « fiche élève » (version 1.30, révisée le 26 novembre 2026) — à exécuter dans Supabase (SQL Editor → New query → Run).
-- Sans danger si exécutée plusieurs fois ; aucune donnée existante n'est perdue. À lancer EN DERNIER (après « goutte »).
-- Si vous l'aviez déjà lancée plus tôt : relancez-la, elle met à jour ce qui existe déjà.
--
-- Ce qu'elle apporte :
--   1. public.student_items : pour chaque élève, combien de fois chaque famille de calculs / règle / mot a été posé et raté, à quelle
--      difficulté, et quelles mauvaises réponses il a choisies (des mots du jeu : jamais de texte libre). Au plus 250 exercices précis
--      par élève. Illisible depuis le navigateur. Effacé avec l'élève, et au bout de 400 jours.
--   2. public.submit_student_items : envoi par le jeu, rattaché à UNE partie déjà reçue (son identifiant). Une partie jouée sans réseau
--      envoie donc ses erreurs plus tard ; un même envoi n'est jamais compté deux fois.
--   3. public.student_detail : la fiche d'un élève pour les enseignants de son école, et pour l'administrateur en observation
--      (chaque consultation par l'administrateur est notée dans son journal).
--   4. public.class_insights : aperçu de la classe, avec la réussite récente JEU PAR JEU (jamais une moyenne de jeux différents).
--   5. public.admin_item_spread : pour l'administrateur, le nombre d'élèves différents derrière chaque exercice et la dispersion de
--      leurs résultats (des comptes, aucun nom), pour ne jamais conclure à partir de quelques élèves seulement.
--
-- Le suivi ANONYME des exercices (item_stats, pour régler la difficulté) ne change pas.

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
  v_sid uuid := private.student_from_token(p_token);
  v_err text;
  v_n   integer;
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

revoke all on function private.store_student_items(uuid, text, text, text, jsonb) from public, anon, authenticated;
revoke all on function private.student_items_check(uuid, text, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.submit_student_items(text, text, text, text, text, jsonb) from public;
revoke all on function public.submit_student_items(text, text, text, jsonb) from public;
revoke all on function public.student_detail(uuid, integer) from public, anon;
revoke all on function public.class_insights(uuid) from public, anon;
revoke all on function public.admin_item_spread() from public, anon;
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

-- Version du serveur : 20 (fonctionnalités « eleves » et « eleves_fiable »).
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
    'nettoyage_auto', v_cron
  );
  return jsonb_build_object(
    'version', 20,
    'features', f,
    'migrations', coalesce((select jsonb_agg(id order by id) from private.schema_migrations), '[]'::jsonb),
    'plain_codes', (select count(*) from public.students where access_code is not null),
    'missing', coalesce((select jsonb_agg(k order by k) from jsonb_each(f) as e(k, v) where v = 'false'::jsonb), '[]'::jsonb));
end $$;

revoke all on function public.server_version() from public, anon;
grant execute on function public.server_version() to authenticated;

insert into private.schema_migrations (id) values ('2026-11-eleves') on conflict (id) do nothing;
insert into private.schema_migrations (id) values ('2026-11-eleves-fiable') on conflict (id) do nothing;
