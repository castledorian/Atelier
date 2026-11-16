import { useEffect, useState } from 'react';

/** Délai de jeu libre avant le message de pause (en secondes). */
export const BREAK_AFTER_S = 15 * 60;

/**
 * Message de pause doux, jamais bloquant : après 15 minutes de jeu libre (onglet visible),
 * il rappelle que les scores sont gardés. L'élève le ferme d'un clic ; le décompte repart.
 */
export default function BreakNotice() {
  const [shown, setShown] = useState(false);

  useEffect(() => {
    let seconds = 0;
    const id = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      seconds += 5;
      if (seconds >= BREAK_AFTER_S) {
        seconds = 0;
        setShown(true);
      }
    }, 5000);
    return () => window.clearInterval(id);
  }, []);

  if (!shown) return null;
  return (
    <div className="break-notice" role="status">
      <span>Une pause&nbsp;? Tes scores sont gardés.</span>
      <button type="button" className="btn" onClick={() => setShown(false)}>
        Je continue
      </button>
    </div>
  );
}
