/**
 * « Mémoire d'encre » — règles et difficulté des manches.
 * Deux modes, inspirés des exercices de mémoire de travail :
 *  · La Suite  : des taches s'allument une à une ; on refait la même suite dans le même ordre.
 *  · Les Cases : des taches apparaissent un instant sur une grille ; on retrouve leurs places.
 * Un cahier = 6 pages de 4 manches, de plus en plus difficiles (environ 4 à 5 minutes).
 */

export type Mode = 'suite' | 'cases';
export type Rng = () => number;

export const PAGES = 6;
export const PER_PAGE = 4;
export const TOTAL = PAGES * PER_PAGE;
export const MAX_LIVES = 3;

export const MODES: Array<{ id: Mode; label: string; hint: string }> = [
  { id: 'suite', label: 'La Suite', hint: 'Regarde les taches s’allumer, puis refais la même suite.' },
  { id: 'cases', label: 'Les Cases', hint: 'Retiens où se cachaient les taches, puis retrouve-les.' },
];

export const PAGE_TITLES: Record<Mode, string[]> = {
  suite: ['Échauffement', 'Petites suites', 'Suites plus longues', 'Écoute et regarde', 'Mémoire d’éléphant', 'Le grand défi'],
  cases: ['Échauffement', 'Quatre par quatre', 'Beaucoup de taches', 'Une grille de plus', 'Mémoire de lynx', 'Le grand défi'],
};

/** Longueur de la suite à chaque manche (24 manches). */
export const SUITE_LEN = [3, 3, 4, 4, 4, 5, 5, 5, 5, 6, 6, 6, 6, 7, 7, 7, 7, 8, 8, 8, 8, 9, 9, 10];
/** Côté de la grille et nombre de taches à retrouver à chaque manche (mode Les Cases). */
export const CASES_SIZE = [3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 5, 5, 5, 5, 5, 5, 5, 5, 6, 6, 6, 6, 6, 6];
export const CASES_COUNT = [3, 3, 4, 4, 4, 5, 5, 6, 6, 6, 6, 7, 7, 7, 8, 8, 8, 9, 9, 9, 9, 10, 10, 11];

export const stageOf = (n: number) => Math.min(PAGES - 1, Math.floor(n / PER_PAGE));

/** Durée entre deux taches de la suite (s) : un peu plus rapide à chaque manche. */
export const suiteStep = (n: number) => Math.max(0.5, 0.9 - 0.018 * n);

/** Durée pendant laquelle les taches restent visibles dans Les Cases (s). */
export const casesShow = (n: number) => Math.max(1.3, 1.0 + 0.2 * CASES_COUNT[Math.min(n, TOTAL - 1)] - 0.02 * n);

/** Nombre de points d'une manche réussie. */
export const spanOf = (mode: Mode, n: number) => (mode === 'suite' ? SUITE_LEN[Math.min(n, TOTAL - 1)] : CASES_COUNT[Math.min(n, TOTAL - 1)]);

/** Suite de taches sur une grille 3×3 : jamais deux fois la même case de suite. */
export function makeSuite(n: number, rng: Rng): number[] {
  const len = SUITE_LEN[Math.min(n, TOTAL - 1)];
  const seq: number[] = [];
  while (seq.length < len) {
    const c = Math.floor(rng() * 9);
    if (seq.length && seq[seq.length - 1] === c) continue;
    seq.push(c);
  }
  return seq;
}

/** Cases à retrouver : toutes différentes, réparties au hasard sur la grille. */
export function makeCases(n: number, rng: Rng): { size: number; cells: number[] } {
  const i = Math.min(n, TOTAL - 1);
  const size = CASES_SIZE[i];
  const all = Array.from({ length: size * size }, (_, k) => k);
  for (let k = all.length - 1; k > 0; k--) {
    const j = Math.floor(rng() * (k + 1));
    [all[k], all[j]] = [all[j], all[k]];
  }
  return { size, cells: all.slice(0, CASES_COUNT[i]).sort((a, b) => a - b) };
}

/** Disposition « pavé numérique » d'une grille 3×3 : 7 8 9 / 4 5 6 / 1 2 3. */
export function digitToCell(d: number): number {
  if (d < 1 || d > 9) return -1;
  const row = 2 - Math.floor((d - 1) / 3);
  return row * 3 + ((d - 1) % 3);
}
