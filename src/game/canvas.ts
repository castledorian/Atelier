/**
 * Outils communs aux jeux dessinés sur canevas (Frappe !, Course à l'encre, Mémoire d'encre, Lexique) :
 * la palette du site (papier, encre, ruban rouge), les deux polices, quelques fonctions de calcul et le rectangle arrondi.
 * Une seule définition : changer une couleur ici la change dans tous les jeux.
 */

export const TAU = Math.PI * 2;

/** Palette « cahier » : papier, encre, ruban rouge. */
export const INK = '#1b1915';
export const PAPER = '#efe6d2';
export const PAPER_HI = '#faf5e8';
export const HEAD = '#e4d9bf';
export const RED = '#b02a18';
export const RED_HI = '#f2603f';

/** Polices : titres de machine à écrire, mots du jeu. */
export const F_DISP = '"Special Elite", "Courier New", monospace';
export const F_WORD = '"Courier Prime", "Courier New", monospace';

export const rand = (a: number, b: number) => a + Math.random() * (b - a);
export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

/** Trace (sans remplir) un rectangle aux coins arrondis ; une largeur négative est ramenée à 0. */
export function rr(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  if (w < 0) w = 0;
  r = Math.min(r, w / 2, h / 2);
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}
