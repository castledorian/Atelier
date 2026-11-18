import { isLexDiff, isLexLevel, isRel } from './rounds';
import type { LexBoard, LexDiff, LexLevel, Rel } from './rounds';

/**
 * « Mots en orbite » — tout ce qui reste sur l'appareil : meilleurs scores par classement, réglages du menu,
 * et la liste des mots à revoir (les manches ratées). Rien de tout cela n'est envoyé ailleurs.
 */

export interface LexScore {
  id: string;
  name: string;
  score: number;
  /** manches gagnées */
  span: number;
  date: number;
}

const KEY = 'atelier.lexique.scores.v1';
export const MAX_LEX_SCORES = 10;
const RELS: Rel[] = ['synonyme', 'contraire', 'famille', 'melange'];
export const LEX_BOARDS: LexBoard[] = RELS.flatMap((r) => [r, `${r}-apprenti`, `${r}-expert`] as LexBoard[]);

type Store = Record<string, LexScore[]>;

function read(): Store {
  const empty: Store = Object.fromEntries(LEX_BOARDS.map((b) => [b, []]));
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (!v || typeof v !== 'object') return empty;
    for (const b of LEX_BOARDS) {
      empty[b] = Array.isArray(v[b])
        ? v[b].filter((s: LexScore) => s && typeof s.id === 'string' && typeof s.score === 'number' && typeof s.name === 'string' && typeof s.span === 'number')
        : [];
    }
    return empty;
  } catch {
    return empty;
  }
}

function write(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* stockage plein ou refusé : ce sont des bonus */
  }
}

export const loadLexScores = (b: LexBoard): LexScore[] => read()[b] ?? [];

/** Ajoute une partie ; renvoie le tableau à jour et le rang obtenu (1 = record), ou -1 hors du top 10. */
export function addLexScore(b: LexBoard, entry: LexScore): { scores: LexScore[]; rank: number } {
  const all = read();
  const list = [...(all[b] ?? []), entry].sort((x, y) => y.score - x.score || x.date - y.date).slice(0, MAX_LEX_SCORES);
  all[b] = list;
  write(KEY, all);
  return { scores: list, rank: list.findIndex((s) => s.id === entry.id) + 1 || -1 };
}

export function clearLexScores(b: LexBoard): LexScore[] {
  const all = read();
  all[b] = [];
  write(KEY, all);
  return [];
}

// ───────────── Réglages du menu ─────────────

const SET_KEY = 'atelier.lexique.settings.v1';
export interface LexPrefs {
  rel: Rel;
  diff: LexDiff;
  level: LexLevel | null;
}

export function loadLexPrefs(): LexPrefs {
  try {
    const v = JSON.parse(localStorage.getItem(SET_KEY) ?? 'null');
    return {
      rel: isRel(v?.rel) ? v.rel : 'melange',
      diff: isLexDiff(v?.diff) ? v.diff : 'standard',
      level: isLexLevel(v?.level) ? v.level : null,
    };
  } catch {
    return { rel: 'melange', diff: 'standard', level: null };
  }
}
export const saveLexPrefs = (p: LexPrefs) => write(SET_KEY, p);

// ───────────── Mots à revoir ─────────────

export interface Missed {
  prompt: string;
  center: string;
  answer: string;
  morph: string | null;
  /** nombre de fois ratée */
  n: number;
  t: number;
}

const MISS_KEY = 'atelier.lexique.missed.v1';
export const MAX_MISSED = 24;

export function loadMissed(): Missed[] {
  try {
    const v = JSON.parse(localStorage.getItem(MISS_KEY) ?? 'null');
    if (!Array.isArray(v)) return [];
    return v.filter((m: Missed) => m && typeof m.center === 'string' && typeof m.answer === 'string' && typeof m.prompt === 'string' && typeof m.n === 'number');
  } catch {
    return [];
  }
}

/** Ajoute les manches ratées d'une partie (les plus récentes en premier, sans doublon) ; renvoie la liste à jour. */
export function addMissed(list: Array<{ prompt: string; center: string; answer: string; morph: string | null }>, now = Date.now()): Missed[] {
  let cur = loadMissed();
  for (const m of list) {
    const i = cur.findIndex((x) => x.prompt === m.prompt && x.center === m.center && x.answer === m.answer);
    const n = i >= 0 ? cur[i].n + 1 : 1;
    if (i >= 0) cur.splice(i, 1);
    cur.unshift({ ...m, n, t: now });
  }
  cur = cur.slice(0, MAX_MISSED);
  write(MISS_KEY, cur);
  return cur;
}

/** Efface la liste des mots à revoir. */
export function clearMissed(): Missed[] {
  write(MISS_KEY, []);
  return [];
}
