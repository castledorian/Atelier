import type { LetterStats } from '../analysis';

export interface RunStats {
  score: number;
  wave: number;
  kills: number;
  correct: number;
  errors: number;
  accuracy: number;
  wpm: number;
  maxCombo: number;
  time: number;
  /** touches justes et fautes par lettre attendue */
  letters: LetterStats;
}

export interface GameCallbacks {
  onGameOver: (stats: RunStats) => void;
  /** Prochaine lettre attendue sur la cible verrouillée (pour le clavier tactile). */
  onHint: (next: string | null) => void;
  onCharge: (ready: boolean) => void;
}

export type Kind = 'tache' | 'goutte' | 'pate' | 'boss';
export type Mode = 'demo' | 'play' | 'over';

export interface Enemy {
  kind: Kind;
  word: string;
  typed: number;
  queue: string[];
  total: number;
  x: number;
  y: number;
  bx: number;
  vx: number;
  speed: number;
  kick: number;
  swayA: number;
  swayF: number;
  phase: number;
  r: number;
  r0: number;
  seed: number;
  age: number;
  squash: number;
  flash: number;
  err: number;
  doomed: boolean;
  doomT: number;
  dead: boolean;
  swept: boolean;
  bonus: number;
  spit: number;
  dmg: number;
}

export interface Shot {
  e: Enemy;
  ch: string;
  t: number;
  final: boolean;
  stage: boolean;
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
  x: number;
  y: number;
  r: number;
  age: number;
  life: number;
  c: string;
}

export const COMBO_STEP = 15;
export const MAX_PARTS = 520;
export const FLAVOR = [
  'Gardez la cadence',
  'Encore plus d’encre',
  'Ça coule de partout',
  'Pas de fautes de frappe',
  'La page se remplit',
  'Plus vite, dactylo',
];

export const byY = (a: Enemy, b: Enemy) => a.y - b.y;
export const multFor = (combo: number) => Math.min(6, 1 + Math.floor(combo / COMBO_STEP));
export const fmt = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

export function backOut(p: number) {
  const s = 1.9;
  const q = p - 1;
  return q * q * ((s + 1) * q + s) + 1;
}
