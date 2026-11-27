import { FINISH_BONUS, PAGE_BONUS } from '../scoring';
import type { MemDiff, Mode } from './rounds';
import { INK, PAPER_HI, RED } from '../canvas';

/**
 * Moteur de « Mémoire d'encre » (canvas 2D).
 * Une grille de TACHES D'ENCRE. Au repos, chaque tache est pâle et dort (yeux fermés) ; quand elle doit être retenue,
 * elle se retourne, se réveille, noircit et ouvre des yeux vivants (ils regardent partout, clignent, suivent le doigt).
 * Le joueur refait la suite (La Suite, qui s'allonge d'une tache à chaque réussite) ou retrouve les places (Les Cases).
 */

export interface MemoryResult {
  mode: Mode;
  score: number;
  /** manches réussies */
  correct: number;
  /** manches ratées (une vie perdue chacune) */
  wrong: number;
  /** meilleure série de manches réussies d'affilée */
  bestStreak: number;
  /** plus longue suite (ou plus grand nombre de cases) retenue */
  maxSpan: number;
  /** difficulté jouée */
  diff: MemDiff;
  /** page de départ (0 = début du cahier) */
  startPage: number;
  /** par page : manches jouées (a) et ratées (e) — sert à régler la difficulté */
  pages: Array<{ a: number; e: number }>;
  /** secondes réellement jouées */
  time: number;
  won: boolean;
  /** dernière page atteinte (1 à 6) */
  page: number;
  lives: number;
}

export interface MemoryCallbacks {
  onOver: (r: MemoryResult) => void;
}

export type St = 'banner' | 'show' | 'input' | 'ok' | 'bad';

/** Faces d'une pièce */
export const FRONT = 0;
export const BLOT = 1;
export const OK = 2;
export const BAD = 3;
export const HINT = 4;

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

export interface Ring {
  x: number;
  y: number;
  r: number;
  age: number;
  c: string;
}

export interface Mote {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  a: number;
}

export const INK_HI = '#2d2a24';
export const GREEN = '#1f6b3f';
export const GOLD = '#d49a1a';
export const GOLD_D = '#8a5a00';
export const PART_COLORS = [INK, RED, GREEN, GOLD, PAPER_HI];
export const MAX_PARTS = 200;
export const LEAD = 0.6; // pause avant la première tache de la suite
export const FLIP = 0.22; // durée du réveil / de l'endormissement d'une tache (s)
export const VARIANTS = 6; // formes de taches différentes
/** Teinte du papier : elle change très doucement à chaque page, pour sentir qu'on avance. */
export const TINTS = ['#efe6d2', '#ece8d3', '#e8eadb', '#e6e9e2', '#ebe6e2', '#f2e6cf'];
export const WIN_BONUS = FINISH_BONUS;
export const PERFECT_PAGE = PAGE_BONUS;
export const OK_WORDS = ['Bravo !', 'Bien joué !', 'Super !', 'Excellent !'];

export const fmt = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
export const smooth = (t: number) => t * t * (3 - 2 * t);
export const backOut = (t: number) => 1 + 2.4 * Math.pow(t - 1, 3) + 1.4 * Math.pow(t - 1, 2);

export function heart(c: CanvasRenderingContext2D, x: number, y: number, s: number) {
  c.beginPath();
  c.moveTo(x, y + s * 0.9);
  c.bezierCurveTo(x - s * 1.3, y + s * 0.1, x - s * 0.75, y - s * 0.85, x, y - s * 0.3);
  c.bezierCurveTo(x + s * 0.75, y - s * 0.85, x + s * 1.3, y + s * 0.1, x, y + s * 0.9);
  c.closePath();
}
