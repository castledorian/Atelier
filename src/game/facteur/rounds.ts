import { answerPoints, multFor, streakAfterLoss, ANSWER_POINTS } from '../scoring';
import { plain, wordsUpTo } from './words';
import type { FLevel, FWord } from './words';

/**
 * « Le facteur » : des colis (une image) défilent sur le tapis, il faut les ranger dans la bonne boîte aux lettres (un mot).
 *
 * Choix pensés pour le CP (voir le document du projet) :
 *  - aucune vie et aucune pénalité de temps : le colis avance doucement, et s'il arrive au bout il refait un tour ;
 *  - une boîte fausse se grise (on n'a jamais plus de 2 erreurs par colis), et le colis mal rangé REVIENT quelques colis plus tard ;
 *  - chaque mot passe deux fois dans une séance : retrouver plusieurs fois le même mot aide à le mémoriser ;
 *  - les mauvais mots ressemblent au bon (même première lettre, même longueur) : l'enfant doit lire, pas deviner sur l'initiale seule.
 */

export type Rng = () => number;

/** Mots (images) différents par séance, et nombre de colis par mot. */
export const WORDS_PER_SESSION = 8;
export const PARCELS_PER_WORD = 2;
/** Boîtes aux lettres par colis. */
export const CHOICES = 3;
/** Nombre de colis d'une séance sans erreur. */
export const PARCELS = WORDS_PER_SESSION * PARCELS_PER_WORD;
/** Un colis mal rangé revient après ce nombre de colis. */
export const RETURN_AFTER = 3;

/**
 * Durée (s) d'un tour de tapis : le colis avance doucement de gauche à droite pendant que l'enfant lit les trois mots.
 * Rien ne se passe quand il arrive au bout (ni erreur, ni point en moins) : il refait simplement un tour. Le tapis ne sert qu'à donner
 * un rythme calme ; les mots plus longs des niveaux suivants gardent presque autant de temps.
 */
export const TRAVEL_SECONDS: Record<FLevel, number> = { 1: 36, 2: 34, 3: 32, 4: 30 };

const shuffle = <T>(a: T[], rng: Rng): T[] => {
  const b = a.slice();
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
};

/**
 * Les mots de la séance : au moins 60 % du niveau choisi, le reste vient des niveaux précédents (révision).
 * `hasPicture` écarte les mots dont on n'a ni image ni dessin de secours.
 */
export function pickWords(level: FLevel, count: number, rng: Rng, hasPicture: (w: FWord) => boolean = () => true): FWord[] {
  const ok = wordsUpTo(level).filter((x) => !x.tool && hasPicture(x));
  const now = shuffle(ok.filter((x) => x.level === level), rng);
  const before = shuffle(ok.filter((x) => x.level < level), rng);
  const wantNow = Math.min(now.length, Math.max(Math.ceil(count * 0.6), count - before.length));
  const picked = [...now.slice(0, wantNow), ...before.slice(0, count - wantNow)];
  // si le niveau et les précédents ne suffisent pas, on complète avec ce qui reste du niveau
  for (const x of now.slice(wantNow)) if (picked.length < count) picked.push(x);
  return shuffle(picked, rng);
}

/** Les deux mauvais mots : ceux qui ressemblent le plus au bon (première lettre, longueur), avec un peu de hasard. */
export function distractors(target: FWord, pool: FWord[], rng: Rng, n = CHOICES - 1): FWord[] {
  const tp = plain(target.mark);
  const scored = pool
    .filter((c) => plain(c.mark) !== tp)
    .map((c) => {
      const cp = plain(c.mark);
      let s = rng() * 1.5;
      if (cp[0] === tp[0]) s += 2;
      if (Math.abs(cp.length - tp.length) <= 1) s += 1.5;
      if (cp[cp.length - 1] === tp[tp.length - 1]) s += 0.5;
      if (cp === tp + 's' || tp === cp + 's' || cp === tp + 'e' || tp === cp + 'e') s -= 3; // singulier / pluriel : trop piégeux
      return { c, s };
    })
    .sort((a, b) => b.s - a.s);
  const out: FWord[] = [];
  const seen = new Set<string>([tp]);
  for (const { c } of scored) {
    const k = plain(c.mark);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(c);
    if (out.length === n) break;
  }
  return out;
}

export interface Parcel {
  /** numéro du colis dans la séance (sert de clé : le colis ne repart pas du début du tapis après une erreur) */
  id: number;
  word: FWord;
  /** les boîtes aux lettres, dans l'ordre d'affichage */
  choices: FWord[];
  /** boîtes déjà essayées (grisées) */
  tried: boolean[];
}

export interface FResult {
  level: FLevel;
  delivered: number;
  /** colis rangés du premier coup */
  firstTry: number;
  slips: number;
  score: number;
  stars: 1 | 2 | 3;
  /** mots ratés au moins une fois (à revoir) */
  missed: string[];
}

export type Tap = { kind: 'ok'; points: number; first: boolean } | { kind: 'wrong'; hint: boolean } | { kind: 'ignored' };

export const starsFor = (firstTry: number, delivered: number): 1 | 2 | 3 => {
  const r = delivered ? firstTry / delivered : 0;
  return r >= 0.85 ? 3 : r >= 0.6 ? 2 : 1;
};

export class FacteurGame {
  readonly level: FLevel;
  private queue: FWord[];
  private cur: Parcel | null = null;
  private slipsNow = 0;
  private requeued = false;
  private streak = 0;
  private delivered = 0;
  private firstTry = 0;
  private slips = 0;
  private score = 0;
  private missed = new Set<string>();
  private seq = 0;
  readonly total: number;
  private pool: FWord[];
  private rng: Rng;

  constructor(level: FLevel, words: FWord[], pool: FWord[], rng: Rng) {
    this.pool = pool;
    this.rng = rng;
    this.level = level;
    const a = shuffle(words, rng);
    let b = shuffle(words, rng);
    // le premier colis du 2e tour n'est jamais le dernier du 1er
    if (a.length > 1 && b[0] === a[a.length - 1]) b = [...b.slice(1), b[0]];
    this.queue = [...a, ...b];
    this.total = this.queue.length;
    this.next();
  }

  private next() {
    const word = this.queue.shift();
    if (!word) {
      this.cur = null;
      return;
    }
    const mix = shuffle([word, ...distractors(word, this.pool, this.rng)], this.rng);
    this.cur = { id: ++this.seq, word, choices: mix, tried: mix.map(() => false) };
    this.slipsNow = 0;
    this.requeued = false;
  }

  get parcel(): Parcel | null {
    return this.cur;
  }
  get over(): boolean {
    return this.cur === null;
  }
  /** colis restant à ranger (celui en cours compris) */
  get left(): number {
    return this.queue.length + (this.cur ? 1 : 0);
  }
  get mult(): number {
    return multFor(this.streak);
  }
  get points(): number {
    return this.score;
  }

  /** Touche la boîte `i`. */
  tap(i: number): Tap {
    const p = this.cur;
    if (!p || i < 0 || i >= p.choices.length || p.tried[i]) return { kind: 'ignored' };
    if (plain(p.choices[i].mark) === plain(p.word.mark)) {
      const first = this.slipsNow === 0;
      const base = first ? ANSWER_POINTS : this.slipsNow === 1 ? ANSWER_POINTS / 2 : ANSWER_POINTS / 4;
      const points = first ? answerPoints(base, 0, this.mult) : base;
      this.score += points;
      this.delivered++;
      if (first) {
        this.firstTry++;
        this.streak++;
      }
      this.next();
      return { kind: 'ok', points, first };
    }
    p.tried[i] = true;
    this.slipsNow++;
    this.slips++;
    this.missed.add(plain(p.word.mark));
    this.streak = streakAfterLoss(this.streak, 'apprenti');
    if (!this.requeued) {
      this.requeued = true;
      this.queue.splice(Math.min(RETURN_AFTER, this.queue.length), 0, p.word); // il reviendra, avec d'autres mauvais mots
    }
    // après 2 erreurs il ne reste qu'une boîte : elle s'allume
    return { kind: 'wrong', hint: p.tried.filter(Boolean).length >= p.choices.length - 1 };
  }

  get result(): FResult {
    return {
      level: this.level,
      delivered: this.delivered,
      firstTry: this.firstTry,
      slips: this.slips,
      score: this.score,
      stars: starsFor(this.firstTry, this.delivered),
      missed: [...this.missed],
    };
  }
}

/** Raccourci : une séance complète pour un niveau. */
export function newSession(level: FLevel, rng: Rng, hasPicture?: (w: FWord) => boolean): FacteurGame {
  return new FacteurGame(level, pickWords(level, WORDS_PER_SESSION, rng, hasPicture), wordsUpTo(level), rng);
}
