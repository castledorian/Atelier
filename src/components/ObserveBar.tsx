import type { ReactNode } from 'react';

/**
 * Bandeau du mode observation : toujours visible, il rappelle qu'on regarde l'écran de quelqu'un d'autre
 * sans pouvoir rien modifier (le serveur l'interdit aussi : ce bandeau n'est pas la seule protection).
 */
export function ObserveBar({ label, onQuit }: { label: string; onQuit: () => void }) {
  return (
    <div className="observe-bar" role="region" aria-label="Mode observation">
      <p>
        <strong>Observation en lecture seule</strong> — {label}. Rien de ce que tu fais ici n’est enregistré ni envoyé.
      </p>
      <button type="button" className="btn btn-ghost" onClick={onQuit}>
        Quitter l’observation
      </button>
    </div>
  );
}

/**
 * Ce qu'on peut encore toucher en observation : changer d'onglet, trier un tableau, ouvrir un volet, une bulle « i »,
 * et tout ce qui est marqué `data-observe-ok` (consultation pure : fiche élève, résultats de séance, export).
 */
const NAV = '[role="tab"], .th-sort, summary, .tip-i, [data-observe-ok]';

/**
 * Zone en lecture seule : les clics, saisies et envois de formulaire qui ne servent pas à naviguer sont interceptés avant d'atteindre
 * l'écran qu'elle entoure. Ce n'est qu'une courtoisie : le serveur refuse de toute façon toute modification venant d'un administrateur.
 */
export function ReadOnlyZone({ children }: { children: ReactNode }) {
  const block = (e: { target: EventTarget; preventDefault: () => void; stopPropagation: () => void }) => {
    const t = e.target as HTMLElement;
    if (t.closest(NAV)) return;
    if (t.closest('button, input, select, textarea, label, [role="button"]')) {
      e.preventDefault();
      e.stopPropagation();
    }
  };
  return (
    <div
      className="observe-lock"
      onClickCapture={block}
      onSubmitCapture={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onChangeCapture={(e) => e.stopPropagation()}
      onBeforeInputCapture={(e) => e.preventDefault()}
    >
      {children}
    </div>
  );
}
