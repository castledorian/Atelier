import type { Level } from './questions';

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

type Store = Record<Level, CourseScore[]>;

function read(): Store {
  const empty: Store = { cm1: [], cm2: [] };
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (!v || typeof v !== 'object') return empty;
    for (const l of ['cm1', 'cm2'] as const) {
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

export const loadCourseScores = (level: Level): CourseScore[] => read()[level];

/** Ajoute une partie ; renvoie le tableau à jour et le rang obtenu (1 = record), ou -1 si elle n'entre pas dans le top 10. */
export function addCourseScore(level: Level, entry: CourseScore): { scores: CourseScore[]; rank: number } {
  const all = read();
  const list = [...all[level], entry].sort((a, b) => b.score - a.score || a.date - b.date).slice(0, MAX_COURSE_SCORES);
  all[level] = list;
  write(all);
  return { scores: list, rank: list.findIndex((s) => s.id === entry.id) + 1 || -1 };
}

export function renameCourseScore(level: Level, id: string, name: string): CourseScore[] {
  const all = read();
  all[level] = all[level].map((s) => (s.id === id ? { ...s, name } : s));
  write(all);
  return all[level];
}

export function clearCourseScores(level: Level): CourseScore[] {
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
