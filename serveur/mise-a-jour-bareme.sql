-- Mise à jour « barème commun » : le score des jeux de réponses suit désormais la même logique que Frappe !
-- (série ×1 à ×6, 100 points par bonne réponse, bonus de vitesse plafonné à 40 %). Les parties valent donc plus de points qu'avant :
-- il faut relever les plafonds du contrôle anti-triche, sinon le serveur refuserait les nouveaux scores (« score supérieur au maximum possible »).
-- À exécuter UNE SEULE FOIS dans Supabase → SQL Editor → New query → Run (projet déjà installé avec schema.sql).
-- Sans danger : aucune donnée n'est touchée ; les anciens scores restent enregistrés (ils sont simplement plus bas que les nouveaux).
-- À lancer APRÈS les autres mises à jour (en dernier).

-- ───────────── Contrôle des parties ─────────────

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
  else
    return 'jeu inconnu';
  end if;
  return null;
end $$;

-- ───────────── Version du serveur ─────────────

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
    'nettoyage_auto', v_cron
  );
  return jsonb_build_object(
    'version', 15,
    'features', f,
    'migrations', coalesce((select jsonb_agg(id order by id) from private.schema_migrations), '[]'::jsonb),
    'plain_codes', (select count(*) from public.students where access_code is not null),
    'missing', coalesce((select jsonb_agg(k order by k) from jsonb_each(f) as e(k, v) where v = 'false'::jsonb), '[]'::jsonb));
end $$;

-- Même droits que les autres mises à jour : l'indicateur de version n'est lisible que par un compte connecté.
revoke all on function public.server_version() from public, anon;
grant execute on function public.server_version() to authenticated;

insert into private.schema_migrations (id) values ('2026-11-bareme') on conflict (id) do nothing;
