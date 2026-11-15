/**
 * « Mémoire d'encre » — règles et difficulté des manches.
 * Deux modes, inspirés des exercices de mémoire de travail :
 *  · La Suite  : une suite de taches s'allume une à une ; on la refait dans le même ordre.
 *                À chaque réussite, la MÊME suite s'allonge d'une tache (comme « Sequence Memory » de Human Benchmark).
 *  · Les Cases : des taches apparaissent un instant sur une grille ; on retrouve leurs places.
 * Un cahier = 6 pages (La Suite : 5 manches par page, Les Cases : 4 manches par page).
 */

export type Mode = 'suite' | 'cases';
export type Rng = () => number;

export const PAGES = 6;
export const MAX_LIVES = 3;
export const SUITE_PER_PAGE = 5;
export const CASES_PER_PAGE = 4;

/** Nombre de manches par page. */
export const perPage = (m: Mode) => (m === 'suite' ? SUITE_PER_PAGE : CASES_PER_PAGE);
/** Nombre de manches d'un cahier complet (La Suite : 30 taches au bout, Les Cases : 24 manches). */
export const totalOf = (m: Mode) => PAGES * perPage(m);
/** Page (0 à 5) d'une manche. */
export const stageOf = (m: Mode, n: number) => Math.min(PAGES - 1, Math.floor(n / perPage(m)));

export const MODES: Array<{ id: Mode; label: string; hint: string }> = [
  { id: 'suite', label: 'La Suite', hint: 'La suite s’allonge d’une tache à chaque réussite. Jusqu’où iras-tu ?' },
  { id: 'cases', label: 'Les Cases', hint: 'Retiens où se cachaient les taches, puis retrouve-les.' },
];

export const PAGE_TITLES: Record<Mode, string[]> = {
  suite: ['Échauffement', 'Petites suites', 'Suites plus longues', 'Mémoire d’éléphant', 'Mémoire de lynx', 'Le grand défi'],
  cases: ['Échauffement', 'Quatre par quatre', 'Beaucoup de taches', 'Une grille de plus', 'Mémoire de lynx', 'Le grand défi'],
};

/** Côté de la grille et nombre de taches à retrouver à chaque manche (mode Les Cases, 24 manches). */
export const CASES_SIZE = [3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 5, 5, 5, 5, 5, 5, 5, 5, 6, 6, 6, 6, 6, 6];
export const CASES_COUNT = [3, 3, 4, 4, 4, 5, 5, 6, 6, 6, 6, 7, 7, 7, 8, 8, 8, 9, 9, 9, 9, 10, 10, 11];
const CASES_TOTAL = CASES_SIZE.length;

/** Longueur de la suite à la manche n (La Suite) : 1, 2, 3… une tache de plus à chaque manche. */
export const suiteLen = (n: number) => n + 1;

/** Durée entre deux taches de la suite (s) : très légèrement plus rapide quand la suite s'allonge. */
export const suiteStep = (n: number) => Math.max(0.55, 0.9 - 0.014 * n);

/** Durée pendant laquelle les taches restent visibles dans Les Cases (s). */
export const casesShow = (n: number) => Math.max(1.3, 1.0 + 0.2 * CASES_COUNT[Math.min(n, CASES_TOTAL - 1)] - 0.02 * n);

/** Nombre de taches à retenir à la manche n. */
export const spanOf = (mode: Mode, n: number) => (mode === 'suite' ? suiteLen(n) : CASES_COUNT[Math.min(n, CASES_TOTAL - 1)]);

/**
 * Allonge la suite : on GARDE le début et on ajoute des taches (grille 3×3, jamais deux fois la même case de suite).
 * Si `prev` est plus longue que `len`, elle est raccourcie.
 */
export function extendSuite(prev: number[], len: number, rng: Rng): number[] {
  const seq = prev.slice(0, len);
  while (seq.length < len) {
    const c = Math.floor(rng() * 9);
    if (seq.length && seq[seq.length - 1] === c) continue;
    seq.push(c);
  }
  return seq;
}

/** Cases à retrouver : toutes différentes, réparties au hasard sur la grille. */
export function makeCases(n: number, rng: Rng): { size: number; cells: number[] } {
  const i = Math.min(n, CASES_TOTAL - 1);
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
