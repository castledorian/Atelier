import { useEffect, useRef, useState } from 'react';
import { CHEAT_EVENT } from '../server/student';

/**
 * Message affiché quand le serveur a refusé une partie impossible (score ou durée qu'aucun joueur ne peut obtenir).
 * Le ton est celui d'un clin d'œil : la partie n'est pas comptée, les suivantes jouées honnêtement le seront.
 */
export default function CheatNotice() {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const on = () => setOpen(true);
    window.addEventListener(CHEAT_EVENT, on);
    return () => window.removeEventListener(CHEAT_EVENT, on);
  }, []);

  useEffect(() => {
    if (open) btn.current?.focus();
  }, [open]);

  if (!open) return null;
  return (
    <div className="cheat-layer" role="alertdialog" aria-modal="true" aria-labelledby="cheat-title" aria-describedby="cheat-text">
      <div className="cheat-card">
        <p className="eyebrow">Alerte de l’atelier</p>
        <h2 id="cheat-title" className="title-sm">
          Félicitations, tu as triché&nbsp;!
        </h2>
        <p id="cheat-text" className="cheat-text">
          Bravo, tu as réussi à envoyer un score que personne ne peut obtenir en jouant. Mais le serveur vérifie chaque partie : celle-ci n’est <strong>pas comptée</strong>.
          Les parties jouées pour de vrai, elles, sont toujours gardées et comptent pour le classement.
        </p>
        <button ref={btn} type="button" className="btn btn-primary" onClick={() => setOpen(false)}>
          Compris, je rejoue honnêtement
        </button>
      </div>
    </div>
  );
}
