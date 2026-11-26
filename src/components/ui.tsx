import { useId, useState } from 'react';
import type { ReactNode } from 'react';
import { Tip } from './Tip';

/**
 * Éléments d'interface communs aux pages de données (espace enseignant, administration) : une seule façon de montrer un chiffre,
 * un état, une barre ou une courbe, pour que tout soit lisible au premier coup d'œil.
 * Règles : jamais l'information par la seule couleur (une pastille porte toujours un symbole ET un mot) ;
 * une courbe est toujours doublée d'un tableau de chiffres ; tout se lit au clavier.
 */

export type Tone = 'good' | 'warn' | 'bad' | 'info' | 'mute';

const SYMBOL: Record<Tone, string> = { good: '✓', warn: '!', bad: '▲', info: 'i', mute: '–' };

/** Pastille d'état : symbole + mot, jamais la couleur seule. */
export function Pill({ tone = 'mute', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={`u-pill u-t-${tone}`}>
      <span aria-hidden="true" className="u-pill-sym">
        {SYMBOL[tone]}
      </span>
      {children}
    </span>
  );
}

/** Carte : un titre (le détail éventuel est dans une bulle « i »), un contenu, éventuellement une action à droite du titre. */
export function Card({ title, note, action, children, className = '' }: { title?: ReactNode; note?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`u-card ${className}`}>
      {(title || action) && (
        <header className="u-card-head">
          {title && (
            <h2 className="u-card-title">
              {title}
              {note && <Tip label={`À propos : ${typeof title === 'string' ? title : 'cette partie'}`}>{note}</Tip>}
            </h2>
          )}
          {action && <div className="u-card-action">{action}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

/** Un chiffre clé avec son libellé ; la précision éventuelle va dans une bulle « i ». */
export function Stat({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: Tone }) {
  return (
    <div className={`u-stat${tone ? ` u-stat-${tone}` : ''}`}>
      <div className="u-stat-label">
        {label}
        {hint && <Tip label={`À propos : ${label}`}>{hint}</Tip>}
      </div>
      <div className="u-stat-value">{value}</div>
    </div>
  );
}

/** Barre horizontale 0–100 avec son pourcentage écrit. */
export function Bar({ pct, tone = 'info', label }: { pct: number; tone?: Tone; label: string }) {
  const v = Math.max(0, Math.min(100, pct));
  return (
    <div className="u-bar" role="img" aria-label={`${label} : ${Math.round(v)} %`}>
      <div className={`u-bar-fill u-fill-${tone}`} style={{ width: `${v}%` }} />
    </div>
  );
}

/**
 * Où se situe une réussite par rapport à l'objectif : la zone acceptable (objectif ± tolérance) est grisée,
 * le segment bleu est l'intervalle de confiance, le trait est la valeur observée.
 */
export function RangeBar({ p, lo, hi, target, tolerance, label }: { p: number; lo: number; hi: number; target: number; tolerance: number; label: string }) {
  return (
    <div className="u-range" role="img" aria-label={`${label} : ${p} % observés, entre ${lo} % et ${hi} % à 95 % de confiance, objectif ${target} % ± ${tolerance}`}>
      <div className="u-range-zone" style={{ left: `${target - tolerance}%`, width: `${tolerance * 2}%` }} />
      <div className="u-range-ci" style={{ left: `${lo}%`, width: `${Math.max(1, hi - lo)}%` }} />
      <div className="u-range-p" style={{ left: `${p}%` }} />
    </div>
  );
}

export interface ChartPoint {
  /** étiquette de l'axe et du tableau (ex. « 12 nov. ») */
  x: string;
  /** valeur lissée (trait épais) */
  y: number;
  /** valeur brute (petit point), facultative */
  raw?: number;
  /** détail pour l'infobulle et le tableau */
  detail?: string;
}

/**
 * Courbe simple (0 à 100 %) : trait lissé épais, points bruts discrets, repère d'objectif facultatif, infobulle au survol / au focus,
 * et tableau « Voir les chiffres » équivalent pour les lecteurs d'écran.
 */
export function LineChart({ points, title, unit = '%', target, rawLabel = 'Partie', smoothLabel = 'Moyenne glissante' }: { points: ChartPoint[]; title: string; unit?: string; target?: number; rawLabel?: string; smoothLabel?: string }) {
  const id = useId();
  const [hover, setHover] = useState<number | null>(null);
  const W = 640;
  const H = 220;
  const L = 38;
  const R = 12;
  const T = 12;
  const B = 28;
  if (points.length === 0) return <p className="u-empty">Pas encore de partie à afficher.</p>;
  const xs = (i: number) => (points.length === 1 ? (L + W - R) / 2 : L + (i * (W - L - R)) / (points.length - 1));
  const ys = (v: number) => T + ((100 - Math.max(0, Math.min(100, v))) * (H - T - B)) / 100;
  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${xs(i).toFixed(1)},${ys(p.y).toFixed(1)}`).join(' ');
  const step = Math.max(1, Math.ceil(points.length / 6));
  const h = hover !== null ? points[hover] : null;
  return (
    <figure className="u-chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="group" aria-labelledby={`${id}-t`} onPointerLeave={() => setHover(null)}>
        <title id={`${id}-t`}>{title}</title>
        {[0, 25, 50, 75, 100].map((g) => (
          <g key={g}>
            <line x1={L} x2={W - R} y1={ys(g)} y2={ys(g)} className="u-grid" />
            <text x={L - 6} y={ys(g) + 4} textAnchor="end" className="u-axis">
              {g}
              {unit}
            </text>
          </g>
        ))}
        {target !== undefined && (
          <g>
            <line x1={L} x2={W - R} y1={ys(target)} y2={ys(target)} className="u-target" />
            <text x={W - R} y={ys(target) - 5} textAnchor="end" className="u-axis">
              objectif {target} {unit}
            </text>
          </g>
        )}
        {points.map((p, i) => (i % step === 0 || i === points.length - 1 ? (
          <text key={`x${i}`} x={xs(i)} y={H - 8} textAnchor={i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'} className="u-axis">
            {p.x}
          </text>
        ) : null))}
        {points.map((p, i) => p.raw !== undefined && <circle key={`r${i}`} cx={xs(i)} cy={ys(p.raw)} r={3} className="u-dot-raw" />)}
        {points.length > 1 && <path d={line} className="u-line" />}
        {points.map((p, i) => (
          <g key={`h${i}`}>
            {hover === i && <line x1={xs(i)} x2={xs(i)} y1={T} y2={H - B} className="u-cross" />}
            <circle cx={xs(i)} cy={ys(p.y)} r={hover === i ? 6 : 4} className="u-dot" />
            {/* zone de survol plus large que le point */}
            <rect
              x={xs(i) - Math.max(10, (W - L - R) / points.length / 2)}
              y={T}
              width={Math.max(20, (W - L - R) / points.length)}
              height={H - T - B}
              fill="transparent"
              tabIndex={0}
              aria-label={`${p.x} : ${Math.round(p.y)} ${unit}${p.detail ? `, ${p.detail}` : ''}`}
              onPointerEnter={() => setHover(i)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
            />
          </g>
        ))}
        {h && hover !== null && (
          <g pointerEvents="none" transform={`translate(${Math.min(W - 150, Math.max(L, xs(hover) - 70))},${Math.max(2, ys(h.y) - 52)})`}>
            <rect width={140} height={44} rx={6} className="u-tip" />
            <text x={8} y={17} className="u-tip-t">
              {h.x} · {Math.round(h.y)} {unit}
            </text>
            <text x={8} y={34} className="u-tip-s">
              {h.detail ?? ''}
            </text>
          </g>
        )}
      </svg>
      <figcaption className="u-legend">
        <span>
          <i className="u-key u-key-line" aria-hidden="true" /> {smoothLabel}
        </span>
        <span>
          <i className="u-key u-key-dot" aria-hidden="true" /> {rawLabel}
        </span>
        {target !== undefined && (
          <span>
            <i className="u-key u-key-target" aria-hidden="true" /> Objectif
          </span>
        )}
      </figcaption>
      <details className="u-table">
        <summary>Voir les chiffres</summary>
        <table>
          <thead>
            <tr>
              <th scope="col">Date</th>
              <th scope="col">{rawLabel}</th>
              <th scope="col">{smoothLabel}</th>
              <th scope="col">Détail</th>
            </tr>
          </thead>
          <tbody>
            {points.map((p, i) => (
              <tr key={i}>
                <td>{p.x}</td>
                <td>{p.raw !== undefined ? `${Math.round(p.raw)} ${unit}` : '–'}</td>
                <td>{Math.round(p.y)} {unit}</td>
                <td>{p.detail ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}

/** Petites barres d'activité (une par semaine). */
export function WeekBars({ weeks, label }: { weeks: { label: string; value: number }[]; label: string }) {
  const max = Math.max(1, ...weeks.map((w) => w.value));
  return (
    <div className="u-weeks" role="img" aria-label={`${label} : ${weeks.map((w) => `${w.label} ${w.value}`).join(', ')}`}>
      {weeks.map((w, i) => (
        <div key={i} className="u-week" title={`${w.label} : ${w.value} partie${w.value > 1 ? 's' : ''}`}>
          <div className="u-week-bar" style={{ height: `${Math.max(w.value > 0 ? 8 : 2, (100 * w.value) / max)}%` }} />
          <span>{w.value}</span>
        </div>
      ))}
    </div>
  );
}
