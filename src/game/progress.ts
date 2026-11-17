import { RULES } from './encre/rules';
import type { Family, RuleId } from './encre/rules';
import { loadStore, recentFaults, saveStore, stateOf } from './encre/tracker';
import type { RuleStatus, Store } from './encre/tracker';
import type { LetterStats } from './analysis';

/**
 * « Mes progrès » : tout est calculé à partir de données gardées SUR L'APPAREIL de l'élève (localStorage).
 * Rien n'est envoyé : ni prénom, ni résultat. L'élève peut tout effacer depuis la page elle-même.
 */

export type ProgressGame = 'typing' | 'math' | 'spelling' | 'memory';

/** Une partie, résumée : de quoi tracer une tendance sans garder de données personnelles. */
export interface GameLog {
  /** date (ms) */
  t: number;
  /** réponses justes et fausses */
  ok: number;
  err: number;
  score: number;
  /** classement joué (niveau + difficulté) */
  board: string;
  /** Mémoire : la plus longue suite (ou le plus grand nombre de cases) retenue */
  span?: number;
}

export const MAX_LOG = 30;
const LOG_KEY = 'atelier.progress.v1';
const LETTERS_KEY = 'atelier.progress.letters.v1';

type LogStore = Partial<Record<ProgressGame, GameLog[]>>;

function readLogs(): LogStore {
  try {
    const v = JSON.parse(localStorage.getItem(LOG_KEY) ?? 'null');
    return v && typeof v === 'object' ? (v as LogStore) : {};
  } catch {
    return {};
  }
}

const validLog = (e: unknown): e is GameLog => {
  const x = e as GameLog | null;
  return !!x && Number.isFinite(x.t) && Number.isFinite(x.ok) && Number.isFinite(x.err) && Number.isFinite(x.score) && typeof x.board === 'string';
};

export function loadLog(game: ProgressGame): GameLog[] {
  const list = readLogs()[game];
  return Array.isArray(list) ? list.filter(validLog).slice(-MAX_LOG) : [];
}

/** Ajoute une partie (les plus anciennes sont oubliées au-delà de 30). Une partie sans aucune réponse est ignorée. */
export function addLog(game: ProgressGame, entry: GameLog): GameLog[] {
  const list = loadLog(game);
  if (entry.ok + entry.err <= 0) return list;
  const next = [...list, entry].slice(-MAX_LOG);
  const all = readLogs();
  all[game] = next;
  try {
    localStorage.setItem(LOG_KEY, JSON.stringify(all));
  } catch {
    /* stockage refusé : « Mes progrès » est un bonus */
  }
  return next;
}

export function clearLog(game: ProgressGame) {
  const all = readLogs();
  delete all[game];
  try {
    localStorage.setItem(LOG_KEY, JSON.stringify(all));
  } catch {
    /* ignoré */
  }
}

/** Part de réponses justes, de 0 à 100 (0 si rien n'a été répondu). */
export const accuracyOf = (e: Pick<GameLog, 'ok' | 'err'>): number => (e.ok + e.err > 0 ? Math.round((e.ok / (e.ok + e.err)) * 100) : 0);

export type Trend = 'none' | 'up' | 'down' | 'flat';

export interface Summary {
  games: number;
  best: number;
  /** précision moyenne des 5 dernières parties */
  recent: number;
  /** précision moyenne des 5 parties d'avant (-1 s'il n'y en a pas) */
  before: number;
  trend: Trend;
}

const mean = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0);

/** Bilan : meilleure partie, précision récente et sens de l'évolution (au moins 4 parties pour parler de tendance). */
export function summarize(list: readonly GameLog[]): Summary {
  const n = list.length;
  if (n === 0) return { games: 0, best: 0, recent: 0, before: -1, trend: 'none' };
  const acc = list.map(accuracyOf);
  const recent = mean(acc.slice(-5));
  const prev = acc.slice(Math.max(0, n - 10), Math.max(0, n - 5));
  const before = prev.length ? mean(prev) : -1;
  let trend: Trend = 'none';
  if (n >= 4 && before >= 0) trend = recent - before >= 5 ? 'up' : before - recent >= 5 ? 'down' : 'flat';
  return { games: n, best: Math.max(...list.map((e) => e.score)), recent, before, trend };
}

// ───────────────────────── Règles à revoir (calcul, orthographe) ─────────────────────────

export interface FocusRule {
  id: RuleId;
  status: RuleStatus;
  /** fautes sur les dernières parties */
  recent: number;
  total: number;
}

const ORDER: Record<RuleStatus, number> = { 'a-revoir': 0, isolee: 1, progres: 2, acquise: 3, neuve: 4 };

/** Les règles d'une famille, la plus urgente d'abord : à revoir, puis fautes isolées, puis en progrès, puis acquises. */
export function focusRules(store: Store, family: Family): FocusRule[] {
  return RULES.filter((r) => r.family === family)
    .map((r) => ({ id: r.id, status: stateOf(store[r.id]), recent: recentFaults(store[r.id]), total: store[r.id]?.total ?? 0 }))
    .sort((a, b) => ORDER[a.status] - ORDER[b.status] || b.recent - a.recent || b.total - a.total);
}

/** Efface le suivi des règles d'une famille (calcul ou orthographe), sur cet appareil. */
export function clearRules(family: Family) {
  const store = loadStore();
  for (const r of RULES) if (r.family === family) delete store[r.id];
  saveStore(store);
}

// ───────────────────────── Lettres difficiles (Frappe !) ─────────────────────────

/** Au-delà de ce nombre de frappes, les compteurs sont divisés par deux : les progrès récents pèsent plus que les débuts. */
export const LETTERS_CAP = 600;

export function loadLetters(): LetterStats {
  try {
    const v = JSON.parse(localStorage.getItem(LETTERS_KEY) ?? 'null');
    if (!v || typeof v !== 'object') return {};
    const out: LetterStats = {};
    for (const [k, s] of Object.entries(v as Record<string, { ok: number; err: number }>)) {
      if (/^[A-Z]$/.test(k) && s && Number.isFinite(s.ok) && Number.isFinite(s.err)) out[k] = { ok: Math.max(0, s.ok), err: Math.max(0, s.err) };
    }
    return out;
  } catch {
    return {};
  }
}

/** Cumule les lettres d'une partie dans le total de l'appareil. */
export function mergeLetters(total: LetterStats, game: LetterStats): LetterStats {
  const out: LetterStats = {};
  for (const [k, s] of Object.entries(total)) out[k] = { ok: s.ok, err: s.err };
  for (const [raw, s] of Object.entries(game)) {
    const k = raw.toUpperCase();
    if (!/^[A-Z]$/.test(k)) continue;
    const cur = out[k] ?? { ok: 0, err: 0 };
    out[k] = { ok: cur.ok + s.ok, err: cur.err + s.err };
  }
  for (const k of Object.keys(out)) {
    if (out[k].ok + out[k].err > LETTERS_CAP) out[k] = { ok: Math.round(out[k].ok / 2), err: Math.round(out[k].err / 2) };
  }
  return out;
}

export function addLetters(game: LetterStats): LetterStats {
  const next = mergeLetters(loadLetters(), game);
  try {
    localStorage.setItem(LETTERS_KEY, JSON.stringify(next));
  } catch {
    /* ignoré */
  }
  return next;
}

export function clearLetters() {
  try {
    localStorage.removeItem(LETTERS_KEY);
  } catch {
    /* ignoré */
  }
}

export interface LetterRow {
  letter: string;
  ok: number;
  err: number;
  /** taux d'erreur de 0 à 100 */
  rate: number;
}

/** Les lettres les plus ratées (au moins 8 frappes pour parler d'un vrai point faible), les pires d'abord. */
export function hardLetters(stats: LetterStats, max = 6): LetterRow[] {
  return Object.entries(stats)
    .map(([letter, s]) => ({ letter, ok: s.ok, err: s.err, rate: s.ok + s.err > 0 ? Math.round((s.err / (s.ok + s.err)) * 100) : 0 }))
    .filter((r) => r.ok + r.err >= 8 && r.err >= 2)
    .sort((a, b) => b.rate - a.rate || b.err - a.err)
    .slice(0, max);
}
