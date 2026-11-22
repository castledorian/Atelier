import type { EnemyMood } from './InkEnemy';

/**
 * La créature de la grotte, dessinée pour grandir : 7 étapes (de la petite goutte au Grand Pâté), et chacune ajoute
 * des traits bien visibles (bras, cornes, piquants, armure de pages, couronne, cape, halo). Entre deux étapes, elle
 * enfle doucement (`grow`, de 0 à 1) : on la voit changer d'une semaine à l'autre.
 * Jamais effrayante : de grands yeux ronds, des sourcils froncés plutôt que des crocs pointus.
 * Décor seulement (aria-hidden) : le nom et les points de vie sont écrits à côté.
 */

export type BossMood = EnemyMood | 'sleep';

/** Corps de chaque étape (vue de face, posé sur le sol à y = 214). */
const BODY = [
  'M120 128 C132 146 146 162 146 182 C146 202 134 214 120 214 C106 214 94 202 94 182 C94 162 108 146 120 128 Z',
  'M68 214 C58 196 72 170 96 166 C104 148 136 146 146 164 C170 164 186 190 174 214 C162 206 152 218 140 210 C128 220 112 218 100 210 C88 218 78 214 68 214 Z',
  'M58 214 C44 170 66 116 120 112 C174 116 196 170 182 214 C168 204 156 220 142 208 C130 222 110 222 98 208 C84 220 70 206 58 214 Z',
  'M44 214 C30 160 58 94 120 90 C182 94 210 160 196 214 C186 204 180 228 168 214 C158 230 146 212 134 224 C122 210 110 230 100 214 C88 228 78 208 66 224 C58 210 50 224 44 214 Z',
  'M38 214 C22 150 52 74 120 70 C188 74 218 150 202 214 C190 204 182 230 168 214 C156 232 142 212 128 226 C116 210 102 232 92 214 C80 230 66 206 54 224 C48 210 42 224 38 214 Z',
  'M28 216 C10 140 46 58 120 54 C194 58 230 140 212 216 C198 204 190 232 174 214 C160 234 144 212 128 228 C114 210 98 234 86 214 C72 232 56 206 42 226 C36 212 32 226 28 216 Z',
  'M22 216 C2 134 40 48 120 44 C200 48 238 134 218 216 C204 202 194 234 176 214 C162 236 144 212 128 230 C112 210 96 236 82 214 C66 234 50 206 36 228 C30 212 26 228 22 216 Z',
];
/** Haut du corps de chaque étape (pour placer les yeux, les cornes, la couronne). */
const TOP = [128, 148, 112, 90, 70, 54, 44];

export const BOSS_STAGES = BODY.length;

/** Cadrage de chaque étape : serré pour les petites (on les voit bien), large pour les grandes (cornes et couronne comprises). */
const VIEW = ['60 96 120 130', '40 110 160 120', '20 80 200 150', '6 52 228 186', '-4 14 248 220', '-12 -12 264 256', '-14 -18 268 262'];

function Eyes({ stage, mood, cy }: { stage: number; mood: BossMood; cy: number }) {
  const gap = [11, 16, 20, 24, 27, 31, 34][stage];
  const r = [6, 8, 11, 13, 14, 16, 17][stage];
  const glow = stage >= 4;
  if (mood === 'sleep') {
    return (
      <g stroke="#e9e2f7" strokeWidth={stage < 2 ? 2.5 : 3.5} strokeLinecap="round" fill="none">
        <path d={`M${120 - gap - r} ${cy} q${r} ${r * 0.7} ${2 * r} 0`} />
        <path d={`M${120 + gap - r} ${cy} q${r} ${r * 0.7} ${2 * r} 0`} />
      </g>
    );
  }
  if (mood === 'dead') {
    return (
      <g stroke="#e9e2f7" strokeWidth="4" strokeLinecap="round">
        {[-1, 1].map((side) => (
          <g key={side}>
            <line x1={120 + side * gap - r * 0.7} y1={cy - r * 0.7} x2={120 + side * gap + r * 0.7} y2={cy + r * 0.7} />
            <line x1={120 + side * gap + r * 0.7} y1={cy - r * 0.7} x2={120 + side * gap - r * 0.7} y2={cy + r * 0.7} />
          </g>
        ))}
      </g>
    );
  }
  const angry = mood === 'angry' || mood === 'attack' || stage >= 3;
  return (
    <g>
      {[-1, 1].map((side) => {
        const x = 120 + side * gap;
        return (
          <g key={side}>
            <circle cx={x} cy={cy} r={r} fill={glow ? '#ffe9a8' : '#fbf8ff'} />
            {glow && <circle cx={x} cy={cy} r={r + 5} fill="#ffd34d" opacity="0.18" />}
            <circle cx={x + side * -1.5} cy={cy + 1.5} r={r * 0.5} fill="#151021" />
            <circle cx={x + side * -1.5 - r * 0.18} cy={cy + 1.5 - r * 0.2} r={r * 0.16} fill="#fff" />
            {angry && (
              <path
                d={`M${x - side * (r + 3)} ${cy - r - 6} L${x + side * (r + 2)} ${cy - r + 1}`}
                stroke="#0b0816"
                strokeWidth={stage >= 4 ? 6 : 4.5}
                strokeLinecap="round"
              />
            )}
          </g>
        );
      })}
    </g>
  );
}

function Mouth({ stage, mood, cy }: { stage: number; mood: BossMood; cy: number }) {
  const w = [6, 9, 14, 18, 22, 26, 28][stage];
  if (mood === 'sleep') return <ellipse cx="120" cy={cy} rx={w * 0.35} ry={w * 0.25} fill="#0b0816" />;
  if (mood === 'attack') return <ellipse cx="120" cy={cy + 2} rx={w} ry={w * 0.65} fill="#0b0816" stroke="#7a2a3a" strokeWidth="3" />;
  if (mood === 'dead') return <path d={`M${120 - w} ${cy + 4} q${w} -8 ${2 * w} 0`} stroke="#0b0816" strokeWidth="4" fill="none" strokeLinecap="round" />;
  // un sourire en coin, avec deux petites dents arrondies à partir du Monstre
  return (
    <g>
      <path d={`M${120 - w} ${cy} q${w} ${w * 0.55} ${2 * w} -3`} stroke="#0b0816" strokeWidth={stage < 2 ? 3 : 4.5} fill="none" strokeLinecap="round" />
      {stage >= 4 && (
        <g fill="#fbf8ff">
          <rect x={120 - w * 0.55} y={cy + 1} width="7" height="8" rx="3" />
          <rect x={120 + w * 0.3} y={cy} width="7" height="8" rx="3" />
        </g>
      )}
    </g>
  );
}

export function InkBoss({ stage, grow = 0, mood = 'idle', title }: { stage: number; grow?: number; mood?: BossMood; title?: string }) {
  const s = Math.max(0, Math.min(BODY.length - 1, Math.round(stage)));
  const g = Math.max(0, Math.min(1, grow));
  const top = TOP[s];
  const eyeY = top + (214 - top) * (s <= 1 ? 0.5 : 0.38);
  const mouthY = eyeY + [12, 16, 24, 30, 34, 38, 40][s];
  // elle enfle doucement entre deux étapes (au plus 8 %)
  const scale = 1 + 0.08 * g;
  return (
    <svg className="ib" data-stage={s} data-mood={mood} viewBox={VIEW[s]} aria-hidden="true" focusable="false">
      {title && <title>{title}</title>}
      <defs>
        <radialGradient id={`ib-body-${s}`} cx="0.38" cy="0.3" r="0.85">
          <stop offset="0" stopColor={s >= 6 ? '#3d2f6e' : '#2f2752'} />
          <stop offset="0.6" stopColor="#17122b" />
          <stop offset="1" stopColor="#0a0714" />
        </radialGradient>
        <radialGradient id="ib-aura" cx="0.5" cy="0.55" r="0.5">
          <stop offset="0" stopColor="#a68bff" stopOpacity="0.55" />
          <stop offset="1" stopColor="#a68bff" stopOpacity="0" />
        </radialGradient>
      </defs>

      <g className="ib-all" style={{ transform: `scale(${scale})`, transformOrigin: '120px 214px' }}>
        {/* halo du Colosse et du Grand Pâté */}
        {s >= 5 && <ellipse className="ib-aura" cx="120" cy="140" rx="118" ry="104" fill="url(#ib-aura)" />}
        {/* cape du Grand Pâté, derrière le corps */}
        {s >= 6 && <path d="M44 80 C6 150 0 200 6 228 L234 228 C240 200 234 150 196 80 Z" fill="#7a1f3e" stroke="#c45a7a" strokeWidth="3" />}

        {/* flaque au sol : elle s'étale à chaque étape */}
        <ellipse cx="120" cy="218" rx={40 + s * 16 + g * 10} ry={6 + s * 1.5} fill="#0c0918" opacity="0.85" />

        <g className="ib-breathe">
          {/* bras (à partir du Gros Pâté), avec griffes rondes au Colosse */}
          {s >= 2 && (
            <g fill={`url(#ib-body-${s})`} stroke="#9d8be0" strokeOpacity="0.9" strokeWidth="2.5">
              <path d={`M${s >= 5 ? 34 : 60} ${eyeY + 20} C${s >= 5 ? 6 : 34} ${eyeY + 30} ${s >= 5 ? 4 : 30} ${eyeY + 58} ${s >= 5 ? 18 : 40} ${eyeY + 66} C${s >= 5 ? 30 : 50} ${eyeY + 60} ${s >= 5 ? 36 : 56} ${eyeY + 46} ${s >= 5 ? 44 : 64} ${eyeY + 40} Z`} />
              <path d={`M${s >= 5 ? 206 : 180} ${eyeY + 20} C${s >= 5 ? 234 : 206} ${eyeY + 30} ${s >= 5 ? 236 : 210} ${eyeY + 58} ${s >= 5 ? 222 : 200} ${eyeY + 66} C${s >= 5 ? 210 : 190} ${eyeY + 60} ${s >= 5 ? 204 : 184} ${eyeY + 46} ${s >= 5 ? 196 : 176} ${eyeY + 40} Z`} />
              {s >= 5 && (
                <g fill="#fbf8ff" stroke="none">
                  <circle cx="14" cy={eyeY + 66} r="4" />
                  <circle cx="22" cy={eyeY + 70} r="4" />
                  <circle cx="226" cy={eyeY + 66} r="4" />
                  <circle cx="218" cy={eyeY + 70} r="4" />
                </g>
              )}
            </g>
          )}

          {/* cornes (Monstre et après) */}
          {s >= 4 && (
            <g fill="#e6dcc4" stroke="#3a2f1d" strokeWidth="3" strokeLinejoin="round">
              <path d={`M${120 - 46 - s * 2} ${top + 26} C${120 - 70 - s * 3} ${top - 2} ${120 - 66 - s * 3} ${top - 26 - s * 2} ${120 - 52 - s * 2} ${top - 34 - s * 2} C${120 - 54} ${top - 14} ${120 - 40} ${top + 4} ${120 - 28} ${top + 14} Z`} />
              <path d={`M${120 + 46 + s * 2} ${top + 26} C${120 + 70 + s * 3} ${top - 2} ${120 + 66 + s * 3} ${top - 26 - s * 2} ${120 + 52 + s * 2} ${top - 34 - s * 2} C${120 + 54} ${top - 14} ${120 + 40} ${top + 4} ${120 + 28} ${top + 14} Z`} />
            </g>
          )}

          {/* piquants arrondis sur le dos (Mare d'encre et après) */}
          {s >= 3 && (
            <g fill="#17122b" stroke="#9d8be0" strokeOpacity="0.85" strokeWidth="2.5" strokeLinejoin="round">
              {[-1, 1].flatMap((side) =>
                Array.from({ length: s >= 5 ? 3 : 2 }, (_, k) => {
                  const x = 120 + side * (34 + k * 22 + s * 2);
                  const y = top + 14 + k * 16;
                  return <path key={`${side}-${k}`} d={`M${x - 10} ${y + 10} Q${x + side * 4} ${y - 18 - s} ${x + 10} ${y + 12} Z`} />;
                }),
              )}
            </g>
          )}

          {/* corps */}
          <path d={BODY[s]} fill={`url(#ib-body-${s})`} stroke="#8f7ad8" strokeOpacity="0.6" strokeWidth="2.5" />
          {/* reflet brillant de l'encre */}
          <ellipse cx={120 - (214 - top) * 0.22} cy={top + (214 - top) * 0.22} rx={(214 - top) * 0.13} ry={(214 - top) * 0.07} fill="#ffffff" opacity="0.22" transform={`rotate(-28 ${120 - (214 - top) * 0.22} ${top + (214 - top) * 0.22})`} />

          {/* armure de pages de cahier (Colosse et Grand Pâté) */}
          {s >= 5 && (
            <g>
              <rect x="92" y={mouthY + 22} width="56" height="40" rx="6" fill="#efe6d2" stroke="#3a2f1d" strokeWidth="3" transform={`rotate(-4 120 ${mouthY + 42})`} />
              <g stroke="#7aa0c8" strokeWidth="2" transform={`rotate(-4 120 ${mouthY + 42})`}>
                <line x1="98" y1={mouthY + 34} x2="142" y2={mouthY + 34} />
                <line x1="98" y1={mouthY + 44} x2="142" y2={mouthY + 44} />
                <line x1="98" y1={mouthY + 54} x2="134" y2={mouthY + 54} />
              </g>
              <line x1="106" y1={mouthY + 24} x2="104" y2={mouthY + 62} stroke="#d06a6a" strokeWidth="2" transform={`rotate(-4 120 ${mouthY + 42})`} />
            </g>
          )}

          <Eyes stage={s} mood={mood} cy={eyeY} />
          <Mouth stage={s} mood={mood} cy={mouthY} />

          {/* couronne du Grand Pâté */}
          {s >= 6 && (
            <g transform={`translate(0 ${top - 30})`}>
              <path d="M88 34 L92 4 L106 22 L120 0 L134 22 L148 4 L152 34 Z" fill="#f2c14e" stroke="#6b4a10" strokeWidth="3" strokeLinejoin="round" />
              <circle cx="120" cy="22" r="5" fill="#d9415a" />
              <circle cx="100" cy="26" r="3.5" fill="#4aa3d9" />
              <circle cx="140" cy="26" r="3.5" fill="#4aa3d9" />
            </g>
          )}
        </g>

        {/* gouttes qui tombent de la créature : une de plus à chaque étape */}
        {Array.from({ length: s + 1 }, (_, k) => {
          const x = 120 + (k % 2 ? 1 : -1) * (20 + k * 12 + s * 4);
          return <circle key={k} className="ib-drip" cx={x} cy={196} r={3 + (k % 3)} fill="#1d1738" style={{ animationDelay: `${(k * 0.7) % 3}s` }} />;
        })}

        {/* il dort : des « z » qui montent */}
        {mood === 'sleep' && (
          <g className="ib-zzz" fill="#e9e2f7" fontFamily="var(--font-display), sans-serif" fontWeight="700">
            <text x={150 + s * 6} y={top - 4} fontSize={12 + s * 2}>
              z
            </text>
            <text x={162 + s * 7} y={top - 20 - s * 2} fontSize={16 + s * 2}>
              Z
            </text>
          </g>
        )}
      </g>
    </svg>
  );
}
