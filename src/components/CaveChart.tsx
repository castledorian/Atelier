import { useMemo, useState } from 'react';
import { BASE_HP, BOSS_NAMES, INK_STEPS, POWER_STEPS } from '../game/boss/state';
import { cumulate, lastWeek, shortDate, xOf } from '../game/boss/history';
import type { DayPoint } from '../game/boss/history';

/**
 * L'évolution de la grotte depuis la rentrée, en deux petits graphiques côte à côte (jamais deux échelles sur un même graphique) :
 * les points de vie de la créature, avec ses étapes, et la force de la classe, avec ses lanternes.
 * Survol ou toucher : la date et la valeur du jour. Les chiffres sont aussi dans un tableau (bouton « Voir les chiffres »).
 */

const W = 320;
const H = 150;
const PAD = { l: 6, r: 8, t: 12, b: 22 };
const LEVEL_NAMES = ['Aucune lanterne', '1 lanterne', '2 lanternes', '3 lanternes', '4 lanternes', '5 lanternes', '6 lanternes'];

function Panel({
  title,
  points,
  value,
  xs,
  steps,
  stepNames,
  color,
  unit,
}: {
  title: string;
  points: DayPoint[];
  value: (p: DayPoint) => number;
  xs: number[];
  steps: number[];
  stepNames: readonly string[];
  color: string;
  unit: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const vals = points.map(value);
  const last = vals[vals.length - 1] ?? 0;
  // l'échelle montre l'étape en cours et la suivante : on voit ce qu'il reste à faire
  const next = steps.find((s) => s > last) ?? last;
  const max = Math.max(next, ...vals, 1) * 1.08;
  const min = Math.min(0, ...vals);
  const X = (x: number) => PAD.l + x * (W - PAD.l - PAD.r);
  const Y = (v: number) => PAD.t + (1 - (v - min) / (max - min)) * (H - PAD.t - PAD.b);
  const line = points.map((_, i) => `${i ? 'L' : 'M'}${X(xs[i]).toFixed(1)} ${Y(vals[i]).toFixed(1)}`).join(' ');
  const area = points.length ? `${line} L${X(xs[xs.length - 1]).toFixed(1)} ${Y(min)} L${X(xs[0]).toFixed(1)} ${Y(min)} Z` : '';
  const shown = steps.map((s, i) => [s, i] as const).filter(([s]) => s > 0 && s <= max);
  // un nom d'étape n'est écrit que s'il ne touche pas le précédent (les lignes restent toutes)
  const named = new Set<number>();
  let lastY = Infinity;
  for (const [s] of [...shown].reverse()) {
    if (Math.abs(Y(s) - lastY) >= 12) {
      named.add(s);
      lastY = Y(s);
    }
  }

  const pick = (clientX: number, el: SVGSVGElement) => {
    const r = el.getBoundingClientRect();
    const x = ((clientX - r.left) / r.width) * W;
    let best = 0;
    for (let i = 1; i < xs.length; i++) if (Math.abs(X(xs[i]) - x) < Math.abs(X(xs[best]) - x)) best = i;
    setHover(xs.length ? best : null);
  };
  const h = hover !== null && hover < points.length ? hover : null;

  return (
    <figure className="cc-panel">
      <figcaption>
        <span className="cc-title">{title}</span>
        <strong className="cc-now">
          {last.toLocaleString('fr-FR')} <span>{unit}</span>
        </strong>
      </figcaption>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`${title} : ${last} ${unit} aujourd’hui.`}
        onPointerMove={(e) => pick(e.clientX, e.currentTarget)}
        onPointerDown={(e) => pick(e.clientX, e.currentTarget)}
        onPointerLeave={() => setHover(null)}
      >
        {/* étapes : lignes pointillées discrètes, nommées */}
        {shown.map(([s, i]) => (
          <g key={s} className="cc-step">
            <line x1={PAD.l} x2={W - PAD.r} y1={Y(s)} y2={Y(s)} />
            {named.has(s) && (
              <text x={W - PAD.r} y={Y(s) - 3} textAnchor="end">
                {stepNames[i]}
              </text>
            )}
          </g>
        ))}
        <line className="cc-axis" x1={PAD.l} x2={W - PAD.r} y1={Y(min)} y2={Y(min)} />
        {points.length > 0 && (
          <>
            <path d={area} fill={color} opacity="0.14" />
            <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
            <circle cx={X(xs[xs.length - 1])} cy={Y(last)} r="4" fill={color} stroke="#14110e" strokeWidth="2" />
            <text className="cc-date" x={PAD.l} y={H - 6}>
              {shortDate(points[0].d)}
            </text>
            <text className="cc-date" x={W - PAD.r} y={H - 6} textAnchor="end">
              aujourd’hui
            </text>
          </>
        )}
        {h !== null && (
          <g className="cc-hover">
            <line x1={X(xs[h])} x2={X(xs[h])} y1={PAD.t} y2={Y(min)} />
            <circle cx={X(xs[h])} cy={Y(vals[h])} r="5" fill={color} stroke="#14110e" strokeWidth="2" />
          </g>
        )}
      </svg>
      <p className="cc-tip" aria-hidden="true">
        {h !== null ? `${shortDate(points[h].d)} : ${vals[h].toLocaleString('fr-FR')} ${unit}` : ' '}
      </p>
    </figure>
  );
}

export default function CaveChart({ days, today, ink, power }: { days: ReadonlyArray<{ d: string; ink: number; power: number }>; today: string; ink: number; power: number }) {
  // ce qui a été compté avant le début du journal (appareil qui jouait avant cette version) : ajouté au départ de la courbe,
  // pour qu'elle arrive toujours sur les vrais chiffres de la grotte
  const points = useMemo(() => {
    const sumInk = days.reduce((n, x) => n + x.ink, 0);
    const sumPow = days.reduce((n, x) => n + x.power, 0);
    const before = { ink: Math.max(0, ink - sumInk), power: Math.max(0, power - sumPow) };
    return cumulate(days, BASE_HP + before.ink).map((p) => ({ ...p, power: p.power + before.power }));
  }, [days, ink, power]);
  const xs = useMemo(() => xOf(points, today), [points, today]);
  const week = lastWeek(points, today, BASE_HP);
  if (points.length === 0) return <p className="cc-empty">La courbe apparaîtra après les premières parties de la classe.</p>;
  return (
    <section className="cc" aria-labelledby="cc-h">
      <h2 id="cc-h" className="cc-h">
        L’évolution depuis la rentrée
      </h2>
      <div className="cc-grid">
        <Panel title="La créature" points={points} value={(p) => p.hp} xs={xs} steps={INK_STEPS.map((s) => s + BASE_HP)} stepNames={BOSS_NAMES} color="#8b72e6" unit="points de vie" />
        <Panel title="La classe" points={points} value={(p) => p.power} xs={xs} steps={[...POWER_STEPS]} stepNames={LEVEL_NAMES} color="#b98322" unit="réussites" />
      </div>
      <p className="cc-week">
        Cette semaine : la créature a {week.hp >= 0 ? `pris ${week.hp}` : `perdu ${-week.hp}`} point{Math.abs(week.hp) > 1 ? 's' : ''} de vie, la classe a
        gagné {week.power} réussite{week.power > 1 ? 's' : ''}.
      </p>
      <details className="cc-table">
        <summary>Voir les chiffres</summary>
        <table>
          <caption className="sr-only">Évolution jour par jour</caption>
          <thead>
            <tr>
              <th scope="col">Jour</th>
              <th scope="col">Points de vie de la créature</th>
              <th scope="col">Réussites de la classe</th>
            </tr>
          </thead>
          <tbody>
            {[...points].reverse().map((p) => (
              <tr key={p.d}>
                <td>{shortDate(p.d)}</td>
                <td>{p.hp.toLocaleString('fr-FR')}</td>
                <td>{p.power.toLocaleString('fr-FR')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </section>
  );
}
