/**
 * Les friandises de la goutte, dessinées en SVG (pas d'émoji : même rendu sur tous les ordinateurs de l'école).
 * Trait d'encre épais comme la goutte ; quelques couleurs franches, petites surfaces.
 * `hidden` : silhouette d'une saveur pas encore goûtée (pour la collection).
 */

const K = '#1b1915';

function Shape({ id }: { id: string }) {
  switch (id) {
    case 'pain':
      return (
        <g stroke={K} strokeWidth="2.2" strokeLinejoin="round">
          <path d="M8 18 C8 9 32 9 32 18 C32 21 30 22 30 24 V32 H10 V24 C10 22 8 21 8 18 Z" fill="#d9a35a" />
          <path d="M13 20 V29 H27 V20" fill="#f3e2b8" stroke="none" />
        </g>
      );
    case 'pomme':
      return (
        <g stroke={K} strokeWidth="2.2" strokeLinejoin="round">
          <path d="M20 13 C14 8 6 12 7 21 C8 30 14 34 20 32 C26 34 32 30 33 21 C34 12 26 8 20 13 Z" fill="#d9415a" />
          <path d="M20 13 C20 9 21 6 23 4" fill="none" />
          <path d="M22 9 C25 5 30 6 31 8 C28 10 25 10 22 9 Z" fill="#3f8f4a" />
          <ellipse cx="13" cy="19" rx="2" ry="3.5" fill="#fff" opacity="0.5" stroke="none" />
        </g>
      );
    case 'carotte':
      return (
        <g stroke={K} strokeWidth="2.2" strokeLinejoin="round">
          <path d="M26 12 L8 33 C6 35 4 33 6 31 L23 9 Z" fill="#ee8a2e" />
          <path d="M24 10 C24 4 28 3 29 5 M25 11 C30 8 35 9 34 11 M26 12 C31 14 32 18 30 18" fill="none" stroke="#3f8f4a" strokeWidth="2.6" strokeLinecap="round" />
        </g>
      );
    case 'biscuit':
      return (
        <g stroke={K} strokeWidth="2.2">
          <circle cx="20" cy="20" r="13" fill="#d9a35a" />
          <g fill={K} stroke="none">
            <circle cx="15" cy="15" r="2" />
            <circle cx="24" cy="14" r="1.6" />
            <circle cx="22" cy="23" r="2" />
            <circle cx="14" cy="24" r="1.6" />
          </g>
        </g>
      );
    case 'fraise':
      return (
        <g stroke={K} strokeWidth="2.2" strokeLinejoin="round">
          <path d="M8 14 C8 10 32 10 32 14 C32 24 24 34 20 34 C16 34 8 24 8 14 Z" fill="#d9415a" />
          <path d="M11 12 L15 6 L20 11 L25 6 L29 12 Z" fill="#3f8f4a" />
          <g fill="#f7e27a" stroke="none">
            <circle cx="15" cy="18" r="1.2" />
            <circle cx="24" cy="18" r="1.2" />
            <circle cx="20" cy="24" r="1.2" />
            <circle cx="16" cy="27" r="1.2" />
            <circle cx="24" cy="26" r="1.2" />
          </g>
        </g>
      );
    case 'crepe':
      return (
        <g stroke={K} strokeWidth="2.2" strokeLinejoin="round">
          <path d="M5 28 C10 12 30 12 35 28 Z" fill="#f2c979" />
          <path d="M12 22 C16 20 18 24 22 21 C25 19 27 22 29 21" fill="none" stroke="#7a3f1d" strokeWidth="2.6" strokeLinecap="round" />
        </g>
      );
    case 'croissant':
      return (
        <g stroke={K} strokeWidth="2.2" strokeLinejoin="round">
          <path d="M4 26 C6 14 14 9 20 9 C26 9 34 14 36 26 C32 27 29 24 28 21 C26 25 23 26 20 26 C17 26 14 25 12 21 C11 24 8 27 4 26 Z" fill="#e0a548" />
          <path d="M14 13 L16 21 M20 10 V25 M26 13 L24 21" fill="none" stroke="#8a5a2b" strokeWidth="1.8" />
        </g>
      );
    case 'tarte':
      return (
        <g stroke={K} strokeWidth="2.2" strokeLinejoin="round">
          <path d="M6 30 L32 14 C35 20 35 26 33 30 Z" fill="#e8c27a" />
          <path d="M9 28 L31 16 C32 20 32 24 31 27 Z" fill="#c0392b" stroke="none" />
          <path d="M6 30 L32 14" fill="none" />
        </g>
      );
    case 'glace':
      return (
        <g stroke={K} strokeWidth="2.2" strokeLinejoin="round">
          <path d="M12 20 L20 36 L28 20 Z" fill="#e0a548" />
          <circle cx="20" cy="15" r="8" fill="#f5b3c6" />
          <circle cx="24" cy="9" r="2.2" fill="#d9415a" />
        </g>
      );
    case 'macaron':
      return (
        <g stroke={K} strokeWidth="2.2">
          <ellipse cx="20" cy="15" rx="13" ry="6" fill="#9fd3c7" />
          <rect x="8" y="18" width="24" height="4" rx="2" fill="#f3f0e6" />
          <ellipse cx="20" cy="25" rx="13" ry="6" fill="#9fd3c7" />
        </g>
      );
    case 'gateau':
      return (
        <g stroke={K} strokeWidth="2.2" strokeLinejoin="round">
          <rect x="7" y="19" width="26" height="14" rx="2" fill="#f5b3c6" />
          <path d="M7 23 C11 26 13 21 17 24 C21 27 23 21 27 24 C30 26 31 23 33 23" fill="none" stroke="#f3f0e6" strokeWidth="3" />
          <rect x="18.5" y="9" width="3" height="10" fill="#4aa3d9" />
          <path d="M20 3 C23 6 22 9 20 9 C18 9 17 6 20 3 Z" fill="#f2c14e" />
        </g>
      );
    case 'etoile':
      return (
        <g stroke={K} strokeWidth="2.2" strokeLinejoin="round">
          <path d="M20 4 L24.7 14 L35.5 15.3 L27.5 22.7 L29.6 33.4 L20 28.1 L10.4 33.4 L12.5 22.7 L4.5 15.3 L15.3 14 Z" fill="#f2c14e" />
          <circle cx="16" cy="17" r="1.5" fill="#fff" stroke="none" />
        </g>
      );
    default:
      return <circle cx="20" cy="20" r="12" fill="#ccc" stroke={K} strokeWidth="2.2" />;
  }
}

export function FoodArt({ id, hidden = false, className }: { id: string; hidden?: boolean; className?: string }) {
  return (
    <svg className={`food${hidden ? ' food-hidden' : ''}${className ? ` ${className}` : ''}`} viewBox="0 0 40 40" aria-hidden="true" focusable="false">
      <Shape id={id} />
    </svg>
  );
}
