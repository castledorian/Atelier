import type { CreatureState } from '../game/encre/tracker';
import type { RuleId } from '../game/encre/bestiary';

/**
 * Les créatures de l'Encre, dessinées en SVG simples (aucune image externe). Taches à gros yeux, drôles et jamais
 * effrayantes ; en « version calme », ni visage ni accessoire expressif : seulement la tache et son motif.
 * Le rouge n'est jamais utilisé ici : il est réservé au Correcteur.
 */

const BODY = '#232b45';
const LIGHT = '#faf5e8';
const DROP = 'M48 10 C70 34 84 50 84 62 C84 80 68 90 48 90 C28 90 12 80 12 62 C12 50 26 34 48 10 Z';

function Eyes({ cx, cy, s = 1 }: { cx: number; cy: number; s?: number }) {
  return (
    <g>
      <circle cx={cx - 9 * s} cy={cy} r={6 * s} fill={LIGHT} />
      <circle cx={cx + 9 * s} cy={cy} r={6 * s} fill={LIGHT} />
      <circle cx={cx - 8 * s} cy={cy + 1} r={2.8 * s} fill={BODY} />
      <circle cx={cx + 10 * s} cy={cy + 1} r={2.8 * s} fill={BODY} />
    </g>
  );
}

function Body({ look, children, transform }: { look: CreatureState; children?: React.ReactNode; transform?: string }) {
  if (look === 'crayon') return <path d={DROP} transform={transform} fill="none" stroke="#6a6a6a" strokeWidth="2.5" strokeDasharray="5 4" strokeLinejoin="round" />;
  const op = look === 'silhouette' ? 0.28 : look === 'palie' ? 0.62 : 1;
  return (
    <g transform={transform}>
      <path d={DROP} fill={BODY} opacity={op} />
      {look !== 'silhouette' && children}
    </g>
  );
}

function Mark({ id, calm, look }: { id: RuleId; calm: boolean; look: CreatureState }) {
  const ink = look === 'crayon' ? '#6a6a6a' : LIGHT;
  const face = !calm && look !== 'crayon';
  switch (id) {
    case 'retenue':
      return (
        <g>
          {face && <Eyes cx={48} cy={60} />}
          <path d="M70 16 l8 -6 v26" fill="none" stroke={look === 'crayon' ? '#6a6a6a' : BODY} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M34 74 q14 8 28 0" fill="none" stroke={ink} strokeWidth="3" strokeLinecap="round" />
        </g>
      );
    case 'table-fantome':
      return (
        <g>
          {face && <Eyes cx={48} cy={50} />}
          <path d="M40 66 l16 16 M56 66 l-16 16" stroke={ink} strokeWidth="4" strokeLinecap="round" />
        </g>
      );
    case 'zero-voleur':
      return (
        <g>
          {face && <Eyes cx={46} cy={52} />}
          <ellipse cx="74" cy="72" rx="10" ry="13" fill="none" stroke={look === 'crayon' ? '#6a6a6a' : BODY} strokeWidth="5" />
          <path d="M30 72 q10 8 20 0" fill="none" stroke={ink} strokeWidth="3" strokeLinecap="round" />
        </g>
      );
    case 'doublon':
    case 'jumeaux':
      return null;
    case 'accordeur':
      return (
        <g>
          {face && <Eyes cx={48} cy={60} />}
          <path d="M36 6 v14 q0 8 12 8 q12 0 12 -8 v-14 M48 28 v10" fill="none" stroke={look === 'crayon' ? '#6a6a6a' : BODY} strokeWidth="4" strokeLinecap="round" />
          <path d="M34 76 q14 -8 28 0" fill="none" stroke={ink} strokeWidth="3" strokeLinecap="round" />
        </g>
      );
  }
}

export function CreatureArt({ id, state = 'encree', calm = false, size = 64, label }: { id: RuleId; state?: CreatureState; calm?: boolean; size?: number; label?: string }) {
  if (state === 'inconnue') {
    return (
      <svg width={size} height={size} viewBox="0 0 96 96" role="img" aria-label={label ?? 'Créature pas encore rencontrée'}>
        <path d={DROP} fill="none" stroke="#6a6a6a" strokeWidth="3" strokeDasharray="3 5" strokeLinejoin="round" />
        <text x="48" y="68" textAnchor="middle" fontSize="40" fontWeight="700" fill="#6a6a6a" fontFamily="'Courier Prime', monospace">?</text>
      </svg>
    );
  }
  const twin = id === 'doublon' || id === 'jumeaux';
  const face = !calm && state !== 'crayon' && state !== 'silhouette';
  return (
    <svg width={size} height={size} viewBox="0 0 96 96" role="img" aria-label={label}>
      {twin ? (
        <>
          <Body look={state} transform={id === 'doublon' ? 'translate(2 18) scale(.62)' : 'translate(0 14) scale(.66)'}>
            {face && <Eyes cx={48} cy={60} />}
          </Body>
          <Body look={state} transform={id === 'doublon' ? 'translate(34 18) scale(.62)' : 'translate(34 14) scale(.66)'}>
            {face && <Eyes cx={48} cy={60} />}
          </Body>
        </>
      ) : (
        <Body look={state}>{state === 'silhouette' ? null : <Mark id={id} calm={calm} look={state} />}</Body>
      )}
    </svg>
  );
}
