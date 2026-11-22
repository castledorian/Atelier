import type { ReactNode } from 'react';

/**
 * Le décor de la grotte : on descend le long d'une échelle de corde, une lanterne à la main, jusqu'à la salle où
 * dort la créature d'encre. La salle est sombre, mais un éclairage ciblé tombe sur la créature : elle se détache toujours bien.
 *
 * `depth` (0 à 1) : jusqu'où la lanterne est descendue (elle s'enfonce un peu plus à chaque saison de l'année).
 * `stage` (0 à 6) : l'étape de la créature. La grotte change avec elle : l'encre coule des stalactites, tache les parois,
 *   forme un lac qui s'étale, puis des veines violettes s'allument et une cascade d'encre apparaît.
 * `lanterns` (0 à 6) : la force de la classe. Chaque palier allume une lanterne sur les parois : la classe éclaire la grotte.
 * `children` : la créature.
 */

/** Pointes des stalactites (d'où coule l'encre). */
const TIPS: Array<[number, number]> = [[73, 46], [229, 52], [93, 28], [250, 30], [193, 24], [126, 20]];
/** Taches d'encre sur les parois, dans l'ordre où elles apparaissent. */
const STAINS: Array<[number, number, number]> = [[46, 150, 14], [272, 176, 16], [30, 262, 18], [284, 290, 15], [60, 320, 12]];
/** Lanternes de la classe, de la plus haute à la plus basse. */
const LANTERNS: Array<[number, number]> = [[40, 70], [282, 86], [24, 180], [292, 200], [52, 286], [268, 312]];

export default function CaveScene({ depth, stage = 0, lanterns = 0, children }: { depth: number; stage?: number; lanterns?: number; children: ReactNode }) {
  const st = Math.max(0, Math.min(6, Math.round(stage)));
  const lit = Math.max(0, Math.min(LANTERNS.length, Math.round(lanterns)));
  const d = Math.max(0, Math.min(1, depth));
  // la lanterne descend de 0 à 190 unités du dessin ; elle s'arrête plus ou moins bas selon l'avancée de l'année
  const dive = Math.round(40 + 150 * d);
  return (
    <div className="descent" data-stage={st} style={{ ['--dive' as string]: `${dive}px` }}>
      <svg className="descent-art" viewBox="0 0 320 380" preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false">
        <defs>
          <linearGradient id="rk" x1="0" x2="1">
            <stop offset="0" stopColor="#0a0908" />
            <stop offset="0.7" stopColor="#2b251e" />
            <stop offset="1" stopColor="#3a3228" />
          </linearGradient>
          <linearGradient id="rk2" x1="1" x2="0">
            <stop offset="0" stopColor="#0a0908" />
            <stop offset="0.7" stopColor="#272119" />
            <stop offset="1" stopColor="#342d24" />
          </linearGradient>
          <linearGradient id="cone" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#f6dca0" stopOpacity="0.02" />
            <stop offset="0.55" stopColor="#f6dca0" stopOpacity="0.14" />
            <stop offset="1" stopColor="#f6dca0" stopOpacity="0.34" />
          </linearGradient>
          <radialGradient id="pool" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor="#ffe6b0" stopOpacity="0.85" />
            <stop offset="0.55" stopColor="#d9a45a" stopOpacity="0.3" />
            <stop offset="1" stopColor="#d9a45a" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="glow" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor="#ffd98a" stopOpacity="0.9" />
            <stop offset="1" stopColor="#ffd98a" stopOpacity="0" />
          </radialGradient>
        </defs>
        {/* fond : le noir de la grotte */}
        <rect x="-800" width="1920" height="380" fill="#070605" />
        {/* éclairage ciblé : un faisceau qui tombe d'une fissure du plafond sur la créature */}
        <polygon points="132,0 188,0 268,380 52,380" fill="url(#cone)" />
        <ellipse cx="160" cy="352" rx="135" ry="34" fill="url(#pool)" />
        {/* parois (prolongées de chaque côté pour que le décor remplisse les écrans larges) */}
        <rect x="-800" width="800" height="380" fill="#0a0908" />
        <rect x="320" width="800" height="380" fill="#0a0908" />
        <path d="M0 0 H66 Q92 52 70 108 Q48 168 84 226 Q106 290 78 380 H0 Z" fill="url(#rk)" />
        <path d="M320 0 H258 Q232 56 254 112 Q276 172 240 230 Q220 292 246 380 H320 Z" fill="url(#rk2)" />
        {/* stalactites */}
        <g fill="#14110e">
          <polygon points="66,0 80,0 73,46" />
          <polygon points="84,0 98,0 93,28" />
          <polygon points="222,0 238,0 229,52" />
          <polygon points="244,0 256,0 250,30" />
          <polygon points="188,0 198,0 193,24" />
          <polygon points="122,0 130,0 126,20" />
        </g>
        {/* l'encre envahit la grotte à mesure que la créature grandit */}
        <g aria-hidden="true">
          {/* coulures sous les stalactites */}
          {TIPS.slice(0, st).map(([x, y], i) => (
            <g key={`d${i}`} fill="#241a44">
              <path d={`M${x - 3} ${y - 6} Q${x} ${y + 10} ${x + 3} ${y - 6} Z`} />
              <circle className="cave-ink-drop" cx={x} cy={y + 6} r="3" style={{ animationDelay: `${i * 0.9}s` }} />
            </g>
          ))}
          {/* taches sur les parois */}
          {STAINS.slice(0, Math.max(0, st - 1)).map(([x, y, r], i) => (
            <g key={`s${i}`} fill="#1d1538" opacity="0.95">
              <ellipse cx={x} cy={y} rx={r} ry={r * 0.8} />
              <circle cx={x + r * 0.9} cy={y + r * 0.6} r={r * 0.3} />
              <circle cx={x - r * 0.7} cy={y - r * 0.8} r={r * 0.22} />
            </g>
          ))}
          {/* veines violettes qui luisent (Monstre et après) */}
          {st >= 4 && (
            <g className="cave-veins" fill="none" stroke="#a68bff" strokeWidth="2" strokeLinecap="round">
              <path d="M8 120 C30 140 20 170 44 190 C60 204 50 230 70 250" />
              <path d="M312 110 C290 140 300 168 276 186 C262 200 272 232 252 250" />
              {st >= 5 && <path d="M18 300 C40 310 52 330 80 336" />}
              {st >= 5 && <path d="M304 300 C282 312 268 330 240 338" />}
            </g>
          )}
          {/* cascade d'encre (Grand Pâté) */}
          {st >= 6 && <path className="cave-fall" d="M70 108 C66 160 76 220 70 300 L84 300 C90 220 80 160 84 108 Z" fill="#241a44" />}
          {/* lac d'encre au sol : il s'étale à chaque étape */}
          <ellipse cx="160" cy="356" rx={24 + st * 22} ry={6 + st * 2.2} fill="#140f26" opacity={st ? 0.95 : 0.6} />
        </g>
        {/* lanternes allumées par la classe : une par palier de force */}
        <g aria-hidden="true">
          {LANTERNS.map(([x, y], i) => (
            <g key={`l${i}`} className={i < lit ? 'cave-lamp cave-lamp-on' : 'cave-lamp'}>
              {i < lit && <circle cx={x} cy={y} r="22" fill="url(#glow)" />}
              <line x1={x} y1={y - 16} x2={x} y2={y - 8} stroke="#7a6548" strokeWidth="2" />
              <rect x={x - 5} y={y - 8} width="10" height="13" rx="2" fill={i < lit ? '#f2c869' : '#2b251e'} stroke="#3b2d17" strokeWidth="1.5" />
            </g>
          ))}
        </g>
        {/* échelle de corde */}
        <g stroke="#7a6548" strokeWidth="2" fill="none" opacity="0.85">
          <line x1="122" y1="0" x2="122" y2="262" />
          <line x1="140" y1="0" x2="140" y2="262" />
          {Array.from({ length: 15 }, (_, i) => (
            <line key={i} x1="122" y1={10 + i * 17} x2="140" y2={10 + i * 17} strokeWidth="1.6" />
          ))}
        </g>
        {/* la lanterne descend jusqu'à son niveau */}
        <g className="descent-lantern">
          <circle cx="131" cy="0" r="34" fill="url(#glow)" />
          <line x1="131" y1="-9" x2="131" y2="-2" stroke="#7a6548" strokeWidth="2" />
          <rect x="125" y="-2" width="12" height="16" rx="2" fill="#f2c869" stroke="#3b2d17" strokeWidth="1.5" />
          <rect x="123" y="-4" width="16" height="3" fill="#3b2d17" />
          <rect x="123" y="14" width="16" height="3" fill="#3b2d17" />
        </g>
      </svg>
      <span className="descent-drop" />
      <span className="descent-drop descent-drop-2" />
      <span className="descent-drop descent-drop-3" />
      <div className="descent-boss">{children}</div>
    </div>
  );
}
