import type { Sfx, SfxName } from '../audio';
import {
  MAX_LIVES,
  PAGES,
  PAGE_TITLES,
  PER_PAGE,
  casesShow,
  digitToCell,
  makeCases,
  makeSuite,
  spanOf,
  stageOf,
  suiteStep,
} from './rounds';
import type { Mode } from './rounds';

/**
 * Moteur de « Mémoire d'encre » (canvas 2D).
 * Une grille de PIÈCES de papier. Quand une tache d'encre doit être retenue, la pièce se RETOURNE comme au pile ou face
 * et laisse voir une tache aux yeux vivants (ils regardent partout, clignent, suivent le doigt).
 * Le joueur refait la suite (La Suite) ou retrouve les places des taches (Les Cases).
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
const PAPER = '#efe6d2';
const PAPER_HI = '#faf5e8';
const RED = '#c9341f';
const GREEN = '#1f6b3f';
const GOLD = '#d49a1a';
const GOLD_D = '#8a5a00';
const F_DISP = '"Special Elite", "Courier New", monospace';
const PART_COLORS = [INK, RED, GREEN, GOLD, PAPER_HI];
const MAX_PARTS = 200;
const LEAD = 0.75; // pause avant la première tache de la suite
const FLIP = 0.26; // durée d'un retournement de pièce (s)
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
  private dirty = true;
  private u = 1;
  private compact = false;
  private hudH = 56;
  private qH = 52;
  private gx = 0;
  private gy = 0;
  private gs = 300;

  private shakeOn = true;
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
  private flipTo = new Uint8Array(9); // face vers laquelle on se retourne
  private flipT = new Float32Array(9).fill(-1); // -1 = au repos, sinon 0 → 1
  private land = new Float32Array(9); // petit rebond à l'atterrissage
  private born = new Float32Array(9); // apparition de la grille
  private ph = new Float32Array(9); // phase propre à chaque pièce (yeux, flottement)
  private hold = new Float32Array(9); // pièce retenue face visible un instant après un bon choix
  private mark = new Uint8Array(9); // 0 rien · 1 juste · 2 faux · 3 indice
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

  setOptions(o: { shake?: boolean }) {
    if (o.shake !== undefined) this.shakeOn = o.shake;
  }

  // ───────────────────────── Commandes ─────────────────────────

  start(mode: Mode) {
    this.mode = mode;
    this.run = 'play';
    this.reset();
    this.paused = false;
    this.sfx.play('start');
    this.pageBanner();
    this.dirty = true;
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
    const i = this.tileAt(x, y);
    if (i < 0) return;
    this.cursor = i;
    this.showCursor = false;
    this.tap(i);
  }

  lookAt(x: number, y: number) {
    this.lookX = x;
    this.lookY = y;
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
      page: stageOf(this.n) + 1,
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
    this.maxSpan = 0;
    this.pageLost = 0;
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

  private pageBanner() {
    const p = stageOf(this.n);
    this.st = 'banner';
    this.tt = 0;
    this.bannerText = `PAGE ${p + 1} / ${PAGES}`;
    this.bannerSub = PAGE_TITLES[this.mode][p];
    this.bannerDur = this.first ? 2.0 : 1.7;
  }

  /** Prépare une nouvelle manche (ou rejoue la même après une erreur en mode La Suite). */
  private beginRound(retry = false) {
    this.found.clear();
    this.k = 0;
    this.lastLit = -1;
    if (this.mode === 'suite') {
      this.setGrid(3);
      if (!retry || this.seq.length === 0) this.seq = makeSuite(this.n, Math.random);
      this.targets = [];
      this.rankOf = [];
    } else {
      const r = makeCases(this.n, Math.random);
      this.setGrid(r.size);
      this.targets = r.cells;
      this.seq = [];
      this.showT = casesShow(this.n);
      this.rankOf = new Array(r.size * r.size).fill(-1);
      r.cells.forEach((c, i) => (this.rankOf[c] = i));
    }
    this.st = 'show';
    this.tt = 0;
    this.first = false;
    this.dirty = true;
  }

  private note(i: number) {
    if (this.run === 'play') this.sfx.play(`n${i % 9}` as SfxName);
  }

  private tap(i: number) {
    if (this.st !== 'input') return;
    if (this.mode === 'suite') {
      if (i === this.seq[this.k]) {
        this.hold[i] = 0.42;
        this.note(i);
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
        this.note(i);
        if (this.found.size >= this.targets.length) this.roundOk();
      } else {
        this.bad(i);
      }
    }
    this.dirty = true;
  }

  private roundOk() {
    const span = spanOf(this.mode, this.n);
    this.correct++;
    this.streak++;
    this.best = Math.max(this.best, this.streak);
    this.maxSpan = Math.max(this.maxSpan, span);
    const mult = Math.min(5, 1 + Math.floor((this.streak - 1) / 3));
    const pts = span * 10 * mult;
    this.score += pts;
    this.okWord = OK_WORDS[this.n % OK_WORDS.length];
    this.st = 'ok';
    this.tt = 0;
    this.flash = 0.5;
    this.flashC = GREEN;
    this.sfx.play(this.streak % 3 === 0 ? 'mult' : 'ding');
    this.text(this.W / 2, this.gy + this.gs * 0.5, `+${pts}${mult > 1 ? ` ×${mult}` : ''}`, GREEN, 34);
    // petite vague de joie : toutes les pièces sautillent
    for (let i = 0; i < this.size * this.size; i++) {
      if (this.flipT[i] < 0) this.land[i] = 0.22 + 0.02 * ((i * 7) % 5);
    }
  }

  private bad(i: number) {
    this.wrong++;
    this.streak = 0;
    this.pageLost++;
    this.lives--;
    this.mark[i] = 2;
    if (this.mode === 'suite') {
      this.mark[this.seq[this.k]] = 3;
    } else {
      for (const c of this.targets) if (!this.found.has(c)) this.mark[c] = 3;
    }
    this.flash = 0.7;
    this.flashC = RED;
    this.shake = 7;
    this.sfx.play('error');
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
    if (this.n % PER_PAGE === 0) {
      // page terminée
      const done = this.n / PER_PAGE;
      if (this.pageLost === 0 && this.run === 'play') {
        this.score += PERFECT_PAGE;
        this.text(this.W / 2, this.gy + this.gs * 0.3, `PAGE PARFAITE ! +${PERFECT_PAGE}`, GOLD, 28);
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
    const dt = Math.min(0.05, Math.max(0, ms / 1000));
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
    const b = this.bg;
    b.width = Math.round(W * dpr);
    b.height = Math.round(H * dpr);
    const c = b.getContext('2d')!;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.fillStyle = PAPER;
    c.fillRect(0, 0, W, H);
    c.fillStyle = 'rgba(120,150,180,0.16)';
    for (let y = this.hudH + 34; y < H; y += 34) c.fillRect(0, Math.round(y), W, 1);
    c.fillStyle = 'rgba(201,52,31,0.45)';
    c.fillRect(Math.round(W * 0.06), this.hudH, 2, H);
    c.fillStyle = 'rgba(27,25,21,0.07)';
    c.fillRect(0, 0, W, this.hudH);
    c.fillStyle = INK;
    c.fillRect(0, this.hudH - 2, W, 2);
  }

  /** Dessins prêts à l'emploi des faces de la pièce (recalculés seulement si la taille change). */
  private layoutGrid() {
    if (this.W <= 0) return;
    const R = this.coinR();
    if (Math.abs(R - this.faceR) < 0.5 && this.dpr === this.faceDpr && this.faces.length === 5) return;
    this.faceR = R;
    this.faceDpr = this.dpr;
    const dpr = this.dpr;
    const D = Math.ceil(2 * R * dpr) + 4;
    const mk = (draw: (c: CanvasRenderingContext2D) => void) => {
      const cv = document.createElement('canvas');
      cv.width = D;
      cv.height = D;
      const c = cv.getContext('2d')!;
      c.translate(D / 2, D / 2);
      c.scale(dpr, dpr);
      draw(c);
      return cv;
    };
    const disc = (c: CanvasRenderingContext2D, r: number) => {
      c.beginPath();
      c.arc(0, 0, r, 0, TAU);
    };
    const rimW = Math.max(2.5, R * 0.05);
    const front = mk((c) => {
      const g = c.createRadialGradient(-R * 0.3, -R * 0.35, R * 0.1, 0, 0, R);
      g.addColorStop(0, '#fffaf0');
      g.addColorStop(1, '#eadfc4');
      disc(c, R - rimW / 2);
      c.fillStyle = g;
      c.fill();
      c.strokeStyle = INK;
      c.lineWidth = rimW;
      c.stroke();
      c.strokeStyle = 'rgba(27,25,21,0.26)';
      c.lineWidth = 1.5;
      c.setLineDash([2, 6]);
      disc(c, R * 0.78);
      c.stroke();
      c.setLineDash([]);
      // petite goutte d'encre en filigrane
      c.fillStyle = 'rgba(27,25,21,0.15)';
      c.beginPath();
      c.moveTo(0, -R * 0.36);
      c.bezierCurveTo(R * 0.3, -R * 0.02, R * 0.3, R * 0.32, 0, R * 0.32);
      c.bezierCurveTo(-R * 0.3, R * 0.32, -R * 0.3, -R * 0.02, 0, -R * 0.36);
      c.fill();
      // reflet
      c.strokeStyle = 'rgba(255,255,255,0.75)';
      c.lineWidth = Math.max(2, R * 0.05);
      c.lineCap = 'round';
      c.beginPath();
      c.arc(0, 0, R * 0.62, Math.PI * 1.08, Math.PI * 1.42);
      c.stroke();
    });
    const blotBase = (c: CanvasRenderingContext2D) => {
      const g = c.createRadialGradient(-R * 0.3, -R * 0.35, R * 0.1, 0, 0, R);
      g.addColorStop(0, INK_HI);
      g.addColorStop(1, INK);
      disc(c, R - rimW / 2);
      c.fillStyle = g;
      c.fill();
      c.strokeStyle = INK;
      c.lineWidth = rimW;
      c.stroke();
      c.strokeStyle = 'rgba(250,245,232,0.22)';
      c.lineWidth = 2;
      disc(c, R * 0.86);
      c.stroke();
      // grain d'encre
      c.fillStyle = 'rgba(250,245,232,0.08)';
      for (let k = 0; k < 12; k++) {
        const a = k * 2.399;
        const d = R * (0.5 + 0.38 * ((k * 0.618) % 1));
        c.beginPath();
        c.arc(Math.cos(a) * d, Math.sin(a) * d, R * (0.03 + 0.025 * ((k * 0.37) % 1)), 0, TAU);
        c.fill();
      }
    };
    const blot = mk(blotBase);
    const hint = mk((c) => {
      blotBase(c);
      c.strokeStyle = GOLD;
      c.lineWidth = Math.max(4, R * 0.09);
      disc(c, R - rimW);
      c.stroke();
    });
    const ok = mk((c) => {
      const g = c.createRadialGradient(-R * 0.3, -R * 0.35, R * 0.1, 0, 0, R);
      g.addColorStop(0, '#f0faf3');
      g.addColorStop(1, '#cde7d4');
      disc(c, R - rimW / 2);
      c.fillStyle = g;
      c.fill();
      c.strokeStyle = GREEN;
      c.lineWidth = rimW + 0.5;
      c.stroke();
      c.strokeStyle = GREEN;
      c.lineWidth = R * 0.17;
      c.lineCap = 'round';
      c.lineJoin = 'round';
      c.beginPath();
      c.moveTo(-R * 0.36, R * 0.02);
      c.lineTo(-R * 0.1, R * 0.28);
      c.lineTo(R * 0.38, -R * 0.28);
      c.stroke();
    });
    const bad = mk((c) => {
      const g = c.createRadialGradient(-R * 0.3, -R * 0.35, R * 0.1, 0, 0, R);
      g.addColorStop(0, '#fdeae5');
      g.addColorStop(1, '#f0c4b8');
      disc(c, R - rimW / 2);
      c.fillStyle = g;
      c.fill();
      c.strokeStyle = RED;
      c.lineWidth = rimW + 0.5;
      c.stroke();
      c.strokeStyle = RED;
      c.lineWidth = R * 0.17;
      c.lineCap = 'round';
      c.beginPath();
      c.moveTo(-R * 0.3, -R * 0.3);
      c.lineTo(R * 0.3, R * 0.3);
      c.moveTo(R * 0.3, -R * 0.3);
      c.lineTo(-R * 0.3, R * 0.3);
      c.stroke();
    });
    this.faces = [front, blot, ok, bad, hint];
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
          page: this.won ? PAGES : stageOf(this.n) + 1,
          lives: Math.max(0, this.lives),
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
          this.flipTo[i] = d;
          this.flipT[i] = 0;
        }
      } else {
        const before = this.flipT[i];
        this.flipT[i] += dt / FLIP;
        if (before < 0.5 && this.flipT[i] >= 0.5) this.shown[i] = this.flipTo[i];
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
    if (m === 1) return OK;
    if (m === 3) return HINT;
    if (this.hold[i] > 0) return BLOT;
    if (this.won && this.over) return this.overT > 0.15 + (i % 7) * 0.05 ? OK : FRONT;
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
    const step = suiteStep(this.n);
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
        const step = suiteStep(this.n);
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
      if (this.tt >= (this.run === 'demo' ? 0.8 : 1.1)) {
        if (this.run === 'demo') {
          this.n = (this.n + 1) % 5;
          this.beginRound();
        } else this.nextRound();
      }
    } else if (this.st === 'bad') {
      if (this.over) return;
      if (this.tt >= 1.8) {
        this.mark.fill(0);
        this.beginRound(true);
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
    return this.tileSize() * 0.5 - 1;
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
    if (this.shakeOn && this.shake > 0.5) {
      ox = Math.round(rand(-1, 1) * this.shake);
      oy = Math.round(rand(-1, 1) * this.shake);
    }
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.drawImage(this.bg, 0, 0);
    c.setTransform(dpr, 0, 0, dpr, Math.round(ox * dpr), Math.round(oy * dpr));
    this.drawMotes(c);
    this.drawCoins(c);
    this.drawRings(c);
    this.drawParts(c);
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.drawHud(c);
    this.drawPrompt(c);
    this.drawTexts(c);
    this.drawBanner(c);
    if (this.flash > 0.02) {
      c.globalAlpha = this.flash * 0.18;
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

  private drawCoins(c: CanvasRenderingContext2D) {
    const n = this.size;
    const R = this.coinR();
    const faces = this.faces;
    if (faces.length < 5) return;
    const fw = faces[0].width / this.dpr;
    const playing = this.run === 'play' && !this.over;
    for (let i = 0; i < n * n; i++) {
      const r = this.tileRect(i)!;
      const cx = r.x + r.s / 2;
      let cy = r.y + r.s / 2;
      // apparition de la grille
      const b = this.born[i];
      if (b <= 0) continue;
      const appear = backOut(clamp(b / 0.32, 0, 1));
      const ph = this.ph[i];
      const flipping = this.flipT[i] >= 0;
      const th = flipping ? Math.PI * smooth(clamp(this.flipT[i], 0, 1)) : 0;
      const sinT = Math.sin(th);
      const sx = Math.abs(Math.cos(th));
      const face = this.shown[i];
      const isBlot = face === BLOT || face === HINT;
      // survol / curseur : la pièce se soulève
      const hovered =
        playing &&
        this.st === 'input' &&
        ((this.lookX >= 0 && Math.hypot(this.lookX - cx, this.lookY - cy) < R) || (this.showCursor && i === this.cursor));
      const lift = sinT * R * 0.3 + (hovered ? R * 0.06 : 0);
      const idle = isBlot ? 0 : Math.sin(this.pulse * 1.5 + ph) * 1.4;
      cy += idle;
      // rebond à l'atterrissage (écrasement puis étirement)
      const lk = this.land[i] / 0.22;
      const squash = lk > 0 ? Math.sin(lk * Math.PI) * 0.08 : 0;
      const sc = appear * (1 + sinT * 0.1 + (hovered ? 0.05 : 0));
      const jelly = isBlot && !flipping ? 0.018 * Math.sin(this.pulse * 8 + ph) : 0;
      const rot = isBlot && !flipping ? 0.035 * Math.sin(this.pulse * 4.5 + ph) : 0;

      // ombre au sol
      c.fillStyle = INK;
      c.globalAlpha = (0.2 - 0.08 * sinT) * Math.min(1, appear);
      c.beginPath();
      c.ellipse(cx, r.y + r.s / 2 + R * 0.9 + 2, R * 0.8 * (1 - 0.2 * sinT) * sc, R * 0.2 * sc, 0, 0, TAU);
      c.fill();
      c.globalAlpha = 1;

      c.save();
      c.translate(cx, cy - lift);
      c.rotate(rot);
      c.scale(sc * sx * (1 + squash + jelly), sc * (1 - squash - jelly));
      // tranche de la pièce quand elle est de côté
      if (sinT > 0.05) {
        c.fillStyle = INK;
        c.beginPath();
        c.ellipse(0, 0, R + (R * 0.16 * sinT) / Math.max(sx, 0.08), R, 0, 0, TAU);
        c.fill();
      }
      c.drawImage(faces[face], -fw / 2, -fw / 2, fw, fw);
      if (isBlot && sx > 0.25) this.drawEyes(c, R, ph, cx, cy - lift, face === HINT);
      c.restore();

      // curseur clavier : anneau doré qui tourne
      if (this.showCursor && i === this.cursor && playing) {
        c.strokeStyle = GOLD;
        c.lineWidth = 4;
        c.setLineDash([10, 7]);
        c.lineDashOffset = -this.pulse * 26;
        c.beginPath();
        c.arc(cx, cy - lift, R + 6, 0, TAU);
        c.stroke();
        c.setLineDash([]);
      }
    }
  }

  /** Deux yeux vivants : ils regardent autour d'eux, suivent le doigt, clignent et froncent les sourcils. */
  private drawEyes(c: CanvasRenderingContext2D, R: number, ph: number, wx: number, wy: number, dim: boolean) {
    const er = R * 0.2;
    const t = this.pulse;
    // regard : balade lente + attraction par le doigt / la souris
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
    // clignement
    const bt = (t * 0.85 + ph) % 3.6;
    const blink = bt < 0.14 ? Math.sin((bt / 0.14) * Math.PI) : 0;
    c.globalAlpha = dim ? 0.8 : 1;
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

  /** En-tête sobre : libellé au-dessus d'un grand chiffre, cœurs, progression. */
  private drawHud(c: CanvasRenderingContext2D) {
    const { W, hudH, u } = this;
    c.textBaseline = 'middle';
    if (this.run !== 'play') return;
    const right = W - 62;
    const page = `${Math.min(PAGES, stageOf(this.n) + 1)}/${PAGES}`;
    const label = (txt: string, x: number, y: number, al: CanvasTextAlign) => {
      c.textAlign = al;
      c.font = `${Math.round(clamp(hudH * 0.2, 9, 11))}px ${F_DISP}`;
      c.fillStyle = 'rgba(27,25,21,0.62)';
      c.fillText(txt, x, y);
    };
    const value = (txt: string, x: number, y: number, al: CanvasTextAlign) => {
      c.textAlign = al;
      c.font = `${Math.round(clamp(hudH * 0.4, 16, 24))}px ${F_DISP}`;
      c.fillStyle = INK;
      c.fillText(txt, x, y);
    };
    if (this.compact) {
      c.font = `${Math.round(clamp(hudH * 0.42, 14, 18))}px ${F_DISP}`;
      c.fillStyle = INK;
      c.textAlign = 'left';
      c.fillText(`SCORE ${fmt(this.score)}`, 14, hudH / 2 - 2);
      c.textAlign = 'center';
      c.fillText(`PAGE ${page}`, W / 2, hudH / 2 - 2);
    } else {
      label('SCORE', 14, hudH * 0.28, 'left');
      value(fmt(this.score), 14, hudH * 0.62, 'left');
      label('PAGE', W / 2, hudH * 0.28, 'center');
      value(page, W / 2, hudH * 0.62, 'center');
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
    // progression : une case par page, qui se remplit au fil des manches
    const gap = 4;
    const x0 = 14;
    const x1 = right + 6;
    const bw = (x1 - x0 - gap * (PAGES - 1)) / PAGES;
    const done = this.over && !this.won ? this.n : this.n + (this.st === 'ok' ? 1 : 0);
    for (let i = 0; i < PAGES; i++) {
      const x = x0 + i * (bw + gap);
      const f = clamp((done - i * PER_PAGE) / PER_PAGE, 0, 1);
      c.fillStyle = 'rgba(27,25,21,0.14)';
      c.fillRect(x, hudH - 9, bw, 4);
      if (f > 0) {
        c.fillStyle = f >= 1 ? INK : GOLD;
        c.fillRect(x, hudH - 9, bw * f, 4);
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
    else if (this.st === 'bad') s = this.mode === 'suite' ? 'Réécoute…' : 'Pas de panique !';
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
        filled = clamp(Math.floor((this.tt - LEAD) / suiteStep(this.n)) + 1, 0, total);
        col = GOLD_D;
      }
      const pr = clamp(qH * 0.075, 3.5, 6);
      const sp = pr * 3.3;
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
