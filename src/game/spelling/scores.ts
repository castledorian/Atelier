import { isCourseDiff, isLevel } from '../course/questions';
import type { BoardKey, CourseDiff, Level } from '../course/questions';

/** Meilleurs scores de « Chasse aux fautes » (5 par niveau et difficulté) et dernier réglage choisi : sur cet appareil seulement. */

export interface SpellingScore {
  id: string;
  score: number;
  streak: number;
  date: number;
}

const KEY = 'atelier.spelling.scores.v1';
const PREFS = 'atelier.spelling.prefs.v1';
export const MAX_SPELLING_SCORES = 5;

type Store = Partial<Record<string, SpellingScore[]>>;

function read(): Store {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    return v && typeof v === 'object' ? (v as Store) : {};
  } catch {
    return {};
  }
}

export function loadSpellingScores(board: BoardKey): SpellingScore[] {
  const list = read()[board];
  return Array.isArray(list) ? list.filter((s) => s && typeof s.id === 'string' && typeof s.score === 'number') : [];
}

/** Ajoute une partie ; renvoie son rang (1 = record) ou -1 si elle n'entre pas dans le tableau. */
export function addSpellingScore(board: BoardKey, entry: SpellingScore): number {
  const all = read();
  const list = [...loadSpellingScores(board), entry].sort((a, b) => b.score - a.score || a.date - b.date).slice(0, MAX_SPELLING_SCORES);
  all[board] = list;
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* stockage refusé : le tableau est un bonus */
  }
  return list.findIndex((s) => s.id === entry.id) + 1 || -1;
}

export function loadSpellingPrefs(): { level: Level; diff: CourseDiff } {
  try {
    const v = JSON.parse(localStorage.getItem(PREFS) ?? 'null') as { level?: unknown; diff?: unknown } | null;
    return { level: isLevel(v?.level) ? v.level : 'cm1', diff: isCourseDiff(v?.diff) ? v.diff : 'standard' };
  } catch {
    return { level: 'cm1', diff: 'standard' };
  }
}

export function saveSpellingPrefs(p: { level: Level; diff: CourseDiff }) {
  try {
    localStorage.setItem(PREFS, JSON.stringify(p));
  } catch {
    /* ignoré */
  }
}
