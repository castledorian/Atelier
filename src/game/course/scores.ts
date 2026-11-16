import { isCourseDiff } from './questions';
import type { BoardKey, CourseDiff, Level } from './questions';

/** Tableau des meilleurs scores de « Course à l'encre », gardé sur cet appareil (un classement par niveau). */

export interface CourseScore {
  id: string;
  name: string;
  score: number;
  streak: number;
  date: number;
}

const KEY = 'atelier.course.scores.v1';
const LEVEL_KEY = 'atelier.course.level.v1';
export const MAX_COURSE_SCORES = 10;

const KEYS: BoardKey[] = ['cm1', 'cm1-apprenti', 'cm1-expert', 'cm2', 'cm2-apprenti', 'cm2-expert'];
type Store = Record<BoardKey, CourseScore[]>;

function read(): Store {
  const empty = Object.fromEntries(KEYS.map((k) => [k, [] as CourseScore[]])) as Store;
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (!v || typeof v !== 'object') return empty;
    for (const l of KEYS) {
      empty[l] = Array.isArray(v[l])
        ? v[l].filter((s: CourseScore) => s && typeof s.id === 'string' && typeof s.score === 'number' && typeof s.name === 'string')
        : [];
    }
    return empty;
  } catch {
    return empty;
  }
}

function write(s: Store) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* stockage plein ou refusé : le tableau est un bonus */
  }
}

export const loadCourseScores = (level: BoardKey): CourseScore[] => read()[level];

/** Ajoute une partie ; renvoie le tableau à jour et le rang obtenu (1 = record), ou -1 si elle n'entre pas dans le top 10. */
export function addCourseScore(level: BoardKey, entry: CourseScore): { scores: CourseScore[]; rank: number } {
  const all = read();
  const list = [...all[level], entry].sort((a, b) => b.score - a.score || a.date - b.date).slice(0, MAX_COURSE_SCORES);
  all[level] = list;
  write(all);
  return { scores: list, rank: list.findIndex((s) => s.id === entry.id) + 1 || -1 };
}

export function renameCourseScore(level: BoardKey, id: string, name: string): CourseScore[] {
  const all = read();
  all[level] = all[level].map((s) => (s.id === id ? { ...s, name } : s));
  write(all);
  return all[level];
}

export function clearCourseScores(level: BoardKey): CourseScore[] {
  const all = read();
  all[level] = [];
  write(all);
  return [];
}

export function loadCourseLevel(): Level {
  try {
    return localStorage.getItem(LEVEL_KEY) === 'cm2' ? 'cm2' : 'cm1';
  } catch {
    return 'cm1';
  }
}

export function saveCourseLevel(l: Level) {
  try {
    localStorage.setItem(LEVEL_KEY, l);
  } catch {
    /* ignoré */
  }
}

const DIFF_KEY = 'atelier.course.diff.v1';

export function loadCourseDiff(): CourseDiff {
  try {
    const v = localStorage.getItem(DIFF_KEY);
    return isCourseDiff(v) ? v : 'standard';
  } catch {
    return 'standard';
  }
}

export function saveCourseDiff(d: CourseDiff) {
  try {
    localStorage.setItem(DIFF_KEY, d);
  } catch {
    /* ignoré */
  }
}

// ───────────── Progression : tampons du cahier (une page terminée = un tampon, 6 au maximum) ─────────────

const STAMPS_KEY = 'atelier.course.stamps.v1';

/** Plus grand nombre de pages terminées, tous niveaux confondus, sur cet appareil. */
export function loadCourseStamps(): number {
  try {
    const n = Number(localStorage.getItem(STAMPS_KEY));
    return Number.isFinite(n) ? Math.max(0, Math.min(6, Math.floor(n))) : 0;
  } catch {
    return 0;
  }
}

/** Enregistre une partie ; renvoie le nombre de tampons d'avant et d'après. */
export function recordCourseStamps(pagesCleared: number): { before: number; after: number } {
  const before = loadCourseStamps();
  const after = Math.max(before, Math.max(0, Math.min(6, Math.floor(pagesCleared))));
  if (after !== before) {
    try {
      localStorage.setItem(STAMPS_KEY, String(after));
    } catch {
      /* stockage refusé : le tampon est un bonus */
    }
  }
  return { before, after };
}
