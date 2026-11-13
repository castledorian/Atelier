export type Difficulty = 'apprenti' | 'standard' | 'expert';
export type Penalty = 'none' | 'tier' | 'reset';

/** Plafond de vies, identique dans tous les modes : aucune source de vie ne peut le dépasser. */
export const MAX_LIVES = 5;

export const DIFFICULTIES_ORDER: Difficulty[] = ['apprenti', 'standard', 'expert'];

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
}

export const DIFFICULTIES: Record<Difficulty, DiffConfig> = {
  apprenti: {
    label: 'Apprenti',
    tagline: 'Je découvre le clavier : lettres une à une, cible automatique, touche à frapper en surbrillance.',
    lives: 5,
    maxLives: MAX_LIVES,
    bossLife: true,
    cross: { base: 22, decay: 0.985, min: 14 },
    gap: { start: 2.6, decay: 0.98, min: 1.4 },
    countMul: 0.6,
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
  },
  standard: {
    label: 'Standard',
    tagline: 'Je tape déjà un peu : l’équilibre d’origine, avec une difficulté qui monte sans à-coups.',
    lives: 3,
    maxLives: MAX_LIVES,
    bossLife: true,
    cross: { base: 14, decay: 0.965, min: 5.5 },
    gap: { start: 1.8, decay: 0.965, min: 0.6 },
    countMul: 1,
    floor1: 1,
    floor: 2,
    clusterP: 0.45,
    tache: (n) => [3, Math.min(7, 3 + Math.ceil(n / 2))],
    pateFrom: 3,
    pateEvery: 3,
    pate: (n) => [7, Math.min(12, 8 + Math.floor(n / 3))],
    goutteFrom: 2,
    goutteBase: 2,
    goutteDiv: 2,
    goutteMul: 1.55,
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
  },
};

/** Secondes pour qu'une tache traverse l'écran à la vague n : décroissance continue, sans palier. */
export const crossTime = (c: DiffConfig, n: number) => Math.max(c.cross.min, c.cross.base * Math.pow(c.cross.decay, n));

/** Écart moyen entre deux apparitions à la vague n. */
export const gapBase = (c: DiffConfig, n: number) => Math.max(c.gap.min, c.gap.start * Math.pow(c.gap.decay, n));

export function isDifficulty(v: unknown): v is Difficulty {
  return v === 'apprenti' || v === 'standard' || v === 'expert';
}
