import type { EnemyMood } from './InkEnemy';

/**
 * Le visage du monstre, dessiné en code : les yeux, les sourcils et la bouche.
 * Il sert aux deux versions du monstre : le dessin vectoriel de secours (InkBoss) et les illustrations
 * (Monster), dont le corps est sans visage justement pour que le visage puisse bouger, cligner et s'adapter à l'humeur.
 * Jamais effrayant : de grands yeux ronds, des sourcils froncés plutôt que des crocs pointus.
 */

export type BossMood = EnemyMood | 'sleep';

/** Où et à quelle taille dessiner le visage (repère de 240 × 240, comme les deux dessins). */
export interface FaceGeom {
  /** milieu des deux yeux (120 = au centre) */
  cx?: number;
  /** hauteur des yeux */
  eyeY: number;
  /** demi-écart entre les deux yeux */
  gap: number;
  /** rayon d'un œil */
  r: number;
  /** hauteur de la bouche */
  mouthY: number;
  /** demi-largeur de la bouche */
  w: number;
  /** yeux lumineux (grandes formes) */
  glow?: boolean;
  /** sourcils toujours froncés */
  angry?: boolean;
  /** deux petites dents arrondies */
  teeth?: boolean;
  /** épaisseur du trait de la bouche et des paupières */
  line?: number;
}

const INK = '#0b0816';
const LID = '#e9e2f7';

function Eyes({ g, mood }: { g: FaceGeom; mood: BossMood }) {
  const { cx = 120, eyeY: cy, gap, r } = g;
  if (mood === 'sleep') {
    return (
      <g stroke={LID} strokeWidth={(g.line ?? 3) + 0.5} strokeLinecap="round" fill="none">
        {[-1, 1].map((side) => (
          <path key={side} d={`M${cx + side * gap - r} ${cy} q${r} ${r * 0.7} ${2 * r} 0`} />
        ))}
      </g>
    );
  }
  if (mood === 'dead') {
    return (
      <g stroke={LID} strokeWidth="4" strokeLinecap="round">
        {[-1, 1].map((side) => (
          <g key={side}>
            <line x1={cx + side * gap - r * 0.7} y1={cy - r * 0.7} x2={cx + side * gap + r * 0.7} y2={cy + r * 0.7} />
            <line x1={cx + side * gap + r * 0.7} y1={cy - r * 0.7} x2={cx + side * gap - r * 0.7} y2={cy + r * 0.7} />
          </g>
        ))}
      </g>
    );
  }
  const angry = g.angry === true || mood === 'angry' || mood === 'attack';
  return (
    <g className="mf-eyes">
      {[-1, 1].map((side) => {
        const x = cx + side * gap;
        return (
          <g key={side}>
            <g className="mf-eye">
              <circle cx={x} cy={cy} r={r} fill={g.glow ? '#ffe9a8' : '#fbf8ff'} />
              {g.glow && <circle cx={x} cy={cy} r={r + 5} fill="#ffd34d" opacity="0.18" />}
              <g className="mf-pupil">
                <circle cx={x - side * 1.5} cy={cy + 1.5} r={r * 0.5} fill="#151021" />
                <circle cx={x - side * 1.5 - r * 0.18} cy={cy + 1.5 - r * 0.2} r={r * 0.16} fill="#fff" />
              </g>
            </g>
            {angry && <path d={`M${x - side * (r + 3)} ${cy - r - 6} L${x + side * (r + 2)} ${cy - r + 1}`} stroke={INK} strokeWidth={r >= 14 ? 6 : 4.5} strokeLinecap="round" />}
          </g>
        );
      })}
    </g>
  );
}

function Mouth({ g, mood }: { g: FaceGeom; mood: BossMood }) {
  const { cx = 120, mouthY: cy, w } = g;
  if (mood === 'sleep') return <ellipse cx={cx} cy={cy} rx={w * 0.35} ry={w * 0.25} fill={INK} />;
  if (mood === 'attack') return <ellipse cx={cx} cy={cy + 2} rx={w} ry={w * 0.65} fill={INK} stroke="#7a2a3a" strokeWidth="3" />;
  if (mood === 'dead') return <path d={`M${cx - w} ${cy + 4} q${w} -8 ${2 * w} 0`} stroke={INK} strokeWidth="4" fill="none" strokeLinecap="round" />;
  return (
    <g>
      <path d={`M${cx - w} ${cy} q${w} ${w * 0.55} ${2 * w} -3`} stroke={INK} strokeWidth={g.line ?? 4.5} fill="none" strokeLinecap="round" />
      {g.teeth && (
        <g fill="#fbf8ff">
          <rect x={cx - w * 0.55} y={cy + 1} width="7" height="8" rx="3" />
          <rect x={cx + w * 0.3} y={cy} width="7" height="8" rx="3" />
        </g>
      )}
    </g>
  );
}

export function MonsterFace({ g, mood }: { g: FaceGeom; mood: BossMood }) {
  return (
    <g className="mf" data-mood={mood}>
      <Eyes g={g} mood={mood} />
      <Mouth g={g} mood={mood} />
    </g>
  );
}
