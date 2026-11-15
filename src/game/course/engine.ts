import type { Sfx } from '../audio';
import { PAGES, PAGE_TITLES, PER_PAGE, TOTAL, fmtNum, fromMissed, makeChoices, makeQuestion, stageOf, travelTime } from './questions';
import type { Level, Missed, Question } from './questions';

/**
 * Moteur de « Course à l'encre » (canvas 2D).
 * Trois colonnes de cahier. Une étiquette portant trois réponses TOMBE du haut : la plume (en bas) doit se placer
 * sous la bonne réponse. On peut VALIDER pour faire tomber l'étiquette tout de suite et gagner un bonus de vitesse.
 * Une mare d'encre aux yeux méchants monte du bas : une erreur la fait bondir, une bonne réponse la fait reculer.
 */

export interface CourseResult {
  level: Level;
  score: number;
  correct: number;
  wrong: number;
  bestStreak: number;
  /** secondes réellement jouées */
  time: number;
  missed: Missed[];
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
}

interface Gate {
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
const INK_HI = '#2d2a24';
const PAPER = '#efe6d2';
const PAPER_HI = '#faf5e8';
const RED = '#c9341f';
const GREEN = '#1f6b3f';
const GOLD = '#d49a1a';
/** doré foncé pour le texte : lisible sur le papier (contraste ≥ 4,5:1) */
const GOLD_D = '#8a5a00';
const F_DISP = '"Special Elite", "Courier New", monospace';
const F_NUM = '"Courier Prime", "Courier New", monospace';
const PART_COLORS = [INK, RED, GREEN, GOLD, PAPER_HI];
const MAX_PARTS = 260;
const MAX_BONUS = 20;
const SURFACE_STEPS = 18;

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const fmt = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const WIN_BONUS = 100;
const PERFECT_PAGE = 50;

function backOut(p: number) {
  const s = 1.7;
  const q = p - 1;
  return q * q * ((s + 1) * q + s) + 1;
}

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

export interface StartOptions {
  /** entraînement ciblé : on repose ces calculs */
  drill?: Missed[];
}

export class CourseGame {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly sfx: Sfx;
  private readonly cb: CourseCallbacks;
  private readonly bg = document.createElement('canvas');
  private readonly stains = document.createElement('canvas');
  private readonly sctx: CanvasRenderingContext2D;
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
  private qH = 70;
  private topY = 0;
  private colW = 100;
  private gw = 90;
  private gh = 60;
  private penY = 0;
  private penGap = 100;
  private barH = 40;
  private resolveY = 0;
  private stainT = 0;

  private shakeOn = true;
  private shake = 0;
  private mode: 'demo' | 'play' = 'demo';
  private paused = false;
  private level: Level = 'cm1';
  private drillQueue: Question[] | null = null;
  private drillTotal = 0;

  // état de partie
  private t = 0;
  private lane = 1;
  private penX = 0;
  private penVx = 0;
  private flood = 0.85;
  private inkShown = 0.85;
  private score = 0;
  private streak = 0;
  private best = 0;
  private correct = 0;
  private wrong = 0;
  private asked = 0;
  private shield = false;
  private gate: Gate | null = null;
  private spawnIn = 1;
  private recent: string[] = [];
  private missed = new Map<string, Missed>();
  private hitStop = 0;
  private over = false;
  private overT = 0;
  private reported = false;
  private banner = '';
  private bannerSub = '';
  private bannerT = 0;
  private bannerDur = 1.5;
  private pageWrong = 0;
  private won = false;
  private hintOff = false;
  private flash = 0;
  private flashC = RED;
  private parts: Part[] = [];
  private texts: Txt[] = [];
  private pulse = 0;
  private demoWait = 0;
  private surf = new Float32Array(SURFACE_STEPS + 1);

  constructor(canvas: HTMLCanvasElement, sfx: Sfx, cb: CourseCallbacks) {
    this.canvas = canvas;
    const c = canvas.getContext('2d', { alpha: false });
    if (!c) throw new Error('canvas indisponible');
    this.ctx = c;
    this.sctx = this.stains.getContext('2d')!;
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

  start(level: Level, opts: StartOptions = {}) {
    this.level = level;
    this.mode = 'play';
    this.reset();
    if (opts.drill && opts.drill.length) {
      const list = opts.drill.map(fromMissed);
      for (let i = list.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [list[i], list[j]] = [list[j], list[i]];
      }
      this.drillQueue = list;
      this.drillTotal = list.length;
    }
    this.paused = false;
    this.sfx.play('start');
    this.dirty = true;
  }

  startDemo() {
    this.mode = 'demo';
    this.level = 'cm1';
    this.reset();
    this.flood = 0.7;
    this.inkShown = 0.7;
    this.paused = false;
    this.dirty = true;
  }

  setPaused(p: boolean) {
    if (this.over || this.mode !== 'play') return;
    this.paused = p;
    this.dirty = true;
    this.last = performance.now();
  }

  get isPlaying() {
    return this.mode === 'play' && !this.over;
  }

  /** Va sur une colonne (0 = gauche, 1 = milieu, 2 = droite). */
  moveTo(lane: number) {
    if (this.mode !== 'play' || this.paused || this.over) return;
    if (this.gate && this.gate.state === 2) return; // validé : on ne change plus
    lane = clamp(Math.round(lane), 0, 2);
    if (lane === this.lane) return;
    this.lane = lane;
    this.sfx.play('key');
    this.dirty = true;
  }

  step(dir: -1 | 1) {
    this.moveTo(this.lane + dir);
  }

  /** Colonne sous un point de l'écran (pour le toucher), coordonnée relative au canvas. */
  moveToX(x: number) {
    if (this.W <= 0) return;
    this.moveTo(Math.floor((x / this.W) * 3));
  }

  /** Valide la colonne choisie : l'étiquette tombe tout de suite, et plus c'est rapide, plus le bonus est grand. */
  validate() {
    const g = this.gate;
    if (this.mode !== 'play' || this.paused || this.over || !g || g.state !== 0) return;
    const p = clamp((this.t - g.t0) / g.T, 0, 1);
    g.bonus = Math.round(MAX_BONUS * (1 - p));
    g.state = 2;
    g.picked = this.lane;
    g.speed = Math.max(g.speed * 4, this.H * 2.6);
    this.hintOff = true;
    this.sfx.play('sweep');
    this.dirty = true;
  }

  /** Pour les tests automatiques. */
  debug() {
    const g = this.gate;
    return {
      lane: this.lane,
      correct: g && g.state === 0 ? g.correct : -1,
      gateY: g ? g.y : -1,
      over: this.over,
      score: this.score,
      flood: this.flood,
      streak: this.streak,
      asked: this.asked,
      page: stageOf(this.asked) + 1,
      won: this.won,
      mode: this.mode,
      quality: this.quality,
      paused: this.paused,
    };
  }

  private reset() {
    this.t = 0;
    this.lane = 1;
    this.penX = this.colX(1);
    this.penVx = 0;
    this.flood = 0.85;
    this.inkShown = 0.85;
    this.score = 0;
    this.streak = 0;
    this.best = 0;
    this.correct = 0;
    this.wrong = 0;
    this.asked = 0;
    this.shield = false;
    this.gate = null;
    this.spawnIn = 0.9;
    this.recent = [];
    this.missed = new Map();
    this.hitStop = 0;
    this.over = false;
    this.overT = 0;
    this.reported = false;
    this.banner = '';
    this.bannerSub = '';
    this.bannerT = 0;
    this.pageWrong = 0;
    this.won = false;
    this.hintOff = false;
    this.flash = 0;
    this.parts.length = 0;
    this.texts.length = 0;
    this.shake = 0;
    this.drillQueue = null;
    this.drillTotal = 0;
    this.demoWait = 0;
    this.sctx.clearRect(0, 0, this.stains.width, this.stains.height);
  }

  // ───────────────────────── Boucle ─────────────────────────

  private frame = (now: number) => {
    this.raf = requestAnimationFrame(this.frame);
    const ms = now - this.last;
    const dt = Math.min(0.05, Math.max(0, ms / 1000));
    this.last = now;
    if (!this.paused) this.watchSpeed(ms);
    if (this.mode === 'demo' && this.demoStill) {
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
    if (this.mode === 'demo') {
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
    this.stains.width = this.canvas.width;
    this.stains.height = this.canvas.height;
    this.sctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.compact = H < 420;
    this.u = clamp(Math.min(W / 640, H / 640), 0.7, 1.2);
    this.hudH = this.compact ? 40 : 56;
    this.qH = this.compact ? 46 : clamp(Math.round(H * 0.12), 58, 86);
    this.topY = this.hudH + this.qH + 10;
    this.colW = W / 3;
    this.gw = clamp(this.colW * 0.82, 70, 190);
    this.gh = clamp(Math.round(H * 0.135), 50, 96);
    const er = this.eyeR();
    this.barH = Math.max(er * 3.9, H * 0.07);
    this.penGap = clamp(H * 0.2, 64, 150);
    this.penY = H - this.barH - this.penGap;
    this.resolveY = this.penY - 30 * this.u * 1.15 - this.gh / 2;
    this.penX = this.colX(this.lane);
    if (this.gate) this.gate.speed = (this.resolveY - this.topY - this.gh / 2) / this.gate.T;
    this.buildBg();
    this.dirty = true;
    this.render();
  };

  private colX(l: number) {
    return this.colW * (l + 0.5);
  }

  private eyeR() {
    return clamp(this.W * 0.026, 9, 17);
  }

  private buildBg() {
    const { W, H, dpr } = this;
    const b = this.bg;
    b.width = Math.round(W * dpr);
    b.height = Math.round(H * dpr);
    const c = b.getContext('2d')!;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.fillStyle = PAPER;
    c.fillRect(0, 0, W, H);
    // papier uniforme comme dans « Frappe ! » : lignes de cahier sur toute la hauteur
    c.fillStyle = 'rgba(120,150,180,0.16)';
    for (let y = this.hudH + 34; y < H; y += 34) c.fillRect(0, Math.round(y), W, 1);
    // séparations de colonnes : à peine visibles
    c.strokeStyle = 'rgba(120,150,180,0.32)';
    c.lineWidth = 1.5;
    c.setLineDash([6, 10]);
    for (let l = 1; l < 3; l++) {
      c.beginPath();
      c.moveTo(Math.round(l * this.colW) + 0.5, this.hudH + 2);
      c.lineTo(Math.round(l * this.colW) + 0.5, H);
      c.stroke();
    }
    c.setLineDash([]);
    // marge rouge sous la plume
    c.fillStyle = 'rgba(201,52,31,0.45)';
    c.fillRect(0, Math.round(this.penY + 40 * this.u), W, 2);
    // en-tête
    c.fillStyle = 'rgba(27,25,21,0.07)';
    c.fillRect(0, 0, W, this.hudH);
    c.fillStyle = INK;
    c.fillRect(0, this.hudH - 2, W, 2);
  }

  // ───────────────────────── Mise à jour ─────────────────────────

  private update(dt: number) {
    this.pulse += dt;
    this.fx(dt);
    // la plume glisse vers sa colonne et s'incline un peu
    const tx = this.colX(this.lane);
    const nx = this.penX + (tx - this.penX) * (1 - Math.exp(-dt * 14));
    this.penVx = (nx - this.penX) / Math.max(dt, 0.001);
    this.penX = nx;
    // le niveau d'encre suit la jauge avec de l'élan
    this.inkShown += (this.flood - this.inkShown) * (1 - Math.exp(-dt * (this.flood < this.inkShown ? 9 : 3.5)));

    if (this.mode === 'demo') {
      this.t += dt;
      this.botStep(dt);
      this.flow(dt);
      return;
    }
    if (this.over) {
      this.overT += dt;
      if (this.won && this.overT < 2 && Math.random() < dt * 7) this.burst(rand(this.W * 0.1, this.W * 0.9), this.topY + rand(0, 80), 10, 3, 300);
      if (this.overT > (this.won ? 2.4 : 1.1) && !this.reported) {
        this.reported = true;
        this.cb.onOver(this.result(false));
      }
      return;
    }
    if (this.hitStop > 0) {
      this.hitStop -= dt;
      return;
    }
    this.t += dt;
    this.flow(dt);
    if (this.drillQueue === null) this.flood -= (0.004 + 0.001 * stageOf(this.asked)) * dt;
    if (this.flood <= 0 && !this.over) this.swallow();
  }

  /** Chute des étiquettes et apparition des suivantes. */
  private flow(dt: number) {
    this.bannerT = Math.max(0, this.bannerT - dt);
    this.flash = Math.max(0, this.flash - dt * 3);
    const g = this.gate;
    if (g) {
      g.age += dt;
      if (g.state === 0 || g.state === 2) {
        g.y += g.speed * dt;
        if (g.y >= this.resolveY) {
          g.y = this.resolveY;
          this.resolve(g);
        }
      } else if (g.age > 0.65) {
        this.gate = null;
        this.spawnIn = this.mode === 'demo' ? 0.4 : 0.3;
        if (this.mode === 'play' && !this.drillQueue && this.asked >= TOTAL) this.victory();
      }
    } else {
      this.spawnIn -= dt;
      if (this.spawnIn <= 0) this.spawn();
    }
  }

  private spawn() {
    let q: Question;
    let retry = false;
    if (this.drillQueue) {
      const nx = this.drillQueue.shift();
      if (!nx) {
        if (this.mode === 'play' && !this.over) this.finishDrill();
        return;
      }
      q = nx;
      retry = this.recent.includes('~' + q.text);
    } else {
      q = makeQuestion(this.level, this.asked, Math.random, this.recent);
    }
    this.recent.push(q.text);
    if (this.recent.length > 4) this.recent.shift();
    const { choices, correct } = makeChoices(q);
    const T = this.mode === 'demo' ? 5 : this.drillQueue ? 11 : travelTime(this.level, this.asked);
    const y = this.topY + this.gh / 2;
    this.gate = { q, choices, correct, y, speed: (this.resolveY - y) / T, t0: this.t, T, state: 0, picked: -1, age: 0, retry, bonus: 0 };
    this.demoWait = rand(1.4, 2.6);
    if (this.mode === 'play' && !this.drillQueue && this.asked % PER_PAGE === 0) {
      this.pageBanner();
      this.pageWrong = 0;
      if (this.asked > 0) this.sfx.play('wave');
    }
  }

  private pageBanner() {
    const p = stageOf(this.asked);
    this.banner = `PAGE ${p + 1} / ${PAGES}`;
    this.bannerSub = PAGE_TITLES[this.level][p];
    this.bannerDur = 1.7;
    this.bannerT = 1.7;
  }

  /** Les 6 pages sont finies : le cahier est terminé. */
  private victory() {
    if (this.over) return;
    const bonus = WIN_BONUS + Math.round(clamp(this.flood, 0, 1) * 100) + (this.shield ? 50 : 0);
    this.score += bonus;
    this.won = true;
    this.over = true;
    this.overT = 0;
    this.flood = 1;
    this.banner = 'CAHIER TERMINÉ !';
    this.bannerSub = `Bonus +${bonus}`;
    this.bannerDur = 2.4;
    this.bannerT = 2.4;
    this.flash = 0.8;
    this.flashC = GOLD;
    this.sfx.play('clear');
    for (let k = 0; k < 4; k++) this.burst(rand(this.W * 0.15, this.W * 0.85), this.topY + 40, 14, 3, 320);
  }

  /** L'étiquette atteint la plume : la colonne choisie est-elle la bonne ? */
  private resolve(g: Gate) {
    const validated = g.state === 2;
    g.state = 1;
    g.age = 0;
    if (!validated) g.picked = this.lane;
    const ok = g.picked === g.correct;
    const demo = this.mode === 'demo';
    const x = this.colX(g.picked);
    const y = this.penY - 24 * this.u;
    if (!demo) this.asked++;
    if (ok) {
      if (demo) {
        this.burst(x, y, 8, 2, 120);
        return;
      }
      this.correct++;
      this.streak++;
      this.best = Math.max(this.best, this.streak);
      const mult = Math.min(5, 1 + Math.floor(this.streak / 3));
      const prevMult = Math.min(5, 1 + Math.floor((this.streak - 1) / 3));
      const pts = 10 * mult + g.bonus;
      this.score += pts;
      this.flood = Math.min(1, this.flood + 0.08 + (this.streak >= 3 ? 0.03 : 0));
      this.burst(x, y, 20, 2, 280);
      this.burst(x, y, 9, 4, 220);
      const ty = this.resolveY - this.gh * 0.75;
      this.text(x, ty, `+${pts}`, GREEN, 32);
      if (!this.drillQueue && this.asked % PER_PAGE === 0 && this.pageWrong === 0 && this.asked < TOTAL) {
        this.score += PERFECT_PAGE;
        this.text(this.W / 2, this.topY + (this.penY - this.topY) * 0.3, `PAGE PARFAITE ! +${PERFECT_PAGE}`, GOLD, 30);
        this.sfx.play('ding');
      }
      if (g.bonus >= MAX_BONUS * 0.6) this.text(x, ty - 34 * this.u, 'RAPIDE !', GOLD, 22);
      this.shake = Math.max(this.shake, 3);
      this.sfx.play('kill');
      if (mult > prevMult) {
        this.sfx.play('mult');
        this.text(this.W / 2, this.topY + (this.penY - this.topY) * 0.45, `SÉRIE ×${mult}`, GOLD, 40);
        this.flash = 0.7;
        this.flashC = GOLD;
      }
      if (this.streak % 5 === 0 && !this.shield) {
        this.shield = true;
        this.sfx.play('ding');
        this.text(x, this.resolveY - this.gh * 0.75 - 68 * this.u, 'BOUCLIER !', GOLD, 24);
      }
    } else {
      if (demo) {
        this.burst(x, y, 8, 1, 120);
        return;
      }
      this.wrong++;
      this.pageWrong++;
      const m = this.missed.get(g.q.text);
      if (m) m.count++;
      else this.missed.set(g.q.text, { text: g.q.text, answer: g.q.answer, near: g.q.near, count: 1 });
      this.burst(x, y, 26, 1, 330);
      this.burst(x, y, 10, 0, 250);
      this.stain(x, y, 30 * this.u);
      this.text(this.W / 2, this.topY + (this.penY - this.topY) * 0.4, `C’était ${fmtNum(g.q.answer)}`, RED, 26);
      if (this.shield) {
        this.shield = false;
        this.text(x, y - 40 * this.u, 'BOUCLIER CASSÉ', GOLD, 22);
        this.sfx.play('hit');
        this.shake = Math.max(this.shake, 6);
      } else {
        this.streak = 0;
        this.flood -= 0.28;
        this.shake = Math.max(this.shake, 12);
        this.hitStop = 0.09;
        this.flash = 1;
        this.flashC = RED;
        this.sfx.play('error');
        if (this.drillQueue) this.flood = Math.max(0.35, this.flood);
      }
      if (this.drillQueue && !g.retry) {
        this.drillQueue.push(g.q);
        this.recent.push('~' + g.q.text);
      }
    }
  }

  private finishDrill() {
    if (this.over) return;
    this.over = true;
    this.overT = 0;
    this.sfx.play('clear');
    this.reported = true;
    window.setTimeout(() => this.cb.onOver(this.result(true)), 500);
  }

  private swallow() {
    this.over = true;
    this.overT = 0;
    this.shake = 16;
    this.sfx.play('breach');
    window.setTimeout(() => this.sfx.play('over'), 250);
  }

  private result(cleared: boolean): CourseResult {
    return {
      level: this.level,
      score: this.score,
      correct: this.correct,
      wrong: this.wrong,
      bestStreak: this.best,
      time: Math.round(this.t),
      missed: [...this.missed.values()].sort((a, b) => b.count - a.count),
      cleared,
      drill: this.drillTotal > 0,
      won: this.won,
      page: this.won ? PAGES : stageOf(this.asked) + 1,
    };
  }

  /** Décor du menu : la plume joue toute seule. */
  private botStep(dt: number) {
    const g = this.gate;
    if (!g || g.state !== 0) return;
    if (this.lane !== g.correct) this.lane = g.correct;
    this.demoWait -= dt;
    if (this.demoWait <= 0) {
      g.state = 2;
      g.speed = this.H * 2.2;
      g.picked = this.lane;
    }
  }

  // ───────────────────────── Effets ─────────────────────────

  private burst(x: number, y: number, n: number, c: number, speed: number) {
    for (let i = 0; i < n; i++) {
      if (this.parts.length >= MAX_PARTS) this.parts.shift();
      const a = rand(0, TAU);
      const s = rand(0.25, 1) * speed;
      const life = rand(0.35, 0.85);
      this.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 90, r: rand(2, 6) * this.u, life, max: life, c });
    }
  }

  private stain(x: number, y: number, r: number) {
    const c = this.sctx;
    c.globalAlpha = 0.22;
    c.fillStyle = INK;
    c.beginPath();
    c.arc(x, y, r * 0.7, 0, TAU);
    for (let k = 0; k < 10; k++) {
      const a = rand(0, TAU);
      const d = r * rand(0.6, 1.9);
      const sr = r * rand(0.06, 0.24);
      c.moveTo(x + Math.cos(a) * d + sr, y + Math.sin(a) * d);
      c.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, sr, 0, TAU);
    }
    c.fill();
    c.globalAlpha = 1;
  }

  private text(x: number, y: number, s: string, c: string, size: number) {
    if (this.texts.length > 12) this.texts.shift();
    const half = s.length * size * 0.32;
    const cx = half * 2 > this.W - 16 ? this.W / 2 : clamp(x, half + 8, this.W - half - 8);
    this.texts.push({ x: cx, y, s, c: c === GOLD ? GOLD_D : c, size: Math.round(size * this.u), age: 0, life: 1 });
  }

  private fx(dt: number) {
    this.shake = Math.max(0, this.shake - 26 * dt);
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
    // gouttes qui giclent de la mare
    if (this.mode === 'play' && !this.over && Math.random() < dt * (this.flood < 0.35 ? 9 : 3.5)) {
      this.parts.push({ x: rand(8, this.W - 8), y: this.inkTop(), vx: rand(-25, 25), vy: rand(-260, -120), r: rand(2, 4.5) * this.u, life: 0.55, max: 0.55, c: 0 });
    }
    // l'encre sèche : les taches s'estompent doucement
    this.stainT += dt;
    if (this.stainT > 0.3) {
      this.stainT = 0;
      const c = this.sctx;
      c.globalCompositeOperation = 'destination-out';
      c.fillStyle = 'rgba(0,0,0,.05)';
      c.fillRect(0, 0, this.W, this.H);
      c.globalCompositeOperation = 'source-over';
    }
  }

  // ───────────────────────── Dessin ─────────────────────────

  /** Hauteur de la surface de la mare : plus la jauge est basse, plus elle monte vers la plume. */
  private inkTop() {
    if (this.over && !this.won && this.mode === 'play') {
      const p = clamp(this.overT / 0.9, 0, 1);
      return lerp(this.penY + 14, -30, p * p);
    }
    const f = clamp(this.inkShown, 0, 1);
    return lerp(this.penY + 14, this.H - this.barH, f);
  }

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
    c.drawImage(this.bg, Math.round(ox * dpr), Math.round(oy * dpr));
    c.drawImage(this.stains, Math.round(ox * dpr), Math.round(oy * dpr));
    c.setTransform(dpr, 0, 0, dpr, Math.round(ox * dpr), Math.round(oy * dpr));

    this.drawBeam(c);
    if (this.gate) this.drawGate(c, this.gate);
    this.drawInk(c);
    this.drawPen(c);
    this.drawParts(c);
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.drawHud(c);
    this.drawQuestion(c);
    this.drawTexts(c);
    this.drawBanner(c);
    this.drawHint(c);
    if (this.flash > 0.02) {
      c.globalAlpha = this.flash * 0.2;
      c.fillStyle = this.flashC;
      c.fillRect(0, 0, W, H);
      if (this.flashC === RED) {
        c.strokeStyle = RED;
        c.globalAlpha = this.flash * 0.7;
        c.lineWidth = 8;
        c.strokeRect(0, 0, W, H);
      }
      c.globalAlpha = 1;
    }
  }

  /** Colonne choisie : un faisceau doré de la plume vers le haut. */
  private drawBeam(c: CanvasRenderingContext2D) {
    if (this.mode !== 'play') return;
    c.fillStyle = 'rgba(212,154,26,0.07)';
    c.fillRect(this.penX - this.colW / 2, this.hudH + 2, this.colW, this.penY - this.hudH + 40 * this.u - 2);
  }

  private drawInk(c: CanvasRenderingContext2D) {
    const { W, H, u } = this;
    const top = this.inkTop();
    const t = this.pulse;
    const f = clamp(this.inkShown, 0, 1);
    const angry = f < 0.35;
    const amp = (4 + (1 - f) * 10) * u;
    const S = SURFACE_STEPS;
    const surf = this.surf;
    for (let i = 0; i <= S; i++) {
      const x = (i / S) * W;
      const hump = Math.max(0, Math.sin(x * 0.011 + t * 0.6)) * Math.max(0, Math.sin(x * 0.0063 - t * 0.35 + 1));
      surf[i] = top - amp * (0.55 * Math.sin(t * 1.9 + x * 0.025) + 0.35 * Math.sin(t * 3.1 - x * 0.047)) - hump * (8 + (1 - f) * 26) * u;
    }
    c.fillStyle = INK;
    c.beginPath();
    c.moveTo(-4, H + 4);
    c.lineTo(-4, surf[0]);
    for (let i = 0; i < S; i++) {
      const x0 = (i / S) * W;
      const x1 = ((i + 1) / S) * W;
      c.quadraticCurveTo(x0, surf[i], (x0 + x1) / 2, (surf[i] + surf[i + 1]) / 2);
    }
    c.lineTo(W + 4, surf[S]);
    c.lineTo(W + 4, H + 4);
    c.closePath();
    // gouttes qui se détachent au-dessus de la surface
    for (let k = 0; k < 5; k++) {
      const sx = (((k * 0.2 + 0.1 + 0.04 * Math.sin(t * 0.8 + k * 2)) % 1) + 1) % 1 * W;
      const sy = top - (14 + 10 * Math.abs(Math.sin(t * 1.4 + k * 1.3))) * u - (1 - f) * 18 * u;
      const sr = (4 + (k % 3) * 1.6) * u;
      c.moveTo(sx + sr, sy);
      c.arc(sx, sy, sr, 0, TAU);
    }
    c.fill();
    // texture : taches plus claires qui dérivent dans l'encre
    c.fillStyle = INK_HI;
    c.beginPath();
    const depth = H - top;
    for (let k = 0; k < 9; k++) {
      const px = ((((k * 0.117 + t * 0.012 * (k % 2 ? 1 : -1)) % 1) + 1) % 1) * W;
      const py = top + 16 * u + (((k * 37) % 100) / 100) * Math.max(0, depth - 24 * u);
      const pr = (8 + (k % 4) * 5) * u * (0.8 + 0.2 * Math.sin(t * 1.5 + k));
      if (py < H) {
        c.moveTo(px + pr, py);
        c.arc(px, py, pr, 0, TAU);
      }
    }
    c.fill();
    // reflets
    c.strokeStyle = 'rgba(250,245,232,0.22)';
    c.lineWidth = 3 * u;
    c.lineCap = 'round';
    c.beginPath();
    for (let k = 0; k < 3; k++) {
      const px = W * (0.18 + k * 0.32) + Math.sin(t * 0.7 + k) * 10;
      const py = top + 12 * u + Math.sin(t * 1.9 + px * 0.025 + k) * 3 * u;
      c.moveTo(px, py);
      c.lineTo(px + 26 * u, py + 2 * u);
    }
    c.stroke();
    c.lineCap = 'butt';
    // yeux méchants, qui suivent la plume
    if (!(this.over && this.overT > 0.5)) {
      const er = this.eyeR();
      const ey = Math.min(top + er * 2.1, H - er * 1.6);
      for (const s of [-1, 1]) this.eye(c, W / 2 + s * W * 0.13, ey, er, s, angry);
    }
  }

  private eye(c: CanvasRenderingContext2D, ex: number, ey: number, er: number, side: number, angry: boolean) {
    const dx = this.penX - ex;
    const dy = this.penY - ey;
    const dl = Math.hypot(dx, dy) || 1;
    c.fillStyle = angry ? '#ffe9e2' : PAPER_HI;
    c.beginPath();
    c.arc(ex, ey, er, 0, TAU);
    c.fill();
    c.fillStyle = angry ? RED : INK;
    c.beginPath();
    c.arc(ex + (dx / dl) * er * 0.45, ey + (dy / dl) * er * 0.45, er * 0.5, 0, TAU);
    c.fill();
    // paupière en colère
    c.fillStyle = INK;
    c.beginPath();
    c.moveTo(ex + side * er * 1.4, ey - er * 1.1);
    c.lineTo(ex - side * er * 1.4, ey - er * 0.1);
    c.lineTo(ex - side * er * 1.4, ey - er * 1.8);
    c.lineTo(ex + side * er * 1.4, ey - er * 1.8);
    c.closePath();
    c.fill();
  }

  private drawPen(c: CanvasRenderingContext2D) {
    const { u } = this;
    const bob = this.mode === 'play' && !this.over ? Math.sin(this.pulse * 7) * 1.5 : 0;
    const tilt = clamp(this.penVx / 2400, -0.3, 0.3);
    c.save();
    c.translate(this.penX, this.penY + bob);
    c.rotate(tilt);
    c.scale(u * 1.15, u * 1.15);
    c.fillStyle = 'rgba(27,25,21,0.18)';
    c.beginPath();
    c.ellipse(0, 36, 20, 5, 0, 0, TAU);
    c.fill();
    // plume (pointe vers le haut)
    c.lineJoin = 'round';
    c.beginPath();
    c.moveTo(0, -30);
    c.lineTo(15, -2);
    c.lineTo(9, 22);
    c.lineTo(-9, 22);
    c.lineTo(-15, -2);
    c.closePath();
    c.lineWidth = 4;
    c.strokeStyle = PAPER_HI;
    c.stroke();
    c.fillStyle = INK;
    c.fill();
    c.fillStyle = PAPER_HI;
    c.fillRect(-2.2, -20, 4.4, 17);
    c.beginPath();
    c.arc(0, 2, 3.8, 0, TAU);
    c.fill();
    c.fillStyle = GOLD;
    c.fillRect(-11, 24, 22, 7);
    if (this.shield) {
      c.strokeStyle = GOLD;
      c.lineWidth = 4;
      c.beginPath();
      c.arc(0, 0, 38 + Math.sin(this.pulse * 6) * 1.5, 0, TAU);
      c.stroke();
    }
    c.restore();
  }

  private drawGate(c: CanvasRenderingContext2D, g: Gate) {
    const { gw, gh } = this;
    const dying = g.state === 1;
    const k = dying ? clamp(g.age / 0.65, 0, 1) : 0;
    const pop = !dying ? backOut(clamp(g.age / 0.28, 0, 1)) : 1;
    const sway = dying ? 0 : Math.sin(this.pulse * 2.2 + g.t0) * 0.025;
    for (let l = 0; l < 3; l++) {
      let y = g.y;
      let alpha = 1;
      let fill = PAPER_HI;
      let ink = INK;
      let mark = '';
      let scale = pop;
      const selected = !dying && l === this.lane && this.mode === 'play';
      if (selected) scale *= 1.06;
      if (dying) {
        if (l === g.correct) {
          fill = '#dff0e4';
          ink = GREEN;
          mark = '✓';
          scale = 1 + Math.sin(Math.min(1, k * 3) * Math.PI) * 0.14;
          alpha = g.picked === g.correct ? 1 - Math.max(0, k - 0.55) / 0.45 : 1 - k * 0.8;
        } else if (l === g.picked) {
          fill = '#f7d9d2';
          ink = RED;
          mark = '✗';
          alpha = 1 - Math.max(0, k - 0.4) / 0.6;
          y += k * 10;
        } else {
          alpha = 1 - clamp((k - 0.35) / 0.65, 0, 1);
          y += k * 24;
        }
      }
      if (alpha <= 0.02) continue;
      c.globalAlpha = alpha;
      c.save();
      c.translate(this.colX(l), y);
      c.rotate(sway * (l === 1 ? -1 : 1));
      c.scale(scale, scale);
      if (selected) {
        c.fillStyle = 'rgba(212,154,26,0.35)';
        rr(c, -gw / 2 - 7, -gh / 2 - 7, gw + 14, gh + 14, 14);
        c.fill();
      }
      // étiquette : ombre portée, papier, trou de ficelle
      c.fillStyle = 'rgba(27,25,21,0.85)';
      rr(c, -gw / 2 + 3, -gh / 2 + 4, gw, gh, 10);
      c.fill();
      c.fillStyle = fill;
      c.strokeStyle = selected ? GOLD : ink;
      c.lineWidth = selected ? 4 : 3;
      rr(c, -gw / 2, -gh / 2, gw, gh, 10);
      c.fill();
      c.stroke();
      c.fillStyle = PAPER;
      c.strokeStyle = ink;
      c.lineWidth = 2;
      c.beginPath();
      c.arc(0, -gh / 2 + 8, 3.6, 0, TAU);
      c.fill();
      c.stroke();
      c.fillStyle = ink;
      const txt = fmtNum(g.choices[l]);
      let fs = Math.round(clamp(gh * 0.58, 24, 54));
      c.font = `700 ${fs}px ${F_NUM}`;
      while (c.measureText(txt).width > gw - 20 && fs > 14) {
        fs -= 2;
        c.font = `700 ${fs}px ${F_NUM}`;
      }
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(txt, 0, 4);
      if (mark) {
        c.font = `${Math.round(gh * 0.7)}px ${F_DISP}`;
        c.fillText(mark, gw / 2 - 4, -gh / 2 + 2);
      }
      c.restore();
    }
    c.globalAlpha = 1;
  }

  private drawParts(c: CanvasRenderingContext2D) {
    const ps = this.parts;
    for (let ci = 0; ci < PART_COLORS.length; ci++) {
      let any = false;
      c.fillStyle = PART_COLORS[ci];
      c.beginPath();
      for (let i = 0; i < ps.length; i++) {
        const p = ps[i];
        if (p.c !== ci) continue;
        const r = p.r * clamp(p.life / p.max + 0.2, 0.2, 1);
        c.moveTo(p.x + r, p.y);
        c.arc(p.x, p.y, r, 0, TAU);
        any = true;
      }
      if (any) c.fill();
    }
  }

  /** En-tête sobre, comme « Frappe ! » : petit libellé au-dessus d'un grand chiffre. */
  private drawHud(c: CanvasRenderingContext2D) {
    const { W, hudH, u } = this;
    c.textBaseline = 'middle';
    if (this.mode !== 'play') return;
    const drill = this.drillTotal > 0;
    const mult = Math.min(5, 1 + Math.floor(this.streak / 3));
    const right = W - 62; // le bouton pause occupe la droite
    const page = `${Math.min(PAGES, stageOf(this.asked) + 1)}/${PAGES}`;
    const label = (txt: string, x: number, y: number, al: CanvasTextAlign) => {
      c.textAlign = al;
      c.font = `${Math.round(clamp(hudH * 0.2, 9, 11))}px ${F_DISP}`;
      c.fillStyle = 'rgba(27,25,21,0.62)';
      c.fillText(txt, x, y);
    };
    const value = (txt: string, x: number, y: number, al: CanvasTextAlign, col = INK) => {
      c.textAlign = al;
      c.font = `${Math.round(clamp(hudH * 0.4, 16, 24))}px ${F_DISP}`;
      c.fillStyle = col;
      c.fillText(txt, x, y);
    };
    if (this.compact) {
      // écran bas : une seule ligne
      const y = hudH / 2 - (drill ? 0 : 2);
      c.font = `${Math.round(clamp(hudH * 0.42, 14, 18))}px ${F_DISP}`;
      c.fillStyle = INK;
      c.textAlign = 'left';
      c.fillText(`SCORE ${fmt(this.score)}`, 14, y);
      c.textAlign = 'center';
      c.fillText(drill ? 'ENTRAÎNEMENT' : `PAGE ${page}`, W / 2, y);
      if (mult > 1) {
        c.fillStyle = GOLD_D;
        c.textAlign = 'right';
        c.fillText(`×${mult}`, right, y);
      }
    } else {
      label('SCORE', 14, hudH * 0.28, 'left');
      value(fmt(this.score), 14, hudH * 0.62, 'left');
      label(drill ? 'MODE' : 'PAGE', W / 2, hudH * 0.28, 'center');
      value(drill ? 'ENTRAÎNEMENT' : page, W / 2, hudH * 0.62, 'center');
      if (mult > 1) {
        label(`SÉRIE ${this.streak}`, right, hudH * 0.28, 'right');
        value(`×${mult}`, right, hudH * 0.62, 'right', GOLD_D);
      }
    }
    if (this.shield) {
      c.fillStyle = GOLD;
      c.strokeStyle = INK;
      c.lineWidth = 2;
      c.beginPath();
      c.arc(right - (mult > 1 ? 58 : 6), hudH / 2, 8 * u, 0, TAU);
      c.fill();
      c.stroke();
    }
    if (!drill) {
      // progression : une case par page, qui s'arrête avant le bouton pause
      const gap = 4;
      const x0 = 14;
      const x1 = right + 6;
      const bw = (x1 - x0 - gap * (PAGES - 1)) / PAGES;
      for (let i = 0; i < PAGES; i++) {
        const x = x0 + i * (bw + gap);
        const f = clamp((this.asked - i * PER_PAGE) / PER_PAGE, 0, 1);
        c.fillStyle = 'rgba(27,25,21,0.14)';
        c.fillRect(x, hudH - 9, bw, 4);
        if (f > 0) {
          c.fillStyle = f >= 1 ? INK : GOLD;
          c.fillRect(x, hudH - 9, bw * f, 4);
        }
      }
    }
    c.textAlign = 'left';
  }

  private drawQuestion(c: CanvasRenderingContext2D) {
    if (this.mode === 'demo') return;
    const g = this.gate;
    const { W, qH } = this;
    const y0 = this.hudH + 4;
    let s = '';
    if (g) s = g.state === 0 || g.state === 2 ? g.q.text : g.q.text.replace('?', fmtNum(g.q.answer));
    else if (this.mode === 'play' && this.t < 1) s = 'Prêt ?';
    if (!s) return;
    const w = Math.min(W - 20, 560);
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
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    const showBonus = this.mode === 'play' && !this.compact;
    let fs = Math.round(clamp(qH * 0.56, 24, 50));
    c.font = `700 ${fs}px ${F_NUM}`;
    const room = w - 24 - (showBonus ? 90 : 0);
    while (c.measureText(s).width > room && fs > 16) {
      fs -= 2;
      c.font = `700 ${fs}px ${F_NUM}`;
    }
    c.fillText(s, showBonus ? W / 2 - 38 : W / 2, y0 + (qH - 6) / 2 + 2);
    // bonus de vitesse : il fond au fil du temps
    if (this.mode === 'play' && g && g.state === 0) {
      const p = clamp((this.t - g.t0) / g.T, 0, 1);
      const bonus = Math.round(MAX_BONUS * (1 - p));
      if (showBonus) {
        const bx = (W + w) / 2 - 14;
        c.textAlign = 'right';
        c.font = `${Math.round(clamp(qH * 0.3, 14, 20))}px ${F_DISP}`;
        c.fillStyle = bonus > 8 ? GOLD_D : 'rgba(27,25,21,0.6)';
        c.fillText(`+${bonus}`, bx, y0 + (qH - 6) / 2 - 8);
        c.font = `${Math.round(clamp(qH * 0.2, 10, 13))}px ${F_DISP}`;
        c.fillStyle = 'rgba(27,25,21,0.55)';
        c.fillText('VITESSE', bx, y0 + (qH - 6) / 2 + 12);
      }
      c.fillStyle = 'rgba(27,25,21,0.14)';
      c.fillRect((W - w) / 2 + 8, y0 + qH - 12, w - 16, 4);
      c.fillStyle = bonus > 8 ? GOLD : INK;
      c.fillRect((W - w) / 2 + 8, y0 + qH - 12, (w - 16) * (1 - p), 4);
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
    if (this.bannerT <= 0) return;
    const p = 1 - this.bannerT / this.bannerDur;
    const a = p < 0.12 ? p / 0.12 : p > 0.78 ? (1 - p) / 0.22 : 1;
    const pop = p < 0.12 ? 0.7 + (p / 0.12) * 0.3 : 1;
    c.globalAlpha = clamp(a, 0, 1);
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.lineJoin = 'round';
    const y = this.topY + (this.penY - this.topY) * 0.4;
    let fs = Math.round(Math.min((this.won ? 50 : 36) * this.u, this.W * (this.won ? 0.12 : 0.09)) * pop);
    c.font = `${fs}px ${F_DISP}`;
    while (c.measureText(this.banner).width > this.W - 24 && fs > 16) {
      fs -= 2;
      c.font = `${fs}px ${F_DISP}`;
    }
    c.lineWidth = 9;
    c.strokeStyle = PAPER_HI;
    c.strokeText(this.banner, this.W / 2, y);
    c.fillStyle = this.won ? GOLD_D : RED;
    c.fillText(this.banner, this.W / 2, y);
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

  private drawHint(c: CanvasRenderingContext2D) {
    if (this.mode !== 'play' || this.over || this.hintOff || this.asked > 1 || this.t > 14) return;
    c.globalAlpha = 0.9 + 0.1 * Math.sin(this.pulse * 5);
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    const touch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    const lines = touch ? ['Touche une colonne, puis', 'glisse vers le haut pour valider'] : ['← → pour choisir une colonne', 'Entrée ou ↑ pour valider'];
    const size = Math.round(clamp(this.W * 0.036, 15, 22));
    c.font = `${size}px ${F_DISP}`;
    const w = Math.max(...lines.map((l) => c.measureText(l).width)) + 30;
    const h = size * 2.9;
    const x = this.W / 2;
    const y = this.topY + (this.penY - this.topY) * 0.62;
    c.fillStyle = INK;
    rr(c, x - w / 2, y - h / 2, w, h, 10);
    c.fill();
    c.fillStyle = PAPER_HI;
    c.fillText(lines[0], x, y - size * 0.62);
    c.fillText(lines[1], x, y + size * 0.72);
    c.globalAlpha = 1;
    c.textAlign = 'left';
  }
}
