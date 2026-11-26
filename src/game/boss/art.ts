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

/** Une entrée par forme, de la 1 à la 10 (repère de 240 × 240 : `eyeY` = hauteur des yeux, `gap` = demi-écart, `r` = rayon, `mouthY`, `w` = demi-largeur de la bouche). */
export const FORM_ART: ReadonlyArray<FormArt | null> = [
  { face: { eyeY: 150, gap: 20, r: 12, mouthY: 176, w: 14 } },
  { face: { eyeY: 161, gap: 20, r: 10, mouthY: 178, w: 12 } },
  { face: { eyeY: 100, gap: 22, r: 12, mouthY: 128, w: 14 } },
  { face: { eyeY: 108, gap: 26, r: 14, mouthY: 140, w: 17 } },
  { face: { eyeY: 140, gap: 28, r: 13, mouthY: 168, w: 18 } },
  { face: { eyeY: 115, gap: 30, r: 15, mouthY: 150, w: 20, angry: true } },
  { face: { eyeY: 94, gap: 24, r: 14, mouthY: 124, w: 17, glow: true, angry: true, teeth: true } },
  { face: { eyeY: 64, gap: 19, r: 10, mouthY: 83, w: 10, glow: true, angry: true } },
  { face: { eyeY: 62, gap: 18, r: 10, mouthY: 80, w: 10, glow: true, angry: true }, aura: true },
  { face: { eyeY: 62, gap: 16, r: 8, mouthY: 78, w: 9, glow: true, angry: true }, aura: true },
];

/** Dessin vectoriel de secours (0 à 6) pour chaque forme, tant que son illustration manque. */
export const FALLBACK_STAGE: readonly number[] = [0, 1, 1, 2, 3, 3, 4, 5, 5, 6];

/** Adresse de l'image d'une forme (compatible avec le sous-dossier de GitHub Pages). */
export const artUrl = (form: number): string => `${import.meta.env.BASE_URL}cave/forme-${String(form + 1).padStart(2, '0')}.webp`;
