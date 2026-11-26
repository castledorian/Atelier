import { useEffect, useMemo, useState } from 'react';
import { Bar, Card, LineChart, Pill, Stat, WeekBars } from '../components/ui';
import type { ChartPoint, Tone } from '../components/ui';
import { diffName, gameName, levelName, picksText } from '../game/balanceView';
import { gameSummaries, missedItems, progressSeries, strengthsAndWeaknesses, summarySentence, trendOf, weeklyActivity } from '../game/studentView';
import type { StudentDetail } from '../game/studentView';
import * as T from '../server/teacher';
import { Tip } from '../components/Tip';

const day = (ms: number) => new Date(ms).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
const when = (ms: number) => new Date(ms).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const dur = (s: number) => (s >= 3600 ? `${Math.floor(s / 3600)} h ${Math.round((s % 3600) / 60)} min` : s >= 60 ? `${Math.round(s / 60)} min` : `${s} s`);
const pct = (n: number | null) => (n === null ? '—' : `${String(Math.round(n)).replace('.', ',')} %`);
/** Jeux dont le détail exercice par exercice est suivi (les autres : seulement les parties). */
const DETAILED = ['math', 'spelling', 'facteur'];

type Act = <R>(f: () => Promise<R>) => Promise<R | undefined>;

/** Fiche d'un élève : où il progresse, où il bute, ce qu'il a joué. Pensée pour aider, jamais pour classer. */
export default function StudentProfile({ id, name, onBack, act }: { id: string; name: string; onBack: () => void; act: Act }) {
  const [d, setD] = useState<StudentDetail | null>(null);
  const [failed, setFailed] = useState(false);
  const [game, setGame] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void act(() => T.studentDetail(id)).then((r) => {
      if (!live) return;
      if (r) setD(r);
      else setFailed(true);
    });
    return () => {
      live = false;
    };
  }, [id, act]);

  const now = useMemo(() => Date.now(), []);
  const summaries = useMemo(() => (d ? gameSummaries(d.runs) : []), [d]);
  const current = game ?? summaries[0]?.game ?? null;
  const series = useMemo(() => (d && current ? progressSeries(d.runs, current) : []), [d, current]);
  const trend = useMemo(() => trendOf(series), [series]);
  const { weak, strong } = useMemo(() => (d ? strengthsAndWeaknesses(d.items) : { weak: [], strong: [] }), [d]);
  const missed = useMemo(() => (d ? missedItems(d.items) : []), [d]);
  const weeks = useMemo(() => (d ? weeklyActivity(d.runs, now) : []), [d, now]);
  const gameRuns = d ? d.runs.filter((r) => r.kind === 'game') : [];
  const seconds = d ? d.runs.reduce((s, r) => s + r.duration, 0) : 0;
  const accAll = gameRuns.length ? gameRuns.reduce((s, r) => s + r.acc, 0) / gameRuns.length : null;
  const recent = d ? [...d.runs].sort((a, b) => b.at - a.at).slice(0, 12) : [];
  const hasItems = !!d && d.items.length > 0;

  const points: ChartPoint[] = series.map((p) => ({ x: day(p.at), y: p.smooth, raw: p.acc, detail: `${p.score} pts` }));
  const trendTone: Tone = trend.kind === 'up' ? 'good' : trend.kind === 'down' ? 'warn' : 'mute';
  const trendText = trend.kind === 'few' ? 'Pas assez de parties' : trend.kind === 'up' ? `En progrès (+${trend.delta} pts)` : trend.kind === 'down' ? `En baisse (${trend.delta} pts)` : 'Stable';

  return (
    <div className="u-page">
      <button type="button" className="u-back" onClick={onBack}>
        <span aria-hidden="true">←</span> Retour à la classe
      </button>
      <header className="u-hero">
        <div>
          <p className="u-eyebrow">Fiche élève{d ? ` · ${d.student.class_name}` : ''}</p>
          <h1 className="u-h1">{name}</h1>
        </div>
        {d && gameRuns.length > 0 && <Pill tone={trendTone}>{current ? `${gameName(current)} : ` : ''}{trendText}</Pill>}
      </header>

      {!d && !failed && <p className="u-empty">Chargement de la fiche…</p>}
      {failed && (
        <p className="u-empty">
          Fiche indisponible.
          <Tip label="Pourquoi ?">Le serveur n’a pas répondu, ou sa mise à jour « fiche élève » n’est pas encore faite.</Tip>
        </p>
      )}

      {d && (
        <>
          <p className="u-lead">{summarySentence(d.student.name, d.runs, weak, strong, trend)}</p>

          <div className="u-grid-stats">
            <Stat label="Parties jouées" value={gameRuns.length} hint={d.runs.length > gameRuns.length ? `+ ${d.runs.length - gameRuns.length} entraînements` : undefined} />
            <Stat label="Temps de jeu" value={seconds ? dur(seconds) : '—'} />
            <Stat label="Réussite moyenne" value={pct(accAll)} hint="Moyenne de toutes ses parties (hors entraînements)." />
            <Stat label="Dernière partie" value={d.runs.length ? when(Math.max(...d.runs.map((r) => r.at))) : '—'} />
          </div>

          {summaries.length > 0 && (
            <Card
              title="Évolution de la réussite"
              note="Point rouge : une partie. Trait noir : moyenne des 3 dernières parties, pour lisser les hauts et les bas."
              action={
                summaries.length > 1 ? (
                  <div className="seg" role="radiogroup" aria-label="Jeu affiché">
                    {summaries.map((s) => (
                      <button key={s.game} type="button" role="radio" aria-checked={current === s.game} className="seg-b" onClick={() => setGame(s.game)}>
                        {gameName(s.game)}
                      </button>
                    ))}
                  </div>
                ) : undefined
              }
            >
              <LineChart points={points} title={`Réussite de ${d.student.name} à ${current ? gameName(current) : ''}`} />
              <ul className="u-game-list">
                {summaries.map((s) => (
                  <li key={s.game}>
                    <strong>{gameName(s.game)}</strong>
                    <span>
                      {s.runs} partie{s.runs > 1 ? 's' : ''} · record {s.best} · réussite {pct(s.acc)}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <div className="u-cols">
            <Card title="À retravailler" note="Familles de calculs ou règles où l’élève se trompe le plus souvent.">
              {weak.length === 0 ? (
                <p className="u-empty">{hasItems ? 'Rien d’inquiétant pour l’instant : aucune famille n’est nettement ratée.' : 'Pas encore de détail exercice par exercice.'}</p>
              ) : (
                <ul className="u-rows">
                  {weak.map((w) => (
                    <li key={`${w.game}-${w.label}`}>
                      <div className="u-row-top">
                        <span>
                          {w.label} <span className="u-dim">· {gameName(w.game)}</span>
                        </span>
                        <strong>{Math.round(w.err)} % d’erreurs</strong>
                      </div>
                      <Bar pct={w.err} tone="warn" label={`Erreurs en ${w.label}`} />
                      <span className="u-dim">
                        {w.wrong} ratés sur {w.shown} posés
                        {Object.keys(w.picks).length ? ` · réponses choisies : ${picksText(w.picks, 2)}` : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card title="Bien maîtrisé" note="Familles réussies du premier coup, posées au moins 15 fois.">
              {strong.length === 0 ? (
                <p className="u-empty">{hasItems ? 'Pas encore de famille réussie à plus de 90 % sur assez de manches.' : 'Pas encore de détail exercice par exercice.'}</p>
              ) : (
                <ul className="u-rows">
                  {strong.map((w) => (
                    <li key={`${w.game}-${w.label}`}>
                      <div className="u-row-top">
                        <span>
                          {w.label} <span className="u-dim">· {gameName(w.game)}</span>
                        </span>
                        <strong>{Math.round(100 - w.err)} % de réussite</strong>
                      </div>
                      <Bar pct={100 - w.err} tone="good" label={`Réussite en ${w.label}`} />
                      <span className="u-dim">
                        {w.shown - w.wrong} réussis sur {w.shown} posés
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          {!hasItems && summaries.some((s) => DETAILED.includes(s.game)) && (
            <p className="u-info">
              Détail des erreurs : dès la prochaine partie.
              <Tip label="Pourquoi c’est vide ?">Les parties déjà jouées n’avaient pas gardé ce détail. Frappe ! et Mémoire d’encre n’ont ni calculs ni mots à détailler.</Tip>
            </p>
          )}

          {missed.length > 0 && (
            <Card title="Exercices les plus ratés" note="Un calcul, un mot ou une phrase raté au moins deux fois, avec ce que l’élève a répondu à la place.">
              <div className="u-scroll">
                <table className="u-tbl">
                  <thead>
                    <tr>
                      <th scope="col">Exercice</th>
                      <th scope="col">Jeu</th>
                      <th scope="col" className="u-num">
                        Ratés
                      </th>
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
                        <td className="u-num">
                          {m.wrong} / {m.shown}
                        </td>
                        <td>{picksText(m.picks, 3) || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          <div className="u-cols">
            <Card title="Régularité" note="Parties par semaine, sur les 8 dernières semaines.">
              <WeekBars label="Parties par semaine" weeks={weeks.map((w) => ({ label: `semaine du ${day(w.start)}`, value: w.runs }))} />
            </Card>
            <Card title="Dernières parties">
              {recent.length === 0 ? (
                <p className="u-empty">Aucune partie.</p>
              ) : (
                <ul className="u-recent">
                  {recent.map((r, i) => (
                    <li key={i}>
                      <span className="u-dim">{when(r.at)}</span>
                      <span>
                        {gameName(r.game)} · {diffName(r.mode)}
                      </span>
                      <span className="u-tag">{r.kind === 'drill' ? 'Entraînement' : r.session ? 'Séance' : 'Libre'}</span>
                      <strong>{r.score} pts</strong>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
