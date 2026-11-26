import type { FaceGeom } from '../../components/MonsterFace';

/**
 * Les illustrations du monstre : une image par forme (corps SANS visage, fond transparent, carrée), rangée dans
 * `public/cave/forme-01.webp` … `forme-10.webp`. Le visage (yeux, sourcils, bouche) et les animations sont dessinés par le code.
 *
 * Tant qu'une forme n'a pas son illustration (`null`), la page utilise le dessin vectoriel de secours (InkBoss) :
 * rien ne casse, et chaque illustration ajoutée remplace automatiquement le secours de sa forme.
 * Pour ajouter une illustration : déposer l'image, puis remplacer `null` par `{ face: { … } }` (position du visage dans un repère de 240 × 240).
 */

export interface FormArt {
  /** emplacement du visage sur l'image */
  face: FaceGeom;
  /** hauteur occupée par le monstre dans l'image, de 0 à 1 (sert à le poser sur la flaque) */
  fill?: number;
  /** aura lumineuse derrière le monstre (grandes formes) */
  aura?: boolean;
}

/** Une entrée par forme, de la 1 à la 10. */
export const FORM_ART: ReadonlyArray<FormArt | null> = [null, null, null, null, null, null, null, null, null, null];

/** Dessin vectoriel de secours (0 à 6) pour chaque forme, tant que son illustration manque. */
export const FALLBACK_STAGE: readonly number[] = [0, 1, 1, 2, 3, 3, 4, 5, 5, 6];

/** Adresse de l'image d'une forme (compatible avec le sous-dossier de GitHub Pages). */
export const artUrl = (form: number): string => `${import.meta.env.BASE_URL}cave/forme-${String(form + 1).padStart(2, '0')}.webp`;
