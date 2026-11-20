import { isFLevel } from './words';
import type { FLevel } from './words';

/** Records et dernier niveau joué, gardés sur l'appareil (rien ne part sur le réseau). */

const KEY = 'atelier.facteur.v1';

export interface FBest {
  score: number;
  stars: 1 | 2 | 3;
}
interface Saved {
  level: FLevel;
  best: Partial<Record<FLevel, FBest>>;
}

function read(): Saved {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<Saved> | null;
    const best: Saved['best'] = {};
    for (const l of [1, 2, 3, 4] as FLevel[]) {
      const b = v?.best?.[l];
      if (b && typeof b.score === 'number' && (b.stars === 1 || b.stars === 2 || b.stars === 3)) best[l] = { score: b.score, stars: b.stars };
    }
    return { level: isFLevel(v?.level) ? v.level : 1, best };
  } catch {
    return { level: 1, best: {} };
  }
}

function write(s: Saved) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* stockage refusé : on joue quand même */
  }
}

export const loadFLevel = (): FLevel => read().level;
export const loadFBest = (level: FLevel): FBest | null => read().best[level] ?? null;

/** Efface les records (le dernier niveau joué est gardé). */
export function clearFScores() {
  const s = read();
  s.best = {};
  write(s);
}

export function saveFLevel(level: FLevel) {
  const s = read();
  s.level = level;
  write(s);
}

/** Enregistre une partie ; `record` = meilleur score du niveau. Les étoiles ne redescendent jamais. */
export function saveFResult(level: FLevel, score: number, stars: 1 | 2 | 3): { record: boolean; best: FBest } {
  const s = read();
  const old = s.best[level];
  const record = !old || score > old.score;
  const best: FBest = { score: Math.max(score, old?.score ?? 0), stars: Math.max(stars, old?.stars ?? 1) as 1 | 2 | 3 };
  s.best[level] = best;
  s.level = level;
  write(s);
  return { record, best };
}
