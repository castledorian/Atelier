/** « Mots en orbite » — calculs purs (positions, score) : séparés du moteur pour pouvoir être testés sans écran. */

import { ANSWER_POINTS, answerPoints } from '../scoring';

export type Rng = () => number;

/** Distance du centre (cx, cy) au bord du rectangle [0,w]×[0,h] dans la direction `angle` (radians). */
export function edgeDistance(w: number, h: number, cx: number, cy: number, angle: number): number {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const tx = dx > 1e-9 ? (w - cx) / dx : dx < -1e-9 ? -cx / dx : Infinity;
  const ty = dy > 1e-9 ? (h - cy) / dy : dy < -1e-9 ? -cy / dy : Infinity;
  return Math.min(tx, ty);
}

/** n directions réparties sur le cercle (« de toutes les directions »), avec un peu de désordre ; jamais deux trop proches. */
export function spreadAngles(n: number, rng: Rng): number[] {
  if (n <= 0) return [];
  const step = (Math.PI * 2) / n;
  const base = rng() * Math.PI * 2;
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(base + i * step + (rng() - 0.5) * step * 0.5);
  // l'ordre d'arrivée n'est pas l'ordre autour du cercle
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Distance à laquelle une étiquette (demi-largeur ex, demi-hauteur ey) touche le mot central (rx, ry) quand elle arrive avec l'angle `a`. */
export function reachDistance(rx: number, ry: number, ex: number, ey: number, a: number): number {
  const ax = rx + ex;
  const ay = ry + ey;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return (ax * ay) / Math.hypot(ay * c, ax * s);
}

/** Multiplicateur de série : voir le barème commun (src/game/scoring.ts). */
export { multFor } from '../scoring';

/**
 * Points d'une bonne réponse : la valeur de base d'une réponse, un bonus de rapidité (0 à 1 : part de la traversée restante
 * quand le mot est touché, au plus 40 % de la base), le tout multiplié par la série.
 */
export function winPoints(speedLeft: number, mult: number): number {
  return answerPoints(ANSWER_POINTS, speedLeft, mult);
}
