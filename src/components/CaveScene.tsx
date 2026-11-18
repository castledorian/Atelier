import type { ReactNode } from 'react';

/**
 * Le décor de la grotte : on descend le long d'une échelle de corde, une lanterne à la main, jusqu'à la salle où
 * dort la créature d'encre. La salle est sombre, mais un éclairage ciblé tombe sur la créature : elle se détache toujours bien.
 *
 * `depth` (0 à 1) : jusqu'où la lanterne est descendue (elle s'enfonce un peu plus à chaque saison de l'année).
 * `children` : la créature.
 */
export default function CaveScene({ depth, children }: { depth: number; children: ReactNode }) {
  const d = Math.max(0, Math.min(1, depth));
  // la lanterne descend de 0 à 190 unités du dessin ; elle s'arrête plus ou moins bas selon l'avancée de l'année
  const dive = Math.round(40 + 150 * d);
  return (
    <div className="descent" style={{ ['--dive' as string]: `${dive}px` }}>
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
