import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

/**
 * Petit « i » placé en haut à droite d'un menu de jeu : il lance un extrait animé du jeu,
 * pour ceux qui comprennent mieux en voyant qu'en lisant.
 */
export function InfoButton({ onClick, label = 'Voir un extrait du jeu' }: { onClick: () => void; label?: string }) {
  return (
    <button type="button" className="info-btn" onClick={onClick} aria-label={label} title={label}>
      <span aria-hidden="true">i</span>
    </button>
  );
}

/** Une étape d'un extrait : la phrase affichée pendant quelques secondes. */
export interface PreviewStep {
  text: string;
}

const STEP_MS = 4600;

/**
 * Bandeau posé sur le jeu pendant l'extrait : légende qui change toute seule, boucle sans fin,
 * « Fermer » (ou Échap) et « Jouer ». Rien n'est enregistré, aucun score n'est compté.
 */
export function PreviewBar({
  title,
  steps,
  onClose,
  onPlay,
  inline = false,
  children,
}: {
  title: string;
  steps: PreviewStep[];
  onClose: () => void;
  onPlay: () => void;
  /** dans la page (jeux en HTML) plutôt que posé sur un jeu sur canvas */
  inline?: boolean;
  /** décor animé propre au jeu (jeux en HTML) ; les jeux sur canvas jouent déjà derrière */
  children?: ReactNode;
}) {
  const [i, setI] = useState(0);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const id = window.setInterval(() => setI((k) => (k + 1) % steps.length), STEP_MS);
    return () => window.clearInterval(id);
  }, [steps.length]);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className={`preview-layer${inline ? ' inline' : ''}`} role="region" aria-label={`Extrait : ${title}`}>
      {children}
      <section className="preview-bar">
        <p className="eyebrow">Extrait · {title}</p>
        <p className="preview-text" role="status" aria-live="polite">
          {steps[i].text}
        </p>
        <div className="preview-foot">
          <span className="preview-dots" aria-hidden="true">
            {steps.map((_, k) => (
              <span key={k} className={k === i ? 'on' : ''} />
            ))}
          </span>
          <button ref={closeRef} type="button" className="btn btn-ghost" onClick={onClose}>
            Fermer
          </button>
          <button type="button" className="btn btn-primary" onClick={onPlay}>
            Jouer
          </button>
        </div>
      </section>
    </div>
  );
}

/** Extraits : les phrases affichées, jeu par jeu. */
export const PREVIEWS = {
  typing: {
    title: 'Frappe !',
    steps: [
      { text: 'Des taches d’encre tombent. Chacune porte un mot.' },
      { text: 'Tape le mot, lettre après lettre : la tache éclate.' },
      { text: 'Ne les laisse pas atteindre la marge en bas de la page.' },
      { text: 'Enchaîne les mots sans faute pour gagner plus de points.' },
    ],
  },
  math: {
    title: 'Course à l’encre',
    steps: [
      { text: 'Un calcul s’affiche en haut de la page.' },
      { text: 'Trois réponses descendent : place la plume sous la bonne.' },
      { text: 'Bonne réponse : l’encre recule. Mauvaise ou trop lente : elle monte.' },
      { text: 'Au clavier : ← → pour choisir, Entrée pour valider.' },
    ],
  },
  memory: {
    title: 'Mémoire d’encre',
    steps: [
      { text: 'Les taches s’allument une à une : regarde bien leur ordre.' },
      { text: 'Quand c’est fini, touche les cases dans le même ordre.' },
      { text: 'À chaque réussite, la suite s’allonge d’une tache.' },
      { text: 'Dans « Les Cases », les taches apparaissent un instant : retrouve leurs places.' },
    ],
  },
  spelling: {
    title: 'Chasse aux fautes',
    steps: [
      { text: 'Une faute s’est glissée dans la phrase.' },
      { text: 'Touche le mot qui n’est pas bien écrit.' },
      { text: 'Choisis ensuite la bonne écriture parmi les propositions.' },
      { text: 'Bravo ! Une astuce t’aide à retenir la règle pour la prochaine fois.' },
    ],
  },
} as const;

/**
 * Extrait animé de « Chasse aux fautes » : la même phrase que dans le jeu, jouée toute seule
 * (le mot fautif est montré du doigt, puis la bonne écriture est choisie). Décor seulement : rien n'est cliquable.
 */
export function SpellingDemo() {
  const [phase, setPhase] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setPhase((k) => (k + 1) % 4), STEP_MS);
    return () => window.clearInterval(id);
  }, []);
  const fixed = phase >= 3;
  return (
    <div className="sp-demo" aria-hidden="true">
      <div className="sp-sentence">
        <span className="sp-plain">Les</span>
        <span className="sp-plain">enfants</span>
        {phase === 0 && <span className="sp-demo-word">joue</span>}
        {phase === 1 && <span className="sp-demo-word sp-demo-point">joue</span>}
        {phase === 2 && <span className="sp-mark">joue</span>}
        {fixed && <span className="sp-ok">jouent</span>}
        <span className="sp-plain">dehors.</span>
      </div>
      {phase >= 2 && (
        <div className="sp-choices">
          {['joue', 'jouent', 'joues'].map((c) => (
            <span key={c} className={`btn btn-ghost sp-choice${fixed && c === 'jouent' ? ' sp-demo-right' : ''}`}>
              {c}
            </span>
          ))}
        </div>
      )}
      {fixed && (
        <p className="sp-tip">
          <strong>Astuce :</strong> « Les enfants » est au pluriel, le verbe prend donc -nt.
        </p>
      )}
    </div>
  );
}
