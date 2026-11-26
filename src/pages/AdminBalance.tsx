import { useMemo, useState } from 'react';
import { FACTEUR_TARGET, NO_END, TARGET, TOLERANCE, diffName, gameName, itemsCsv, levelName, levelsCsv, mergeRows, picksText, rank, summaryText, targetOf, verdictOf } from '../game/balanceView';
import { adviceOf, asLevels, gradeRows, hourly, statsText, weeklyTotals } from '../game/statsView';
import { downloadText, toCsv } from '../game/history';
import { SortTh, sortRows, useSort } from '../components/SortTable';
import type { SortValue } from '../components/SortTable';
import type { AdminItems, BalanceLevel, ClassStat, GameStats, GradeStat, ItemSpreadRow } from '../server/admin';
import { ACTION_LABEL, MIN_PLAYERS, adviceText, countByAction, exerciseAdvice } from '../game/exerciseAdvice';
import type { Action, ExerciseAdvice } from '../game/exerciseAdvice';
import { CONFIDENCE_LABEL, confidenceOf } from '../game/reliability';
import { Card, Pill, RangeBar } from '../components/ui';
import { Tip } from '../components/Tip';
import type { Tone } from '../components/ui';

const ORDER = ['cp', 'ce1', 'ce2', 'cm1', 'cm2'];
const GAMES = ['math', 'spelling', 'facteur'];
const ALL_GAMES = ['typing', 'math', 'spelling', 'lexique', 'memory', 'facteur'];
export const PERIODS: [number, string][] = [
  [30, '30 jours'],
  [90, '3 mois'],
  [365, '1 an'],
];
const PRIO: Record<number, string> = { 1: 'À régler', 2: 'À surveiller', 3: 'Pour info' };
const num = (n: number | null | undefined, unit = '') => (n === null || n === undefined ? '—' : `${String(n).replace('.', ',')}${unit}`);
const today = () => new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
const stamp = () => new Date().toISOString().slice(0, 10);

/** Onglet « Équilibrage » : où les élèves réussissent trop ou pas assez, et ce qui les fait échouer. */
export default function AdminBalance({ levels: allTime, stats, detail, spread = null, days, onDays }: { levels: BalanceLevel[]; stats: AdminItems; detail: GameStats | null; spread?: ItemSpreadRow[] | null; days: number; onDays: (d: number) => void }) {
  const levels = useMemo(() => (detail ? asLevels(detail.balance) : allTime), [detail, allTime]);
  const advice = useMemo(() => (detail ? adviceOf(detail) : []), [detail]);
  const [game, setGame] = useState('math');
  const [level, setLevel] = useState('all');
  const [diff, setDiff] = useState('all');
  const [copied, setCopied] = useState('');

  const levelsSeen = useMemo(() => {
    const seen = new Set<string>();
    for (const r of [...stats.rules, ...stats.items]) if (r.game === game) seen.add(r.level);
    return ORDER.filter((l) => seen.has(l));
  }, [stats, game]);
  const families = useMemo(() => rank(mergeRows(stats.rules, { game, level, difficulty: diff }), 1).slice(0, 12), [stats.rules, game, level, diff]);
  const items = useMemo(() => rank(mergeRows(stats.items, { game, level, difficulty: diff }), 5).slice(0, 30), [stats.items, game, level, diff]);

  const lv = useSort<LvKey>('place', 'asc');
  const sorted = useMemo(() => sortRows(levels, lv.sort, lvValue), [levels, lv.sort]);
  const fam = useSort<ItemKey>('err', 'desc');
  const it = useSort<ItemKey>('err', 'desc');
  const famRows = useMemo(() => sortRows(families, fam.sort, itemValue), [families, fam.sort]);
  const itemRows = useMemo(() => sortRows(items, it.sort, itemValue), [items, it.sort]);

  const copy = async () => {
    const text = (detail ? statsText(detail, stats, today()) : summaryText(levels, stats.rules, stats.items, today())) + '\n' + adviceText(exerciseAdvice(stats.rules, stats.items, spread));
    try {
      await navigator.clipboard.writeText(text);
      setCopied('Résumé copié : collez-le dans la conversation.');
    } catch {
      downloadText(`bilan-equilibrage-${stamp()}.txt`, text, 'text/plain;charset=utf-8');
      setCopied('Copie impossible ici : le résumé a été téléchargé.');
    }
  };

  return (
    <>
      <div className="adm-filters mt-3">
        <span className="adm-note">Période</span>
        <div className="seg" role="radiogroup" aria-label="Période étudiée">
          {PERIODS.map(([d, label]) => (
            <button key={d} type="button" role="radio" aria-checked={days === d} className="seg-b" onClick={() => onDays(d)} disabled={!detail && d !== days}>
              {label}
            </button>
          ))}
        </div>
      </div>
      {!detail && (
        <p className="adm-note">
          Statistiques détaillées indisponibles : lancez <code>serveur/mise-a-jour-stats.sql</code> dans Supabase. En attendant, voici la réussite depuis le début.
        </p>
      )}
      {detail && <Kpis g={detail} />}
      {detail && (
        <>
          <h2 className="subhead mt-4">
            À régler : jeux et niveaux
            <Tip label="Ce que couvre cette liste">Réussite de chaque jeu, niveau et difficulté, parties perdues tout de suite, jeux délaissés, anti-triche. Les familles de calculs, règles et mots sont jugées juste en dessous.</Tip>
          </h2>
          {advice.length === 0 ? (
            <p className="adm-note">Rien de net pour l’instant : pas assez de parties, ou tout est bien réglé.</p>
          ) : (
            <ol className="adm-advice">
              {advice.map((a, k) => (
                <li key={k} data-p={a.priority}>
                  <span className={`adm-verdict v-${a.priority === 1 ? 'hard' : a.priority === 2 ? 'few' : 'none'}`}>{PRIO[a.priority]}</span>
                  <strong>{a.topic}</strong>
                  <span>{a.fact}</span>
                  <span className="adm-gap">{a.hint}</span>
                </li>
              ))}
            </ol>
          )}
        </>
      )}

      <ExercisePanel rules={stats.rules} items={stats.items} spread={spread} />

      <h2 className="subhead mt-4">
        Réussite par niveau
        <Tip label="Objectifs">
          Apprenti ≈ {TARGET.apprenti} %, Standard ≈ {TARGET.standard} %, Expert ≈ {TARGET.expert} % de manches réussies du premier coup (± {TOLERANCE} points) ; Le facteur ≈ {FACTEUR_TARGET} %. Jugé à partir de 150 manches, parties libres seulement.
        </Tip>
      </h2>
      <p className="adm-note adm-actions">
        <button type="button" className="link" onClick={() => downloadText(`reussite-par-niveau-${stamp()}.csv`, levelsCsv(levels))} disabled={levels.length === 0}>
          Exporter en CSV
        </button>
        <button type="button" className="link" onClick={() => void copy()} disabled={levels.length === 0 && stats.items.length === 0}>
          Copier le bilan complet (texte)
        </button>
        <span className="adm-copied" role="status" aria-live="polite">
          {copied}
        </span>
      </p>
      {sorted.length === 0 ? (
        <p className="adm-note">Aucune partie enregistrée pour l’instant.</p>
      ) : (
        <div className="adm-wrap">
          <table className="adm-table">
            <caption className="sr-only">Réussite par jeu, niveau et difficulté</caption>
            <thead>
              <tr>
                <SortTh col="place" sort={lv.sort} onSort={lv.toggle}>
                  Jeu
                </SortTh>
                <SortTh col="level" sort={lv.sort} onSort={lv.toggle}>
                  Niveau
                </SortTh>
                <SortTh col="runs" sort={lv.sort} onSort={lv.toggle} numeric>
                  Parties · manches
                </SortTh>
                <SortTh col="success" sort={lv.sort} onSort={lv.toggle} numeric>
                  Réussite
                </SortTh>
                <SortTh col="gap" sort={lv.sort} onSort={lv.toggle} numeric>
                  Verdict
                </SortTh>
                <SortTh col="finished" sort={lv.sort} onSort={lv.toggle} numeric>
                  Gagnées
                </SortTh>
              </tr>
            </thead>
            <tbody>
              {sorted.map((l) => {
                const v = verdictOf(l);
                const target = targetOf(l.game, l.difficulty);
                return (
                  <tr key={`${l.game}-${l.level}-${l.difficulty}-${l.version}`}>
                    <td className="adm-game">{gameName(l.game)}</td>
                    <td className="adm-nowrap">
                      {l.level === '-' || /^(cp|ce1|ce2|cm1|cm2)(-|$)/.test(l.difficulty) ? diffName(l.difficulty) : `${levelName(l.level)} · ${diffName(l.difficulty)}`}
                    </td>
                    <td className="adm-nowrap">
                      {l.runs} · {l.ok + l.err}
                    </td>
                    <td className="adm-nowrap">
                      <strong>{num(l.success_pct, ' %')}</strong>
                      {target !== undefined && <span className="adm-gap adm-block">objectif {target} %</span>}
                    </td>
                    <td>
                      <span className={`adm-verdict v-${v.verdict}`}>{v.label}</span>
                      {v.detail && <span className="adm-gap adm-block">{v.detail}</span>}
                    </td>
                    <td>
                      {NO_END.includes(l.game) ? '—' : num(l.finished_pct, ' %')}
                      {v.note && <span className="adm-gap adm-block">{v.note}</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {detail && <ByGrade g={detail} />}

      <h2 className="subhead mt-4">Ce qui fait échouer</h2>
      <div className="adm-filters">
        <label>
          Jeu
          <select className="field" value={game} onChange={(e) => { setGame(e.target.value); setLevel('all'); setDiff('all'); }}>
            {GAMES.map((g) => (
              <option key={g} value={g}>
                {gameName(g)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Niveau
          <select className="field" value={level} onChange={(e) => setLevel(e.target.value)}>
            <option value="all">Tous</option>
            {levelsSeen.map((l) => (
              <option key={l} value={l}>
                {levelName(l)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Difficulté
          <select className="field" value={diff} onChange={(e) => setDiff(e.target.value)}>
            <option value="all">Toutes</option>
            {(game === 'facteur' ? ['n1', 'n2', 'n3', 'n4'] : ['apprenti', 'standard', 'expert']).map((d) => (
              <option key={d} value={d}>
                {diffName(d)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="adm-note adm-actions">
        <button type="button" className="link" onClick={() => downloadText(`exercices-rates-${stamp()}.csv`, itemsCsv(stats.rules, stats.items))} disabled={stats.rules.length + stats.items.length === 0}>
          Exporter tous les exercices en CSV
        </button>
        <Tip label="Exercices masqués">Les exercices posés moins de 5 fois sont masqués ici (trop peu fiables). Le CSV les contient tous.</Tip>
      </p>

      {families.length === 0 && items.length === 0 ? (
        <p className="adm-note">
          Pas encore de données.
          <Tip label="D’où viennent les données ?">Des parties libres d’élèves connectés. Si rien n’apparaît, vérifiez la mise à jour SQL « exercices ».</Tip>
        </p>
      ) : (
        <>
          <h3 className="font-bold mt-2">{game === 'math' ? 'Familles de calculs' : game === 'facteur' ? 'Mots par niveau' : 'Règles d’orthographe'}</h3>
          <div className="adm-wrap">
            <table className="adm-table">
              <caption className="sr-only">Familles les plus ratées</caption>
              <thead>
                <tr>
                  <SortTh col="label" sort={fam.sort} onSort={fam.toggle}>
                    Famille
                  </SortTh>
                  <SortTh col="shown" sort={fam.sort} onSort={fam.toggle} numeric>
                    Posé
                  </SortTh>
                  <SortTh col="err" sort={fam.sort} onSort={fam.toggle} numeric>
                    Erreurs
                  </SortTh>
                  <th scope="col">Mauvaises réponses fréquentes</th>
                </tr>
              </thead>
              <tbody>
                {famRows.map((r) => (
                  <tr key={r.item}>
                    <td>{r.label}</td>
                    <td>{r.shown}</td>
                    <td>
                      <Meter pct={r.err_pct} />
                    </td>
                    <td>{picksText(r.picks) || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h3 className="font-bold mt-3">{game === 'math' ? 'Calculs les plus ratés' : game === 'facteur' ? 'Mots les plus ratés' : 'Phrases les plus ratées'}</h3>
          {items.length === 0 ? (
            <p className="adm-note">Aucun exercice posé au moins 5 fois pour l’instant.</p>
          ) : (
            <div className="adm-wrap">
              <table className="adm-table">
                <caption className="sr-only">Exercices les plus ratés</caption>
                <thead>
                  <tr>
                    <SortTh col="label" sort={it.sort} onSort={it.toggle}>
                      Exercice
                    </SortTh>
                    <SortTh col="level" sort={it.sort} onSort={it.toggle}>
                      Niveau
                    </SortTh>
                    <SortTh col="shown" sort={it.sort} onSort={it.toggle} numeric>
                      Posé
                    </SortTh>
                    <SortTh col="err" sort={it.sort} onSort={it.toggle} numeric>
                      Erreurs
                    </SortTh>
                    <th scope="col">Mauvaises réponses choisies</th>
                  </tr>
                </thead>
                <tbody>
                  {itemRows.map((r) => (
                    <tr key={`${r.level}-${r.item}`}>
                      <td>{r.label}</td>
                      <td>{levelName(r.level)}</td>
                      <td>{r.shown}</td>
                      <td>
                        <Meter pct={r.err_pct} />
                      </td>
                      <td>{picksText(r.picks) || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
      {detail && <Activity g={detail} />}
    </>
  );
}

/** Colonnes triables du tableau « Réussite par niveau ». */
type LvKey = 'place' | 'level' | 'runs' | 'success' | 'gap' | 'finished';

function lvValue(l: BalanceLevel, key: LvKey): SortValue {
  switch (key) {
    case 'place':
      // ordre d'origine : par jeu, puis par niveau de classe, puis par difficulté
      return `${gameName(l.game)} ${String(Math.max(0, ORDER.indexOf(l.level))).padStart(2, '0')} ${l.difficulty} ${l.version}`;
    case 'level':
      return `${String(Math.max(0, ORDER.indexOf(l.level))).padStart(2, '0')} ${l.difficulty}`;
    case 'runs':
      return l.runs;
    case 'success':
      return l.success_pct;
    case 'gap':
      // du plus mal réglé au mieux réglé : on trie sur l'écart à l'objectif
      return verdictOf(l).gap ?? null;
    case 'finished':
      return l.finished_pct;
  }
}

/** Colonnes triables des tableaux d'exercices. */
type ItemKey = 'label' | 'level' | 'shown' | 'err';

function itemValue(r: { label: string; level: string; shown: number; err_pct: number | null }, key: ItemKey): SortValue {
  switch (key) {
    case 'label':
      return r.label;
    case 'level':
      return String(Math.max(0, ORDER.indexOf(r.level))).padStart(2, '0');
    case 'shown':
      return r.shown;
    case 'err':
      return r.err_pct;
  }
}

/** Pourcentage d'erreurs : le chiffre est toujours écrit, la barre n'est qu'un repère. */
function Meter({ pct, good = false }: { pct: number | null; good?: boolean }) {
  const v = pct ?? 0;
  return (
    <span className={good ? 'adm-meter adm-meter-good' : 'adm-meter'}>
      <span className="adm-meter-bar" aria-hidden="true">
        <i style={{ width: `${Math.min(100, Math.max(0, v))}%` }} />
      </span>
      <strong>{num(pct, ' %')}</strong>
    </span>
  );
}

const fmt = (n: number) => n.toLocaleString('fr-FR');
const DAYS = ['', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];

/** Chiffres clés de la période. */
function Kpis({ g }: { g: GameStats }) {
  const t = g.totals;
  return (
    <ul className="adm-kpis" aria-label="Chiffres clés de la période">
      {(
        [
          ['Parties', t.runs],
          ['Élèves', t.players],
          ['Classes', t.classes],
          ['Écoles', t.schools],
          ['Minutes de jeu', t.minutes],
          ['En séance', t.session_runs],
        ] as [string, number][]
      ).map(([k, v]) => (
        <li key={k}>
          <strong>{fmt(v)}</strong>
          <span>{k}</span>
        </li>
      ))}
    </ul>
  );
}

/** Activité de la période : semaines, heures, fidélité, refus du serveur. */
function Activity({ g }: { g: GameStats }) {
  const weeks = weeklyTotals(g);
  const wMax = Math.max(1, ...weeks.map((w) => w.runs));
  const h = hourly(g);
  const hMax = Math.max(1, ...h.hours);
  const busiest = [...g.hours].sort((a, b) => b.runs - a.runs)[0];
  return (
    <>
      <h2 className="subhead mt-5">Activité : parties par semaine</h2>
      {weeks.length === 0 ? (
        <p className="adm-note">Aucune partie sur la période.</p>
      ) : (
        <div className="adm-bars adm-bars-gap" role="img" aria-label={`Parties par semaine : ${weeks.map((w) => `semaine du ${w.week.slice(8)}/${w.week.slice(5, 7)} : ${w.runs}`).join(', ')}`}>
          {weeks.map((w) => (
            <div key={w.week} className="adm-bar" title={`Semaine du ${w.week.slice(8)}/${w.week.slice(5, 7)} : ${w.runs} parties`}>
              <i style={{ height: `${Math.max(2, (w.runs / wMax) * 100)}%` }} />
              <span>{weeks.length <= 16 ? `${w.week.slice(8)}/${w.week.slice(5, 7)}` : ''}</span>
            </div>
          ))}
        </div>
      )}

      <h2 className="subhead">Heures de jeu</h2>
      <p className="adm-note">
        {h.schoolPct} % des parties sur le temps scolaire.
        {busiest ? ` Moment le plus joué : le ${DAYS[busiest.dow]} vers ${busiest.hour} h.` : ''}
      </p>
      <div className="adm-bars adm-bars-gap" role="img" aria-label={`Parties par heure : ${h.hours.map((n, k) => `${k} h : ${n}`).join(', ')}`}>
        {h.hours.map((n, k) => (
          <div key={k} className="adm-bar" title={`${k} h : ${n} parties`}>
            <i style={{ height: `${Math.max(n ? 2 : 0, (n / hMax) * 100)}%` }} />
            <span>{k % 3 === 0 ? k : ''}</span>
          </div>
        ))}
      </div>

      {g.loyalty.length > 0 && (
        <>
          <h2 className="subhead">Fidélité</h2>
          <div className="adm-wrap">
            <table className="adm-table">
              <caption className="sr-only">Fidélité des joueurs par jeu</caption>
              <thead>
                <tr>
                  <th scope="col">Jeu</th>
                  <th scope="col">Élèves</th>
                  <th scope="col">Parties par élève</th>
                  <th scope="col">Revenus un autre jour</th>
                  <th scope="col">10 parties ou plus</th>
                  <th scope="col">Une seule partie</th>
                </tr>
              </thead>
              <tbody>
                {[...g.loyalty]
                  .sort((a, b) => ALL_GAMES.indexOf(a.game) - ALL_GAMES.indexOf(b.game))
                  .map((l) => (
                    <tr key={l.game}>
                      <td className="adm-game">{gameName(l.game)}</td>
                      <td>{fmt(l.players)}</td>
                      <td>{num(l.runs_per_player)}</td>
                      <td>{num(l.back_pct, ' %')}</td>
                      <td>{num(l.ten_pct, ' %')}</td>
                      <td>{num(l.once_pct, ' %')}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {g.cheats.length > 0 && (
        <>
          <h2 className="subhead mt-4">
            Parties refusées par le serveur
            <Tip label="Comment lire">Beaucoup de refus pour une même raison, chez plusieurs élèves : la borne est sans doute trop stricte.</Tip>
          </h2>
          <div className="adm-wrap">
            <table className="adm-table">
              <caption className="sr-only">Parties refusées, par jeu et par raison</caption>
              <thead>
                <tr>
                  <th scope="col">Jeu</th>
                  <th scope="col">Raison</th>
                  <th scope="col">Parties</th>
                  <th scope="col">Élèves</th>
                </tr>
              </thead>
              <tbody>
                {g.cheats.map((c) => (
                  <tr key={`${c.game}-${c.reason}`}>
                    <td className="adm-game">{gameName(c.game)}</td>
                    <td>{c.reason}</td>
                    <td>{c.n}</td>
                    <td>{c.players}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}

type GradeKey = 'grade' | 'mode' | 'runs' | 'players' | 'acc' | 'score' | 'dur' | 'low' | 'high' | 'short';
function gradeValue(r: GradeStat, k: GradeKey): SortValue {
  switch (k) {
    case 'grade':
      return r.grade === '?' ? 'zz' : String(ORDER.indexOf(r.grade));
    case 'mode':
      return r.mode;
    case 'runs':
      return r.runs;
    case 'players':
      return r.players;
    case 'acc':
      return r.acc_med;
    case 'score':
      return r.score_med;
    case 'dur':
      return r.dur_med;
    case 'low':
      return r.low_pct;
    case 'high':
      return r.high_pct;
    case 'short':
      return r.short_pct;
  }
}
type ClassKey = 'school' | 'grade' | 'runs' | 'players' | 'sessions' | 'acc' | 'score' | 'last';
function classValue(r: ClassStat, k: ClassKey): SortValue {
  switch (k) {
    case 'school':
      return `${r.school} ${r.class}`;
    case 'grade':
      return r.grade === '?' ? 'zz' : String(ORDER.indexOf(r.grade));
    case 'runs':
      return r.runs;
    case 'players':
      return r.players;
    case 'sessions':
      return r.session_runs;
    case 'acc':
      return r.acc;
    case 'score':
      return r.score_med;
    case 'last':
      return r.last_at;
  }
}

function gradeCsv(g: GameStats): string {
  return toCsv(
    ['Jeu', 'Niveau de la classe', 'Mode', 'Parties', 'Élèves', 'Classes', 'Réussite moyenne %', 'Réussite médiane %', 'Score 1er quartile', 'Score médian', 'Score 3e quartile', 'Durée médiane (s)', 'Bonnes réponses moyennes', 'Vague moyenne', '< 60 % (%)', '≥ 95 % (%)', '< 30 s (%)'],
    g.by_grade.map((r) => [gameName(r.game), r.grade === '?' ? 'non fixé' : levelName(r.grade), diffName(r.mode), r.runs, r.players, r.classes, r.acc ?? '', r.acc_med ?? '', r.score_p25 ?? '', r.score_med ?? '', r.score_p75 ?? '', r.dur_med ?? '', r.correct ?? '', r.wave ?? '', r.low_pct, r.high_pct, r.short_pct]),
  );
}

/** Par niveau de classe, puis par classe : ce que les élèves réussissent vraiment, jeu par jeu. */
function ByGrade({ g }: { g: GameStats }) {
  const present = ALL_GAMES.filter((x) => g.by_grade.some((r) => r.game === x) || g.by_class.some((r) => r.game === x));
  const [game, setGame] = useState(present[0] ?? 'math');
  const gs = useSort<GradeKey>('grade', 'asc');
  const cs = useSort<ClassKey>('runs', 'desc');
  const rows = useMemo(() => sortRows(gradeRows(g, game), gs.sort, gradeValue), [g, game, gs.sort]);
  const classes = useMemo(() => sortRows(g.by_class.filter((r) => r.game === game), cs.sort, classValue), [g, game, cs.sort]);
  if (present.length === 0) return null;
  return (
    <>
      <h2 className="subhead mt-4">
        Par niveau de classe
        <Tip label="Comment lire">Parties libres, regroupées par niveau de la classe (fixé par l’enseignant) et par mode joué. Réussite : médiane des parties ; score : médiane (1er–3e quartile).</Tip>
      </h2>
      <div className="adm-filters">
        <label>
          Jeu
          <select className="field" value={game} onChange={(e) => setGame(e.target.value)}>
            {present.map((x) => (
              <option key={x} value={x}>
                {gameName(x)}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="link" onClick={() => downloadText(`stats-par-niveau-${stamp()}.csv`, gradeCsv(g))}>
          Exporter tous les jeux en CSV
        </button>
      </div>
      {rows.length === 0 ? (
        <p className="adm-note">Aucune partie libre pour ce jeu sur la période.</p>
      ) : (
        <div className="adm-wrap">
          <table className="adm-table">
            <caption className="sr-only">{gameName(game)} : résultats par niveau de classe et par mode</caption>
            <thead>
              <tr>
                <SortTh col="grade" sort={gs.sort} onSort={gs.toggle}>
                  Classes
                </SortTh>
                <SortTh col="mode" sort={gs.sort} onSort={gs.toggle}>
                  Mode
                </SortTh>
                <SortTh col="runs" sort={gs.sort} onSort={gs.toggle} numeric>
                  Parties · élèves
                </SortTh>
                <SortTh col="acc" sort={gs.sort} onSort={gs.toggle} numeric>
                  Réussite
                </SortTh>
                <SortTh col="score" sort={gs.sort} onSort={gs.toggle} numeric>
                  Score
                </SortTh>
                <SortTh col="dur" sort={gs.sort} onSort={gs.toggle} numeric>
                  Durée
                </SortTh>
                <SortTh col="low" sort={gs.sort} onSort={gs.toggle} numeric>
                  &lt; 60 %
                </SortTh>
                <SortTh col="high" sort={gs.sort} onSort={gs.toggle} numeric>
                  ≥ 95 %
                </SortTh>
                <SortTh col="short" sort={gs.sort} onSort={gs.toggle} numeric>
                  &lt; 30 s
                </SortTh>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={`${r.grade}-${r.mode}`}>
                  <td className="adm-nowrap">{r.grade === '?' ? 'Sans niveau' : levelName(r.grade)}</td>
                  <td className="adm-nowrap">{diffName(r.mode)}</td>
                  <td className="adm-nowrap">
                    {fmt(r.runs)} · {r.players}
                    <span className="adm-gap adm-block">{r.classes} classe{r.classes > 1 ? 's' : ''}</span>
                  </td>
                  <td>
                    <Meter pct={r.acc_med} good />
                  </td>
                  <td className="adm-nowrap">
                    <strong>{r.score_med === null ? '—' : fmt(r.score_med)}</strong>
                    <span className="adm-gap adm-block">
                      {r.score_p25 === null ? '' : `${fmt(r.score_p25)} – ${fmt(r.score_p75 ?? 0)}`}
                    </span>
                  </td>
                  <td className="adm-nowrap">{r.dur_med === null ? '—' : `${r.dur_med} s`}</td>
                  <td>{num(r.low_pct, ' %')}</td>
                  <td>{num(r.high_pct, ' %')}</td>
                  <td>{num(r.short_pct, ' %')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h3 className="font-bold mt-3">
        Par classe
        <Tip label="Classes affichées">Seulement les classes où au moins 3 élèves ont joué à ce jeu (jamais un élève isolé). Séances comprises.</Tip>
      </h3>
      {classes.length === 0 ? (
        <p className="adm-note">Aucune classe de 3 joueurs ou plus pour ce jeu.</p>
      ) : (
        <div className="adm-wrap">
          <table className="adm-table">
            <caption className="sr-only">{gameName(game)} : résultats par classe</caption>
            <thead>
              <tr>
                <SortTh col="school" sort={cs.sort} onSort={cs.toggle}>
                  Classe
                </SortTh>
                <SortTh col="grade" sort={cs.sort} onSort={cs.toggle}>
                  Niveau
                </SortTh>
                <SortTh col="runs" sort={cs.sort} onSort={cs.toggle} numeric>
                  Parties · élèves
                </SortTh>
                <SortTh col="sessions" sort={cs.sort} onSort={cs.toggle} numeric>
                  En séance
                </SortTh>
                <SortTh col="acc" sort={cs.sort} onSort={cs.toggle} numeric>
                  Réussite
                </SortTh>
                <SortTh col="score" sort={cs.sort} onSort={cs.toggle} numeric>
                  Score médian
                </SortTh>
                <SortTh col="last" sort={cs.sort} onSort={cs.toggle} numeric>
                  Dernière partie
                </SortTh>
              </tr>
            </thead>
            <tbody>
              {classes.map((r) => (
                <tr key={`${r.school}-${r.class}`}>
                  <td>
                    {r.class}
                    <span className="adm-gap adm-block">{r.school}</span>
                  </td>
                  <td>{r.grade === '?' ? '—' : levelName(r.grade)}</td>
                  <td className="adm-nowrap">
                    {fmt(r.runs)} · {r.players}
                  </td>
                  <td>{r.session_runs}</td>
                  <td>
                    <Meter pct={r.acc} good />
                  </td>
                  <td>{r.score_med === null ? '—' : fmt(r.score_med)}</td>
                  <td className="adm-nowrap">{new Date(r.last_at).toLocaleDateString('fr-FR')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}


// ───────────────────────── Exercice par exercice ─────────────────────────

const ACTION_TONE: Record<Action, Tone> = { diminuer: 'bad', equilibrer: 'warn', ameliorer: 'info', garder: 'good', attendre: 'mute' };
const FILTERS: Array<[Action | 'todo', string]> = [
  ['todo', 'À traiter'],
  ['diminuer', 'À diminuer'],
  ['equilibrer', 'À équilibrer'],
  ['ameliorer', 'À améliorer'],
  ['garder', 'Bien réglés'],
  ['attendre', 'Trop tôt'],
];

/**
 * Chaque famille d'exercices et chaque exercice précis reçoit une action : diminuer (trop difficile), équilibrer (trop facile),
 * améliorer (le contenu est en cause) ou garder. Les chiffres sont toujours donnés avec leur marge d'incertitude à 95 % :
 * sur peu de manches, on préfère « trop tôt pour juger » à une fausse certitude.
 */
export function ExercisePanel({ rules, items, spread = null }: { rules: AdminItems['rules']; items: AdminItems['items']; spread?: ItemSpreadRow[] | null }) {
  const all = useMemo(() => exerciseAdvice(rules, items, spread), [rules, items, spread]);
  const counts = useMemo(() => countByAction(all), [all]);
  const [filter, setFilter] = useState<Action | 'todo'>('todo');
  const [gameF, setGameF] = useState('all');
  const [more, setMore] = useState(false);
  const shown = all.filter((a) => (filter === 'todo' ? a.action === 'diminuer' || a.action === 'equilibrer' || a.action === 'ameliorer' : a.action === filter) && (gameF === 'all' || a.game === gameF));
  const list = more ? shown : shown.slice(0, 10);
  const games: string[] = [...new Set<string>(all.map((a) => a.game))];
  return (
    <Card
      className="mt-4"
      title="À régler : exercice par exercice"
      note={`Chaque famille de calculs, règle ou mot est comparée à l’objectif de son niveau. Une conclusion n’est tirée que si toute la marge d’incertitude (95 %) est du même côté de l’objectif, et jamais avec moins de ${MIN_PLAYERS} élèves différents. La marge est élargie quand les résultats varient beaucoup d’un élève à l’autre. Barre : zone hachurée = objectif, trait noir = marge, trait rouge = valeur mesurée.`}
    >
      {all.length === 0 ? (
        <p className="u-empty">Pas encore de données : elles viennent des parties libres d’élèves connectés.</p>
      ) : (
        <>
          <div className="u-chips" role="radiogroup" aria-label="Filtrer les conseils">
            {FILTERS.map(([k, label]) => {
              const n = k === 'todo' ? counts.diminuer + counts.equilibrer + counts.ameliorer : counts[k];
              return (
                <button key={k} type="button" role="radio" aria-checked={filter === k} className="u-chip" onClick={() => { setFilter(k); setMore(false); }}>
                  {label} <span className="u-chip-n">{n}</span>
                </button>
              );
            })}
            <select className="field u-chip-select" aria-label="Jeu" value={gameF} onChange={(e) => { setGameF(e.target.value); setMore(false); }}>
              <option value="all">Tous les jeux</option>
              {games.map((g) => (
                <option key={g} value={g}>
                  {gameName(g)}
                </option>
              ))}
            </select>
          </div>
          {list.length === 0 ? (
            <p className="u-empty">Rien dans cette catégorie.</p>
          ) : (
            <ul className="u-advice">
              {list.map((a) => (
                <AdviceCard key={`${a.game}-${a.level}-${a.difficulty}-${a.kind}-${a.id}`} a={a} />
              ))}
            </ul>
          )}
          {shown.length > 10 && (
            <button type="button" className="link" onClick={() => setMore((m) => !m)}>
              {more ? 'Voir moins' : `Voir les ${shown.length - 10} autres`}
            </button>
          )}
        </>
      )}
    </Card>
  );
}

function AdviceCard({ a }: { a: ExerciseAdvice }) {
  const conf = confidenceOf(a.shown / Math.max(1, a.deff));
  const who = a.players === null ? 'élèves : pas encore comptés' : `${a.players} élève${a.players > 1 ? 's' : ''}`;
  return (
    <li className="u-advice-item">
      <div className="u-advice-top">
        <Pill tone={ACTION_TONE[a.action]}>{ACTION_LABEL[a.action]}</Pill>
        <span className="u-dim">
          {a.kind === 'famille' ? 'Famille' : 'Exercice'} · {gameName(a.game)} · {levelName(a.level)} · {diffName(a.difficulty)}
        </span>
      </div>
      <p className="u-advice-reason">{a.reason}</p>
      {a.kind === 'famille' && a.interval && a.target !== null && (
        <RangeBar p={a.interval.p} lo={a.interval.lo} hi={a.interval.hi} target={a.target} tolerance={TOLERANCE} label={a.label} />
      )}
      <p className="u-advice-todo">
        <strong>À faire :</strong> {a.todo} <span className="u-dim">
          · {CONFIDENCE_LABEL[conf]} ({a.shown} manches, {who})
        </span>
        {a.deff > 1.05 && (
          <Tip label="Pourquoi cette marge ?">
            Les résultats varient d’un élève à l’autre : ces {a.shown} manches valent environ {Math.round(a.shown / a.deff)} réponses indépendantes. La marge en tient compte.
          </Tip>
        )}
      </p>
    </li>
  );
}
