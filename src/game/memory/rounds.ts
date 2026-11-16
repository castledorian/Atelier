/**
 * « Mémoire d'encre » — règles et difficulté des manches.
 * Deux modes, inspirés des exercices de mémoire de travail :
 *  · La Suite  : une suite de taches s'allume une à une ; on la refait dans le même ordre.
 *                À chaque réussite, la MÊME suite s'allonge d'une tache (comme « Sequence Memory » de Human Benchmark).
 *  · Les Cases : des taches apparaissent un instant sur une grille ; on retrouve leurs places.
 * Un cahier = 6 pages (La Suite : 5 manches par page, Les Cases : 4 manches par page).
 */

import type { Grade } from '../grade';

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

/**
 * Réglage par classe : cadence plus lente, observation plus longue et grilles plus petites pour les plus jeunes.
 * Le CM1 est la référence. Valeurs de départ à ajuster d'après les parties réelles.
 */
export interface MemoryTune {
  /** multiplie la durée entre deux taches de la suite */
  step: number;
  /** multiplie le temps d'observation des cases */
  show: number;
  /** côté maximal de la grille des cases */
  size: number;
  /** proportion du nombre de taches à retrouver (Les Cases) */
  count: number;
}

export const MEMORY_TUNE: Record<Grade, MemoryTune> = {
  cp: { step: 1.45, show: 1.6, size: 3, count: 0.55 },
  ce1: { step: 1.3, show: 1.4, size: 4, count: 0.7 },
  ce2: { step: 1.15, show: 1.2, size: 5, count: 0.85 },
  cm1: { step: 1, show: 1, size: 6, count: 1 },
  cm2: { step: 0.95, show: 0.95, size: 6, count: 1 },
};

/** Côté de la grille et nombre de taches à la manche n, pour une classe. */
export function casesSpec(n: number, grade: Grade = 'cm1'): { size: number; count: number } {
  const i = Math.min(n, CASES_TOTAL - 1);
  const t = MEMORY_TUNE[grade];
  const size = Math.min(CASES_SIZE[i], t.size);
  const count = Math.min(Math.max(2, Math.round(CASES_COUNT[i] * t.count)), size * size - 2);
  return { size, count };
}

/** Longueur de la suite à la manche n (La Suite) : 1, 2, 3… une tache de plus à chaque manche. */
export const suiteLen = (n: number) => n + 1;

/** Durée entre deux taches de la suite (s) : très légèrement plus rapide quand la suite s'allonge. */
export const suiteStep = (n: number, grade: Grade = 'cm1') => Math.max(0.55, 0.9 - 0.014 * n) * MEMORY_TUNE[grade].step;

/** Durée pendant laquelle les taches restent visibles dans Les Cases (s). */
export const casesShow = (n: number, grade: Grade = 'cm1') => {
  const t = MEMORY_TUNE[grade];
  return Math.max(1.3, 1.0 + 0.2 * casesSpec(n, grade).count - 0.02 * n) * t.show;
};

/** Nombre de taches à retenir à la manche n. */
export const spanOf = (mode: Mode, n: number, grade: Grade = 'cm1') => (mode === 'suite' ? suiteLen(n) : casesSpec(n, grade).count);

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
export function makeCases(n: number, rng: Rng, grade: Grade = 'cm1'): { size: number; cells: number[] } {
  const { size, count } = casesSpec(n, grade);
  const all = Array.from({ length: size * size }, (_, k) => k);
  for (let k = all.length - 1; k > 0; k--) {
    const j = Math.floor(rng() * (k + 1));
    [all[k], all[j]] = [all[j], all[k]];
  }
  return { size, cells: all.slice(0, count).sort((a, b) => a - b) };
}

/** Disposition « pavé numérique » d'une grille 3×3 : 7 8 9 / 4 5 6 / 1 2 3. */
export function digitToCell(d: number): number {
  if (d < 1 || d > 9) return -1;
  const row = 2 - Math.floor((d - 1) / 3);
  return row * 3 + ((d - 1) % 3);
}
