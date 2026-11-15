import { useEffect, useState } from 'react';

/**
 * Bouton de retour, toujours au même endroit (en haut à gauche) et avec la même forme dans tous les jeux :
 * « ← Accueil » ramène à la liste des jeux, « ← Retour » revient à l'écran précédent du jeu.
 */
export function BackButton({
  onClick,
  label = 'Accueil',
  autoFocus = false,
}: {
  onClick: () => void;
  label?: string;
  autoFocus?: boolean;
}) {
  return (
    <button type="button" className="back-btn" onClick={onClick} autoFocus={autoFocus}>
      <span aria-hidden="true" className="back-arrow">
        ←
      </span>
      {label}
    </button>
  );
}

/**
 * Nombre de lignes de tableau qui tiennent à l'écran sans faire défiler la page.
 * `reserved` = hauteur (px) déjà prise par le reste de l'écran, `row` = hauteur d'une ligne.
 */
export function useFitRows(reserved: number, row = 30, min = 3, max = 10) {
  const calc = () => {
    if (typeof window === 'undefined') return max;
    return Math.max(min, Math.min(max, Math.floor((window.innerHeight - reserved) / row)));
  };
  const [n, setN] = useState(calc);
  useEffect(() => {
    const on = () => setN(calc());
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reserved, row, min, max]);
  return n;
}
