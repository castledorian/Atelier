import { useMemo, useState } from 'react';
import { diffName, gameName, levelName } from '../../game/balanceView';
import { gradeRows, hourly, weeklyTotals } from '../../game/statsView';
import { downloadText, toCsv } from '../../game/history';
import { SortTh, sortRows, useSort } from '../../components/SortTable';
import type { SortValue } from '../../components/SortTable';
import { Tip } from '../../components/Tip';
import type { ClassStat, GameStats, GradeStat } from '../../server/admin';
import { ALL_GAMES, Meter, ORDER, fmt, num, stamp } from './shared';

const DAYS = ['', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];

/** Chiffres clés de la période. */
export function Kpis({ g }: { g: GameStats }) {
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
export function Activity({ g }: { g: GameStats }) {
  const weeks = weeklyTotals(g);
  const wMax = Math.max(1, ...weeks.map((w) => w.runs));
  const h = hourly(g);
  const hMax = Math.max(1, ...h.hours);
  const busiest = [...g.hours].sort((a, b) => b.runs - a.runs)[0];
  return (
    <>
      <h2 className="subhead mt-3">Activité : parties par semaine</h2>
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
export function ByGrade({ g }: { g: GameStats }) {
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
