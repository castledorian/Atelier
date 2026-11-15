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
 * Une grille d'étiquettes de papier. Des taches d'encre aux yeux (comme dans « Frappe ! ») s'y allument :
 * le joueur doit refaire la suite (La Suite) ou retrouver leurs places (Les Cases).
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

const TAU = Math.PI * 2;
const INK = '#1b1915';
const PAPER = '#efe6d2';
const PAPER_HI = '#faf5e8';
const RED = '#c9341f';
const GREEN = '#1f6b3f';
const GOLD = '#d49a1a';
const GOLD_D = '#8a5a00';
const F_DISP = '"Special Elite", "Courier New", monospace';
const F_NUM = '"Courier Prime", "Courier New", monospace';
const PART_COLORS = [INK, RED, GREEN, GOLD, PAPER_HI];
const MAX_PARTS = 200;
const LEAD = 0.75; // pause avant la première tache de la suite
const WIN_BONUS = 100;
const PERFECT_PAGE = 50;
const OK_WORDS = ['Bravo !', 'Bien joué !', 'Super !', 'Excellent !'];

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const fmt = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

function rr(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  r = Math.min(r, w / 2, h / 2);
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

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
  private showT = 1.5;
  private k = 0; // suite : prochaine tache attendue
  private found = new Set<number>();
  private lastLit = -1;
  private litAmt: Float32Array = new Float32Array(9);
  private hold: Float32Array = new Float32Array(9);
  private mark: Uint8Array = new Uint8Array(9); // 0 rien · 1 juste · 2 faux · 3 indice
  private cursor = 4;
  private showCursor = false;
  private lookX = 0;
  private lookY = 0;
  private flash = 0;
  private flashC = RED;
  private okWord = OK_WORDS[0];
  private parts: Part[] = [];
  private texts: Txt[] = [];
  private pulse = 0;
  private botT = 0;
  private botK = 0;

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

  /** Toucher / clic : une étiquette est choisie. Coordonnées relatives au canvas. */
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

  /** Clavier : choisit l'étiquette du curseur. */
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

  /** Centre d'une étiquette (coordonnées du canvas) — pour les tests automatiques. */
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
    this.found.clear();
    this.cursor = 4;
    this.showCursor = false;
    this.botT = 0;
    this.botK = 0;
    this.setGrid(3);
  }

  private setGrid(size: number) {
    this.size = size;
    const len = size * size;
    if (this.litAmt.length !== len) {
      this.litAmt = new Float32Array(len);
      this.hold = new Float32Array(len);
      this.mark = new Uint8Array(len);
    } else {
      this.litAmt.fill(0);
      this.hold.fill(0);
      this.mark.fill(0);
    }
    if (this.cursor >= len) this.cursor = Math.floor(len / 2);
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
    } else {
      const r = makeCases(this.n, Math.random);
      this.setGrid(r.size);
      this.targets = r.cells;
      this.seq = [];
      this.showT = casesShow(this.n);
    }
    this.hold.fill(0);
    this.mark.fill(0);
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
        this.hold[i] = 0.32;
        this.note(i);
        this.burst(i, 6);
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
        this.burst(i, 6);
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
    const cy = this.gy + this.gs * 0.5;
    this.text(this.W / 2, cy, `+${pts}${mult > 1 ? ` ×${mult}` : ''}`, GREEN, 34);
    for (let i = 0; i < 3; i++) this.burst(Math.floor(rand(0, this.size * this.size)), 4);
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
    for (let k = 0; k < 6; k++) this.burst(Math.floor(rand(0, this.size * this.size)), 10);
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
    this.qH = this.compact ? 40 : clamp(Math.round(H * 0.085), 46, 60);
    const top = this.hudH + this.qH + 16;
    const side = clamp(Math.min(W - 24, H - top - 14), 120, 620);
    this.gs = side;
    this.gx = Math.round((W - side) / 2);
    this.gy = Math.round(top + Math.max(0, (H - top - 14 - side) / 2));
    this.buildBg();
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

  // ───────────────────────── Mise à jour ─────────────────────────

  private update(dt: number) {
    this.pulse += dt;
    this.fx(dt);
    const len = this.size * this.size;

    if (this.over) {
      this.overT += dt;
      if (this.won && this.overT < 2.2 && Math.random() < dt * 8) this.burst(Math.floor(rand(0, len)), 8);
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

    // lueur des étiquettes : suit la cible avec un peu d'élan
    const want = this.wantLit();
    for (let i = 0; i < len; i++) {
      if (this.hold[i] > 0) this.hold[i] = Math.max(0, this.hold[i] - dt);
      const w = Math.max(want[i], this.hold[i] > 0 ? 1 : 0);
      this.litAmt[i] += (w - this.litAmt[i]) * (1 - Math.exp(-dt * 24));
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
        if (this.tt >= LEAD + this.seq.length * step + 0.2) this.toInput();
      } else {
        if (this.lastLit < 0 && this.tt >= 0.5) {
          this.lastLit = 0;
          this.sfx.play(this.run === 'play' ? 'ready' : 'key');
        }
        if (this.tt >= 0.5 + this.showT + 0.25) this.toInput();
      }
    } else if (this.st === 'input') {
      if (this.run === 'demo') this.botStep(dt);
    } else if (this.st === 'ok') {
      if (this.tt >= (this.run === 'demo' ? 0.7 : 0.95)) {
        if (this.run === 'demo') {
          this.n = (this.n + 1) % 5;
          this.beginRound();
        } else this.nextRound();
      }
    } else if (this.st === 'bad') {
      if (this.over) return;
      if (this.tt >= 1.7) {
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
    if (this.botT < 0.65) return;
    this.botT = 0;
    if (this.botK < this.seq.length) {
      const i = this.seq[this.botK++];
      this.hold[i] = 0.3;
      this.k++;
      if (this.k >= this.seq.length) {
        this.st = 'ok';
        this.tt = 0;
      }
    }
  }

  /** Quelles étiquettes doivent briller en ce moment ? */
  private wantLit(): Float32Array {
    const w = this.tmp(this.size * this.size);
    if (this.st === 'show') {
      if (this.mode === 'suite') {
        const step = suiteStep(this.n);
        const rel = this.tt - LEAD;
        const idx = Math.floor(rel / step);
        if (rel >= 0 && idx < this.seq.length && rel - idx * step < step * 0.62) w[this.seq[idx]] = 1;
      } else if (this.tt >= 0.5 && this.tt < 0.5 + this.showT) {
        for (const c of this.targets) w[c] = 1;
      }
    } else if (this.st === 'bad') {
      if (this.mode === 'cases') for (const c of this.targets) if (!this.found.has(c)) w[c] = 0.55;
    }
    return w;
  }

  private scratch = new Float32Array(36);
  private tmp(n: number) {
    this.scratch.fill(0);
    return this.scratch.subarray(0, n);
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
  }

  private text(x: number, y: number, s: string, c: string, size: number) {
    if (this.texts.length > 8) this.texts.shift();
    const half = s.length * size * 0.32;
    const cx = half * 2 > this.W - 16 ? this.W / 2 : clamp(x, half + 8, this.W - half - 8);
    this.texts.push({ x: cx, y, s, c: c === GOLD ? GOLD_D : c, size: Math.round(size * this.u), age: 0, life: 1.1 });
  }

  /** Gouttes d'encre qui giclent d'une étiquette. */
  private burst(i: number, n: number) {
    const r = this.tileRect(i);
    if (!r) return;
    const cx = r.x + r.s / 2;
    const cy = r.y + r.s / 2;
    for (let k = 0; k < n && this.parts.length < MAX_PARTS; k++) {
      const a = rand(0, TAU);
      const sp = rand(60, 260);
      this.parts.push({
        x: cx,
        y: cy,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 120,
        r: rand(2, 4.5) * this.u,
        life: rand(0.4, 0.8),
        max: 0.8,
        c: Math.random() < 0.7 ? 0 : 1 + Math.floor(Math.random() * 3),
      });
    }
  }

  // ───────────────────────── Géométrie ─────────────────────────

  private gap() {
    return clamp((this.gs / this.size) * 0.1, 5, 14);
  }

  private tileRect(i: number): { x: number; y: number; s: number } | null {
    const n = this.size;
    if (i < 0 || i >= n * n) return null;
    const gap = this.gap();
    const s = (this.gs - gap * (n - 1)) / n;
    return { x: this.gx + (i % n) * (s + gap), y: this.gy + Math.floor(i / n) * (s + gap), s };
  }

  private tileAt(x: number, y: number): number {
    const n = this.size;
    const gap = this.gap();
    const s = (this.gs - gap * (n - 1)) / n;
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
    this.drawTiles(c);
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

  private drawTiles(c: CanvasRenderingContext2D) {
    const n = this.size;
    for (let i = 0; i < n * n; i++) {
      const r = this.tileRect(i)!;
      const lit = this.litAmt[i];
      const mk = this.mark[i];
      const s = r.s;
      const cx = r.x + s / 2;
      const cy = r.y + s / 2;
      const sc = 1 + lit * 0.025;
      c.save();
      c.translate(cx, cy);
      c.scale(sc, sc);
      const rad = clamp(s * 0.14, 6, 16);
      const sh = clamp(s * 0.05, 3, 5);
      // ombre portée
      c.fillStyle = 'rgba(27,25,21,0.85)';
      rr(c, -s / 2 + sh * 0.7, -s / 2 + sh, s, s, rad);
      c.fill();
      // papier (ou encre quand la tache est allumée)
      let fill = PAPER_HI;
      if (mk === 1) fill = '#dff0e4';
      else if (mk === 2) fill = '#f7d9d2';
      c.fillStyle = fill;
      c.strokeStyle = INK;
      c.lineWidth = 3;
      rr(c, -s / 2, -s / 2, s, s, rad);
      c.fill();
      c.stroke();
      if (lit > 0.02) {
        c.globalAlpha = Math.min(1, lit);
        c.fillStyle = INK;
        rr(c, -s / 2, -s / 2, s, s, rad);
        c.fill();
        this.drawEyes(c, 0, 0, s, cx, cy);
        c.globalAlpha = 1;
      }
      // trou de ficelle
      c.fillStyle = PAPER;
      c.strokeStyle = lit > 0.5 ? PAPER_HI : INK;
      c.lineWidth = 2;
      c.beginPath();
      c.arc(0, -s / 2 + clamp(s * 0.1, 6, 10), clamp(s * 0.045, 2.5, 4), 0, TAU);
      c.fill();
      c.stroke();
      // marques
      if (mk === 1 || mk === 2) {
        c.fillStyle = mk === 1 ? GREEN : RED;
        c.font = `${Math.round(s * 0.5)}px ${F_DISP}`;
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText(mk === 1 ? '✓' : '✗', 0, s * 0.04);
      }
      if (mk === 3) {
        c.strokeStyle = GOLD;
        c.lineWidth = 5;
        rr(c, -s / 2 + 1, -s / 2 + 1, s - 2, s - 2, rad);
        c.stroke();
      }
      // curseur clavier
      if (this.showCursor && i === this.cursor && this.run === 'play') {
        c.strokeStyle = GOLD;
        c.lineWidth = 4;
        rr(c, -s / 2 - 5, -s / 2 - 5, s + 10, s + 10, rad + 4);
        c.stroke();
      }
      c.restore();
    }
    c.textAlign = 'left';
  }

  /** Deux yeux qui suivent le doigt ou la souris, comme les taches de « Frappe ! ». */
  private drawEyes(c: CanvasRenderingContext2D, x: number, y: number, s: number, wx: number, wy: number) {
    const er = s * 0.14;
    const dx = this.lookX - wx;
    const dy = this.lookY - wy;
    const d = Math.hypot(dx, dy) || 1;
    const px = (dx / d) * er * 0.38;
    const py = (dy / d) * er * 0.38;
    for (const sx of [-1, 1]) {
      const ex = x + sx * s * 0.2;
      const ey = y + s * 0.02;
      c.fillStyle = PAPER_HI;
      c.beginPath();
      c.arc(ex, ey, er, 0, TAU);
      c.fill();
      c.fillStyle = INK;
      c.beginPath();
      c.arc(ex + px, ey + py, er * 0.5, 0, TAU);
      c.fill();
    }
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

  /** En-tête sobre, comme « Course à l'encre » : libellé au-dessus d'un grand chiffre, cœurs, progression. */
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
    // vies
    const hs = 8 * u;
    for (let i = 0; i < MAX_LIVES; i++) {
      const hx = right - (MAX_LIVES - 1 - i) * (hs * 2.7) - hs;
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

  /** Carte de consigne au-dessus de la grille. */
  private drawPrompt(c: CanvasRenderingContext2D) {
    const { W, qH } = this;
    let s = '';
    let right = '';
    if (this.run === 'demo') return;
    if (this.st === 'banner') s = this.first ? 'Prêt ?' : '';
    else if (this.st === 'show') {
      s = 'Regarde bien…';
      right = this.mode === 'suite' ? `${this.seq.length} taches` : `${this.targets.length} taches`;
    } else if (this.st === 'input') {
      s = 'À toi !';
      right = this.mode === 'suite' ? `${this.k} / ${this.seq.length}` : `${this.found.size} / ${this.targets.length}`;
    } else if (this.st === 'ok') s = this.okWord;
    else if (this.st === 'bad') s = this.mode === 'suite' ? 'Réécoute…' : 'Pas de panique !';
    if (!s) return;
    const y0 = this.hudH + 6;
    const w = Math.min(W - 20, 440);
    c.fillStyle = INK;
    rr(c, (W - w) / 2 + 3, y0 + 4, w, qH - 6, 12);
    c.fill();
    c.fillStyle = PAPER_HI;
    c.strokeStyle = INK;
    c.lineWidth = 3;
    rr(c, (W - w) / 2, y0, w, qH - 6, 12);
    c.fill();
    c.stroke();
    c.fillStyle = INK;
    c.textBaseline = 'middle';
    c.textAlign = right ? 'left' : 'center';
    c.font = `${Math.round(clamp(qH * 0.5, 20, 32))}px ${F_DISP}`;
    c.fillText(s, right ? (W - w) / 2 + 18 : W / 2, y0 + (qH - 6) / 2 + 1);
    if (right) {
      c.textAlign = 'right';
      c.font = `700 ${Math.round(clamp(qH * 0.38, 15, 22))}px ${F_NUM}`;
      c.fillStyle = this.st === 'input' ? GOLD_D : 'rgba(27,25,21,0.65)';
      c.fillText(right, (W + w) / 2 - 16, y0 + (qH - 6) / 2 + 1);
    }
    // Les Cases : le temps d'observation fond sous la carte
    if (this.st === 'show' && this.mode === 'cases' && this.tt >= 0.5) {
      const p = clamp((this.tt - 0.5) / this.showT, 0, 1);
      c.fillStyle = 'rgba(27,25,21,0.14)';
      c.fillRect((W - w) / 2 + 10, y0 + qH - 12, w - 20, 4);
      c.fillStyle = GOLD;
      c.fillRect((W - w) / 2 + 10, y0 + qH - 12, (w - 20) * (1 - p), 4);
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

