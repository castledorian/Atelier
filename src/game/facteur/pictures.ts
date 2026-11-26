import { slug } from './words';
import type { FWord } from './words';

/**
 * Les images des colis : un fichier par mot dans `public/facteur/` (vache.webp, lezard.webp… voir `slug`).
 * La liste des fichiers présents est relevée à la construction du site (vite.config.ts) : pas de requête perdue, pas de liste à tenir à jour.
 * Tant qu'un mot n'a pas son image, son petit dessin de secours (emoji) est utilisé ; sans l'un ni l'autre, le mot n'est pas proposé.
 */

declare const __FACTEUR_IMAGES__: string[] | undefined;

const FILES: string[] = typeof __FACTEUR_IMAGES__ !== 'undefined' ? __FACTEUR_IMAGES__ : [];
const BY_SLUG = new Map(FILES.map((f) => [f.replace(/\.[^.]+$/, ''), f]));

export interface Picture {
  /** adresse de l'image */
  src?: string;
  /** dessin de secours */
  emoji?: string;
}

export function pictureOf(w: FWord): Picture | null {
  const file = BY_SLUG.get(slug(w.mark));
  if (file) return { src: `./facteur/${file}`, emoji: w.emoji };
  return w.emoji ? { emoji: w.emoji } : null;
}

export const hasPicture = (w: FWord): boolean => pictureOf(w) !== null;
