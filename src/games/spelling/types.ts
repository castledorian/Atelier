import type { DuelInfo } from '../../components/EncreNotes';
import type { CourseDiff, Level } from '../../game/course/questions';
import type { RuleId } from '../../game/encre/rules';
import type { ItemOutcome } from '../../game/itemstats';
import type { Item } from '../../game/spelling/engine';

export type Phase = 'menu' | 'play' | 'over';
export type Cloud = 'off' | 'sending' | 'sent' | 'queued';


export interface GameState {
  level: Level;
  diff: CourseDiff;
  duel: { rule: RuleId; items: Item[] } | null;
  active: RuleId[];
  asked: number;
  used: Set<string>;
  lastOk: boolean[];
  score: number;
  streak: number;
  best: number;
  okRounds: number;
  faults: Partial<Record<RuleId, number>>;
  /** phrases ratées, pour le récapitulatif */
  missed: Item[];
  /** résultat de chaque phrase jouée, pour le suivi anonyme des exercices */
  outcomes: ItemOutcome[];
  /** phrases des parties précédentes */
  avoid: Set<string>;
  /** phrases ratées dans les parties précédentes, à revoir */
  retry: string[];
  t0: number;
  /** vies (le duel de l'Encre n'en a pas : maxHp = 0) */
  hp: number;
  maxHp: number;
  /** Apprenti : la première erreur sur un mot juste ne coûte rien */
  freeTap: boolean;
  /** premier combat jamais joué : une flèche montre le mot à toucher */
  tuto: boolean;
  /** dessin de chaque ennemi, dans l'ordre */
  order: number[];
}

/** Déroulé d'une phrase : la créature l'écrit, on touche le mot fautif, on le corrige, puis la manche se termine. */
export type Step = 'write' | 'tap' | 'fix' | 'done';

export interface Round {
  item: Item;
  choices: string[];
  step: Step;
  tapFirst: boolean;
  tries: number;
  hintUsed: boolean;
  tipShown: boolean;
  wrongPicks: string[];
  msg: string;
  /** la réponse a été donnée (deux corrections fausses) */
  revealed: boolean;
  gained: number;
  badTaps: number[];
  /** nombre d'attaques subies pendant la phrase */
  hits: number;
  /** plus de vie : la créature gagne */
  lost: boolean;
}

export interface Over {
  score: number;
  okRounds: number;
  total: number;
  bestStreak: number;
  rank: number;
  record: boolean;
  duel?: DuelInfo;
  top: RuleId | null;
  promoted: RuleId[];
  missed: Item[];
  level: Level;
  diff: CourseDiff;
  /** partie perdue : plus de vie avant la fin */
  dead: boolean;
  /** créatures vaincues */
  defeated: number;
  hpLeft: number;
  maxHp: number;
}
