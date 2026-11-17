import { useEffect, useState } from 'react';

/** Téléphone tenu en paysage : l'écran est trop bas pour les jeux qui ont besoin de hauteur. */
const QUERY = '(orientation: landscape) and (max-height: 500px) and (pointer: coarse)';

export function useShortLandscape(): boolean {
  const [short, setShort] = useState(() => typeof matchMedia === 'function' && matchMedia(QUERY).matches);
  useEffect(() => {
    if (typeof matchMedia !== 'function') return;
    const mq = matchMedia(QUERY);
    const on = () => setShort(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return short;
}

/** Message plein écran demandant de tourner le téléphone (le jeu est mis en pause pendant ce temps). */
export function RotateNotice({ game }: { game: string }) {
  return (
    <div className="rotate-notice" role="alert">
      <svg className="rotate-phone" viewBox="0 0 64 64" width="64" height="64" aria-hidden="true" focusable="false">
        <rect x="20" y="6" width="24" height="44" rx="4" fill="none" stroke="currentColor" strokeWidth="3" />
        <circle cx="32" cy="44" r="2" fill="currentColor" />
        <path d="M10 56 q22 10 44 0" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        <path d="M50 52 l4 4 l-6 2" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <p className="rotate-title">Tourne ton téléphone</p>
      <p className="rotate-text">{game} se joue à la verticale : il faut de la hauteur pour bien voir les réponses.</p>
    </div>
  );
}
