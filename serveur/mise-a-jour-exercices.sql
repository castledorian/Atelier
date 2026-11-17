-- Mise à jour « suivi des exercices » — à exécuter UNE FOIS dans Supabase (SQL Editor). Sans danger si répétée.
-- À exécuter APRÈS mise-a-jour-admin.sql (elle réutilise le contrôle d'accès administrateur).
--
-- Ce que ça ajoute : pour régler la difficulté des jeux, le site sait maintenant quels calculs et quelles phrases
-- font échouer le plus souvent (Course à l'encre, Chasse aux fautes).
--
-- Garde-fous (RGPD) :
--  • ce sont des COMPTEURS ANONYMES : « tel calcul a été posé N fois, raté E fois, avec telles mauvaises réponses ».
--    Rien n'indique quel élève, quelle classe ou quelle école : seuls le jeu, le niveau, la difficulté et la version comptent ;
--  • seules les parties libres sont comptées (pas les séances de classe, pas les entraînements, pas les réglages personnalisés) ;
--  • la table est illisible depuis le navigateur ; seule la lecture réservée à l'administrateur du site y accède (et chaque consultation est notée) ;
--  • l'envoi n'est possible qu'à un élève connecté qui vient de jouer, et il est limité en nombre et en taille.

-- ───────────────────────── Table ─────────────────────────

create table if not exists public.item_stats (
  game        text    not null check (game in ('math', 'spelling')),
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
  if p_game not in ('math', 'spelling') or p_level not in ('cp', 'ce1', 'ce2', 'cm1', 'cm2')
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

revoke all on function private.merge_picks(jsonb, jsonb) from public, anon, authenticated;
revoke all on function private.store_items(text, text, text, integer, jsonb) from public, anon, authenticated;
revoke all on function public.submit_item_stats(text, text, text, text, integer, jsonb) from public;
revoke all on function public.admin_balance() from public;
revoke all on function public.admin_item_stats(text, text) from public;
grant execute on function public.submit_item_stats(text, text, text, text, integer, jsonb) to anon, authenticated;
grant execute on function public.admin_balance()                to authenticated;
grant execute on function public.admin_item_stats(text, text)   to authenticated;
