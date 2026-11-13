import type { Layout } from './storage';

/** Rangées du clavier : haut, milieu (position de repos des doigts), bas. */
export const LAYOUTS: Record<Layout, string[]> = {
  azerty: ['azertyuiop', 'qsdfghjklm', 'wxcvbn'],
  qwerty: ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'],
};

/**
 * Doigt qui frappe chaque lettre : 0 auriculaire, 1 annulaire, 2 majeur, 3 index.
 * Les deux mains partagent les mêmes numéros (la position à l'écran indique la main).
 */
const FINGERS: Record<Layout, Record<string, number>> = {
  azerty: {
    a: 0, q: 0, w: 0, z: 1, s: 1, x: 1, e: 2, d: 2, c: 2,
    r: 3, f: 3, v: 3, t: 3, g: 3, b: 3,
    y: 3, h: 3, n: 3, u: 3, j: 3,
    i: 2, k: 2, o: 1, l: 1, p: 0, m: 0,
  },
  qwerty: {
    q: 0, a: 0, z: 0, w: 1, s: 1, x: 1, e: 2, d: 2, c: 2,
    r: 3, f: 3, v: 3, t: 3, g: 3, b: 3,
    y: 3, h: 3, n: 3, u: 3, j: 3, m: 3,
    i: 2, k: 2, o: 1, l: 1, p: 0,
  },
};

export function fingerOf(ch: string, layout: Layout): number {
  return FINGERS[layout][ch] ?? 3;
}

/** Lettres (majuscules) disponibles pour un palier d'apprentissage : 1 = rangée du milieu, 2 = + haut, 3 = tout. */
export function letterPool(layout: Layout, step: number): string {
  const [top, mid, bot] = LAYOUTS[layout];
  const rows = step <= 1 ? mid : step === 2 ? top + mid : top + mid + bot;
  return rows.toUpperCase();
}

const LEFT: Record<Layout, string> = {
  azerty: 'azertqsdfgwxcvb',
  qwerty: 'qwertasdfgzxcvb',
};
const FINGER_NAMES = ['auriculaire', 'annulaire', 'majeur', 'index'];

/** Ex. « majeur gauche » : le doigt à utiliser pour une lettre (en minuscule ou majuscule). */
export function fingerLabel(ch: string, layout: Layout): string {
  const c = ch.toLowerCase();
  const hand = LEFT[layout].includes(c) ? 'gauche' : 'droit';
  return `${FINGER_NAMES[fingerOf(c, layout)]} ${hand}`;
}
