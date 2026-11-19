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
/** Difficulté (même vocabulaire que Frappe ! et Course à l'encre). */
export type MemDiff = 'apprenti' | 'standard' | 'expert';
export type Rng = () => number;

export const PAGES = 6;
export const MAX_LIVES = 3;

export const MEM_DIFFS: Array<{ id: MemDiff; label: string; hint: string }> = [
  { id: 'apprenti', label: 'Apprenti', hint: '5 vies, tout va plus lentement et les taches restent plus longtemps : pour découvrir le jeu.' },
  { id: 'standard', label: 'Standard', hint: '3 vies : le rythme de référence pour la classe.' },
  { id: 'expert', label: 'Expert', hint: 'On commence par une suite de 3, ça va plus vite et il y a plus de taches : pour les mémoires de lynx.' },
];
export const isMemDiff = (v: unknown): v is MemDiff => v === 'apprenti' || v === 'standard' || v === 'expert';

/**
 * Réglage de chaque difficulté, appliqué en plus de la classe (qui règle déjà la cadence et la taille des grilles).
 * Valeurs réglées par simulation d'élèves fragiles, moyens et à l'aise de chaque classe : Apprenti = parties longues
 * et rassurantes (une dizaine de manches), Standard = référence, Expert = départ à 3 et rythme serré.
 */
export interface MemDiffTune {
  /** vies au départ (et plafond de vies) */
  lives: number;
  /** multiplie la durée entre deux taches de la suite */
  step: number;
  /** multiplie le temps d'observation des cases */
  show: number;
  /** multiplie le nombre de taches à retrouver (Les Cases) */
  count: number;
  /** manche de départ de La Suite (2 = on commence par une suite de 3) */
  start: number;
}
export const MEMORY_DIFF: Record<MemDiff, MemDiffTune> = {
  apprenti: { lives: 5, step: 1.3, show: 1.35, count: 0.85, start: 0 },
  standard: { lives: 3, step: 1, show: 1, count: 1, start: 0 },
  expert: { lives: 3, step: 0.85, show: 0.8, count: 1.15, start: 2 },
};

/** Clé d'un classement : « suite » = Standard (comme avant l'ajout des difficultés), « suite-apprenti », « cases-expert »… */
export type MemBoard = Mode | `${Mode}-apprenti` | `${Mode}-expert`;
export const memBoard = (mode: Mode, diff: MemDiff): MemBoard => (diff === 'standard' ? mode : `${mode}-${diff}`);

/** Première manche d'une partie : le début de la page choisie, ou plus loin en Expert (La Suite). */
export const firstRound = (mode: Mode, startPage: number, diff: MemDiff) =>
  Math.max(startPage * perPage(mode), mode === 'suite' ? MEMORY_DIFF[diff].start : 0);
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
  /** nombre maximal de taches à retrouver (Les Cases) : l'empan de mémoire des élèves de cet âge, une tache de plus en Expert */
  cap: number;
}

export const MEMORY_TUNE: Record<Grade, MemoryTune> = {
  cp: { step: 1.45, show: 1.6, size: 3, count: 0.55, cap: 4 },
  ce1: { step: 1.3, show: 1.4, size: 4, count: 0.7, cap: 6 },
  ce2: { step: 1.15, show: 1.2, size: 5, count: 0.85, cap: 8 },
  cm1: { step: 1, show: 1, size: 6, count: 1, cap: 99 },
  cm2: { step: 0.95, show: 0.95, size: 6, count: 1, cap: 99 },
};

/** Côté de la grille et nombre de taches à la manche n, pour une classe. */
export function casesSpec(n: number, grade: Grade = 'cm1', diff: MemDiff = 'standard'): { size: number; count: number } {
  const i = Math.min(n, CASES_TOTAL - 1);
  const t = MEMORY_TUNE[grade];
  const size = Math.min(CASES_SIZE[i], t.size);
  const cap = t.cap + (diff === 'expert' && t.cap < 99 ? 1 : 0);
  const count = Math.min(Math.max(2, Math.round(CASES_COUNT[i] * t.count * MEMORY_DIFF[diff].count)), size * size - 2, cap);
  return { size, count };
}

/** Longueur de la suite à la manche n (La Suite) : 1, 2, 3… une tache de plus à chaque manche. */
export const suiteLen = (n: number) => n + 1;

/** Durée entre deux taches de la suite (s) : très légèrement plus rapide quand la suite s'allonge. */
export const suiteStep = (n: number, grade: Grade = 'cm1', diff: MemDiff = 'standard') =>
  Math.max(0.55, 0.9 - 0.014 * n) * MEMORY_TUNE[grade].step * MEMORY_DIFF[diff].step;

/** Durée pendant laquelle les taches restent visibles dans Les Cases (s). */
export const casesShow = (n: number, grade: Grade = 'cm1', diff: MemDiff = 'standard') => {
  const t = MEMORY_TUNE[grade];
  return Math.max(1.3, 1.0 + 0.2 * casesSpec(n, grade, diff).count - 0.02 * n) * t.show * MEMORY_DIFF[diff].show;
};

/** Nombre de taches à retenir à la manche n. */
export const spanOf = (mode: Mode, n: number, grade: Grade = 'cm1', diff: MemDiff = 'standard') => (mode === 'suite' ? suiteLen(n) : casesSpec(n, grade, diff).count);

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
export function makeCases(n: number, rng: Rng, grade: Grade = 'cm1', diff: MemDiff = 'standard'): { size: number; cells: number[] } {
  const { size, count } = casesSpec(n, grade, diff);
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
