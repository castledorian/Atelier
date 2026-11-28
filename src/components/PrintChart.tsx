/**
 * Courbe d'évolution pour le papier : fixe, sans survol, en noir et blanc (lisible sur une photocopie).
 * Trait épais = moyenne des 3 dernières parties ; ronds creux = chaque partie.
 */
export interface PrintPoint {
  label: string;
  acc: number;
  smooth: number;
}

export function PrintChart({ points, title }: { points: PrintPoint[]; title: string }) {
  const W = 320;
  const H = 104;
  const L = 30;
  const R = 6;
  const T = 6;
  const B = 18;
  const xs = (i: number) => (points.length === 1 ? (L + W - R) / 2 : L + (i * (W - L - R)) / (points.length - 1));
  const ys = (v: number) => T + ((100 - Math.max(0, Math.min(100, v))) * (H - T - B)) / 100;
  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${xs(i).toFixed(1)},${ys(p.smooth).toFixed(1)}`).join(' ');
  const last = points.length - 1;
  return (
    <svg className="ps-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${title} : de ${Math.round(points[0].smooth)} % à ${Math.round(points[last].smooth)} % en ${points.length} partie${points.length > 1 ? 's' : ''}`}>
      <rect x={L} y={T} width={W - L - R} height={H - T - B} className="ps-plot" />
      {[0, 50, 100].map((g) => (
        <g key={g}>
          <line x1={L} x2={W - R} y1={ys(g)} y2={ys(g)} className="ps-grid" />
          <text x={L - 4} y={ys(g) + 3} textAnchor="end" className="ps-axis">
            {g} %
          </text>
        </g>
      ))}
      {points.map((p, i) => (
        <circle key={i} cx={xs(i)} cy={ys(p.acc)} r={2.4} className="ps-raw" />
      ))}
      {points.length > 1 && <path d={line} className="ps-line" />}
      <circle cx={xs(last)} cy={ys(points[last].smooth)} r={3.4} className="ps-end" />
      <text x={L} y={H - 4} textAnchor="start" className="ps-axis">
        {points[0].label}
      </text>
      {points.length > 1 && (
        <text x={W - R} y={H - 4} textAnchor="end" className="ps-axis">
          {points[last].label}
        </text>
      )}
    </svg>
  );
}
