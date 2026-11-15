import type { Mode } from './rounds';

/** Tableau des meilleurs scores de « Mémoire d'encre », gardé sur cet appareil (un classement par mode). */

export interface MemoryScore {
  id: string;
  name: string;
  score: number;
  /** plus longue suite / plus grand nombre de cases retenu */
  span: number;
  date: number;
}

const KEY = 'atelier.memory.scores.v1';
const MODE_KEY = 'atelier.memory.mode.v1';
export const MAX_MEMORY_SCORES = 10;

type Store = Record<Mode, MemoryScore[]>;

function read(): Store {
  const empty: Store = { suite: [], cases: [] };
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (!v || typeof v !== 'object') return empty;
    for (const m of ['suite', 'cases'] as const) {
      empty[m] = Array.isArray(v[m])
        ? v[m].filter((s: MemoryScore) => s && typeof s.id === 'string' && typeof s.score === 'number' && typeof s.name === 'string')
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

export const loadMemoryScores = (mode: Mode): MemoryScore[] => read()[mode];

/** Ajoute une partie ; renvoie le tableau à jour et le rang obtenu (1 = record), ou -1 si elle n'entre pas dans le top 10. */
export function addMemoryScore(mode: Mode, entry: MemoryScore): { scores: MemoryScore[]; rank: number } {
  const all = read();
  const list = [...all[mode], entry].sort((a, b) => b.score - a.score || a.date - b.date).slice(0, MAX_MEMORY_SCORES);
  all[mode] = list;
  write(all);
  return { scores: list, rank: list.findIndex((s) => s.id === entry.id) + 1 || -1 };
}

export function clearMemoryScores(mode: Mode): MemoryScore[] {
  const all = read();
  all[mode] = [];
  write(all);
  return [];
}

export function loadMemoryMode(): Mode {
  try {
    return localStorage.getItem(MODE_KEY) === 'cases' ? 'cases' : 'suite';
  } catch {
    return 'suite';
  }
}

export function saveMemoryMode(m: Mode) {
  try {
    localStorage.setItem(MODE_KEY, m);
  } catch {
    /* ignoré */
  }
}

// ───────────── Progression : tampons du cahier ─────────────

/** Un tampon par page terminée (6 au maximum) : un but visible qui se remplit, et qui reste sur l'appareil. */
export interface MemoryProgress {
  /** plus grand nombre de pages terminées, de 0 à 6 */
  stamps: number;
  /** plus longue suite (ou plus grand nombre de taches) de la dernière partie */
  lastSpan: number;
}

const PKEY = 'atelier.memory.progress.v1';

function readProgress(): Record<Mode, MemoryProgress> {
  const empty: Record<Mode, MemoryProgress> = { suite: { stamps: 0, lastSpan: 0 }, cases: { stamps: 0, lastSpan: 0 } };
  try {
    const v = JSON.parse(localStorage.getItem(PKEY) ?? 'null');
    if (!v || typeof v !== 'object') return empty;
    for (const m of ['suite', 'cases'] as const) {
      const x = v[m];
      if (x && typeof x.stamps === 'number' && typeof x.lastSpan === 'number') {
        empty[m] = { stamps: Math.max(0, Math.min(6, Math.floor(x.stamps))), lastSpan: Math.max(0, Math.floor(x.lastSpan)) };
      }
    }
    return empty;
  } catch {
    return empty;
  }
}

export const loadProgress = (mode: Mode): MemoryProgress => readProgress()[mode];

/** Enregistre une partie terminée ; renvoie la progression d'AVANT et d'APRÈS (pour féliciter d'un nouveau tampon). */
export function recordProgress(mode: Mode, pagesCleared: number, span: number): { before: MemoryProgress; after: MemoryProgress } {
  const all = readProgress();
  const before = { ...all[mode] };
  const after = { stamps: Math.max(before.stamps, Math.max(0, Math.min(6, pagesCleared))), lastSpan: span };
  all[mode] = after;
  try {
    localStorage.setItem(PKEY, JSON.stringify(all));
  } catch {
    /* stockage plein ou refusé : tant pis */
  }
  return { before, after };
}
