import type { CourseDiff, Level } from '../../game/course/questions';
import { hpFor, isTyped } from '../../game/spelling/engine';

export const isWord = (w: string) => /[\p{L}\p{N}]/u.test(w);
export const fmt = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
export const reducedMotion = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Durées des animations (ms), alignées sur la feuille de style. */
export const T = {
  /** la créature apparaît avant d'écrire */
  enter: 520,
  /** départ du boulet → impact sur la créature */
  shot: 300,
  /** impact → la correction s'écrit */
  fix: 380,
};

/** Résumé de la difficulté ; le nombre de vies vient du moteur (il dépend de la classe). */
export const hintText = (diff: CourseDiff, level: Level) => {
  const hp = `${hpFor(diff, level)} vies.`;
  if (diff === 'apprenti') return `${hp} Deux propositions seulement, l’astuce s’affiche toute seule, et ta première hésitation ne compte pas.`;
  if (diff === 'standard') return `${hp} Trois propositions. Un indice est possible, mais il rapporte moins de points.`;
  return isTyped(diff, level) ? `${hp} Pas de propositions : tu écris toi-même la bonne orthographe, sans indice.` : `${hp} Quatre propositions, sans indice : à toi de bien lire.`;
};
