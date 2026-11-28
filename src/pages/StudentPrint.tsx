import { useMemo } from 'react';
import { PrintChart } from '../components/PrintChart';
import { Check } from '../components/Screens';
import { diffName, gameName, levelName, picksText } from '../game/balanceView';
import { PERIODS, periodLabel, runsInPeriod } from '../game/printSheet';
import type { Period, PrintOpts } from '../game/printSheet';
import { gameSummaries, metricOf, missedItems, progressSeries, strengthsAndWeaknesses, summarySentence, trendOf, weeklyActivity } from '../game/studentView';
import type { RuleStat, StudentDetail } from '../game/studentView';

const day = (ms: number) => new Date(ms).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
const when = (ms: number) => new Date(ms).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const dur = (s: number) => (s >= 3600 ? `${Math.floor(s / 3600)} h ${Math.round((s % 3600) / 60)} min` : s >= 60 ? `${Math.round(s / 60)} min` : `${s} s`);
const pct = (n: number | null) => (n === null ? '—' : `${String(Math.round(n)).replace('.', ',')} %`);

const TREND = { few: 'peu de parties', up: 'en progrès', down: 'en baisse', flat: 'stable' } as const;

function RuleList({ title, rows, kind }: { title: string; rows: RuleStat[]; kind: 'weak' | 'strong' }) {
  return (
    <section className="ps-block">
      <h2>{title}</h2>
      {rows.length === 0 ? (
        <p className="ps-dim">{kind === 'weak' ? 'Rien d’inquiétant relevé.' : 'Pas encore assez de manches.'}</p>
      ) : (
        <ul className="ps-rows">
          {rows.map((w) => {
            const v = kind === 'weak' ? w.err : 100 - w.err;
            return (
              <li key={`${w.game}-${w.label}`}>
                <span>
                  {w.label} <span className="ps-dim">· {gameName(w.game)}</span>
                </span>
                <span className="ps-meter" aria-hidden="true">
                  <i style={{ width: `${Math.round(v)}%` }} />
                </span>
                <strong>
                  {Math.round(v)} % {kind === 'weak' ? 'd’erreurs' : 'de réussite'}
                </strong>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/**
 * La fiche sur papier : une page A4, compacte, avec tout ce que l'enseignant a choisi.
 * Cachée à l'écran ; l'écran d'une fiche garde ses boutons et son graphique interactif.
 */
export function PrintSheet({ d, name, opts, comment, now }: { d: StudentDetail; name: string; opts: PrintOpts; comment: string; now: number }) {
  const runs = useMemo(() => runsInPeriod(d.runs, opts.period, now), [d.runs, opts.period, now]);
  const games = useMemo(() => gameSummaries(runs).filter((s) => !opts.hidden.includes(s.game)), [runs, opts.hidden]);
  const { weak, strong } = useMemo(() => strengthsAndWeaknesses(d.items), [d.items]);
  const missed = useMemo(() => missedItems(d.items, 6), [d.items]);
  const weeks = useMemo(() => weeklyActivity(runs, now), [runs, now]);
  const recent = useMemo(() => [...runs].sort((a, b) => b.at - a.at).slice(0, 10), [runs]);
  const all = useMemo(() => gameSummaries(runs), [runs]);
  const gameRuns = runs.filter((r) => r.kind === 'game');
  const seconds = runs.reduce((s, r) => s + r.duration, 0);
  const lead = all[0];
  const leadTrend = useMemo(() => trendOf(lead ? progressSeries(runs, lead.game) : []), [runs, lead]);

  return (
    <article className="ps" aria-label={`Fiche de ${name}`}>
      <header className="ps-head">
        <div>
          <p className="ps-eyebrow">Atelier · Bilan de l’élève</p>
          <h1>{name}</h1>
        </div>
        <p className="ps-meta">
          {d.student.class_name}
          <br />
          {periodLabel(opts.period)} · imprimé le {new Date(now).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
      </header>

      {opts.figures && (
        <dl className="ps-figs">
          <div>
            <dt>Parties jouées</dt>
            <dd>{gameRuns.length}</dd>
          </div>
          <div>
            <dt>Temps de jeu</dt>
            <dd>{seconds ? dur(seconds) : '—'}</dd>
          </div>
          <div>
            <dt>Jeux joués</dt>
            <dd>{all.length}</dd>
          </div>
          <div>
            <dt>Dernière partie</dt>
            <dd>{runs.length ? when(Math.max(...runs.map((r) => r.at))) : '—'}</dd>
          </div>
        </dl>
      )}

      <p className="ps-lead">{summarySentence(d.student.name, runs, weak, strong, leadTrend, lead ? { label: gameName(lead.game), metric: metricOf(lead.game) } : undefined)}</p>

      {opts.charts && games.length > 0 && (
        <section className="ps-block">
          <h2>Évolution par jeu</h2>
          <div className="ps-charts">
            {games.map((g) => {
              const series = progressSeries(runs, g.game);
              const t = trendOf(series);
              return (
                <figure key={g.game} className="ps-fig">
                  <figcaption>
                    <strong>{gameName(g.game)}</strong>
                    <span>
                      {metricOf(g.game)} {pct(g.acc)} · {TREND[t.kind]}
                    </span>
                  </figcaption>
                  <PrintChart points={series.map((p) => ({ label: day(p.at), acc: p.acc, smooth: p.smooth }))} title={`${metricOf(g.game)} à ${gameName(g.game)}`} />
                  <p className="ps-dim">
                    {g.runs} partie{g.runs > 1 ? 's' : ''} · record {g.best} pts · {dur(g.seconds)}
                  </p>
                </figure>
              );
            })}
          </div>
          <p className="ps-dim ps-legend">Trait : moyenne des 3 dernières parties. Ronds : chaque partie. Frappe ! : précision de frappe.</p>
        </section>
      )}

      {(opts.weak || opts.strong) && (
        <div className="ps-cols">
          {opts.weak && <RuleList title="À retravailler" rows={weak} kind="weak" />}
          {opts.strong && <RuleList title="Bien maîtrisé" rows={strong} kind="strong" />}
        </div>
      )}

      {opts.missed && missed.length > 0 && (
        <section className="ps-block">
          <h2>Exercices les plus ratés</h2>
          <table className="ps-tbl">
            <thead>
              <tr>
                <th scope="col">Exercice</th>
                <th scope="col">Jeu</th>
                <th scope="col">Ratés</th>
                <th scope="col">A répondu</th>
              </tr>
            </thead>
            <tbody>
              {missed.map((m) => (
                <tr key={`${m.game}-${m.label}`}>
                  <td>{m.label}</td>
                  <td>
                    {gameName(m.game)} · {levelName(m.level)}
                  </td>
                  <td>
                    {m.wrong} / {m.shown}
                  </td>
                  <td>{picksText(m.picks, 2) || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {opts.weeks && (
        <section className="ps-block ps-weeks">
          <h2>Régularité · parties par semaine (8 dernières semaines)</h2>
          <ol className="ps-wk" aria-label={`Parties par semaine : ${weeks.map((w) => `${w.runs}`).join(', ')}`}>
            {weeks.map((w) => (
              <li key={w.start}>
                <i style={{ height: `${Math.max(w.runs > 0 ? 6 : 1, (100 * w.runs) / Math.max(1, ...weeks.map((x) => x.runs)))}%` }} />
                <span>{w.runs}</span>
                <small>{day(w.start)}</small>
              </li>
            ))}
          </ol>
        </section>
      )}

      {opts.recent && recent.length > 0 && (
        <section className="ps-block">
          <h2>Dernières parties</h2>
          <table className="ps-tbl">
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">Jeu</th>
                <th scope="col">Type</th>
                <th scope="col">Score</th>
                <th scope="col">Réussite</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((r, i) => (
                <tr key={i}>
                  <td>{when(r.at)}</td>
                  <td>
                    {gameName(r.game)} · {diffName(r.mode)}
                  </td>
                  <td>{r.kind === 'drill' ? 'Entraînement' : r.session ? 'Séance' : 'Libre'}</td>
                  <td>{r.score} pts</td>
                  <td>{pct(r.acc)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {opts.note && (
        <section className="ps-block ps-note">
          <h2>Appréciation de l’enseignant</h2>
          {comment.trim() ? (
            <p className="ps-comment">{comment.trim()}</p>
          ) : (
            <div className="ps-lines" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
          )}
          <div className="ps-sign">
            <span>Date :</span>
            <span>Signature de l’enseignant :</span>
            <span>Vu par la famille :</span>
          </div>
        </section>
      )}
    </article>
  );
}

/** Choix de ce qui s'imprime : repères, un graphique par jeu, listes, appréciation. */
export function PrintPanel({
  opts,
  onChange,
  comment,
  onComment,
  games,
  onPrint,
  onClose,
}: {
  opts: PrintOpts;
  onChange: (patch: Partial<PrintOpts>) => void;
  comment: string;
  onComment: (v: string) => void;
  games: string[];
  onPrint: () => void;
  onClose: () => void;
}) {
  const toggleGame = (g: string) => onChange({ hidden: opts.hidden.includes(g) ? opts.hidden.filter((x) => x !== g) : [...opts.hidden, g] });
  return (
    <section className="u-card u-printbox no-print" aria-labelledby="pp-title">
      <h2 id="pp-title" className="u-card-title">
        Fiche à imprimer
      </h2>
      <div className="u-printbox-row">
        <span id="pp-period" className="subhead">
          Période
        </span>
        <div className="seg" role="radiogroup" aria-labelledby="pp-period">
          {PERIODS.map((p) => (
            <button key={p.id} type="button" role="radio" aria-checked={opts.period === p.id} className="seg-b" onClick={() => onChange({ period: p.id as Period })}>
              {p.label}
            </button>
          ))}
        </div>
      </div>
      <div className="u-printbox-grid">
        <Check on={opts.figures} onClick={() => onChange({ figures: !opts.figures })}>
          Repères chiffrés
        </Check>
        <Check on={opts.charts} onClick={() => onChange({ charts: !opts.charts })}>
          Graphique par jeu
        </Check>
        <Check on={opts.weak} onClick={() => onChange({ weak: !opts.weak })}>
          À retravailler
        </Check>
        <Check on={opts.strong} onClick={() => onChange({ strong: !opts.strong })}>
          Bien maîtrisé
        </Check>
        <Check on={opts.missed} onClick={() => onChange({ missed: !opts.missed })}>
          Exercices les plus ratés
        </Check>
        <Check on={opts.weeks} onClick={() => onChange({ weeks: !opts.weeks })}>
          Régularité
        </Check>
        <Check on={opts.recent} onClick={() => onChange({ recent: !opts.recent })}>
          Dernières parties
        </Check>
        <Check on={opts.note} onClick={() => onChange({ note: !opts.note })}>
          Appréciation et signatures
        </Check>
      </div>
      {opts.charts && games.length > 1 && (
        <div className="u-printbox-row">
          <span id="pp-games" className="subhead">
            Jeux du graphique
          </span>
          <div className="u-printbox-grid" role="group" aria-labelledby="pp-games">
            {games.map((g) => (
              <Check key={g} on={!opts.hidden.includes(g)} onClick={() => toggleGame(g)}>
                {gameName(g)}
              </Check>
            ))}
          </div>
        </div>
      )}
      {opts.note && (
        <div className="u-printbox-row">
          <label htmlFor="pp-comment" className="subhead">
            Appréciation (facultatif)
          </label>
          <textarea id="pp-comment" className="field" rows={3} maxLength={600} value={comment} onChange={(e) => onComment(e.target.value)} placeholder="Laisse vide pour l’écrire à la main sur la feuille." />
        </div>
      )}
      <p className="u-dim">Les listes d’exercices couvrent toutes les parties, quelle que soit la période.</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn btn-primary" onClick={onPrint}>
          Imprimer
        </button>
        <button type="button" className="btn btn-ghost" onClick={onClose}>
          Fermer
        </button>
      </div>
    </section>
  );
}
