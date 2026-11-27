import type { LexDiff, LexLevel, LexWord, Rel } from './rounds';

/**
 * « Mots en orbite » — moteur de jeu (canvas 2D) : un mot au centre, des mots ennemis qui arrivent de toutes les directions.
 * On tape le mot qui répond à la consigne ; une onde de choc détruit alors la vague, le mot central change et tout va un peu plus vite.
 *
 * Mêmes règles de fluidité que le jeu Frappe : pas de temps borné, qualité d'image abaissée automatiquement si l'ordinateur
 * ne suit pas 60 images/s, fonds mis en cache, nombre de particules plafonné, secousses désactivables.
 */

export interface LexResult {
  score: number;
  /** manches gagnées */
  correct: number;
  /** manches perdues (mauvais mot, ou bonne réponse laissée passer) */
  wrong: number;
  /** numéro de la manche atteinte */
  wave: number;
  bestStreak: number;
  time: number;
  rel: Rel;
  level: LexLevel;
  diff: LexDiff;
  /** les manches ratées, pour les revoir à la fin */
  missed: Array<{ prompt: string; center: string; answer: string; morph: string | null }>;
}

export interface LexCallbacks {
  onOver: (r: LexResult) => void;
  /** phrase à lire par un lecteur d'écran (début de manche, résultat) */
  onAnnounce?: (text: string) => void;
}

export type Mode = 'demo' | 'play' | 'over';
/** wait : pause avant l'arrivée de la vague · live : les mots avancent · shock : onde de choc en cours · rest : temps de lecture après une erreur */
export type Phase = 'wait' | 'live' | 'shock' | 'rest';

export interface Enemy {
  w: LexWord;
  /** direction d'arrivée (radians), distance restante au centre, distance de contact */
  a: number;
  d: number;
  d0: number;
  reach: number;
  speed: number;
  delay: number;
  halfW: number;
  sway: number;
  swayF: number;
  phase: number;
  age: number;
  x: number;
  y: number;
  flash: number;
  err: number;
  doomed: boolean;
  dead: boolean;
  pop: number;
}

export interface Part {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  life: number;
  max: number;
  red: boolean;
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
  r: number;
  v: number;
  age: number;
  life: number;
  c: string;
  w: number;
}

export const BLUE = '#2f4f86';
export const GREEN = '#2f6b3a';
export const MAX_PARTS = 520;

export const backOut = (x: number) => 1 + 2.70158 * Math.pow(x - 1, 3) + 1.70158 * Math.pow(x - 1, 2);
