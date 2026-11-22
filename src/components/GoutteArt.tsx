import { itemById } from '../game/goutte/rules';
import type { Look, Mood } from '../game/goutte/rules';

/**
 * La goutte guerrière de l'élève, dessinée en SVG (léger, net sur tous les écrans).
 * `stage` (0 à 5) : elle grandit et gagne des détails (pieds, bras, sourcils de brave, ceinture, étincelles, halo d'or).
 * Les objets choisis (chapeau, arme, bouclier, accessoire) sont dessinés par-dessus. Décor : le nom est écrit à côté.
 */

const SCALE = [0.62, 0.72, 0.8, 0.88, 0.95, 1];
const BODY = 'M80 22 C96 46 124 72 124 104 C124 130 104 146 80 146 C56 146 36 130 36 104 C36 72 64 46 80 22 Z';

function Hat({ id }: { id: string | null }) {
  switch (id) {
    case 'casquette':
      return (
        <g stroke="#1b1915" strokeWidth="2.5" strokeLinejoin="round">
          <path d="M56 50 C58 28 102 28 104 50 Z" fill="#d9415a" />
          <path d="M100 48 C114 46 124 50 126 54 C116 56 106 54 98 52 Z" fill="#b8334a" />
          <circle cx="80" cy="30" r="3" fill="#1b1915" />
        </g>
      );
    case 'bonnet':
      return (
        <g stroke="#1b1915" strokeWidth="2.5">
          <path d="M56 52 C56 24 104 24 104 52 Z" fill="#4aa3d9" />
          <rect x="52" y="46" width="56" height="10" rx="5" fill="#f3f0e6" />
          <circle cx="80" cy="22" r="7" fill="#f3f0e6" />
        </g>
      );
    case 'casque':
      return (
        <g stroke="#1b1915" strokeWidth="2.5">
          <path d="M52 56 C50 22 110 22 108 56 Z" fill="#a9b3bd" />
          <line x1="80" y1="24" x2="80" y2="56" stroke="#6b757f" strokeWidth="3" />
          <rect x="48" y="52" width="64" height="8" rx="4" fill="#7c8791" />
        </g>
      );
    case 'magicien':
      return (
        <g stroke="#1b1915" strokeWidth="2.5" strokeLinejoin="round">
          <path d="M80 -6 L106 54 L54 54 Z" fill="#5b3ea8" />
          <ellipse cx="80" cy="54" rx="34" ry="7" fill="#4a2f8f" />
          <path d="M76 22 l3 6 6 1 -5 4 1 6 -5 -3 -5 3 1 -6 -5 -4 6 -1 Z" fill="#f2c14e" stroke="none" />
        </g>
      );
    case 'pirate':
      return (
        <g stroke="#1b1915" strokeWidth="2.5" strokeLinejoin="round">
          <path d="M40 54 C52 30 108 30 120 54 C104 48 56 48 40 54 Z" fill="#26221d" />
          <circle cx="80" cy="42" r="6" fill="#f3f0e6" />
          <path d="M76 46 h8" stroke="#26221d" strokeWidth="2" />
        </g>
      );
    case 'couronne':
      return <path d="M56 54 L58 28 L68 42 L80 22 L92 42 L102 28 L104 54 Z" fill="#f2c14e" stroke="#6b4a10" strokeWidth="2.5" strokeLinejoin="round" />;
    case 'heaume':
      return (
        <g stroke="#1b1915" strokeWidth="2.5">
          <path d="M48 76 C44 20 116 20 112 76 Z" fill="#c3ccd4" />
          <rect x="58" y="60" width="44" height="7" rx="3" fill="#1b1915" />
          <path d="M80 18 C90 4 104 8 108 14 C98 14 90 18 84 26" fill="#d9415a" />
        </g>
      );
    default:
      return null;
  }
}

function Weapon({ id }: { id: string | null }) {
  switch (id) {
    case 'plume':
      return (
        <g transform="rotate(22 128 112)">
          <path d="M128 70 C142 84 140 106 128 126 C120 106 118 86 128 70 Z" fill="#f3f0e6" stroke="#1b1915" strokeWidth="2.2" />
          <line x1="128" y1="80" x2="128" y2="134" stroke="#1b1915" strokeWidth="2" />
        </g>
      );
    case 'crayon':
      return (
        <g transform="rotate(18 128 112)">
          <rect x="123" y="58" width="10" height="64" fill="#f2c14e" stroke="#1b1915" strokeWidth="2.2" />
          <path d="M123 58 L128 44 L133 58 Z" fill="#e8c9a0" stroke="#1b1915" strokeWidth="2" />
          <path d="M126.5 48 L128 44 L129.5 48 Z" fill="#1b1915" />
          <rect x="123" y="118" width="10" height="8" fill="#e88aa0" stroke="#1b1915" strokeWidth="2" />
        </g>
      );
    case 'regle':
      return (
        <g transform="rotate(18 128 112)">
          <rect x="122" y="46" width="12" height="80" rx="2" fill="#f7e27a" stroke="#1b1915" strokeWidth="2.2" />
          {Array.from({ length: 7 }, (_, k) => (
            <line key={k} x1="122" y1={54 + k * 10} x2={k % 2 ? 127 : 130} y2={54 + k * 10} stroke="#1b1915" strokeWidth="1.5" />
          ))}
          <rect x="116" y="118" width="24" height="6" rx="3" fill="#7a5a2a" stroke="#1b1915" strokeWidth="2" />
        </g>
      );
    case 'pinceau':
      return (
        <g transform="rotate(18 128 112)">
          <rect x="125" y="62" width="6" height="62" rx="3" fill="#8a5a2b" stroke="#1b1915" strokeWidth="2" />
          <path d="M124 64 C122 50 134 50 132 64 Z" fill="#5b3ea8" stroke="#1b1915" strokeWidth="2" />
          <circle cx="128" cy="44" r="4" fill="#f2c14e" />
          <path d="M128 34 v-6 M120 40 l-4 -4 M136 40 l4 -4" stroke="#f2c14e" strokeWidth="2" strokeLinecap="round" />
        </g>
      );
    case 'stylo':
      return (
        <g transform="rotate(18 128 112)">
          <rect x="123" y="56" width="10" height="66" rx="4" fill="#d4a017" stroke="#1b1915" strokeWidth="2.2" />
          <path d="M123 58 L128 40 L133 58 Z" fill="#f2e3a0" stroke="#1b1915" strokeWidth="2" />
          <line x1="128" y1="44" x2="128" y2="54" stroke="#1b1915" strokeWidth="1.5" />
        </g>
      );
    default:
      return null;
  }
}

function Shield({ id }: { id: string | null }) {
  switch (id) {
    case 'gomme':
      return (
        <g transform="rotate(-10 34 116)">
          <rect x="16" y="96" width="34" height="40" rx="6" fill="#f08aa8" stroke="#1b1915" strokeWidth="2.5" />
          <rect x="16" y="120" width="34" height="16" rx="4" fill="#5aa0d8" stroke="#1b1915" strokeWidth="2.5" />
        </g>
      );
    case 'cahier':
      return (
        <g transform="rotate(-10 34 116)">
          <rect x="14" y="92" width="38" height="48" rx="3" fill="#3d6fb5" stroke="#1b1915" strokeWidth="2.5" />
          <rect x="20" y="102" width="26" height="12" rx="2" fill="#f3f0e6" />
          <line x1="20" y1="92" x2="20" y2="140" stroke="#1b1915" strokeWidth="2" />
        </g>
      );
    case 'etoile':
      return (
        <g>
          <circle cx="32" cy="116" r="22" fill="#2f6fb0" stroke="#1b1915" strokeWidth="2.5" />
          <path d="M32 100 l4.7 9.6 10.6 1.5 -7.7 7.5 1.8 10.5 -9.4 -5 -9.4 5 1.8 -10.5 -7.7 -7.5 10.6 -1.5 Z" fill="#f2c14e" stroke="#1b1915" strokeWidth="1.5" />
        </g>
      );
    case 'dore':
      return (
        <g>
          <path d="M12 96 C24 92 40 92 52 96 C54 120 46 136 32 144 C18 136 10 120 12 96 Z" fill="#e2b334" stroke="#6b4a10" strokeWidth="2.5" />
          <path d="M32 100 V138 M18 112 H46" stroke="#fff3c4" strokeWidth="3" />
        </g>
      );
    default:
      return null;
  }
}

function Behind({ acc }: { acc: string | null }) {
  if (acc === 'cape') return <path d="M50 84 C30 120 30 146 40 156 L120 156 C130 146 130 120 110 84 Z" fill="#b8334a" stroke="#1b1915" strokeWidth="2.5" />;
  if (acc === 'ailes')
    return (
      <g fill="#f3f0e6" stroke="#1b1915" strokeWidth="2.2" strokeLinejoin="round">
        <path d="M46 88 C18 70 4 84 8 98 C16 96 22 100 22 106 C30 102 38 104 42 110 Z" />
        <path d="M114 88 C142 70 156 84 152 98 C144 96 138 100 138 106 C130 102 122 104 118 110 Z" />
      </g>
    );
  return null;
}

function Front({ acc }: { acc: string | null }) {
  if (acc === 'echarpe')
    return (
      <g stroke="#1b1915" strokeWidth="2.2">
        <path d="M44 120 C60 130 100 130 116 120 L118 130 C100 140 60 140 42 130 Z" fill="#d9415a" />
        <path d="M100 130 L106 152 L96 152 L92 134 Z" fill="#b8334a" />
      </g>
    );
  if (acc === 'lunettes')
    return (
      <g fill="none" stroke="#1b1915" strokeWidth="2.6">
        <circle cx="66" cy="98" r="11" />
        <circle cx="94" cy="98" r="11" />
        <path d="M77 97 h6" />
      </g>
    );
  if (acc === 'medaille')
    return (
      <g stroke="#1b1915" strokeWidth="2">
        <path d="M72 118 L80 130 L88 118" fill="#4aa3d9" />
        <circle cx="80" cy="134" r="7" fill="#f2c14e" />
      </g>
    );
  return null;
}

export function GoutteArt({ look, stage, mood = 'happy', size, className }: { look: Look; stage: number; mood?: Mood | 'cheer'; size?: number; className?: string }) {
  const s = Math.max(0, Math.min(SCALE.length - 1, stage));
  const k = SCALE[s];
  const color = itemById(look.color)?.hex ?? '#2f3a8f';
  const asleep = mood === 'sleep';
  const style = size ? { width: size, height: size } : undefined;
  return (
    <svg className={`gt${className ? ` ${className}` : ''}`} data-mood={mood} viewBox="-10 -14 180 180" style={style} aria-hidden="true" focusable="false">
      {/* halo d'or de la Légende */}
      {s >= 5 && <circle className="gt-aura" cx="80" cy="96" r="76" fill="#f2c14e" opacity="0.18" />}
      <ellipse cx="80" cy="152" rx={44 * k} ry="6" fill="#000" opacity="0.18" />
      <g className="gt-bob" style={{ transform: `scale(${k})`, transformOrigin: '80px 150px' }}>
        <Behind acc={look.acc} />
        {/* pieds */}
        {s >= 1 && (
          <g fill={color} stroke="#1b1915" strokeWidth="2.5">
            <ellipse cx="64" cy="146" rx="12" ry="7" />
            <ellipse cx="96" cy="146" rx="12" ry="7" />
          </g>
        )}
        {/* bras */}
        {s >= 2 && (
          <g fill={color} stroke="#1b1915" strokeWidth="2.5">
            <ellipse cx="34" cy="112" rx="9" ry="14" transform="rotate(24 34 112)" />
            <ellipse cx="126" cy="112" rx="9" ry="14" transform="rotate(-24 126 112)" />
          </g>
        )}
        <path d={BODY} fill={color} stroke="#1b1915" strokeWidth="3" />
        <ellipse cx="62" cy="70" rx="9" ry="16" fill="#fff" opacity="0.28" transform="rotate(24 62 70)" />
        {/* ceinture du Chevalier */}
        {s >= 3 && look.acc !== 'echarpe' && (
          <g>
            <rect x="40" y="122" width="80" height="8" rx="3" fill="#5a3a1a" stroke="#1b1915" strokeWidth="2" />
            <rect x="74" y="120" width="12" height="12" rx="2" fill="#f2c14e" stroke="#1b1915" strokeWidth="2" />
          </g>
        )}
        {/* yeux */}
        {asleep ? (
          <g stroke="#1b1915" strokeWidth="3" strokeLinecap="round" fill="none">
            <path d="M58 98 q8 6 16 0" />
            <path d="M86 98 q8 6 16 0" />
          </g>
        ) : (
          <g>
            <ellipse cx="66" cy="96" rx="8" ry="10" fill="#fff" stroke="#1b1915" strokeWidth="2" />
            <ellipse cx="94" cy="96" rx="8" ry="10" fill="#fff" stroke="#1b1915" strokeWidth="2" />
            <circle cx="67" cy="98" r="4.5" fill="#1b1915" />
            <circle cx="95" cy="98" r="4.5" fill="#1b1915" />
            <circle cx="65.5" cy="96" r="1.6" fill="#fff" />
            <circle cx="93.5" cy="96" r="1.6" fill="#fff" />
            {s >= 2 && (
              <g stroke="#1b1915" strokeWidth="3" strokeLinecap="round">
                <path d="M57 83 L73 86" />
                <path d="M103 83 L87 86" />
              </g>
            )}
          </g>
        )}
        {/* joues et bouche */}
        <circle cx="56" cy="112" r="5" fill="#ff8fa8" opacity="0.55" />
        <circle cx="104" cy="112" r="5" fill="#ff8fa8" opacity="0.55" />
        {mood === 'hungry' ? (
          <ellipse cx="80" cy="116" rx="5" ry="6" fill="#1b1915" />
        ) : asleep ? (
          <path d="M75 116 h10" stroke="#1b1915" strokeWidth="3" strokeLinecap="round" />
        ) : (
          <path d={mood === 'cheer' ? 'M68 110 q12 16 24 0 Z' : 'M70 112 q10 10 20 0'} stroke="#1b1915" strokeWidth="3" strokeLinecap="round" fill={mood === 'cheer' ? '#7a2a3a' : 'none'} />
        )}
        <Front acc={look.acc} />
        <Shield id={look.shield} />
        <Weapon id={look.weapon} />
        <Hat id={look.hat} />
      </g>
      {/* étincelles du Héros */}
      {s >= 4 && (
        <g className="gt-spark" fill="#f2c14e">
          <path d="M18 40 l3 7 7 3 -7 3 -3 7 -3 -7 -7 -3 7 -3 Z" />
          <path d="M146 58 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2 Z" />
        </g>
      )}
      {asleep && (
        <g fill="#5b5f8a" fontWeight="700" fontFamily="var(--font-display), sans-serif">
          <text x="118" y="40" fontSize="14">
            z
          </text>
          <text x="130" y="24" fontSize="18">
            Z
          </text>
        </g>
      )}
    </svg>
  );
}
