import type { Sfx } from '../audio';
import { fromMissed, makeChoices, makeQuestion, stageOf, travelTime } from './questions';
import type { Level, Missed, Question } from './questions';

/**
 * Moteur de « Course à l'encre » (canvas 2D).
 * Trois lignes de cahier. Des étiquettes portant trois réponses arrivent de la droite : la plume (à gauche) doit
 * se placer sur la ligne de la BONNE réponse avant l'impact. Une grosse tache d'encre aux yeux méchants la poursuit :
 * une erreur la fait bondir en avant, une bonne réponse la repousse. Même univers graphique que « Frappe ! ».
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
}

export interface CourseCallbacks {
  onOver: (r: CourseResult) => void;
}

interface Gate {
  q: Question;
  choices: number[];
  correct: number;
  x: number;
  speed: number;
  t0: number;
  T: number;
  /** 0 = en route, 1 = résolue (animation de sortie) */
  state: 0 | 1;
  picked: number;
  age: number;
  retry: boolean;
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
const PAPER = '#efe6d2';
const PAPER_HI = '#faf5e8';
const LINE = '#b9c4cf';
const RED = '#c9341f';
const GREEN = '#1f6b3f';
const GOLD = '#d49a1a';
const F_DISP = '"Special Elite", "Courier New", monospace';
const PART_COLORS = [INK, RED, GREEN, GOLD, PAPER_HI];
const MAX_PARTS = 260;
const SHAKE_DECAY = 26;

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const fmt = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

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
  private hudH = 52;
  private qH = 64;
  private laneTop = 0;
  private laneH = 0;
  private penX = 80;

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
  private penY = 0;
  private laneAt = 0;
  private flood = 0.8;
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
  private bannerT = 0;
  private hintT = 0;
  private flash = 0;
  private flashC = RED;
  private parts: Part[] = [];
  private texts: Txt[] = [];
  private pulse = 0;

  constructor(canvas: HTMLCanvasElement, sfx: Sfx, cb: CourseCallbacks) {
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
    this.flood = 0.6;
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

  /** Va sur une ligne (0 = haut, 1 = milieu, 2 = bas). */
  moveTo(lane: number) {
    if (this.mode !== 'play' || this.paused || this.over) return;
    lane = clamp(Math.round(lane), 0, 2);
    if (lane === this.lane) return;
    this.lane = lane;
    this.laneAt = this.t;
    this.hintT = 99;
    this.sfx.play('key');
    this.dirty = true;
  }

  step(dir: -1 | 1) {
    this.moveTo(this.lane + dir);
  }

  /** Ligne sous un point de l'écran (pour le toucher), coordonnées relatives au canvas. */
  moveToY(y: number) {
    if (this.laneH <= 0) return;
    this.moveTo(Math.floor((y - this.laneTop) / this.laneH));
  }

  /** Pour les tests automatiques. */
  debug() {
    const g = this.gate;
    return {
      lane: this.lane,
      correct: g && g.state === 0 ? g.correct : -1,
      gateX: g ? g.x : -1,
      penX: this.penX,
      over: this.over,
      score: this.score,
      flood: this.flood,
      streak: this.streak,
      asked: this.asked,
      mode: this.mode,
      quality: this.quality,
      paused: this.paused,
    };
  }

  private reset() {
    this.t = 0;
    this.lane = 1;
    this.penY = 0;
    this.laneAt = 0;
    this.flood = 0.8;
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
    this.bannerT = 0;
    this.hintT = 0;
    this.flash = 0;
    this.parts.length = 0;
    this.texts.length = 0;
    this.shake = 0;
    this.drillQueue = null;
    this.drillTotal = 0;
    this.penY = this.laneY(1);
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
    this.compact = H < 380;
    this.hudH = this.compact ? 36 : 52;
    this.qH = this.compact ? 42 : clamp(Math.round(H * 0.12), 52, 78);
    this.laneTop = this.hudH + this.qH + 6;
    this.laneH = Math.max(40, (H - this.laneTop - 6) / 3);
    this.u = clamp(Math.min(W, H) / 560, 0.7, 1.15);
    this.penX = Math.max(64, Math.round(W * 0.2));
    this.penY = this.laneY(this.lane);
    this.buildBg();
    this.dirty = true;
    this.render();
  };

  private laneY(l: number) {
    return this.laneTop + this.laneH * (l + 0.5);
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
    // lignes de cahier : une par ligne de course + bandes alternées
    for (let l = 0; l < 3; l++) {
      const y0 = this.laneTop + l * this.laneH;
      if (l % 2 === 0) {
        c.fillStyle = 'rgba(27,25,21,0.035)';
        c.fillRect(0, y0, W, this.laneH);
      }
      c.fillStyle = LINE;
      c.fillRect(0, Math.round(y0 + this.laneH) - 1, W, 2);
    }
    c.fillStyle = LINE;
    c.fillRect(0, Math.round(this.laneTop) - 1, W, 2);
    // marge rouge
    c.fillStyle = 'rgba(201,52,31,0.55)';
    c.fillRect(Math.round(this.penX - 34 * this.u), 0, 2, H);
    // en-tête du cahier
    c.fillStyle = 'rgba(27,25,21,0.06)';
    c.fillRect(0, 0, W, this.hudH);
    c.fillStyle = INK;
    c.fillRect(0, this.hudH - 2, W, 2);
  }

  // ───────────────────────── Mise à jour ─────────────────────────

  private update(dt: number) {
    this.pulse += dt;
    this.fx(dt);
    if (this.mode === 'demo') {
      this.t += dt;
      this.botStep(dt);
      this.flow(dt);
      return;
    }
    if (this.over) {
      this.overT += dt;
      if (this.overT > 1.0 && !this.reported) {
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
    if (this.drillQueue === null) {
      // l'encre gagne du terrain, de plus en plus vite
      this.flood -= (0.008 + 0.002 * stageOf(this.asked)) * dt;
    }
    if (this.flood <= 0 && !this.over) this.swallow();
  }

  /** Mouvement de la plume, des étiquettes, et apparition des suivantes. */
  private flow(dt: number) {
    const ty = this.laneY(this.lane);
    this.penY += (ty - this.penY) * (1 - Math.exp(-dt * 16));
    this.bannerT = Math.max(0, this.bannerT - dt);
    this.flash = Math.max(0, this.flash - dt * 3);
    const g = this.gate;
    if (g) {
      g.age += dt;
      if (g.state === 0) {
        g.x -= g.speed * dt;
        if (g.x <= this.penX) this.resolve(g);
      } else if (g.age > 0.6) {
        this.gate = null;
        this.spawnIn = this.mode === 'demo' ? 0.4 : 0.25;
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
    const T = this.mode === 'demo' ? 4 : this.drillQueue ? 5.5 : travelTime(this.level, this.asked);
    const gw = this.gateW();
    const x = this.W + gw / 2;
    this.gate = { q, choices, correct, x, speed: (x - this.penX) / T, t0: this.t, T, state: 0, picked: -1, age: 0, retry };
    if (this.mode === 'play' && !this.drillQueue && this.asked > 0 && this.asked % 7 === 0) {
      this.banner = `PAGE ${stageOf(this.asked) + 1}`;
      this.bannerT = 1.4;
      this.sfx.play('wave');
    }
  }

  private gateW() {
    return clamp(this.W * 0.15, 72, 150);
  }

  /** La plume arrive sur l'étiquette : la ligne choisie est-elle la bonne ? */
  private resolve(g: Gate) {
    g.state = 1;
    g.age = 0;
    g.picked = this.lane;
    const ok = g.picked === g.correct;
    const demo = this.mode === 'demo';
    const x = this.penX;
    const y = this.laneY(g.picked);
    if (!demo) this.asked++;
    if (ok) {
      if (demo) {
        this.burst(x + 20, y, 8, 2, 120);
        return;
      }
      this.correct++;
      this.streak++;
      this.best = Math.max(this.best, this.streak);
      const mult = Math.min(5, 1 + Math.floor(this.streak / 3));
      const prevMult = Math.min(5, 1 + Math.floor((this.streak - 1) / 3));
      const since = Math.max(this.laneAt, g.t0);
      const p = this.laneAt < g.t0 ? 0.35 : clamp((since - g.t0) / g.T, 0, 1);
      const pts = 10 * mult + Math.round(5 * (1 - p));
      this.score += pts;
      this.flood = Math.min(1, this.flood + 0.07 + (this.streak >= 3 ? 0.03 : 0));
      this.burst(x + 24, y, 18, 2, 260);
      this.burst(x + 24, y, 8, 4, 200);
      this.text(x + 50, y - 20 * this.u, `+${pts}`, GREEN, 26);
      this.text(x + 10, y + 12 * this.u, '✓', GREEN, 34);
      this.shake = Math.max(this.shake, 3);
      this.sfx.play('kill');
      if (mult > prevMult) {
        this.sfx.play('mult');
        this.text(this.W / 2, this.laneTop + this.laneH * 1.5, `SÉRIE ×${mult}`, GOLD, 38);
        this.flash = 0.7;
        this.flashC = GOLD;
      }
      if (this.streak % 5 === 0 && !this.shield) {
        this.shield = true;
        this.sfx.play('ding');
        this.text(x, y - 46 * this.u, 'BOUCLIER !', GOLD, 24);
      }
      if (this.drillQueue) this.drillDone(g);
    } else {
      if (demo) {
        this.burst(x + 20, y, 8, 1, 120);
        return;
      }
      this.wrong++;
      const m = this.missed.get(g.q.text);
      if (m) m.count++;
      else this.missed.set(g.q.text, { text: g.q.text, answer: g.q.answer, near: g.q.near, count: 1 });
      this.burst(x + 20, y, 26, 1, 320);
      this.burst(x + 20, y, 10, 0, 240);
      this.text(x + 10, y + 12 * this.u, '✗', RED, 36);
      this.text(this.W / 2, this.laneTop + this.laneH * 0.55, `C’était ${g.q.answer}`, RED, 24);
      if (this.shield) {
        this.shield = false;
        this.text(x, y - 46 * this.u, 'BOUCLIER CASSÉ', GOLD, 22);
        this.sfx.play('hit');
        this.shake = Math.max(this.shake, 6);
      } else {
        this.streak = 0;
        this.flood -= 0.34;
        this.shake = Math.max(this.shake, 12);
        this.hitStop = 0.09;
        this.flash = 1;
        this.flashC = RED;
        this.sfx.play('error');
        if (this.drillQueue) {
          this.flood = Math.max(0.35, this.flood);
        }
      }
      if (this.drillQueue && !g.retry) {
        this.drillQueue.push(g.q);
        this.recent.push('~' + g.q.text);
      }
      if (this.drillQueue) this.drillDone(g);
    }
  }

  private drillDone(g: Gate) {
    void g;
    if (this.drillQueue && this.drillQueue.length === 0) this.spawnIn = 0.6;
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
    };
  }

  /** Décor du menu : la plume joue toute seule. */
  private botStep(dt: number) {
    void dt;
    const g = this.gate;
    if (g && g.state === 0 && g.x < this.W * 0.75 && this.lane !== g.correct) {
      this.lane = g.correct;
      this.laneAt = this.t;
    }
  }

  // ───────────────────────── Effets ─────────────────────────

  private burst(x: number, y: number, n: number, c: number, speed: number) {
    for (let i = 0; i < n; i++) {
      if (this.parts.length >= MAX_PARTS) this.parts.shift();
      const a = rand(0, TAU);
      const s = rand(0.25, 1) * speed;
      const life = rand(0.35, 0.8);
      this.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 30, r: rand(2, 5.5) * this.u, life, max: life, c });
    }
  }

  private text(x: number, y: number, s: string, c: string, size: number) {
    if (this.texts.length > 14) this.texts.shift();
    this.texts.push({ x, y, s, c, size: Math.round(size * this.u), age: 0, life: 0.9 });
  }

  private fx(dt: number) {
    this.shake = Math.max(0, this.shake - SHAKE_DECAY * dt);
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.parts[i] = this.parts[this.parts.length - 1];
        this.parts.pop();
        continue;
      }
      p.vy += 520 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i];
      t.age += dt;
      if (t.age >= t.life) this.texts.splice(i, 1);
    }
    // gouttes qui coulent de la tache
    if (this.mode === 'play' && !this.over && Math.random() < dt * 5) {
      this.parts.push({ x: this.blotFront() - 4, y: rand(this.laneTop, this.H - 10), vx: rand(20, 60), vy: 0, r: rand(2, 4) * this.u, life: 0.5, max: 0.5, c: 0 });
    }
  }

  // ───────────────────────── Dessin ─────────────────────────

  /** Bord avant de la tache : plus la jauge est basse, plus elle avance vers la plume. */
  private blotFront() {
    if (this.over && this.mode === 'play') {
      const p = clamp(this.overT / 0.8, 0, 1);
      const from = this.penX - 12;
      return from + (this.W - from) * p * p;
    }
    const f = clamp(this.flood, 0, 1);
    const far = 40 * this.u;
    return far + (1 - f) * (this.penX - 12 - far);
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
    c.fillStyle = PAPER;
    c.fillRect(0, 0, this.canvas.width, this.canvas.height);
    c.drawImage(this.bg, Math.round(ox * dpr), Math.round(oy * dpr));
    c.setTransform(dpr, 0, 0, dpr, Math.round(ox * dpr), Math.round(oy * dpr));

    this.drawLaneHighlight(c);
    this.drawBlot(c);
    if (this.gate) this.drawGate(c, this.gate);
    this.drawPen(c);
    this.drawParts(c);
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.drawDanger(c);
    this.drawHud(c);
    this.drawQuestion(c);
    this.drawTexts(c);
    this.drawBanner(c);
    this.drawHint(c);
    if (this.flash > 0.02) {
      c.globalAlpha = this.flash * 0.22;
      c.fillStyle = this.flashC;
      c.fillRect(0, 0, W, H);
      c.globalAlpha = 1;
    }
  }

  private drawLaneHighlight(c: CanvasRenderingContext2D) {
    if (this.mode !== 'play') return;
    c.fillStyle = 'rgba(212,154,26,0.13)';
    c.fillRect(0, this.laneTop + this.lane * this.laneH, this.W, this.laneH);
  }

  private drawBlot(c: CanvasRenderingContext2D) {
    const front = this.blotFront();
    const { H, u } = this;
    const top = this.laneTop - 8;
    const mid = (top + H) / 2;
    const R = (H - top) * 0.62;
    const tm = this.pulse;
    c.fillStyle = INK;
    // corps : plusieurs disques qui ondulent
    c.beginPath();
    c.arc(front - R * 0.62, mid, R, 0, TAU);
    c.fill();
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TAU + tm * 0.9;
      const k = Math.sin(tm * 2.2 + i * 1.7);
      const ry = mid + Math.sin(a) * (H - top) * 0.34;
      const rx = front - 6 * u + k * 5 * u - Math.abs(Math.cos(a)) * 8 * u;
      const rad = (22 + 8 * Math.abs(k)) * u;
      c.beginPath();
      c.arc(rx, ry, rad, 0, TAU);
      c.fill();
    }
    // yeux méchants, qui suivent la plume
    const danger = this.flood < 0.3;
    const ex = front - 26 * u;
    const dy = clamp((this.penY - mid) / ((H - top) / 2), -1, 1);
    for (const s of [-1, 1]) {
      const ey = mid + s * 36 * u;
      c.fillStyle = danger ? '#ffe3dc' : PAPER_HI;
      c.beginPath();
      c.ellipse(ex, ey, 13 * u, 15 * u, 0, 0, TAU);
      c.fill();
      c.fillStyle = danger ? RED : INK;
      c.beginPath();
      c.arc(ex + 5 * u, ey + dy * 6 * u + 2 * u, 6 * u, 0, TAU);
      c.fill();
      // sourcil en colère
      c.strokeStyle = PAPER_HI;
      c.lineWidth = 4 * u;
      c.beginPath();
      c.moveTo(ex - 15 * u, ey - 20 * u - s * 4 * u);
      c.lineTo(ex + 14 * u, ey - 10 * u + s * 4 * u);
      c.stroke();
    }
  }

  private drawPen(c: CanvasRenderingContext2D) {
    const { u } = this;
    const x = this.penX;
    const y = this.penY;
    const bob = this.mode === 'play' && !this.over ? Math.sin(this.pulse * 8) * 1.2 : 0;
    c.save();
    c.translate(x, y + bob);
    c.scale(u * 1.2, u * 1.2);
    // plume (pointe vers la droite)
    c.fillStyle = INK;
    c.beginPath();
    c.moveTo(24, 0);
    c.lineTo(-6, -15);
    c.lineTo(-30, -9);
    c.lineTo(-30, 9);
    c.lineTo(-6, 15);
    c.closePath();
    c.lineJoin = 'round';
    c.lineWidth = 4;
    c.strokeStyle = PAPER_HI;
    c.stroke();
    c.fill();
    c.fillStyle = PAPER_HI;
    c.beginPath();
    c.moveTo(4, -2.5);
    c.lineTo(-12, -2.5);
    c.lineTo(-12, 2.5);
    c.lineTo(4, 2.5);
    c.closePath();
    c.fill();
    c.beginPath();
    c.arc(-14, 0, 3.4, 0, TAU);
    c.fill();
    c.fillStyle = GOLD;
    c.fillRect(-34, -6, 6, 12);
    if (this.shield) {
      c.strokeStyle = GOLD;
      c.lineWidth = 4;
      c.beginPath();
      c.arc(-2, 0, 30 + Math.sin(this.pulse * 6) * 1.5, 0, TAU);
      c.stroke();
    }
    c.restore();
  }

  private drawGate(c: CanvasRenderingContext2D, g: Gate) {
    const gw = this.gateW();
    const gh = Math.min(this.laneH * 0.7, 74);
    const dying = g.state === 1;
    const k = dying ? clamp(g.age / 0.6, 0, 1) : 0;
    for (let l = 0; l < 3; l++) {
      const y = this.laneY(l);
      let x = g.x;
      let alpha = 1;
      let fill = PAPER_HI;
      let ink = INK;
      let mark = '';
      let scale = 1;
      if (dying) {
        if (l === g.correct) {
          fill = '#dff0e4';
          ink = GREEN;
          mark = '✓';
          scale = 1 + Math.sin(Math.min(1, k * 3) * Math.PI) * 0.12;
          if (g.picked !== g.correct) alpha = 1 - k;
          else alpha = 1 - Math.max(0, k - 0.5) * 2;
        } else if (l === g.picked) {
          fill = '#f7d9d2';
          ink = RED;
          mark = '✗';
          alpha = 1 - Math.max(0, k - 0.4) / 0.6;
        } else {
          alpha = 1 - k;
          x += k * 40;
        }
      }
      if (alpha <= 0.02) continue;
      c.globalAlpha = alpha;
      c.save();
      c.translate(x, y);
      c.scale(scale, scale);
      c.fillStyle = fill;
      c.strokeStyle = ink;
      c.lineWidth = 3;
      // étiquette à trou
      rr(c, -gw / 2, -gh / 2, gw, gh, 9);
      c.fill();
      c.stroke();
      c.fillStyle = PAPER;
      c.beginPath();
      c.arc(-gw / 2 + 11, 0, 4, 0, TAU);
      c.fill();
      c.stroke();
      c.fillStyle = ink;
      c.font = `${Math.round(clamp(gh * (String(g.choices[l]).length > 4 ? 0.4 : 0.52), 18, 40))}px ${F_DISP}`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(String(g.choices[l]), 6, 2);
      if (mark) {
        c.font = `${Math.round(gh * 0.6)}px ${F_DISP}`;
        c.fillText(mark, gw / 2 + 4, -gh / 2 + 4);
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

  private drawDanger(c: CanvasRenderingContext2D) {
    if (this.mode !== 'play' || this.over || this.flood > 0.3) return;
    const a = 0.25 + 0.2 * Math.sin(this.pulse * 9);
    c.globalAlpha = a;
    c.strokeStyle = RED;
    c.lineWidth = 8;
    c.strokeRect(4, this.hudH + 4, this.W - 8, this.H - this.hudH - 8);
    c.globalAlpha = 1;
  }

  private drawHud(c: CanvasRenderingContext2D) {
    if (this.mode !== 'play') return;
    const { W, hudH, u } = this;
    const fs = Math.round(clamp(hudH * 0.5, 15, 26));
    c.textBaseline = 'middle';
    c.fillStyle = INK;
    c.font = `${fs}px ${F_DISP}`;
    c.textAlign = 'left';
    c.fillText(`SCORE ${fmt(this.score)}`, 14, hudH / 2);
    // série et multiplicateur
    const mult = Math.min(5, 1 + Math.floor(this.streak / 3));
    c.textAlign = 'center';
    if (this.streak > 0) {
      c.fillStyle = mult > 1 ? GOLD : INK;
      c.fillText(`${mult > 1 ? `×${mult} · ` : ''}SÉRIE ${this.streak}`, W / 2, hudH / 2);
    }
    // jauge d'encre (distance à la tache) + bouclier : à droite, avant le bouton pause
    const bw = clamp(W * 0.18, 70, 150);
    const bx = W - 62 - bw;
    const by = hudH / 2 - 7 * u;
    c.fillStyle = 'rgba(27,25,21,0.15)';
    c.fillRect(bx, by, bw, 14 * u);
    c.fillStyle = this.flood < 0.3 ? RED : INK;
    c.fillRect(bx, by, bw * clamp(this.flood, 0, 1), 14 * u);
    c.strokeStyle = INK;
    c.lineWidth = 2;
    c.strokeRect(bx, by, bw, 14 * u);
    if (this.shield) {
      c.fillStyle = GOLD;
      c.beginPath();
      c.arc(bx - 16, hudH / 2, 9 * u, 0, TAU);
      c.fill();
      c.strokeStyle = INK;
      c.stroke();
    }
    c.textAlign = 'left';
  }

  private drawQuestion(c: CanvasRenderingContext2D) {
    const g = this.gate;
    const { W, qH } = this;
    const y0 = this.hudH + 2;
    let s = '';
    if (this.mode === 'play') {
      if (g && g.state === 0) s = g.q.text;
      else if (g) s = g.q.text.replace('?', String(g.q.answer));
      else if (this.t < 1) s = 'Prêt ?';
    } else if (g) s = g.q.text;
    if (!s) return;
    const w = Math.min(W - 24, 520);
    c.fillStyle = PAPER_HI;
    c.strokeStyle = INK;
    c.lineWidth = 3;
    rr(c, (W - w) / 2, y0 + 3, w, qH - 6, 10);
    c.fill();
    c.stroke();
    c.fillStyle = INK;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    const size = Math.round(clamp(qH * 0.58, 22, 46));
    c.font = `${size}px ${F_DISP}`;
    let fs = size;
    while (c.measureText(s).width > w - 24 && fs > 14) {
      fs -= 2;
      c.font = `${fs}px ${F_DISP}`;
    }
    c.fillText(s, W / 2, y0 + qH / 2 + 2);
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
      const y = t.y - p * 28;
      c.lineWidth = 5;
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
    const p = 1 - this.bannerT / 1.4;
    const a = p < 0.15 ? p / 0.15 : p > 0.75 ? (1 - p) / 0.25 : 1;
    c.globalAlpha = clamp(a, 0, 1);
    c.font = `${Math.round(54 * this.u)}px ${F_DISP}`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.lineWidth = 8;
    c.strokeStyle = PAPER_HI;
    const y = this.laneTop + this.laneH * 1.5;
    c.strokeText(this.banner, this.W / 2, y);
    c.fillStyle = RED;
    c.fillText(this.banner, this.W / 2, y);
    c.globalAlpha = 1;
    c.textAlign = 'left';
  }

  private drawHint(c: CanvasRenderingContext2D) {
    if (this.mode !== 'play' || this.over || this.hintT > 50 || this.asked > 1 || this.t > 9) return;
    c.globalAlpha = 0.85 + 0.15 * Math.sin(this.pulse * 5);
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    const touch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    const s = touch ? 'Touche une ligne pour y placer la plume' : 'Flèches ↑ ↓ pour changer de ligne';
    const size = Math.round(clamp(this.W * 0.03, 15, 22));
    c.font = `${size}px ${F_DISP}`;
    const w = c.measureText(s).width + 28;
    const x = this.W * 0.56;
    const y = this.H - 28 * this.u - 4;
    c.fillStyle = INK;
    rr(c, x - w / 2, y - size, w, size * 2, 8);
    c.fill();
    c.fillStyle = PAPER_HI;
    c.fillText(s, x, y);
    c.globalAlpha = 1;
    c.textAlign = 'left';
  }
}
