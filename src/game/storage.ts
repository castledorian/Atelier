import { DEFAULT_CUSTOM, decodeCustom, isDifficulty, sanitizeCustom } from './difficulty';
import type { CustomConfig, Difficulty } from './difficulty';

export interface ScoreEntry {
  id: string;
  name: string;
  score: number;
  wave: number;
  wpm: number;
  acc: number;
  date: number;
  /** absent sur les anciens scores : ils comptent comme « standard » */
  diff?: Difficulty;
}

export type Layout = 'azerty' | 'qwerty';

export interface Settings {
  sound: boolean;
  shake: boolean;
  /** null = automatique (affiché sur les appareils tactiles) */
  keyboard: boolean | null;
  layout: Layout;
  name: string;
  difficulty: Difficulty;
  /** taille du texte */
  textSize: TextSize;
  /** lecture confortable : lettres plus espacées, interligne large */
  comfort: boolean;
  /** réglages de la séance « Perso » */
  custom: CustomConfig;
}

export type TextSize = 'normal' | 'large' | 'xlarge';

const SCORES_KEY = 'frappe.scores.v1';
const SETTINGS_KEY = 'frappe.settings.v1';
export const MAX_SCORES = 10;

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* stockage indisponible (navigation privée…) : on joue quand même */
  }
}

export const diffOf = (s: ScoreEntry): Difficulty => (isDifficulty(s.diff) ? s.diff : 'standard');

/** Scores d'une difficulté, triés. Chaque difficulté a son propre classement. */
export const scoresFor = (all: ScoreEntry[], d: Difficulty) => all.filter((s) => diffOf(s) === d);

/** Garde les MAX_SCORES meilleurs de chaque difficulté. */
function keepTop(list: ScoreEntry[]): ScoreEntry[] {
  const count: Record<string, number> = {};
  return [...list]
    .sort((a, b) => b.score - a.score)
    .filter((s) => {
      const d = diffOf(s);
      count[d] = (count[d] ?? 0) + 1;
      return count[d] <= MAX_SCORES;
    });
}

export function loadScores(): ScoreEntry[] {
  const list = read<ScoreEntry[]>(SCORES_KEY);
  if (!Array.isArray(list)) return [];
  return keepTop(list.filter((s) => s && typeof s.score === 'number' && typeof s.name === 'string'));
}

export function addScore(entry: Omit<ScoreEntry, 'id' | 'date'> & { diff: Difficulty }): {
  scores: ScoreEntry[];
  id: string | null;
  rank: number;
} {
  const scores = loadScores();
  if (entry.score <= 0) return { scores, id: null, rank: -1 };
  const full: ScoreEntry = {
    ...entry,
    id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    date: Date.now(),
  };
  const kept = keepTop([...scores, full]);
  write(SCORES_KEY, kept);
  const mine = scoresFor(kept, entry.diff);
  const rank = mine.findIndex((s) => s.id === full.id);
  return { scores: kept, id: rank >= 0 ? full.id : null, rank };
}

export function renameScore(id: string, name: string): ScoreEntry[] {
  const scores = loadScores().map((s) => (s.id === id ? { ...s, name } : s));
  write(SCORES_KEY, scores);
  return scores;
}

/** Efface le classement d'une difficulté (les autres sont conservés). */
export function clearScores(diff: Difficulty): ScoreEntry[] {
  const kept = loadScores().filter((s) => diffOf(s) !== diff);
  write(SCORES_KEY, kept);
  return kept;
}

/** Ancien lien d'enseignant : #c=… (séance « Perso ») reste accepté. */
export function settingsFromLink(s: Settings): Settings {
  if (typeof window === 'undefined') return s;
  const p = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const code = p.get('c');
  const c = code ? decodeCustom(code) : null;
  return c ? { ...s, difficulty: 'perso', custom: c } : s;
}

export function loadSettings(): Settings {
  const reduced =
    typeof window !== 'undefined' &&
    !!window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const base: Settings = {
    sound: true,
    shake: !reduced,
    keyboard: null,
    layout: 'azerty',
    name: '',
    difficulty: 'standard',
    textSize: 'normal',
    comfort: false,
    custom: DEFAULT_CUSTOM,
  };
  const saved = read<Partial<Settings>>(SETTINGS_KEY);
  if (!saved || typeof saved !== 'object') return base;
  return {
    sound: typeof saved.sound === 'boolean' ? saved.sound : base.sound,
    shake: typeof saved.shake === 'boolean' ? saved.shake : base.shake,
    keyboard: typeof saved.keyboard === 'boolean' ? saved.keyboard : null,
    layout: saved.layout === 'qwerty' ? 'qwerty' : 'azerty',
    name: typeof saved.name === 'string' ? saved.name.slice(0, 12) : '',
    difficulty: isDifficulty(saved.difficulty) ? saved.difficulty : 'standard',
    textSize: saved.textSize === 'large' || saved.textSize === 'xlarge' ? saved.textSize : 'normal',
    comfort: saved.comfort === true,
    custom: sanitizeCustom(saved.custom),
  };
}

export function saveSettings(s: Settings) {
  write(SETTINGS_KEY, s);
}
