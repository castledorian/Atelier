import { useEffect, useState } from 'react';
import { PAGE_TURN_EVENT } from '../game/pageTurn';
import type { PageTurnDetail } from '../game/pageTurn';

/**
 * La feuille qui se tourne par-dessus le nouvel écran (voir game/pageTurn.ts). Elle ne capte aucun clic
 * et disparaît d'elle-même : on peut jouer ou cliquer pendant qu'elle s'ouvre.
 */
export function PageTurn() {
  const [leaf, setLeaf] = useState<{ id: number; back: boolean } | null>(null);
  useEffect(() => {
    let n = 0;
    const on = (e: Event) => setLeaf({ id: ++n, back: (e as CustomEvent<PageTurnDetail>).detail.back });
    window.addEventListener(PAGE_TURN_EVENT, on);
    return () => window.removeEventListener(PAGE_TURN_EVENT, on);
  }, []);
  if (!leaf) return null;
  return (
    <div key={leaf.id} className={`pt${leaf.back ? ' pt-back' : ''}`} aria-hidden="true" onAnimationEnd={(e) => e.target === e.currentTarget && setLeaf(null)}>
      <div className="pt-leaf" />
      <div className="pt-shade" />
    </div>
  );
}
