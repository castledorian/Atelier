-- Statistiques d'équilibrage — à lancer dans Supabase → SQL Editor (lecture seule, aucune donnée personnelle).
-- Objectif : ~85 % de réussite en « standard », ~95 % en « apprenti », ~65 % en « expert ».
-- Colle les résultats à Claude pour régler les paliers.

-- 1) Taux de réussite par jeu, niveau et difficulté (parties libres uniquement, hors « perso » et séances).
select game, coalesce(level, '-') as niveau, difficulty as difficulte, version,
       count(*) as parties,
       round(100.0 * sum(rounds_ok) / nullif(sum(rounds_ok + rounds_err), 0), 1) as reussite_pct,
       round(avg(score)) as score_moyen,
       round(100.0 * count(*) filter (where outcome = 'finished') / count(*), 1) as parties_terminees_pct,
       round(avg(duration)) as duree_moyenne_s
from public.balance_runs
where not custom
group by game, level, difficulty, version
order by game, level, difficulty, version;

-- 2) Réussite page par page (où ça coince ?). Chaque page : a = manches jouées, e = erreurs.
select game, coalesce(level, '-') as niveau, difficulty as difficulte, p.ord as page,
       sum((p.v->>'a')::int) as manches,
       round(100.0 * (sum((p.v->>'a')::int) - sum((p.v->>'e')::int)) / nullif(sum((p.v->>'a')::int), 0), 1) as reussite_pct
from public.balance_runs b, jsonb_array_elements(b.pages) with ordinality as p(v, ord)
where not b.custom and b.pages is not null
group by game, level, difficulty, p.ord
order by game, level, difficulty, p.ord;

-- 3) Frappe ! : précision et vitesse moyennes par difficulté.
select difficulty as difficulte, count(*) as parties, round(avg(acc), 1) as precision_pct, round(avg(wpm), 1) as mots_par_min, round(avg(wave), 1) as vague_moyenne
from public.balance_runs where game = 'typing' and not custom
group by difficulty order by difficulty;
