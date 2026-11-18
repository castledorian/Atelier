/** « Mots en orbite » — calculs purs (positions, score) : séparés du moteur pour pouvoir être testés sans écran. */

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

/** Multiplicateur de série : ×1, puis +1 toutes les 3 bonnes réponses d'affilée, jusqu'à ×5. */
export const multFor = (streak: number): number => Math.min(5, 1 + Math.floor(Math.max(0, streak) / 3));

/**
 * Points d'une bonne réponse : la longueur du mot, un bonus de rapidité (0 à 1 : part de la traversée restante à la frappe),
 * un bonus « sans faute de frappe », le tout multiplié par la série.
 */
export function winPoints(len: number, speedLeft: number, clean: boolean, mult: number): number {
  const base = 50 + 10 * Math.max(0, len);
  const fast = Math.round(60 * Math.min(1, Math.max(0, speedLeft)));
  return (base + fast + (clean ? 25 : 0)) * Math.max(1, mult);
}
