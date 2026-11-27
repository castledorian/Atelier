import { ANSWER_POINTS, FINISH_BONUS, PAGE_BONUS, speedBonus } from '../scoring';
import type { ItemOutcome } from '../itemstats';
import type { RuleId } from '../encre/rules';
import type { CourseDiff, Level, Missed, Question } from './questions';
import { INK, PAPER_HI, RED } from '../canvas';

/**
 * Moteur de « Course à l'encre » (canvas 2D).
 * Trois colonnes de cahier. Une étiquette portant trois réponses TOMBE du haut : la plume (en bas) doit se placer
 * sous la bonne réponse. On peut VALIDER pour faire tomber l'étiquette tout de suite et gagner un bonus de vitesse.
 * Une mare d'encre aux yeux méchants monte du bas : une erreur la fait bondir, une bonne réponse la fait reculer.
 */

export interface CourseResult {
  level: Level;
  diff: CourseDiff;
  /** par page : calculs posés (a) et erreurs (e) — sert à régler la difficulté */
  pages: Array<{ a: number; e: number }>;
  score: number;
  correct: number;
  wrong: number;
  bestStreak: number;
  /** secondes réellement jouées */
  time: number;
  missed: Missed[];
  /** résultat de chaque calcul de la partie (jamais en entraînement), pour le suivi anonyme des exercices */
  outcomes: ItemOutcome[];
  /** entraînement ciblé terminé sans être rattrapé */
  cleared: boolean;
  drill: boolean;
  /** les 6 pages ont été terminées */
  won: boolean;
  /** dernière page atteinte (1 à 6) */
  page: number;
}

export interface CourseCallbacks {
  onOver: (r: CourseResult) => void;
  /** une Rature revient : la règle qui la dissipe peut s'afficher */
  onSummon?: (rule: RuleId) => void;
}

export interface Gate {
  q: Question;
  choices: number[];
  correct: number;
  y: number;
  speed: number;
  t0: number;
  T: number;
  /** 0 = tombe, 2 = validée (chute rapide), 1 = résolue (animation de sortie) */
  state: 0 | 1 | 2;
  picked: number;
  age: number;
  retry: boolean;
  /** bonus de vitesse obtenu à la validation */
  bonus: number;
}

export interface Part {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  life: number;
  max: number;
  c: number;
}

export interface Txt {
  x: number;
  y: number;
  s: string;
  c: string;
  size: number;
  age: number;
  life: number;
}

export const INK_HI = '#2d2a24';
export const GREEN = '#1f6b3f';
export const GOLD = '#d49a1a';
/** doré foncé pour le texte : lisible sur le papier (contraste ≥ 4,5:1) */
export const GOLD_D = '#8a5a00';
export const F_NUM = '"Courier Prime", "Courier New", monospace';
export const PART_COLORS = [INK, RED, GREEN, GOLD, PAPER_HI];
export const MAX_PARTS = 260;
export const MAX_BONUS = speedBonus(ANSWER_POINTS, 1);
export const SURFACE_STEPS = 18;

export const fmt = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
export const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
export const WIN_BONUS = FINISH_BONUS;
export const PERFECT_PAGE = PAGE_BONUS;

export function backOut(p: number) {
  const s = 1.7;
  const q = p - 1;
  return q * q * ((s + 1) * q + s) + 1;
}

export interface StartOptions {
  /** difficulté (Standard par défaut) */
  diff?: CourseDiff;
  /** entraînement ciblé : on repose ces calculs */
  drill?: Missed[];
  /** Ratures en cours : leurs calculs reviennent de temps en temps (jamais plus fort, seulement plus présents) */
  focus?: RuleId[];
}
