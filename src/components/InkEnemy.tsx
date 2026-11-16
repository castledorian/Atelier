/**
 * Les ennemis d'encre de « Chasse aux fautes » : sept dessins différents (le dernier est le « boss »).
 * Décor seulement (aria-hidden) : l'information importante est toujours écrite à côté.
 */

export const ENEMY_KINDS = 6;
export const BOSS_KIND = 6;

/** Noms des ennemis, par rôle (le nom ne doit jamais contredire le dessin). */
export const ENEMY_NAMES = ['Bavure', 'Gribouille', 'Barbouille', 'Taupinette', 'Moutardin', 'Sépia'];
export const SPLASH_NAMES = ['Goutte', 'Giclée', 'Éclat', 'Perle', 'Postillon', 'Mouchette'];
export const PATE_NAMES = ['Gros Pâté', 'Grosse Flaque', 'Maxi Bavure'];
export const BOSS_NAME = 'Le Grand Pâté';

export type EnemyMood = 'idle' | 'angry' | 'attack' | 'dead';

export type Role = 'splash' | 'tache' | 'pate' | 'boss';
export const ROLE_LABEL: Record<Role, string> = { splash: 'Éclaboussure', tache: 'Tache', pate: 'Pâté costaud', boss: 'Boss' };
const TACHE_KINDS = [0, 4, 5, 3, 1];
/** Le dessin d'un ennemi selon son rôle : une silhouette par rôle, et plusieurs pour les taches. */
export function kindFor(role: Role, n: number): number {
  if (role === 'splash') return 2;
  if (role === 'pate') return 7;
  if (role === 'boss') return BOSS_KIND;
  return TACHE_KINDS[n % TACHE_KINDS.length];
}

/** Les gouttes qui giclent quand l'ennemi est vaincu (départ en x, y et durée : fixes, pour rester léger). */
const DROPS: Array<[number, number, number]> = [
  [-70, -50, 0.6],
  [-40, -80, 0.7],
  [0, -95, 0.65],
  [45, -78, 0.7],
  [72, -46, 0.6],
  [-85, -10, 0.55],
  [86, -12, 0.55],
  [-20, -60, 0.5],
  [30, -64, 0.5],
];

const INK = 'var(--color-ink)';
const PAPER = 'var(--color-paper-hi)';

interface EyeSpec {
  x: number;
  y: number;
  r: number;
}

const BODY: Record<number, string> = {
  0: 'M30 170 C20 110 50 50 100 48 C150 50 182 110 170 170 C160 182 140 172 130 182 C118 172 108 184 98 174 C88 184 70 172 60 182 C48 174 36 182 30 170 Z',
  2: 'M100 20 C130 70 160 100 160 135 C160 168 134 182 100 182 C66 182 40 168 40 135 C40 100 70 70 100 20 Z',
  3: 'M14 165 C10 110 50 70 100 70 C150 70 192 110 186 165 C176 182 150 170 140 182 C126 172 112 184 100 176 C88 184 74 172 60 182 C48 170 24 182 14 165 Z',
  4: 'M30 172 C22 118 50 66 100 64 C150 66 178 118 170 172 C150 184 50 184 30 172 Z',
  7: 'M8 162 C6 112 50 80 100 80 C150 80 194 112 192 162 C190 184 150 178 100 185 C50 178 10 184 8 162 Z',
  5: 'M40 120 C40 60 70 40 100 40 C130 40 160 60 160 120 C160 140 150 150 150 175 C146 190 134 180 130 165 C126 185 112 188 108 165 C104 188 92 188 90 165 C86 185 72 190 70 165 C66 180 54 190 50 175 C50 150 40 140 40 120 Z',
};

/** Étoile à pointes : l'ennemi « hérissé » et le boss. */
function spiky(spikes: number, outer: number, inner: number): string {
  const pts: string[] = [];
  for (let i = 0; i < spikes * 2; i++) {
    const a = (Math.PI * i) / spikes - Math.PI / 2;
    const r = i % 2 === 0 ? outer : inner;
    pts.push(`${(100 + r * Math.cos(a)).toFixed(1)},${(112 + r * Math.sin(a)).toFixed(1)}`);
  }
  return pts.join(' ');
}
const SPIKY_POINTS = spiky(9, 80, 56);
const BOSS_POINTS = spiky(12, 86, 62);

const EYES: Record<number, EyeSpec[]> = {
  0: [
    { x: 78, y: 100, r: 17 },
    { x: 122, y: 100, r: 17 },
  ],
  1: [
    { x: 80, y: 108, r: 13 },
    { x: 120, y: 108, r: 13 },
  ],
  2: [{ x: 100, y: 122, r: 25 }],
  3: [
    { x: 60, y: 128, r: 14 },
    { x: 100, y: 116, r: 17 },
    { x: 140, y: 128, r: 14 },
  ],
  4: [
    { x: 78, y: 112, r: 15 },
    { x: 122, y: 112, r: 15 },
  ],
  5: [
    { x: 80, y: 96, r: 15 },
    { x: 120, y: 96, r: 15 },
  ],
  7: [
    { x: 66, y: 126, r: 12 },
    { x: 134, y: 126, r: 12 },
  ],
  6: [
    { x: 74, y: 104, r: 15 },
    { x: 100, y: 120, r: 12 },
    { x: 126, y: 104, r: 15 },
  ],
};

function Brow({ x, y, r, side }: EyeSpec & { side: number }) {
  return <line x1={x - side * r * 1.2} y1={y - r * 1.7} x2={x + side * r * 1.1} y2={y - r * 0.95} stroke={PAPER} strokeWidth="5" strokeLinecap="round" />;
}

function Eye({ x, y, r, dead }: EyeSpec & { dead: boolean }) {
  if (dead) {
    const d = r * 0.6;
    return (
      <g stroke={PAPER} strokeWidth="5" strokeLinecap="round">
        <line x1={x - d} y1={y - d} x2={x + d} y2={y + d} />
        <line x1={x + d} y1={y - d} x2={x - d} y2={y + d} />
      </g>
    );
  }
  return (
    <g className="en-eye">
      <circle cx={x} cy={y} r={r} fill={PAPER} />
      <g className="en-look">
        <circle cx={x - r * 0.28} cy={y + r * 0.18} r={r * 0.5} fill={INK} />
        <circle cx={x - r * 0.4} cy={y + r * 0.02} r={r * 0.14} fill={PAPER} />
      </g>
    </g>
  );
}

export function InkEnemy({ kind, mood, name }: { kind: number; mood: EnemyMood; name: string }) {
  const dead = mood === 'dead';
  const angry = mood === 'angry' || mood === 'attack';
  const boss = kind === BOSS_KIND;
  const k = Math.max(0, Math.min(7, kind));
  return (
    <svg className={`en en-${mood}${boss ? ' en-boss' : ''} en-r-${k === 2 ? 'splash' : k === 7 ? 'pate' : boss ? 'boss' : 'tache'}`} viewBox="0 0 200 200" aria-hidden="true" focusable="false" data-name={name} style={{ ['--d' as string]: `${-((kind * 0.83) % 3).toFixed(2)}s` }}>
      {/* la flaque, qui reste quand l'ennemi est vaincu */}
      <ellipse className="en-puddle" cx="100" cy="186" rx={dead ? 78 : 60} ry={dead ? 9 : 6} fill={INK} />
      {!dead && k !== 2 && (
        <circle className="en-drip" cx={k === 7 ? 60 : 78} cy={k === 7 ? 178 : 172} r="4.5" fill={INK} />
      )}
      <g className="en-body">
        {k === 1 && <polygon points={SPIKY_POINTS} fill={INK} />}
        {k === BOSS_KIND && <polygon points={BOSS_POINTS} fill={INK} />}
        {k !== 1 && k !== BOSS_KIND && <path d={BODY[k]} fill={INK} />}
        {k === 7 && !dead && (
          <g fill="none" stroke={PAPER} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" opacity="0.75">
            <path d="M20 152 L32 140 L26 128" />
            <path d="M180 150 L168 138 L176 126" />
            <path d="M98 88 L106 100 L99 110" />
          </g>
        )}
        {k === 4 && (
          <>
            <path d="M52 78 L38 28 L86 62 Z" fill={INK} />
            <path d="M148 78 L162 28 L114 62 Z" fill={INK} />
          </>
        )}
        {boss && <path d="M62 44 L72 18 L86 38 L100 12 L114 38 L128 18 L138 44 Z" fill={INK} stroke={PAPER} strokeWidth="3" strokeLinejoin="round" />}
        {EYES[k].map((e, i) => (
          <Eye key={i} {...e} dead={dead} />
        ))}
        {angry && !dead && k !== 2 && EYES[k].filter((_, i) => i !== 1 || EYES[k].length < 3).map((e, i) => <Brow key={i} {...e} side={e.x < 100 ? 1 : -1} />)}
        {/* bouche */}
        {!dead && (k === 4 || k === BOSS_KIND) && (
          <path d={k === 4 ? 'M72 150 Q100 172 128 150' : 'M70 150 Q100 176 130 150'} fill="none" stroke={PAPER} strokeWidth="5" strokeLinecap="round" />
        )}
        {!dead && k === 7 && <path d="M62 160 L76 150 L90 160 L104 150 L118 160 L132 150 L140 158" fill="none" stroke={PAPER} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />}
        {!dead && k === 2 && <ellipse cx="100" cy="156" rx="8" ry="10" fill={PAPER} />}
        {!dead && k === 0 && <path d="M88 136 Q100 128 112 136" fill="none" stroke={PAPER} strokeWidth="4" strokeLinecap="round" />}
        {dead && <path d="M84 150 Q100 140 116 150" fill="none" stroke={PAPER} strokeWidth="4" strokeLinecap="round" />}
      </g>
      {dead && (
        <g className="en-drops">
          {DROPS.map(([dx, dy, d], i) => (
            <circle key={i} cx="100" cy="130" r={i % 3 === 0 ? 9 : 6} fill={INK} style={{ ['--dx' as string]: `${dx}px`, ['--dy' as string]: `${dy}px`, animationDuration: `${d}s` }} />
          ))}
        </g>
      )}
    </svg>
  );
}

/**
 * Petit canon à encre : « toi ». Il regarde vers la droite (vers l'ennemi) ; le tube (`cn-barrel`) recule quand il tire.
 * Affiché à l'échelle 1,2 : la bouche du canon est à environ 97 % de la largeur et 33 % de la hauteur (le boulet part de là).
 */
export function CannonIcon() {
  return (
    <svg className="pen-icon cannon-icon" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <path d="M6 33 L30 33 L32 38 L8 38 Z" fill={INK} />
      <g className="cn-barrel">
        <g transform="rotate(-20 18 30)">
          <rect x="12" y="24" width="28" height="12" rx="4" fill={INK} />
          <rect x="37" y="22" width="7" height="16" rx="2.5" fill={INK} stroke="#c8932b" strokeWidth="1.6" />
          <path d="M16 27.5 L34 27.5" stroke={PAPER} strokeWidth="1.8" strokeLinecap="round" opacity="0.55" />
        </g>
      </g>
      <circle cx="18" cy="38" r="8" fill="#c8932b" stroke={INK} strokeWidth="3" />
      <circle cx="18" cy="38" r="2.6" fill={PAPER} />
      <path d="M18 31 V45 M11 38 H25" stroke={INK} strokeWidth="1.6" />
    </svg>
  );
}

/** Petit stylo-plume (ancien « toi »). */
export function PenIcon() {
  return (
    <svg className="pen-icon" viewBox="0 0 40 40" aria-hidden="true" focusable="false">
      <path d="M8 32 L12 20 L28 4 L36 12 L20 28 Z" fill={INK} />
      <path d="M8 32 L12 20 L20 28 Z" fill="#c8932b" />
      <circle cx="21" cy="15" r="2.2" fill={PAPER} />
      <path d="M6 36 L14 34" stroke={INK} strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
