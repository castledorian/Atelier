import { WORDS, plain } from './words';
import type { FWord } from './words';

/**
 * Mots à revoir du « Facteur », gardés sur l'appareil (rien ne part sur le réseau).
 * Un mot raté gagne un point (3 au plus) ; rangé du premier coup dans une autre séance, il en perd un ; à 0, il sort de la liste.
 * Les séances suivantes reproposent d'abord ces mots (voir pickWords) : revoir un mot raté aide à le retenir.
 */

const KEY = 'atelier.facteur.review.v1';
export const REVIEW_MAX = 3;
/** au plus 3 mots à revoir par séance : le reste reste neuf */
export const REVIEW_PER_SESSION = 3;

type Store = Record<string, number>;

function read(): Store {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Record<string, unknown> | null;
    const out: Store = {};
    if (v && typeof v === 'object') for (const [k, n] of Object.entries(v)) if (typeof n === 'number' && n > 0 && k.length <= 30) out[k] = Math.min(REVIEW_MAX, Math.round(n));
    return out;
  } catch {
    return {};
  }
}

function write(s: Store) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* stockage refusé : on joue quand même */
  }
}

/** Met à jour la liste après une séance : `missed` = mots ratés au moins une fois, `clean` = mots rangés du premier coup à chaque passage. */
export function noteReview(missed: readonly string[], clean: readonly string[]): Store {
  const s = read();
  for (const w of missed) s[w] = Math.min(REVIEW_MAX, (s[w] ?? 0) + 1);
  for (const w of clean) {
    if (!(w in s)) continue;
    s[w] -= 1;
    if (s[w] <= 0) delete s[w];
  }
  write(s);
  return s;
}

/** Mots à revoir, du plus raté au moins raté (seulement des mots du jeu, au cas où la liste de mots change). */
export function reviewWords(): FWord[] {
  const s = read();
  return WORDS.filter((w) => !w.tool && (s[plain(w.mark)] ?? 0) > 0).sort((a, b) => (s[plain(b.mark)] ?? 0) - (s[plain(a.mark)] ?? 0));
}

export function clearReview() {
  write({});
}
