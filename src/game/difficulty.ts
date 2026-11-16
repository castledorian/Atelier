import type { Grade } from './grade';

export type Difficulty = 'apprenti' | 'standard' | 'expert' | 'perso';
export type Penalty = 'none' | 'tier' | 'reset';

/** Plafond de vies, identique dans tous les modes : aucune source de vie ne peut le dépasser. */
export const MAX_LIVES = 5;

export const DIFFICULTIES_ORDER: Difficulty[] = ['apprenti', 'standard', 'expert', 'perso'];

export interface DiffConfig {
  label: string;
  tagline: string;

  // Vies
  lives: number;
  maxLives: number;
  /** +1 vie quand une Rature (boss) est effacée */
  bossLife: boolean;

  // Rythme : temps de traversée de l'écran et écart entre deux apparitions (secondes)
  cross: { base: number; decay: number; min: number };
  gap: { start: number; decay: number; min: number };
  countMul: number;
  /** ennemis ajoutés à chaque vague (1,5 = rythme d'origine) */
  growth: number;
  /** nombre minimal d'ennemis à l'écran (vague 1 / ensuite) */
  floor1: number;
  floor: number;
  clusterP: number;

  // Composition des vagues
  tache: (n: number) => [number, number];
  pateFrom: number;
  pateEvery: number;
  pate: (n: number) => [number, number];
  goutteFrom: number;
  goutteBase: number;
  goutteDiv: number;
  goutteMul: number;

  // Boss
  bossBase: number;
  bossDiv: number;
  bossMax: number;
  bossLenOff: number;
  bossDmg: number;
  spitMul: number;
  spitCap: number;

  // Combo
  missPenalty: Penalty;
  breachPenalty: Penalty;

  // Jauge du retour chariot : elle se mérite (mots terminés, précision)
  chargeMax: number;
  chargeLetter: number;
  chargeWord: number;
  chargeMiss: number;

  // Aides à l'apprentissage
  autoTarget: boolean;
  /** nombre de premières vagues réservées aux lettres isolées, rangée par rangée (0 = aucune) */
  letterWaves: number;

  // Séance personnalisée (enseignant)
  /** lettres autorisées (majuscules) ; absent = toutes */
  allowed?: string;
  /** longueur maximale des mots */
  wordMax: number;
}

const BASE: Record<Exclude<Difficulty, 'perso'>, DiffConfig> = {
  apprenti: {
    label: 'Apprenti',
    tagline: 'Je découvre le clavier : lettres une à une, cible automatique, touche à frapper en surbrillance.',
    lives: 5,
    maxLives: MAX_LIVES,
    bossLife: true,
    cross: { base: 22, decay: 0.985, min: 14 },
    gap: { start: 2.6, decay: 0.98, min: 1.4 },
    countMul: 0.6,
    growth: 1.5,
    floor1: 1,
    floor: 1,
    clusterP: 0,
    tache: (n) => [3, Math.min(5, 3 + Math.floor(n / 4))],
    pateFrom: 6,
    pateEvery: 4,
    pate: (n) => [5, Math.min(7, 5 + Math.floor((n - 6) / 3))],
    goutteFrom: 4,
    goutteBase: 1,
    goutteDiv: 4,
    goutteMul: 1,
    bossBase: 2,
    bossDiv: 10,
    bossMax: 4,
    bossLenOff: -2,
    bossDmg: 1,
    spitMul: 1.7,
    spitCap: 2,
    missPenalty: 'none',
    breachPenalty: 'tier',
    chargeMax: 30,
    chargeLetter: 0.4,
    chargeWord: 0.6,
    chargeMiss: 0,
    autoTarget: true,
    letterWaves: 3,
    wordMax: 12,
  },
  standard: {
    label: 'Standard',
    tagline: 'Je tape déjà un peu : l’équilibre d’origine, avec une difficulté qui monte sans à-coups.',
    lives: 3,
    maxLives: MAX_LIVES,
    bossLife: true,
    // progression deux fois plus lente qu'avant : parties plus longues, courbe plus douce
    cross: { base: 16, decay: 0.984, min: 6 },
    gap: { start: 2.4, decay: 0.982, min: 0.7 },
    countMul: 1,
    growth: 0.75,
    floor1: 1,
    floor: 2,
    clusterP: 0.35,
    tache: (n) => [3, Math.min(7, 3 + Math.ceil(n / 4))],
    pateFrom: 3,
    pateEvery: 6,
    pate: (n) => [7, Math.min(12, 8 + Math.floor(n / 6))],
    // les lettres isolées sont le point dur (on cherche la touche du regard) : moins nombreuses et moins rapides
    goutteFrom: 2,
    goutteBase: 1,
    goutteDiv: 4,
    goutteMul: 1.3,
    bossBase: 4,
    bossDiv: 10,
    bossMax: 6,
    bossLenOff: 0,
    bossDmg: 2,
    spitMul: 1,
    spitCap: 4,
    missPenalty: 'tier',
    breachPenalty: 'tier',
    chargeMax: 45,
    chargeLetter: 0.4,
    chargeWord: 0.6,
    chargeMiss: 2.5,
    autoTarget: false,
    letterWaves: 0,
    wordMax: 12,
  },
  expert: {
    label: 'Expert',
    tagline: 'Je tape vite : mots longs, rythme soutenu, la moindre faute casse le combo.',
    lives: 3,
    maxLives: MAX_LIVES,
    bossLife: true,
    cross: { base: 12, decay: 0.95, min: 3.8 },
    gap: { start: 1.6, decay: 0.955, min: 0.45 },
    countMul: 1.15,
    growth: 1.5,
    floor1: 2,
    floor: 3,
    clusterP: 0.55,
    tache: (n) => [4, Math.min(9, 4 + Math.ceil(n / 2))],
    pateFrom: 2,
    pateEvery: 2,
    pate: (n) => [8, Math.min(12, 9 + Math.floor(n / 3))],
    goutteFrom: 1,
    goutteBase: 3,
    goutteDiv: 2,
    goutteMul: 1.7,
    bossBase: 5,
    bossDiv: 8,
    bossMax: 8,
    bossLenOff: 1,
    bossDmg: 2,
    spitMul: 0.8,
    spitCap: 5,
    missPenalty: 'reset',
    breachPenalty: 'reset',
    chargeMax: 55,
    chargeLetter: 0.4,
    chargeWord: 0.6,
    chargeMiss: 4,
    autoTarget: false,
    letterWaves: 0,
    wordMax: 12,
  },
};

// ───────────────────────── Séance personnalisée (enseignant) ─────────────────────────

export type Content = 'mixed' | 'letters' | 'words';

export interface CustomConfig {
  /** vitesse de chute, en % de la vitesse Standard (40–160) */
  speed: number;
  /** vies de départ (1–5) */
  lives: number;
  /** lettres autorisées, minuscules sans accent */
  letters: string;
  /** lettres seules, mots, ou un mélange */
  content: Content;
  /** longueur maximale des mots (3–9) */
  maxLen: number;
  /** cible choisie automatiquement + touche à frapper en surbrillance */
  autoTarget: boolean;
  /** pénalité de combo en cas de faute */
  miss: Penalty;
}

export const ALPHABET = 'abcdefghijklmnopqrstuvwxyz';

export const DEFAULT_CUSTOM: CustomConfig = {
  speed: 100,
  lives: 3,
  letters: ALPHABET,
  content: 'mixed',
  maxLen: 7,
  autoTarget: false,
  miss: 'tier',
};

const clampN = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

/** Remet une configuration inconnue (stockage, lien partagé) dans des valeurs valides. */
export function sanitizeCustom(v: unknown): CustomConfig {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const letters = [...new Set(String(o.letters ?? ALPHABET).toLowerCase())].filter((c) => ALPHABET.includes(c)).sort().join('');
  return {
    speed: Math.round(clampN(num(o.speed, 100), 40, 160) / 10) * 10,
    lives: Math.round(clampN(num(o.lives, 3), 1, MAX_LIVES)),
    letters: letters || ALPHABET,
    content: o.content === 'letters' || o.content === 'words' ? o.content : 'mixed',
    maxLen: Math.round(clampN(num(o.maxLen, 7), 3, 9)),
    autoTarget: o.autoTarget === true,
    miss: o.miss === 'none' || o.miss === 'reset' ? o.miss : 'tier',
  };
}

export function encodeCustom(c: CustomConfig): string {
  return btoa(JSON.stringify(c)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeCustom(code: string): CustomConfig | null {
  try {
    const b64 = code.replace(/-/g, '+').replace(/_/g, '/');
    return sanitizeCustom(JSON.parse(atob(b64 + '==='.slice((b64.length + 3) % 4))));
  } catch {
    return null;
  }
}

export function buildCustomConfig(input: CustomConfig): DiffConfig {
  const c = sanitizeCustom(input);
  const std = BASE.standard;
  const f = c.speed / 100;
  const sf = Math.sqrt(f);
  const only = c.content === 'letters';
  return {
    ...std,
    label: 'Perso',
    tagline: 'Séance réglée par l’enseignant : vitesse, lettres, mots, vies. Sans classement.',
    lives: c.lives,
    maxLives: MAX_LIVES,
    cross: { base: std.cross.base / f, decay: std.cross.decay, min: std.cross.min / f },
    gap: { start: std.gap.start / sf, decay: std.gap.decay, min: std.gap.min / sf },
    floor1: 1,
    floor: f < 0.8 ? 1 : 2,
    tache: () => [Math.min(3, c.maxLen), c.maxLen],
    pateFrom: 999,
    goutteFrom: c.content === 'words' ? 999 : 1,
    goutteBase: only ? 6 : 2,
    goutteDiv: 3,
    goutteMul: 1,
    bossDmg: 1,
    missPenalty: c.miss,
    breachPenalty: c.miss === 'reset' ? 'reset' : 'tier',
    chargeMiss: c.miss === 'none' ? 0 : 2.5,
    autoTarget: c.autoTarget,
    letterWaves: only ? 999 : 0,
    allowed: c.letters.length < ALPHABET.length ? c.letters.toUpperCase() : undefined,
    wordMax: c.maxLen,
  };
}

/**
 * Réglage par classe, appliqué en plus de la difficulté choisie : plus de temps, des mots plus courts
 * et une vie de plus pour les plus jeunes. Le CM1 est le rythme de référence.
 * Valeurs de départ à ajuster d'après les parties réelles.
 */
export interface GradeTune {
  /** multiplie le temps de chute (plus grand = plus lent) */
  cross: number;
  /** multiplie l'écart entre deux apparitions */
  gap: number;
  /** longueur maximale des mots */
  wordMax: number;
  /** vies en plus au départ (jamais plus que le plafond) */
  lives: number;
}

export const GRADE_TUNE: Record<Grade, GradeTune> = {
  cp: { cross: 1.7, gap: 1.5, wordMax: 3, lives: 2 },
  ce1: { cross: 1.5, gap: 1.35, wordMax: 5, lives: 1 },
  ce2: { cross: 1.25, gap: 1.15, wordMax: 7, lives: 0 },
  cm1: { cross: 1, gap: 1, wordMax: 10, lives: 0 },
  cm2: { cross: 0.92, gap: 0.92, wordMax: 12, lives: 0 },
};

/** Configuration d'une difficulté adaptée à la classe de l'élève. */
export function forGrade(cfg: DiffConfig, grade: Grade | null): DiffConfig {
  if (!grade) return cfg;
  const t = GRADE_TUNE[grade];
  return {
    ...cfg,
    lives: Math.min(MAX_LIVES, cfg.lives + t.lives),
    cross: { ...cfg.cross, base: cfg.cross.base * t.cross, min: cfg.cross.min * t.cross },
    gap: { ...cfg.gap, start: cfg.gap.start * t.gap, min: cfg.gap.min * t.gap },
    wordMax: Math.min(cfg.wordMax, t.wordMax),
  };
}

export const DIFFICULTIES: Record<Difficulty, DiffConfig> = { ...BASE, perso: buildCustomConfig(DEFAULT_CUSTOM) };

/** Secondes pour qu'une tache traverse l'écran à la vague n : décroissance continue, sans palier. */
export const crossTime = (c: DiffConfig, n: number) => Math.max(c.cross.min, c.cross.base * Math.pow(c.cross.decay, n));

/** Écart moyen entre deux apparitions à la vague n. */
export const gapBase = (c: DiffConfig, n: number) => Math.max(c.gap.min, c.gap.start * Math.pow(c.gap.decay, n));

export function isDifficulty(v: unknown): v is Difficulty {
  return v === 'apprenti' || v === 'standard' || v === 'expert' || v === 'perso';
}
