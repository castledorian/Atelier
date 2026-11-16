import type { Sfx, SfxName } from '../audio';
import type { Grade } from '../grade';
import {
  MAX_LIVES,
  PAGES,
  PAGE_TITLES,
  casesShow,
  digitToCell,
  extendSuite,
  makeCases,
  perPage,
  spanOf,
  stageOf,
  suiteLen,
  suiteStep,
  totalOf,
} from './rounds';
import type { Mode } from './rounds';

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

type St = 'banner' | 'show' | 'input' | 'ok' | 'bad';

/** Faces d'une pièce */
const FRONT = 0;
const BLOT = 1;
const OK = 2;
const BAD = 3;
const HINT = 4;

interface Part {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  life: number;
  max: number;
  c: number;
}

interface Txt {
  x: number;
  y: number;
  s: string;
  c: string;
  size: number;
  age: number;
  life: number;
}

interface Ring {
  x: number;
  y: number;
  r: number;
  age: number;
  c: string;
}

interface Mote {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  a: number;
}

const TAU = Math.PI * 2;
const INK = '#1b1915';
const INK_HI = '#2d2a24';
const PAPER_HI = '#faf5e8';
const RED = '#b02a18';
const GREEN = '#1f6b3f';
const GOLD = '#d49a1a';
const GOLD_D = '#8a5a00';
const F_DISP = '"Special Elite", "Courier New", monospace';
const PART_COLORS = [INK, RED, GREEN, GOLD, PAPER_HI];
const MAX_PARTS = 200;
const LEAD = 0.6; // pause avant la première tache de la suite
const FLIP = 0.22; // durée du réveil / de l'endormissement d'une tache (s)
const VARIANTS = 6; // formes de taches différentes
/** Teinte du papier : elle change très doucement à chaque page, pour sentir qu'on avance. */
const TINTS = ['#efe6d2', '#ece8d3', '#e8eadb', '#e6e9e2', '#ebe6e2', '#f2e6cf'];
const WIN_BONUS = 100;
const PERFECT_PAGE = 50;
const OK_WORDS = ['Bravo !', 'Bien joué !', 'Super !', 'Excellent !'];

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const fmt = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
const smooth = (t: number) => t * t * (3 - 2 * t);
const backOut = (t: number) => 1 + 2.4 * Math.pow(t - 1, 3) + 1.4 * Math.pow(t - 1, 2);

function heart(c: CanvasRenderingContext2D, x: number, y: number, s: number) {
  c.beginPath();
  c.moveTo(x, y + s * 0.9);
  c.bezierCurveTo(x - s * 1.3, y + s * 0.1, x - s * 0.75, y - s * 0.85, x, y - s * 0.3);
  c.bezierCurveTo(x + s * 0.75, y - s * 0.85, x + s * 1.3, y + s * 0.1, x, y + s * 0.9);
  c.closePath();
}

export class MemoryGame {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly sfx: Sfx;
  private readonly cb: MemoryCallbacks;
  private readonly bg = document.createElement('canvas');
  private ro: ResizeObserver | null = null;
  private raf = 0;
  private last = 0;

  private W = 0;
  private H = 0;
  private dpr = 1;
  private quality = 2;
  private slowAvg = 16.7;
  private slowFrames = 0;
  private demoStill = false;
  private grade: Grade = 'cm1';
  private dirty = true;
  private u = 1;
  private compact = false;
  private hudH = 56;
  private qH = 52;
  private gx = 0;
  private gy = 0;
  private gs = 300;

  private shakeOn = true;
  private reduced = false;
  private ts = 1;
  private shake = 0;
  private run: 'demo' | 'play' = 'demo';
  private paused = false;
  private mode: Mode = 'suite';

  // état de partie
  private t = 0;
  private n = 0; // manche en cours (0 à 23)
  private lives = MAX_LIVES;
  private score = 0;
  private streak = 0;
  private best = 0;
  private correct = 0;
  private wrong = 0;
  private maxSpan = 0;
  private pageLost = 0;
  private startPage = 0;
  private pageA: number[] = [0, 0, 0, 0, 0, 0];
  private pageE: number[] = [0, 0, 0, 0, 0, 0];
  private record = 0; // meilleure suite déjà réussie sur cet appareil (La Suite)
  private recordShown = false;
  private nearMiss = false;
  private scoreDisp = 0;
  private scorePop = 0;
  private bgStage = -1;
  private over = false;
  private won = false;
  private overT = 0;
  private reported = false;
  private st: St = 'banner';
  private tt = 0;
  private bannerText = '';
  private bannerSub = '';
  private bannerDur = 1.7;
  private first = true;

  // manche
  private size = 3;
  private seq: number[] = [];
  private targets: number[] = [];
  private rankOf: number[] = [];
  private showT = 1.5;
  private k = 0; // suite : prochaine tache attendue
  private found = new Set<number>();
  private lastLit = -1;
  private cursor = 4;
  private showCursor = false;
  private lookT = -99; // dernier moment où le doigt / la souris a bougé
  private lookX = -1;
  private lookY = -1;
  private flash = 0;
  private flashC = RED;
  private okWord = OK_WORDS[0];
  private parts: Part[] = [];
  private texts: Txt[] = [];
  private rings: Ring[] = [];
  private motes: Mote[] = [];
  private pulse = 0;
  private botT = 0;
  private botK = 0;
  private promptKey = '';
  private promptT = 0;

  // pièces
  private shown = new Uint8Array(9); // face actuellement visible
  private flipTo = new Uint8Array(9); // face de départ pendant une transition (fondu)
  private flipT = new Float32Array(9).fill(-1); // -1 = au repos, sinon 0 → 1
  private land = new Float32Array(9); // petit rebond à l'atterrissage
  private born = new Float32Array(9); // apparition de la grille
  private ph = new Float32Array(9); // phase propre à chaque pièce (yeux, flottement)
  private hold = new Float32Array(9); // pièce retenue face visible un instant après un bon choix
  private mark = new Uint8Array(9); // 0 rien · 1 juste · 2 faux · 3 indice
  private gz = { lx: 0, ly: 0, blink: 0 };
  private halo: HTMLCanvasElement | null = null;
  private faces: HTMLCanvasElement[] = [];
  private faceR = 0;
  private faceDpr = 0;

  constructor(canvas: HTMLCanvasElement, sfx: Sfx, cb: MemoryCallbacks) {
    this.canvas = canvas;
    const c = canvas.getContext('2d', { alpha: false });
    if (!c) throw new Error('canvas indisponible');
    this.ctx = c;
    this.sfx = sfx;
    this.cb = cb;
    try {
      this.reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch {
      /* ignoré */
    }
    this.resize();
    if (typeof ResizeObserver !== 'undefined') {
      this.ro = new ResizeObserver(this.resize);
      this.ro.observe(canvas);
    }
    window.addEventListener('resize', this.resize);
    this.startDemo();
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.ro?.disconnect();
    window.removeEventListener('resize', this.resize);
  }

  setOptions(o: { shake?: boolean; best?: number }) {
    if (o.shake !== undefined) this.shakeOn = o.shake;
    if (o.best !== undefined) this.record = Math.max(0, Math.floor(o.best));
  }

  /** Pour les tests automatiques : accélère le temps. */
  debugSpeed(k: number) {
    this.ts = clamp(k, 0.25, 6);
  }

  // ───────────────────────── Commandes ─────────────────────────

  /** `startPage` : on peut repartir du début d'une page déjà terminée (0 à 5), pour jouer à son niveau sans tout refaire. */
  start(mode: Mode, startPage = 0) {
    this.mode = mode;
    this.run = 'play';
    this.reset();
    this.startPage = clamp(Math.floor(startPage), 0, PAGES - 1);
    this.n = this.startPage * perPage(mode);
    this.tintBg();
    this.paused = false;
    this.sfx.play('start');
    this.pageBanner();
    this.dirty = true;
  }

  /** classe de l'élève : règle la cadence et la taille des grilles */
  setGrade(g: Grade) {
    this.grade = g;
  }

  startDemo() {
    this.mode = 'suite';
    this.run = 'demo';
    this.reset();
    this.paused = false;
    this.beginRound();
    this.dirty = true;
  }

  setPaused(p: boolean) {
    if (this.over || this.run !== 'play') return;
    this.paused = p;
    this.dirty = true;
    this.last = performance.now();
  }

  get isPlaying() {
    return this.run === 'play' && !this.over;
  }

  /** Toucher / clic : une pièce est choisie. Coordonnées relatives au canvas. */
  tapAt(x: number, y: number) {
    if (this.run !== 'play' || this.paused || this.over) return;
    this.lookX = x;
    this.lookY = y;
    this.lookT = this.pulse;
    const i = this.tileAt(x, y);
    if (i < 0) return;
    this.cursor = i;
    this.showCursor = false;
    this.tap(i);
  }

  lookAt(x: number, y: number) {
    this.lookX = x;
    this.lookY = y;
    this.lookT = this.pulse;
  }

  /** Clavier : déplace le curseur doré. */
  moveCursor(dx: number, dy: number) {
    if (this.run !== 'play' || this.paused || this.over) return;
    const n = this.size;
    let c = this.cursor % n;
    let r = Math.floor(this.cursor / n);
    c = clamp(c + dx, 0, n - 1);
    r = clamp(r + dy, 0, n - 1);
    this.cursor = r * n + c;
    this.showCursor = true;
    this.dirty = true;
  }

  /** Clavier : choisit la pièce du curseur. */
  confirm() {
    if (this.run !== 'play' || this.paused || this.over) return;
    this.showCursor = true;
    this.tap(this.cursor);
  }

  /** Clavier : un chiffre du pavé numérique (grille 3×3 de La Suite). */
  digit(d: number) {
    if (this.run !== 'play' || this.paused || this.over || this.size !== 3) return;
    const i = digitToCell(d);
    if (i < 0) return;
    this.cursor = i;
    this.showCursor = true;
    this.tap(i);
  }

  /** Centre d'une pièce (coordonnées du canvas) — pour les tests automatiques. */
  tileCenter(i: number) {
    const r = this.tileRect(i);
    return r ? { x: r.x + r.s / 2, y: r.y + r.s / 2 } : null;
  }

  /** Pour les tests automatiques. */
  debug() {
    return {
      st: this.st,
      mode: this.mode,
      run: this.run,
      n: this.n,
      page: stageOf(this.mode, this.n) + 1,
      size: this.size,
      /** cases à toucher, dans l'ordre */
      solution: this.mode === 'suite' ? this.seq.slice(this.k) : this.targets.filter((c) => !this.found.has(c)),
      lives: this.lives,
      score: this.score,
      streak: this.streak,
      over: this.over,
      won: this.won,
      paused: this.paused,
      quality: this.quality,
      record: this.record,
      len: this.seq.length,
    };
  }

  private reset() {
    this.t = 0;
    this.n = 0;
    this.lives = MAX_LIVES;
    this.score = 0;
    this.streak = 0;
    this.best = 0;
    this.correct = 0;
    this.wrong = 0;
    this.pageA = [0, 0, 0, 0, 0, 0];
    this.pageE = [0, 0, 0, 0, 0, 0];
    this.maxSpan = 0;
    this.pageLost = 0;
    this.seq = [];
    this.recordShown = false;
    this.nearMiss = false;
    this.scoreDisp = 0;
    this.scorePop = 0;
    this.over = false;
    this.won = false;
    this.overT = 0;
    this.reported = false;
    this.first = true;
    this.flash = 0;
    this.shake = 0;
    this.parts.length = 0;
    this.texts.length = 0;
    this.rings.length = 0;
    this.found.clear();
    this.cursor = 4;
    this.showCursor = false;
    this.botT = 0;
    this.botK = 0;
    this.promptKey = '';
    this.setGrid(3, true);
    this.tintBg();
  }

  /** (Ré)initialise les pièces. Si la taille ne change pas, elles gardent leur face (elles se retourneront en douceur). */
  private setGrid(size: number, force = false) {
    const len = size * size;
    const changed = this.shown.length !== len || size !== this.size;
    this.size = size;
    if (this.shown.length !== len) {
      this.shown = new Uint8Array(len);
      this.flipTo = new Uint8Array(len);
      this.flipT = new Float32Array(len).fill(-1);
      this.land = new Float32Array(len);
      this.born = new Float32Array(len);
      this.ph = new Float32Array(len);
      this.hold = new Float32Array(len);
      this.mark = new Uint8Array(len);
    }
    if (changed || force) {
      for (let i = 0; i < len; i++) {
        this.ph[i] = rand(0, TAU);
        this.shown[i] = FRONT;
        this.flipT[i] = -1;
        this.land[i] = 0;
        this.born[i] = -0.045 * i; // les pièces apparaissent l'une après l'autre
      }
    }
    this.hold.fill(0);
    this.mark.fill(0);
    if (this.cursor >= len) this.cursor = Math.floor(len / 2);
    this.layoutGrid();
  }

  // ───────────────────────── Déroulement ─────────────────────────

  /** Change la teinte du papier quand on change de page. */
  private tintBg() {
    if (this.W <= 0) return;
    if (stageOf(this.mode, this.n) !== this.bgStage) {
      this.buildBg();
      this.dirty = true;
    }
  }

  private pageBanner() {
    const p = stageOf(this.mode, this.n);
    this.tintBg();
    this.st = 'banner';
    this.tt = 0;
    this.bannerText = this.mode === 'suite' ? `PALIER ${p + 1} / ${PAGES}` : `PAGE ${p + 1} / ${PAGES}`;
    this.bannerSub = PAGE_TITLES[this.mode][p];
    this.bannerDur = this.first ? 1.9 : 1.5;
  }

  /** Prépare une nouvelle manche (ou rejoue la même après une erreur : La Suite garde sa suite, Les Cases en tirent une nouvelle). */
  private beginRound() {
    this.found.clear();
    this.k = 0;
    this.lastLit = -1;
    if (this.mode === 'suite') {
      this.setGrid(3);
      // la suite GARDE son début et gagne une tache de plus à chaque manche réussie
      this.seq = extendSuite(this.seq, suiteLen(this.n), Math.random);
      this.targets = [];
      this.rankOf = [];
    } else {
      const r = makeCases(this.n, Math.random, this.grade);
      this.setGrid(r.size);
      this.targets = r.cells;
      this.seq = [];
      this.showT = casesShow(this.n, this.grade);
      this.rankOf = new Array(r.size * r.size).fill(-1);
      r.cells.forEach((c, i) => (this.rankOf[c] = i));
    }
    this.nearMiss = false;
    this.st = 'show';
    this.tt = 0;
    this.first = false;
    this.dirty = true;
  }

  private note(i: number) {
    if (this.run === 'play') this.sfx.play(`n${i % 9}` as SfxName);
  }

  /** Petite vibration sur téléphone / tablette (retour tactile), désactivée avec les secousses ou si l'appareil demande moins de mouvement. */
  private buzz(pattern: number | number[]) {
    if (!this.shakeOn || this.reduced || this.run !== 'play') return;
    try {
      navigator.vibrate?.(pattern);
    } catch {
      /* ignoré */
    }
  }

  /** Changement de face immédiat (réponse à un toucher) : pas de retournement, la réaction doit être instantanée. */
  private snap(i: number, face: number) {
    if (this.shown[i] === face && this.flipT[i] < 0) return;
    this.shown[i] = face;
    this.flipT[i] = -1;
    this.land[i] = 0.22;
    this.landed(i);
  }

  private tap(i: number) {
    if (this.st !== 'input') return;
    if (this.mode === 'suite') {
      if (i === this.seq[this.k]) {
        this.hold[i] = 0.42;
        this.snap(i, BLOT);
        this.note(i);
        this.buzz(8);
        this.k++;
        if (this.k >= this.seq.length) this.roundOk();
      } else {
        this.bad(i);
      }
    } else {
      if (this.found.has(i)) return;
      if (this.targets.includes(i)) {
        this.found.add(i);
        this.mark[i] = 1;
        this.snap(i, BLOT);
        this.note(i);
        this.buzz(8);
        if (this.found.size >= this.targets.length) this.roundOk();
      } else {
        this.bad(i);
      }
    }
    this.dirty = true;
  }

  private roundOk() {
    const span = spanOf(this.mode, this.n, this.grade);
    this.correct++;
    this.pageA[stageOf(this.mode, this.n)]++;
    this.streak++;
    this.best = Math.max(this.best, this.streak);
    this.maxSpan = Math.max(this.maxSpan, span);
    const mult = Math.min(5, 1 + Math.floor((this.streak - 1) / 3));
    const base = span * 10 * mult;
    // bonus « éclair » : on a répondu avec aisance (récompense la maîtrise, pas le hasard)
    const par = this.mode === 'suite' ? 0.5 + 0.55 * span : 1.4 + 0.9 * span;
    const fast = this.run === 'play' && this.tt < par;
    const bonus = fast ? span * 5 : 0;
    this.score += base + bonus;
    this.scorePop = 1;
    // le mot d'encouragement : on pousse à battre SON propre record (La Suite)
    let word = OK_WORDS[this.n % OK_WORDS.length];
    let newRecord = false;
    if (this.run === 'play' && this.mode === 'suite' && this.record > 0) {
      if (span > this.record && !this.recordShown) {
        this.recordShown = true;
        newRecord = true;
        word = 'Nouveau record !';
      } else if (span === this.record && !this.recordShown) word = 'Record égalé !';
      else if (span + 1 === this.record) word = 'Plus qu’une !';
    }
    if (!newRecord && mult > 1 && this.streak % 3 === 1 && word === OK_WORDS[this.n % OK_WORDS.length]) word = `Série ×${mult} !`;
    this.okWord = word;
    this.st = 'ok';
    this.tt = 0;
    this.flash = 0.5;
    this.flashC = GREEN;
    this.sfx.play(newRecord ? 'clear' : this.streak % 3 === 0 ? 'mult' : 'ding');
    this.text(this.W / 2, this.gy + this.gs * 0.5, `+${base}${mult > 1 ? ` ×${mult}` : ''}`, GREEN, 34);
    if (bonus > 0) this.text(this.W / 2, this.gy + this.gs * 0.74, `ÉCLAIR ! +${bonus}`, GOLD, 22);
    if (newRecord) {
      this.text(this.W / 2, this.gy + this.gs * 0.28, 'NOUVEAU RECORD !', GOLD, 28);
      for (let k = 0; k < 5; k++) this.burst(rand(this.gx, this.gx + this.gs), rand(this.gy, this.gy + this.gs * 0.6), 6, 3);
    }
    // petite vague de joie : toutes les taches sautillent
    for (let i = 0; i < this.size * this.size; i++) {
      if (this.flipT[i] < 0) this.land[i] = 0.22 + 0.02 * ((i * 7) % 5);
    }
  }

  private bad(i: number) {
    this.wrong++;
    this.pageA[stageOf(this.mode, this.n)]++;
    this.pageE[stageOf(this.mode, this.n)]++;
    this.streak = 0;
    this.pageLost++;
    this.lives--;
    // « presque ! » : l'erreur est arrivée tout au bout (on le dit gentiment, ça donne envie de réessayer)
    this.nearMiss =
      this.mode === 'suite'
        ? this.seq.length >= 3 && this.seq.length - this.k <= 1
        : this.targets.length >= 3 && this.targets.length - this.found.size <= 1;
    this.mark[i] = 2;
    this.snap(i, BAD);
    if (this.mode === 'suite') {
      this.mark[this.seq[this.k]] = 3;
    } else {
      for (const c of this.targets) if (!this.found.has(c)) this.mark[c] = 3;
    }
    this.flash = 0.7;
    this.flashC = RED;
    this.shake = 7;
    this.sfx.play('error');
    this.buzz([25, 40, 25]);
    this.st = 'bad';
    this.tt = 0;
    if (this.lives <= 0) {
      this.over = true;
      this.overT = 0;
      this.sfx.play('over');
    }
  }

  private nextRound() {
    this.n++;
    const per = perPage(this.mode);
    if (this.n % per === 0) {
      // page (ou palier) terminé
      const done = this.n / per;
      if (this.pageLost === 0 && this.run === 'play') {
        this.score += PERFECT_PAGE;
        this.scorePop = 1;
        this.text(this.W / 2, this.gy + this.gs * 0.3, `${this.mode === 'suite' ? 'PALIER' : 'PAGE'} PARFAIT${this.mode === 'suite' ? '' : 'E'} ! +${PERFECT_PAGE}`, GOLD, 28);
      }
      if (this.pageLost === 0 && this.lives < MAX_LIVES) {
        this.lives++;
        this.text(this.W / 2, this.gy + this.gs * 0.45, '+1 VIE', RED, 26);
      }
      this.pageLost = 0;
      if (done >= PAGES) {
        this.victory();
        return;
      }
      this.sfx.play('wave');
      this.pageBanner();
      return;
    }
    this.beginRound();
  }

  private victory() {
    if (this.run !== 'play') return;
    const bonus = WIN_BONUS + this.lives * 50;
    this.score += bonus;
    this.won = true;
    this.over = true;
    this.overT = 0;
    this.st = 'banner';
    this.tt = 0;
    this.bannerText = 'CAHIER TERMINÉ !';
    this.bannerSub = `Bonus +${bonus}`;
    this.bannerDur = 2.6;
    this.flash = 0.8;
    this.flashC = GOLD;
    this.sfx.play('clear');
    // toutes les pièces se retournent en cascade
    this.mark.fill(0);
  }

  // ───────────────────────── Boucle ─────────────────────────

  private frame = (now: number) => {
    this.raf = requestAnimationFrame(this.frame);
    const ms = now - this.last;
    const dt = Math.min(0.05, Math.max(0, ms / 1000)) * this.ts;
    this.last = now;
    if (!this.paused) this.watchSpeed(ms);
    if (this.run === 'demo' && this.demoStill) {
      if (this.dirty) this.render();
      return;
    }
    if (this.paused) {
      if (this.dirty) this.render();
      return;
    }
    this.update(dt);
    this.render();
  };

  /** Images trop lentes pendant ~1,5 s → résolution plus basse (jamais remontée pendant la session). */
  private watchSpeed(ms: number) {
    if (ms <= 0 || ms > 200) return;
    this.slowAvg += (ms - this.slowAvg) * 0.05;
    if (this.slowAvg > 21) this.slowFrames++;
    else this.slowFrames = Math.max(0, this.slowFrames - 2);
    if (this.slowFrames < 60) return;
    this.slowFrames = 0;
    this.slowAvg = 16.7;
    if (this.run === 'demo') {
      this.demoStill = true; // le décor du menu est figé plutôt que de ralentir l'écran
      return;
    }
    if (this.quality <= 0.75) return;
    const cur = Math.min(this.quality, window.devicePixelRatio || 1);
    this.quality = cur > 1.5 ? 1.5 : cur > 1 ? 1 : 0.75;
    this.resize();
  }

  private resize = () => {
    const rect = this.canvas.getBoundingClientRect();
    const W = Math.max(240, Math.round(rect.width));
    const H = Math.max(200, Math.round(rect.height));
    const dpr = Math.min(2, this.quality, window.devicePixelRatio || 1);
    if (W === this.W && H === this.H && dpr === this.dpr) return;
    this.W = W;
    this.H = H;
    this.dpr = dpr;
    this.canvas.width = Math.round(W * dpr);
    this.canvas.height = Math.round(H * dpr);
    this.compact = H < 420;
    this.u = clamp(Math.min(W / 640, H / 640), 0.7, 1.2);
    this.hudH = this.compact ? 40 : 56;
    this.qH = this.compact ? 44 : clamp(Math.round(H * 0.095), 52, 66);
    const top = this.hudH + this.qH + 14;
    const side = clamp(Math.min(W - 24, H - top - 14), 120, 620);
    this.gs = side;
    this.gx = Math.round((W - side) / 2);
    this.gy = Math.round(top + Math.max(0, (H - top - 14 - side) / 2));
    // poussière d'encre qui flotte doucement
    this.motes = Array.from({ length: 16 }, () => ({
      x: rand(0, W),
      y: rand(0, H),
      vx: rand(-6, 6),
      vy: rand(-14, -4),
      r: rand(1.5, 4),
      a: rand(0.05, 0.12),
    }));
    this.buildBg();
    this.layoutGrid();
    this.dirty = true;
    this.render();
  };

  private buildBg() {
    const { W, H, dpr } = this;
    const stage = stageOf(this.mode, this.n);
    this.bgStage = stage;
    const b = this.bg;
    b.width = Math.round(W * dpr);
    b.height = Math.round(H * dpr);
    const c = b.getContext('2d')!;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.fillStyle = TINTS[stage];
    c.fillRect(0, 0, W, H);
    // bords du papier un peu plus sombres : le regard est attiré vers la grille, la page est plus reposante
    const v = c.createRadialGradient(W / 2, H * 0.55, Math.min(W, H) * 0.3, W / 2, H * 0.55, Math.max(W, H) * 0.78);
    v.addColorStop(0, 'rgba(140,105,50,0)');
    v.addColorStop(1, 'rgba(140,105,50,0.17)');
    c.fillStyle = v;
    c.fillRect(0, 0, W, H);
    // grain du papier
    for (let k = 0, n = Math.round((W * H) / 1100); k < n; k++) {
      c.fillStyle = k % 2 ? 'rgba(27,25,21,0.04)' : 'rgba(255,255,255,0.06)';
      c.fillRect(rand(0, W), rand(this.hudH, H), 1.5, 1.5);
    }
    c.fillStyle = 'rgba(120,150,180,0.16)';
    for (let y = this.hudH + 34; y < H; y += 34) c.fillRect(0, Math.round(y), W, 1);
    c.fillStyle = 'rgba(201,52,31,0.45)';
    c.fillRect(Math.round(W * 0.06), this.hudH, 2, H);
    c.fillStyle = 'rgba(27,25,21,0.07)';
    c.fillRect(0, 0, W, this.hudH);
    c.fillStyle = INK;
    c.fillRect(0, this.hudH - 2, W, 2);
  }

  /** Dessins prêts à l'emploi des taches (6 formes × 5 faces) et de leur halo d'encre — recalculés seulement si la taille change. */
  private layoutGrid() {
    if (this.W <= 0) return;
    const R = this.coinR();
    if (Math.abs(R - this.faceR) < 0.5 && this.dpr === this.faceDpr && this.faces.length === 6 * VARIANTS) return;
    this.faceR = R;
    this.faceDpr = this.dpr;
    const dpr = this.dpr;
    const D = Math.ceil(2 * R * dpr) + 8;
    const mk = (size: number, draw: (c: CanvasRenderingContext2D) => void) => {
      const cv = document.createElement('canvas');
      cv.width = size;
      cv.height = size;
      const c = cv.getContext('2d')!;
      c.translate(size / 2, size / 2);
      c.scale(dpr, dpr);
      c.lineJoin = 'round';
      draw(c);
      return cv;
    };
    /** Contour d'une tache : un cercle irrégulier, différent pour chaque forme v. */
    const blotPath = (c: CanvasRenderingContext2D, r: number, v: number) => {
      const N = 56;
      c.beginPath();
      for (let k = 0; k <= N; k++) {
        const a = (k / N) * TAU;
        const rr = r * (0.88 + 0.065 * Math.sin(3 * a + v * 1.7) + 0.04 * Math.sin(5 * a + v * 2.9) + 0.025 * Math.sin(2 * a + v * 0.8));
        const x = Math.cos(a) * rr;
        const y = Math.sin(a) * rr;
        if (k === 0) c.moveTo(x, y);
        else c.lineTo(x, y);
      }
      c.closePath();
    };
    const rimW = Math.max(2.5, R * 0.05);
    const grad = (c: CanvasRenderingContext2D, a: string, b: string) => {
      const g = c.createRadialGradient(-R * 0.3, -R * 0.35, R * 0.1, 0, 0, R);
      g.addColorStop(0, a);
      g.addColorStop(1, b);
      return g;
    };
    const faces: HTMLCanvasElement[] = [];
    const make = (draw: (c: CanvasRenderingContext2D, v: number) => void) => {
      for (let v = 0; v < VARIANTS; v++) faces.push(mk(D, (c) => draw(c, v)));
    };
    const ink = (c: CanvasRenderingContext2D, v: number) => {
      blotPath(c, R * 0.97, v);
      c.fillStyle = grad(c, INK_HI, INK);
      c.fill();
      c.strokeStyle = INK;
      c.lineWidth = rimW;
      c.stroke();
      // reflet brillant et grain d'encre
      c.fillStyle = 'rgba(250,245,232,0.17)';
      c.beginPath();
      c.ellipse(-R * 0.4, -R * 0.46, R * 0.27, R * 0.12, -0.65, 0, TAU);
      c.fill();
      c.fillStyle = 'rgba(250,245,232,0.07)';
      for (let k = 0; k < 12; k++) {
        const a = k * 2.399;
        const d = R * (0.45 + 0.38 * ((k * 0.618) % 1));
        c.beginPath();
        c.arc(Math.cos(a) * d, Math.sin(a) * d, R * (0.03 + 0.025 * ((k * 0.37) % 1)), 0, TAU);
        c.fill();
      }
    };
    // 0 · tache pâle qui dort (lavis d'encre séché)
    make((c, v) => {
      blotPath(c, R * 0.97, v);
      c.fillStyle = grad(c, '#fffaf0', '#e4d9bc');
      c.fill();
      c.strokeStyle = 'rgba(27,25,21,0.62)';
      c.lineWidth = rimW;
      c.stroke();
      c.save();
      c.scale(0.74, 0.74);
      blotPath(c, R * 0.97, v);
      c.strokeStyle = 'rgba(27,25,21,0.13)';
      c.lineWidth = 2;
      c.setLineDash([3, 6]);
      c.stroke();
      c.restore();
      c.strokeStyle = 'rgba(255,255,255,0.8)';
      c.lineWidth = Math.max(2, R * 0.05);
      c.lineCap = 'round';
      c.beginPath();
      c.arc(0, 0, R * 0.66, Math.PI * 1.1, Math.PI * 1.4);
      c.stroke();
    });
    // 1 · tache d'encre réveillée
    make((c, v) => ink(c, v));
    // 2 · juste : encre verte et coche
    make((c, v) => {
      blotPath(c, R * 0.97, v);
      c.fillStyle = grad(c, '#f0faf3', '#bfe0c8');
      c.fill();
      c.strokeStyle = GREEN;
      c.lineWidth = rimW + 0.5;
      c.stroke();
      c.lineWidth = R * 0.17;
      c.lineCap = 'round';
      c.beginPath();
      c.moveTo(-R * 0.36, R * 0.02);
      c.lineTo(-R * 0.1, R * 0.28);
      c.lineTo(R * 0.38, -R * 0.28);
      c.stroke();
    });
    // 3 · faux : encre rouge et croix
    make((c, v) => {
      blotPath(c, R * 0.97, v);
      c.fillStyle = grad(c, '#fdeae5', '#f0b9ab');
      c.fill();
      c.strokeStyle = RED;
      c.lineWidth = rimW + 0.5;
      c.stroke();
      c.lineWidth = R * 0.17;
      c.lineCap = 'round';
      c.beginPath();
      c.moveTo(-R * 0.3, -R * 0.3);
      c.lineTo(R * 0.3, R * 0.3);
      c.moveTo(R * 0.3, -R * 0.3);
      c.lineTo(-R * 0.3, R * 0.3);
      c.stroke();
    });
    // 4 · indice : la bonne tache, cerclée d'or
    make((c, v) => {
      ink(c, v);
      blotPath(c, R * 0.97, v);
      c.strokeStyle = GOLD;
      c.lineWidth = Math.max(4, R * 0.09);
      c.stroke();
    });
    // 5 · tache pâle qui dort : yeux fermés dessinés d'avance (rien à dessiner à chaque image)
    make((c, v) => {
      c.save();
      c.scale(1 / dpr, 1 / dpr);
      c.drawImage(faces[v], -D / 2, -D / 2);
      c.restore();
      c.strokeStyle = 'rgba(27,25,21,0.58)';
      c.lineWidth = Math.max(2, R * 0.05);
      c.lineCap = 'round';
      const er = R * 0.17;
      for (const sx of [-1, 1]) {
        c.beginPath();
        c.arc(sx * R * 0.3, -R * 0.03 - er * 0.2, er * 0.95, Math.PI * 0.12, Math.PI * 0.88);
        c.stroke();
      }
    });
    this.faces = faces;
    // halo : l'encre « bave » doucement autour d'une tache réveillée
    const HD = Math.ceil(2 * R * 1.75 * dpr) + 4;
    this.halo = mk(HD, (c) => {
      const g = c.createRadialGradient(0, 0, R * 0.7, 0, 0, R * 1.75);
      g.addColorStop(0, 'rgba(27,25,21,0.3)');
      g.addColorStop(1, 'rgba(27,25,21,0)');
      c.fillStyle = g;
      c.beginPath();
      c.arc(0, 0, R * 1.75, 0, TAU);
      c.fill();
    });
  }

  // ───────────────────────── Mise à jour ─────────────────────────

  private update(dt: number) {
    this.pulse += dt;
    this.promptT += dt;
    this.fx(dt);
    const len = this.size * this.size;

    if (this.over) {
      this.overT += dt;
      if (this.won) this.cheer(dt);
      if (this.overT > (this.won ? 2.8 : 1.4) && !this.reported && this.run === 'play') {
        this.reported = true;
        this.cb.onOver({
          mode: this.mode,
          score: this.score,
          correct: this.correct,
          wrong: this.wrong,
          bestStreak: this.best,
          maxSpan: this.maxSpan,
          time: this.t,
          won: this.won,
          page: this.won ? PAGES : stageOf(this.mode, this.n) + 1,
          lives: Math.max(0, this.lives),
          startPage: this.startPage,
          pages: this.pageA.map((a, i) => ({ a, e: this.pageE[i] })),
        });
      }
    }
    if (this.run === 'play') this.t += dt;
    this.tt += dt;

    // état de la manche
    if (!this.over || this.st === 'bad') this.stepState(dt);

    // pièces : apparition, retournement, rebond
    const litNow = this.litNow();
    for (let i = 0; i < len; i++) {
      if (this.born[i] < 0.4) this.born[i] += dt;
      if (this.hold[i] > 0) this.hold[i] = Math.max(0, this.hold[i] - dt);
      if (this.land[i] > 0) this.land[i] = Math.max(0, this.land[i] - dt);
      if (this.flipT[i] < 0) {
        const d = this.desired(i, litNow);
        if (d !== this.shown[i] && this.born[i] > 0.1) {
          this.flipTo[i] = this.shown[i];
          this.shown[i] = d;
          this.flipT[i] = 0;
        }
      } else {
        this.flipT[i] += dt / FLIP;
        if (this.flipT[i] >= 1) {
          this.flipT[i] = -1;
          this.land[i] = 0.22;
          this.landed(i);
        }
      }
    }
  }

  /** Quelle face doit montrer la pièce i en ce moment ? */
  private desired(i: number, litNow: number): number {
    const m = this.mark[i];
    if (m === 2) return BAD;
    if (m === 1) return BLOT; // case trouvée : la tache d'encre noire apparaît, comme dans La Suite
    if (m === 3) return HINT;
    if (this.hold[i] > 0) return BLOT;
    if (this.won && this.over) return this.overT > 0.15 + (i % 7) * 0.05 ? BLOT : FRONT;
    if (this.st === 'show') {
      if (this.mode === 'suite') return i === litNow ? BLOT : FRONT;
      const r = this.rankOf[i];
      if (r >= 0 && this.tt >= 0.5 + r * 0.06 && this.tt < 0.5 + this.showT + r * 0.06) return BLOT;
    }
    return FRONT;
  }

  /** Pièce allumée dans la suite à cet instant (−1 si aucune). */
  private litNow(): number {
    if (this.st !== 'show' || this.mode !== 'suite') return -1;
    const step = suiteStep(this.n, this.grade);
    const rel = this.tt - LEAD;
    if (rel < 0) return -1;
    const idx = Math.floor(rel / step);
    if (idx >= this.seq.length) return -1;
    return rel - idx * step < step * 0.78 ? this.seq[idx] : -1;
  }

  /** Une pièce vient de se poser : éclaboussure et onde. */
  private landed(i: number) {
    const r = this.tileRect(i);
    if (!r) return;
    const s = this.shown[i];
    const cx = r.x + r.s / 2;
    const cy = r.y + r.s / 2;
    if (s === BLOT || s === OK || s === BAD || s === HINT) {
      this.rings.push({ x: cx, y: cy, r: this.coinR(), age: 0, c: s === BLOT ? INK : s === OK ? GREEN : s === BAD ? RED : GOLD });
      if (this.rings.length > 14) this.rings.shift();
    }
    if (s === BLOT && this.run === 'play') this.burst(cx, cy, 5);
    if (s === OK) this.burst(cx, cy, 7, 2);
    if (s === BAD) this.burst(cx, cy, 6, 1);
  }

  private cheer(dt: number) {
    if (this.overT < 2.2 && Math.random() < dt * 9) {
      const i = Math.floor(rand(0, this.size * this.size));
      const r = this.tileRect(i);
      if (r) this.burst(r.x + r.s / 2, r.y + r.s / 2, 8, 3);
    }
  }

  private stepState(dt: number) {
    if (this.st === 'banner') {
      if (this.over) return;
      if (this.tt >= this.bannerDur) this.beginRound();
    } else if (this.st === 'show') {
      if (this.mode === 'suite') {
        const step = suiteStep(this.n, this.grade);
        const idx = Math.floor((this.tt - LEAD) / step);
        if (idx !== this.lastLit && idx >= 0 && idx < this.seq.length) {
          this.lastLit = idx;
          this.note(this.seq[idx]);
        }
        if (this.tt >= LEAD + this.seq.length * step + 0.35) this.toInput();
      } else {
        if (this.lastLit < 0 && this.tt >= 0.5) {
          this.lastLit = 0;
          this.sfx.play(this.run === 'play' ? 'ready' : 'key');
        }
        if (this.tt >= 0.5 + this.showT + this.targets.length * 0.06 + 0.4) this.toInput();
      }
    } else if (this.st === 'input') {
      if (this.run === 'demo') this.botStep(dt);
    } else if (this.st === 'ok') {
      if (this.tt >= (this.run === 'demo' ? 0.8 : 0.95)) {
        if (this.run === 'demo') {
          this.n = (this.n + 1) % 6;
          this.beginRound();
        } else this.nextRound();
      }
    } else if (this.st === 'bad') {
      if (this.over) return;
      if (this.tt >= 1.7) {
        this.mark.fill(0);
        this.beginRound();
      }
    }
  }

  private toInput() {
    this.st = 'input';
    this.tt = 0;
    this.botT = 0;
    this.botK = 0;
    this.dirty = true;
  }

  /** Mode démonstration (derrière le menu) : un joueur automatique refait la suite, posément. */
  private botStep(dt: number) {
    this.botT += dt;
    if (this.botT < 0.7) return;
    this.botT = 0;
    if (this.botK < this.seq.length) {
      const i = this.seq[this.botK++];
      this.hold[i] = 0.4;
      this.k++;
      if (this.k >= this.seq.length) {
        this.st = 'ok';
        this.tt = 0;
      }
    }
  }

  private fx(dt: number) {
    this.shake = Math.max(0, this.shake - 26 * dt);
    this.flash = Math.max(0, this.flash - dt * 2.2);
    this.scorePop = Math.max(0, this.scorePop - dt * 3.2);
    const sd = this.score - this.scoreDisp;
    this.scoreDisp = Math.abs(sd) < 0.5 ? this.score : this.scoreDisp + sd * Math.min(1, dt * 9);
    const ps = this.parts;
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i];
      p.life -= dt;
      if (p.life <= 0) {
        ps[i] = ps[ps.length - 1];
        ps.pop();
        continue;
      }
      p.vy += 560 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i];
      t.age += dt;
      if (t.age >= t.life) this.texts.splice(i, 1);
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.age += dt;
      if (r.age > 0.5) this.rings.splice(i, 1);
    }
    for (const m of this.motes) {
      m.x += m.vx * dt;
      m.y += m.vy * dt;
      if (m.y < -8) {
        m.y = this.H + 8;
        m.x = rand(0, this.W);
      }
      if (m.x < -8) m.x = this.W + 8;
      if (m.x > this.W + 8) m.x = -8;
    }
  }

  private text(x: number, y: number, s: string, c: string, size: number) {
    if (this.texts.length > 8) this.texts.shift();
    const half = s.length * size * 0.32;
    const cx = half * 2 > this.W - 16 ? this.W / 2 : clamp(x, half + 8, this.W - half - 8);
    this.texts.push({ x: cx, y, s, c: c === GOLD ? GOLD_D : c, size: Math.round(size * this.u), age: 0, life: 1.1 });
  }

  /** Gouttes d'encre qui giclent. */
  private burst(cx: number, cy: number, n: number, color = 0) {
    for (let k = 0; k < n && this.parts.length < MAX_PARTS; k++) {
      const a = rand(0, TAU);
      const sp = rand(70, 270);
      this.parts.push({
        x: cx,
        y: cy,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 130,
        r: rand(2, 4.5) * this.u,
        life: rand(0.4, 0.8),
        max: 0.8,
        c: color || (Math.random() < 0.75 ? 0 : 1 + Math.floor(Math.random() * 3)),
      });
    }
  }

  // ───────────────────────── Géométrie ─────────────────────────

  private gap() {
    return clamp((this.gs / this.size) * 0.1, 5, 14);
  }

  private tileSize() {
    return (this.gs - this.gap() * (this.size - 1)) / this.size;
  }

  private coinR() {
    return this.tileSize() * 0.47;
  }

  private tileRect(i: number): { x: number; y: number; s: number } | null {
    const n = this.size;
    if (i < 0 || i >= n * n) return null;
    const gap = this.gap();
    const s = this.tileSize();
    return { x: this.gx + (i % n) * (s + gap), y: this.gy + Math.floor(i / n) * (s + gap), s };
  }

  private tileAt(x: number, y: number): number {
    const n = this.size;
    const gap = this.gap();
    const s = this.tileSize();
    const pad = gap / 2;
    for (let i = 0; i < n * n; i++) {
      const tx = this.gx + (i % n) * (s + gap);
      const ty = this.gy + Math.floor(i / n) * (s + gap);
      if (x >= tx - pad && x <= tx + s + pad && y >= ty - pad && y <= ty + s + pad) return i;
    }
    return -1;
  }

  // ───────────────────────── Dessin ─────────────────────────

  private render() {
    this.dirty = false;
    const c = this.ctx;
    const { W, H, dpr } = this;
    let ox = 0;
    let oy = 0;
    if (this.shakeOn && !this.reduced && this.shake > 0.5) {
      ox = Math.round(rand(-1, 1) * this.shake);
      oy = Math.round(rand(-1, 1) * this.shake);
    }
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.drawImage(this.bg, 0, 0);
    c.setTransform(dpr, 0, 0, dpr, Math.round(ox * dpr), Math.round(oy * dpr));
    this.drawMotes(c);
    this.drawBlots(c);
    this.drawRings(c);
    this.drawParts(c);
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.drawHud(c);
    this.drawPrompt(c);
    this.drawTexts(c);
    this.drawBanner(c);
    if (this.flash > 0.02) {
      c.globalAlpha = this.flash * (this.reduced ? 0.07 : 0.12);
      c.fillStyle = this.flashC;
      c.fillRect(0, 0, W, H);
      c.globalAlpha = 1;
    }
  }

  private drawMotes(c: CanvasRenderingContext2D) {
    c.fillStyle = INK;
    for (const m of this.motes) {
      c.globalAlpha = m.a;
      c.beginPath();
      c.arc(m.x, m.y, m.r, 0, TAU);
      c.fill();
    }
    c.globalAlpha = 1;
  }

  private drawBlots(c: CanvasRenderingContext2D) {
    const n = this.size;
    const R = this.coinR();
    const faces = this.faces;
    const halo = this.halo;
    if (faces.length < 6 * VARIANTS || !halo) return;
    const fw = faces[0].width / this.dpr;
    const hw = halo.width / this.dpr;
    const playing = this.run === 'play' && !this.over;
    const recent = this.pulse - this.lookT < 1.2;
    for (let i = 0; i < n * n; i++) {
      const r = this.tileRect(i)!;
      const cx = r.x + r.s / 2;
      let cy = r.y + r.s / 2;
      // apparition de la grille : les taches « poussent » l'une après l'autre
      const b = this.born[i];
      if (b <= 0) continue;
      const appear = backOut(clamp(b / 0.32, 0, 1));
      const ph = this.ph[i];
      const flipping = this.flipT[i] >= 0;
      // réveil : fondu de la tache pâle vers l'encre noire (ou l'inverse), avec un petit bond, SANS retournement
      const p = flipping ? smooth(clamp(this.flipT[i], 0, 1)) : 1;
      const bump = flipping ? Math.sin(Math.PI * p) : 0;
      const face = this.shown[i];
      const from = this.flipTo[i];
      const dark = face === BLOT || face === HINT;
      const v = (i * 5 + 2) % VARIANTS;
      // survol : la tache se soulève un peu (seulement tant que la souris ou le doigt bouge, ou au curseur clavier)
      const hovered =
        playing &&
        this.st === 'input' &&
        ((recent && this.lookX >= 0 && Math.hypot(this.lookX - cx, this.lookY - cy) < R) || (this.showCursor && i === this.cursor));
      const lift = bump * R * 0.1 + (hovered ? R * 0.06 : 0);
      cy += dark ? 0 : Math.sin(this.pulse * 1.5 + ph) * 1.4;
      // rebond à l'atterrissage (écrasement puis étirement)
      const lk = this.land[i] / 0.22;
      const squash = lk > 0 ? Math.sin(lk * Math.PI) * 0.1 : 0;
      const jelly = dark && !flipping ? 0.02 * Math.sin(this.pulse * 8 + ph) : 0;
      const sc = appear * (1 + bump * 0.08 + (hovered ? 0.05 : 0));
      const tilt = dark && !flipping ? 0.035 * Math.sin(this.pulse * 4.5 + ph) : 0;
      let y = cy - lift;
      // au repos, on pose la tache sur un pixel entier : l'image est recopiée telle quelle (beaucoup plus rapide sur les vieux ordinateurs)
      const rest = !flipping && !dark && lk <= 0 && appear >= 0.999 && !hovered;
      if (rest) y = Math.round(y * this.dpr) / this.dpr;
      // à quel point la tache est « noire » en ce moment (0 pâle · 1 encre) : ombre et halo suivent
      const fromDark = from === BLOT || from === HINT;
      const ink = flipping ? (dark ? p : 0) + (fromDark ? 1 - p : 0) : dark ? 1 : 0;

      // ombre au sol
      c.fillStyle = INK;
      c.globalAlpha = (0.16 + 0.1 * ink) * Math.min(1, appear);
      c.beginPath();
      c.ellipse(cx, r.y + r.s / 2 + R * 0.92 + 2, R * 0.78 * (1 - 0.1 * bump) * sc, R * 0.2 * sc, 0, 0, TAU);
      c.fill();
      // halo d'encre
      if (ink > 0.01) {
        const hs = hw * sc;
        c.globalAlpha = (0.8 + 0.1 * Math.sin(this.pulse * 3 + ph)) * Math.min(1, appear) * ink;
        c.drawImage(halo, cx - hs / 2, y - hs / 2, hs, hs);
      }
      c.globalAlpha = 1;

      c.save();
      c.translate(rest ? Math.round(cx * this.dpr) / this.dpr : cx, y);
      if (tilt !== 0) c.rotate(tilt);
      c.scale(sc * (1 + squash + jelly), sc * (1 - squash - jelly));
      const spr = (f: number) => faces[(f === FRONT ? 5 : f) * VARIANTS + v];
      if (flipping) {
        c.globalAlpha = 1 - p;
        c.drawImage(spr(from), -fw / 2, -fw / 2, fw, fw);
        c.globalAlpha = p;
        c.drawImage(spr(face), -fw / 2, -fw / 2, fw, fw);
        c.globalAlpha = 1;
        // les yeux s'ouvrent (réveil) ou se ferment (endormissement)
        if (dark) this.drawEyes(c, R, ph, cx, y, face === HINT, p, p);
        else if (fromDark) this.drawEyes(c, R, ph, cx, y, from === HINT, 1 - p, 1 - p);
      } else {
        c.drawImage(spr(face), -fw / 2, -fw / 2, fw, fw);
        if (dark) this.drawEyes(c, R, ph, cx, y, face === HINT, 1, 1);
      }
      c.restore();

      // petites gouttes qui flottent autour d'une tache réveillée, et jaillissent quand elle se pose
      if (face === BLOT && !flipping) {
        c.fillStyle = INK;
        for (let k = 0; k < 3; k++) {
          const a = ph + k * 2.1 + Math.sin(this.pulse * 1.4 + k + ph) * 0.3;
          const d = R * (1.1 + 0.04 * Math.sin(this.pulse * 2.2 + k * 1.7 + ph)) + R * 0.35 * Math.max(0, lk);
          c.beginPath();
          c.arc(cx + Math.cos(a) * d * sc, y + Math.sin(a) * d * sc, R * (0.05 + 0.022 * k) * sc, 0, TAU);
          c.fill();
        }
      }

      // curseur clavier : anneau doré qui tourne
      if (this.showCursor && i === this.cursor && playing) {
        c.strokeStyle = GOLD;
        c.lineWidth = 4;
        c.setLineDash([10, 7]);
        c.lineDashOffset = -this.pulse * 26;
        c.beginPath();
        c.arc(cx, y, R + 6, 0, TAU);
        c.stroke();
        c.setLineDash([]);
      }
    }
  }

  /** Regard d'une tache : balade lente, attiré par le doigt / la souris, avec des clignements. Résultat dans this.gz. */
  private gaze(R: number, ph: number, wx: number, wy: number) {
    const t = this.pulse;
    let lx = Math.sin(t * 1.7 + ph * 3) * 0.55 + Math.sin(t * 0.55 + ph) * 0.35;
    let ly = Math.cos(t * 1.3 + ph * 2) * 0.45;
    if (this.lookX >= 0) {
      const dx = this.lookX - wx;
      const dy = this.lookY - wy;
      const d = Math.hypot(dx, dy) || 1;
      const k = clamp(d / (R * 2.5), 0.4, 1);
      lx = lx * 0.25 + (dx / d) * k;
      ly = ly * 0.25 + (dy / d) * k;
    }
    const bt = (t * 0.85 + ph) % 3.6;
    this.gz.lx = lx;
    this.gz.ly = ly;
    this.gz.blink = bt < 0.14 ? Math.sin((bt / 0.14) * Math.PI) : 0;
  }

  /** Deux yeux vivants : ils regardent autour d'eux, suivent le doigt, clignent et froncent les sourcils. */
  private drawEyes(c: CanvasRenderingContext2D, R: number, ph: number, wx: number, wy: number, dim: boolean, open: number, alpha: number) {
    const er = R * 0.2;
    const t = this.pulse;
    this.gaze(R, ph, wx, wy);
    const { lx, ly } = this.gz;
    const blink = Math.max(this.gz.blink, 1 - open);
    c.globalAlpha = (dim ? 0.8 : 1) * alpha;
    for (const sx of [-1, 1]) {
      const ex = sx * R * 0.3;
      const ey = -R * 0.04;
      c.fillStyle = PAPER_HI;
      c.beginPath();
      c.ellipse(ex, ey, er, Math.max(er * 0.08, er * (1 - 0.92 * blink)), 0, 0, TAU);
      c.fill();
      if (blink < 0.7) {
        c.fillStyle = INK;
        c.beginPath();
        c.arc(ex + lx * er * 0.42, ey + ly * er * 0.42, er * 0.5, 0, TAU);
        c.fill();
        c.fillStyle = PAPER_HI;
        c.beginPath();
        c.arc(ex + lx * er * 0.42 - er * 0.14, ey + ly * er * 0.42 - er * 0.16, er * 0.13, 0, TAU);
        c.fill();
      }
      // sourcil froncé qui bouge un peu
      const tw = Math.sin(t * 3 + ph + sx) * 0.05;
      c.strokeStyle = PAPER_HI;
      c.lineWidth = Math.max(2.5, R * 0.055);
      c.lineCap = 'round';
      c.beginPath();
      c.moveTo(ex + sx * er * 1.05, ey - er * (1.6 + tw));
      c.lineTo(ex - sx * er * 1.0, ey - er * (1.1 - tw));
      c.stroke();
    }
    c.globalAlpha = 1;
  }

  private drawRings(c: CanvasRenderingContext2D) {
    for (const r of this.rings) {
      const p = r.age / 0.5;
      c.globalAlpha = (1 - p) * 0.55;
      c.strokeStyle = r.c;
      c.lineWidth = 3 * (1 - p) + 1;
      c.beginPath();
      c.arc(r.x, r.y, r.r * (0.95 + p * 0.55), 0, TAU);
      c.stroke();
    }
    c.globalAlpha = 1;
  }

  private drawParts(c: CanvasRenderingContext2D) {
    for (const p of this.parts) {
      c.globalAlpha = clamp(p.life / (p.max * 0.5), 0, 1);
      c.fillStyle = PART_COLORS[p.c];
      c.beginPath();
      c.arc(p.x, p.y, p.r, 0, TAU);
      c.fill();
    }
    c.globalAlpha = 1;
  }

  /** En-tête sobre : libellé au-dessus d'un grand chiffre, cœurs, progression vers la page (ou le palier) suivant. */
  private drawHud(c: CanvasRenderingContext2D) {
    const { W, hudH, u } = this;
    c.textBaseline = 'middle';
    if (this.run !== 'play') return;
    const right = W - 62;
    const suite = this.mode === 'suite';
    const per = perPage(this.mode);
    const maxLen = totalOf('suite');
    const page = `${Math.min(PAGES, stageOf(this.mode, this.n) + 1)}/${PAGES}`;
    const len = Math.min(maxLen, this.n + 1);
    const midLabel = suite ? (this.record > 0 ? `SUITE · RECORD ${this.record}` : 'SUITE') : 'PAGE';
    const midValue = suite ? String(len) : page;
    const label = (txt: string, x: number, y: number, al: CanvasTextAlign) => {
      c.textAlign = al;
      c.font = `${Math.round(clamp(hudH * 0.2, 9, 11))}px ${F_DISP}`;
      c.fillStyle = 'rgba(27,25,21,0.62)';
      c.fillText(txt, x, y);
    };
    const value = (txt: string, x: number, y: number, al: CanvasTextAlign, k = 1) => {
      c.textAlign = al;
      c.font = `${Math.round(clamp(hudH * 0.4, 16, 24) * k)}px ${F_DISP}`;
      c.fillStyle = INK;
      c.fillText(txt, x, y);
    };
    const mult = this.streak > 0 ? Math.min(5, 1 + Math.floor((this.streak - 1) / 3)) : 1;
    const scoreTxt = fmt(this.scoreDisp);
    const pop = 1 + 0.2 * this.scorePop;
    if (this.compact) {
      c.font = `${Math.round(clamp(hudH * 0.42, 14, 18) * pop)}px ${F_DISP}`;
      c.fillStyle = INK;
      c.textAlign = 'left';
      c.fillText(`SCORE ${scoreTxt}`, 14, hudH / 2 - 2);
      c.textAlign = 'center';
      c.font = `${Math.round(clamp(hudH * 0.42, 14, 18))}px ${F_DISP}`;
      c.fillText(suite ? `SUITE ${midValue}` : `PAGE ${page}`, W / 2, hudH / 2 - 2);
    } else {
      label('SCORE', 14, hudH * 0.28, 'left');
      value(scoreTxt, 14, hudH * 0.62, 'left', pop);
      label(midLabel, W / 2, hudH * 0.28, 'center');
      value(midValue, W / 2, hudH * 0.62, 'center');
    }
    // série en cours : un badge doré qui bat doucement
    if (mult > 1) {
      c.font = `${Math.round(clamp(hudH * 0.4, 16, 24))}px ${F_DISP}`;
      const bx = 14 + c.measureText(this.compact ? `SCORE ${scoreTxt}` : scoreTxt).width + 12;
      c.font = `${Math.round(clamp(hudH * 0.36, 14, 20) * (1 + 0.08 * Math.sin(this.pulse * 6)))}px ${F_DISP}`;
      c.textAlign = 'left';
      c.fillStyle = GOLD_D;
      c.fillText(`×${mult}`, bx, this.compact ? hudH / 2 - 2 : hudH * 0.62);
    }
    // vies : la dernière bat comme un cœur
    for (let i = 0; i < MAX_LIVES; i++) {
      const beat = this.lives === 1 && i === 0 ? 1 + 0.16 * Math.max(0, Math.sin(this.pulse * 7)) : 1;
      const hs = 8 * u * beat;
      const hx = right - (MAX_LIVES - 1 - i) * (8 * u * 2.7) - 8 * u;
      const hy = this.compact ? hudH / 2 - 2 : hudH * 0.45;
      heart(c, hx, hy, hs);
      if (i < this.lives) {
        c.fillStyle = RED;
        c.fill();
      }
      c.strokeStyle = INK;
      c.lineWidth = 2;
      c.stroke();
    }
    // progression : une case par page, qui se remplit au fil des manches (la dernière manche d'une page fait clignoter la case)
    const gap = 4;
    const x0 = 14;
    const x1 = right + 6;
    const bw = (x1 - x0 - gap * (PAGES - 1)) / PAGES;
    const done = this.over && !this.won ? this.n : this.n + (this.st === 'ok' ? 1 : 0);
    for (let i = 0; i < PAGES; i++) {
      const x = x0 + i * (bw + gap);
      const f = clamp((done - i * per) / per, 0, 1);
      c.fillStyle = 'rgba(27,25,21,0.14)';
      c.fillRect(x, hudH - 9, bw, 4);
      if (f > 0) {
        const last = f < 1 && (1 - f) * per < 1.5;
        c.globalAlpha = last ? 0.65 + 0.35 * Math.sin(this.pulse * 7) : 1;
        c.fillStyle = f >= 1 ? INK : GOLD;
        c.fillRect(x, hudH - 9, bw * f, last ? 5 : 4);
        c.globalAlpha = 1;
      }
    }
    c.textAlign = 'left';
  }

  /** Consigne : grand texte sur le papier (pas de boîte), souligné à la plume, avec des pastilles de progression. */
  private drawPrompt(c: CanvasRenderingContext2D) {
    const { W, qH } = this;
    if (this.run === 'demo') return;
    let s = '';
    if (this.st === 'banner') s = this.first ? 'Prêt ?' : '';
    else if (this.st === 'show') s = 'Regarde bien…';
    else if (this.st === 'input') s = 'À toi !';
    else if (this.st === 'ok') s = this.okWord;
    else if (this.st === 'bad') s = this.nearMiss ? 'Presque\u00a0!' : this.mode === 'suite' ? 'Réécoute…' : 'Pas de panique !';
    if (s !== this.promptKey) {
      this.promptKey = s;
      this.promptT = 0;
    }
    if (!s) return;
    const y0 = this.hudH + 8;
    const fs = Math.round(clamp(qH * 0.46, 20, 32));
    const pop = 1 + 0.22 * Math.max(0, 1 - this.promptT / 0.22);
    const ty = y0 + qH * 0.3;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.font = `${Math.round(fs * pop)}px ${F_DISP}`;
    c.fillStyle = INK;
    c.fillText(s, W / 2, ty);
    // soulignement à la plume qui se dessine
    const tw = c.measureText(s).width;
    const prog = clamp(this.promptT / 0.28, 0, 1);
    c.strokeStyle = this.st === 'bad' ? RED : this.st === 'ok' ? GREEN : GOLD;
    c.lineWidth = 3;
    c.lineCap = 'round';
    c.beginPath();
    const x0 = W / 2 - tw / 2;
    const uy = ty + fs * 0.62;
    for (let x = 0; x <= tw * prog; x += 5) {
      const y = uy + Math.sin(x * 0.18) * 2;
      if (x === 0) c.moveTo(x0 + x, y);
      else c.lineTo(x0 + x, y);
    }
    c.stroke();

    // pastilles : une par tache à retenir
    const total = this.mode === 'suite' ? this.seq.length : this.targets.length;
    if (total > 0 && (this.st === 'show' || this.st === 'input' || this.st === 'ok')) {
      let filled = 0;
      let col = INK;
      if (this.st === 'input') filled = this.mode === 'suite' ? this.k : this.found.size;
      else if (this.st === 'ok') {
        filled = total;
        col = GREEN;
      } else if (this.mode === 'suite') {
        filled = clamp(Math.floor((this.tt - LEAD) / suiteStep(this.n, this.grade)) + 1, 0, total);
        col = GOLD_D;
      }
      const sp = Math.min(clamp(qH * 0.075, 3.5, 6) * 3.3, (W - 48) / total);
      const pr = Math.min(clamp(qH * 0.075, 3.5, 6), sp * 0.38);
      const py = ty + fs * 1.18;
      const x00 = W / 2 - ((total - 1) * sp) / 2;
      for (let i = 0; i < total; i++) {
        const on = i < filled;
        const popK = on && i === filled - 1 ? 1 + 0.35 * Math.max(0, 1 - (this.tt % 0.4) / 0.2) : 1;
        c.beginPath();
        c.arc(x00 + i * sp, py, pr * popK, 0, TAU);
        if (on) {
          c.fillStyle = col;
          c.fill();
        } else {
          c.strokeStyle = 'rgba(27,25,21,0.4)';
          c.lineWidth = 2;
          c.stroke();
        }
      }
      // Les Cases : le temps d'observation fond sous les pastilles
      if (this.st === 'show' && this.mode === 'cases' && this.tt >= 0.5) {
        const p = clamp((this.tt - 0.5) / (this.showT + this.targets.length * 0.06), 0, 1);
        const bw = Math.max(total * sp, 120);
        c.fillStyle = 'rgba(27,25,21,0.14)';
        c.fillRect(W / 2 - bw / 2, py + pr + 5, bw, 3);
        c.fillStyle = GOLD;
        c.fillRect(W / 2 - bw / 2, py + pr + 5, bw * (1 - p), 3);
      }
    }
    c.textAlign = 'left';
  }

  private drawTexts(c: CanvasRenderingContext2D) {
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    for (const t of this.texts) {
      const p = t.age / t.life;
      const pop = p < 0.15 ? 0.6 + (p / 0.15) * 0.5 : 1.1 - Math.min(0.1, (p - 0.15) * 0.3);
      c.globalAlpha = p > 0.7 ? 1 - (p - 0.7) / 0.3 : 1;
      c.font = `${Math.round(t.size * pop)}px ${F_DISP}`;
      const y = t.y - p * 36;
      c.lineWidth = 6;
      c.lineJoin = 'round';
      c.strokeStyle = PAPER_HI;
      c.strokeText(t.s, t.x, y);
      c.fillStyle = t.c;
      c.fillText(t.s, t.x, y);
    }
    c.globalAlpha = 1;
    c.textAlign = 'left';
  }

  private drawBanner(c: CanvasRenderingContext2D) {
    if (this.st !== 'banner' || this.run !== 'play') return;
    if (this.tt > this.bannerDur) return;
    const p = clamp(this.tt / this.bannerDur, 0, 1);
    const a = p < 0.12 ? p / 0.12 : p > 0.78 ? (1 - p) / 0.22 : 1;
    const pop = p < 0.12 ? 0.7 + (p / 0.12) * 0.3 : 1;
    c.globalAlpha = clamp(a, 0, 1);
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.lineJoin = 'round';
    const y = this.gy + this.gs * 0.5;
    let fs = Math.round(Math.min((this.won ? 50 : 38) * this.u, this.W * (this.won ? 0.12 : 0.1)) * pop);
    c.font = `${fs}px ${F_DISP}`;
    while (c.measureText(this.bannerText).width > this.W - 24 && fs > 16) {
      fs -= 2;
      c.font = `${fs}px ${F_DISP}`;
    }
    c.lineWidth = 9;
    c.strokeStyle = PAPER_HI;
    c.strokeText(this.bannerText, this.W / 2, y);
    c.fillStyle = this.won ? GOLD_D : RED;
    c.fillText(this.bannerText, this.W / 2, y);
    if (this.bannerSub) {
      let sf = Math.round(clamp(fs * 0.5, 15, 26));
      c.font = `${sf}px ${F_DISP}`;
      while (c.measureText(this.bannerSub).width > this.W - 28 && sf > 12) {
        sf -= 1;
        c.font = `${sf}px ${F_DISP}`;
      }
      c.lineWidth = 6;
      c.strokeText(this.bannerSub, this.W / 2, y + fs * 0.8);
      c.fillStyle = INK;
      c.fillText(this.bannerSub, this.W / 2, y + fs * 0.8);
    }
    c.globalAlpha = 1;
    c.textAlign = 'left';
  }
}
