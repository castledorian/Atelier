import type { Sfx, SfxName } from './audio';
import type { LetterStats } from './analysis';
import { DEFAULT_CUSTOM, DIFFICULTIES, MAX_LIVES, buildCustomConfig, crossTime, forGrade, gapBase } from './difficulty';
import type { Grade } from './grade';
import type { CustomConfig, DiffConfig, Difficulty, Penalty } from './difficulty';
import { letterPool } from './layouts';
import type { Layout } from './storage';
import { pickLetter, pickWord } from './words';
import { clamp, F_DISP, F_WORD, HEAD, INK, PAPER, PAPER_HI, rand, RED, RED_HI, rr, TAU } from './canvas';

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

type Kind = 'tache' | 'goutte' | 'pate' | 'boss';
type Mode = 'demo' | 'play' | 'over';

interface Enemy {
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

interface Shot {
  e: Enemy;
  ch: string;
  t: number;
  final: boolean;
  stage: boolean;
}

interface Part {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  life: number;
  max: number;
  red: boolean;
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
  life: number;
  c: string;
}

const COMBO_STEP = 15;
const MAX_PARTS = 520;
const FLAVOR = [
  'Gardez la cadence',
  'Encore plus d’encre',
  'Ça coule de partout',
  'Pas de fautes de frappe',
  'La page se remplit',
  'Plus vite, dactylo',
];

const byY = (a: Enemy, b: Enemy) => a.y - b.y;
const multFor = (combo: number) => Math.min(6, 1 + Math.floor(combo / COMBO_STEP));
const fmt = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

function backOut(p: number) {
  const s = 1.9;
  const q = p - 1;
  return q * q * ((s + 1) * q + s) + 1;
}

export class Game {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly sfx: Sfx;
  private readonly cb: GameCallbacks;
  private readonly bg = document.createElement('canvas');
  private readonly stains = document.createElement('canvas');
  private readonly sctx: CanvasRenderingContext2D;
  private readonly px = new Float32Array(20);
  private readonly py = new Float32Array(20);
  private ro: ResizeObserver | null = null;
  private raf = 0;
  private last = 0;
  private dirty = true;
  /**
   * Qualité automatique : résolution maximale du canvas (1 = un pixel par pixel CSS).
   * Si l'ordinateur n'arrive pas à suivre 60 images/s, on baisse la résolution plutôt que de saccader.
   */
  private quality = 2;
  private slowAvg = 16.7;
  private slowFrames = 0;
  private cwFont = '';
  /** démo d'arrière-plan figée (ordinateur trop lent : le menu reste fluide) */
  private demoStill = false;
  /** extrait ouvert depuis l'accueil : la démonstration est jouée avec le son */
  private demoSound = false;

  // Géométrie (pixels CSS)
  private W = 0;
  private H = 0;
  private dpr = 1;
  private hudH = 58;
  private baseH = 32;
  private dangerY = 400;
  private ox = 160;
  private oy = 448;
  private fs = 20;
  private cw = 12;
  private u = 1;
  private travel = 300;
  private compact = false;

  // État
  private mode: Mode = 'demo';
  private paused = false;
  private shakeOn = true;
  private touch = false;
  private cfg: DiffConfig = DIFFICULTIES.standard;
  private fWord = F_WORD;
  private fDisp = F_DISP;
  private wordScale = 1;
  /** entraînement ciblé : lettres à travailler (majuscules), ou null pour une partie normale */
  private drill: string | null = null;
  private letterOk: Record<string, number> = {};
  private letterErr: Record<string, number> = {};
  private layout: Layout = 'azerty';
  private time = 0;
  private real = 0;
  private enemies: Enemy[] = [];
  private shots: Shot[] = [];
  private parts: Part[] = [];
  private texts: Txt[] = [];
  private rings: Ring[] = [];
  private target: Enemy | null = null;
  private lastHint: string | null = null;

  private score = 0;
  private shown = 0;
  private combo = 0;
  private maxCombo = 0;
  private mult = 1;
  private lives = 3;
  private wave = 0;
  private kills = 0;
  private correct = 0;
  private errors = 0;
  private playTime = 0;
  private charge = 0;

  private queue: Kind[] = [];
  private spawnT = 0;
  private clearing = false;
  private clearT = 0;
  private banner: { t: number; text: string; sub: string } | null = null;
  private lane1 = -1;
  private lane2 = -1;
  private botT = 0;
  private sweep: { t: number } | null = null;
  private overT = 0;
  private overSent = false;

  // Ressenti
  private trauma = 0;
  private hitStop = 0;
  private slowT = 0;
  private flash = 0;
  private stainT = 0;
  private slugKick = 0;
  private slugErr = 0;
  private slugCh = '';
  private scorePunch = 0;
  private multPunch = 0;
  private livesPunch = 0;

  constructor(canvas: HTMLCanvasElement, sfx: Sfx, cb: GameCallbacks) {
    this.canvas = canvas;
    this.sfx = sfx;
    this.cb = cb;
    this.ctx = canvas.getContext('2d', { alpha: false }) as CanvasRenderingContext2D;
    this.sctx = this.stains.getContext('2d') as CanvasRenderingContext2D;
    this.resize();
    if (typeof ResizeObserver !== 'undefined') {
      this.ro = new ResizeObserver(this.resize);
      this.ro.observe(canvas);
    }
    window.addEventListener('resize', this.resize);
    if (document.fonts?.load) {
      void document.fonts.load(`700 20px ${F_WORD}`).catch(() => {});
      void document.fonts.load(`20px ${F_DISP}`).catch(() => {});
    }
    this.startDemo();
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  // ───────────────────────── API publique ─────────────────────────

  start(diff: Difficulty = 'standard', drill?: string, custom: CustomConfig = DEFAULT_CUSTOM, grade: Grade | null = null) {
    // la séance de l'enseignant (perso) a ses propres réglages : la classe ne les modifie pas
    const base = diff === 'perso' ? buildCustomConfig(custom) : forGrade(DIFFICULTIES[diff], grade);
    const letters = (drill ?? '').toUpperCase().replace(/[^A-Z]/g, '');
    this.drill = letters || null;
    this.cfg = this.drill ? { ...base, letterWaves: 999, goutteMul: Math.min(base.goutteMul, 1.2), bossLife: false } : base;
    this.reset();
    this.mode = 'play';
    this.paused = false;
    // le menu a déjà montré que l'ordinateur est lent : on démarre directement en qualité allégée
    if (this.demoStill && this.quality > 1) {
      this.quality = 1;
      this.resize();
    }
    this.snd('start');
    this.startWave(1);
    this.last = performance.now();
  }

  setDemoSound(on: boolean) {
    this.demoSound = on;
  }

  startDemo() {
    this.cfg = DIFFICULTIES.standard;
    this.drill = null;
    this.reset();
    this.mode = 'demo';
    this.paused = false;
    this.wave = 3;
    this.spawnT = 0.2;
    this.last = performance.now();
  }

  setPaused(p: boolean) {
    if (this.mode !== 'play') return;
    this.paused = p;
    this.dirty = true;
    this.last = performance.now();
  }

  setOptions(o: { shake: boolean; touch: boolean; layout?: Layout; wordScale?: number }) {
    this.shakeOn = o.shake;
    this.touch = o.touch;
    if (o.layout) this.layout = o.layout;
    if (o.wordScale) {
      this.wordScale = o.wordScale;
      this.fs = Math.round((this.W < 520 ? 17 : 21) * this.wordScale);
    }
    this.dirty = true;
  }

  /** Une frappe = un coup. */
  key(raw: string, bot = false) {
    if (this.paused) return;
    if (this.mode !== 'play' && !(bot && this.mode === 'demo')) return;
    const ch = raw.toUpperCase();
    if (ch.length !== 1 || ch < 'A' || ch > 'Z') return;
    this.slugKick = 1;
    this.slugCh = ch;
    let t = this.target;
    if (t && (t.dead || t.doomed)) t = this.target = null;
    // cible automatique : si on tape la première lettre d'un autre ennemi, on change de cible sans pénalité
    if (t && this.cfg.autoTarget && t.typed === 0 && t.word[0] !== ch) {
      const alt = this.findByNext(ch);
      if (alt) t = this.target = alt;
    }
    if (!t) {
      const best = this.findByNext(ch);
      if (!best) {
        if (this.liveCount() > 0) this.miss(); // lettre attendue inconnue : pas de statistique par lettre
        else this.snd('key');
        return;
      }
      t = this.target = best;
    }
    if (t.word[t.typed] !== ch) {
      this.miss(t.word[t.typed]);
      return;
    }
    this.hit(t, ch);
  }

  private findByNext(ch: string): Enemy | null {
    let best: Enemy | null = null;
    for (const e of this.enemies) {
      if (e.dead || e.doomed || e.word[e.typed] !== ch) continue;
      if (!best || e.y + e.r > best.y + best.r) best = e;
    }
    return best;
  }

  /** Cible automatique : l'ennemi visible le plus proche de la marge. */
  private autoAim(exclude: Enemy | null = null): boolean {
    let best: Enemy | null = null;
    for (const e of this.enemies) {
      if (e.dead || e.doomed || e === exclude || e.typed >= e.word.length) continue;
      if (e.y + e.r < this.hudH + 8) continue;
      if (!best || e.y + e.r > best.y + best.r) best = e;
    }
    if (!best) return false;
    this.target = best;
    this.emitHint();
    return true;
  }

  /** Lâche la cible verrouillée (les dégâts déjà infligés restent). */
  release() {
    if (this.mode !== 'play' || this.paused || !this.target) return;
    const cur = this.target;
    this.target = null;
    if (this.cfg.autoTarget && this.autoAim(cur)) return;
    this.emitHint();
  }

  /** Retour chariot : balaie tout l'écran quand la jauge est pleine. */
  chariot(): boolean {
    if (this.mode !== 'play' || this.paused || this.sweep || this.charge < this.cfg.chargeMax) return false;
    this.charge = 0;
    this.cb.onCharge(false);
    this.sweep = { t: 0 };
    this.snd('sweep');
    this.addTrauma(0.5);
    this.text(this.W / 2, this.hudH + this.travel * 0.45, 'RETOUR CHARIOT !', RED, 26);
    return true;
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.ro?.disconnect();
    window.removeEventListener('resize', this.resize);
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

  /** Surveille la durée des images ; trop lent pendant ~1,5 s → résolution plus basse (jamais remontée pendant la session). */
  private watchSpeed(ms: number) {
    if (ms <= 0 || ms > 200) return; // onglet caché, pause… : non significatif
    this.slowAvg += (ms - this.slowAvg) * 0.05;
    if (this.slowAvg > 21) this.slowFrames++;
    else this.slowFrames = Math.max(0, this.slowFrames - 2);
    if (this.slowFrames < 60) return;
    if (this.mode === 'demo') {
      // derrière le menu, l'animation n'est qu'un décor : on la fige plutôt que de ralentir l'écran
      this.demoStill = true;
      this.slowFrames = 0;
      this.slowAvg = 16.7;
      return;
    }
    if (this.quality <= 0.75) return;
    const cur = Math.min(this.quality, window.devicePixelRatio || 1);
    this.quality = cur > 1.5 ? 1.5 : cur > 1 ? 1 : 0.75;
    this.slowFrames = 0;
    this.slowAvg = 16.7;
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
    this.compact = H < 360;
    this.hudH = this.compact ? 42 : 58;
    this.baseH = this.compact ? 24 : 32;
    this.dangerY = H - this.baseH - (this.compact ? 30 : 38);
    this.ox = W / 2;
    this.oy = H - this.baseH;
    this.fs = Math.round((W < 520 ? 17 : 21) * this.wordScale);
    this.u = clamp(Math.min(W, H) / 620, 0.72, 1.1);
    this.travel = Math.max(80, this.dangerY - this.hudH);
    for (const e of this.enemies) e.bx = clamp(e.bx, 30, W - 30);
    this.buildBg();
    this.render();
  };

  private buildBg() {
    const { W, H, dpr } = this;
    const m = 20;
    this.bg.width = Math.round((W + m * 2) * dpr);
    this.bg.height = Math.round((H + m * 2) * dpr);
    const c = this.bg.getContext('2d') as CanvasRenderingContext2D;
    c.setTransform(dpr, 0, 0, dpr, m * dpr, m * dpr);
    c.fillStyle = PAPER;
    c.fillRect(-m, -m, W + m * 2, H + m * 2);
    // grain du papier
    const specks = Math.min(4500, Math.round((W * H) / 320));
    for (let i = 0; i < specks; i++) {
      c.fillStyle = Math.random() < 0.5 ? 'rgba(90,70,40,.07)' : 'rgba(255,255,255,.22)';
      c.fillRect(rand(-m, W + m), rand(-m, H + m), rand(0.6, 1.6), rand(0.6, 1.6));
    }
    c.strokeStyle = 'rgba(90,70,40,.06)';
    c.lineWidth = 0.7;
    for (let i = 0; i < 70; i++) {
      const x = rand(0, W);
      const y = rand(0, H);
      const a = rand(0, TAU);
      const l = rand(6, 22);
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
      c.stroke();
    }
    // lignes de cahier
    c.strokeStyle = 'rgba(59,91,140,.14)';
    c.lineWidth = 1;
    c.beginPath();
    for (let y = this.hudH + 34.5; y < this.dangerY - 8; y += 34) {
      c.moveTo(-m, y);
      c.lineTo(W + m, y);
    }
    c.stroke();
    // bords légèrement vieillis
    const g = c.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
    g.addColorStop(0, 'rgba(120,90,40,0)');
    g.addColorStop(1, 'rgba(120,90,40,.2)');
    c.fillStyle = g;
    c.fillRect(-m, -m, W + m * 2, H + m * 2);
  }

  private reset() {
    this.enemies = [];
    this.shots = [];
    this.parts = [];
    this.texts = [];
    this.rings = [];
    this.target = null;
    this.score = 0;
    this.shown = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.mult = 1;
    this.letterOk = {};
    this.letterErr = {};
    this.lives = Math.min(MAX_LIVES, this.cfg.lives);
    this.wave = 0;
    this.kills = 0;
    this.correct = 0;
    this.errors = 0;
    this.playTime = 0;
    this.charge = 0;
    this.queue = [];
    this.spawnT = 0;
    this.clearing = false;
    this.banner = null;
    this.sweep = null;
    this.overT = 0;
    this.overSent = false;
    this.trauma = 0;
    this.hitStop = 0;
    this.slowT = 0;
    this.flash = 0;
    this.slugCh = '';
    this.slugErr = 0;
    this.lane1 = this.lane2 = -1;
    this.sctx.clearRect(0, 0, this.W, this.H);
    this.lastHint = null;
    this.cb.onHint(null);
    this.cb.onCharge(false);
  }

  private stats(): RunStats {
    const total = this.correct + this.errors;
    return {
      score: this.score,
      wave: this.wave,
      kills: this.kills,
      correct: this.correct,
      errors: this.errors,
      accuracy: total ? this.correct / total : 1,
      wpm: this.playTime > 2 ? Math.round(this.correct / 5 / (this.playTime / 60)) : 0,
      maxCombo: this.maxCombo,
      time: this.playTime,
      letters: this.letterStats(),
    };
  }

  private letterStats(): LetterStats {
    const out: LetterStats = {};
    for (const ch of new Set([...Object.keys(this.letterOk), ...Object.keys(this.letterErr)])) {
      out[ch] = { ok: this.letterOk[ch] ?? 0, err: this.letterErr[ch] ?? 0 };
    }
    return out;
  }

  private snd(name: SfxName) {
    if (this.mode !== 'demo' || this.demoSound) this.sfx.play(name);
  }

  private addTrauma(v: number) {
    this.trauma = Math.min(1, this.trauma + (this.mode === 'demo' ? v * 0.25 : v));
  }

  private emitHint() {
    if (this.mode === 'demo') return;
    const t = this.target;
    const next = t && !t.doomed && t.typed < t.word.length ? t.word[t.typed] : null;
    if (next !== this.lastHint) {
      this.lastHint = next;
      this.cb.onHint(next);
    }
  }

  private liveCount() {
    let n = 0;
    for (const e of this.enemies) if (!e.dead && !e.doomed) n++;
    return n;
  }

  // ───────────────────────── Logique ─────────────────────────

  private update(dt: number) {
    this.real += dt;
    this.trauma = Math.max(0, this.trauma - dt * 1.9);
    this.flash = Math.max(0, this.flash - dt * 2.2);
    this.slugKick = Math.max(0, this.slugKick - dt * 9);
    this.slugErr = Math.max(0, this.slugErr - dt);
    this.scorePunch = Math.max(0, this.scorePunch - dt * 5);
    this.multPunch = Math.max(0, this.multPunch - dt * 3.5);
    this.livesPunch = Math.max(0, this.livesPunch - dt * 2.5);
    this.shown += (this.score - this.shown) * Math.min(1, dt * 12);
    if (this.score - this.shown < 1) this.shown = this.score;

    let sdt = dt;
    if (this.hitStop > 0) {
      this.hitStop -= dt;
      sdt = 0;
    } else if (this.slowT > 0) {
      this.slowT -= dt;
      sdt = dt * 0.3;
    }
    this.time += sdt;

    if (this.mode === 'play') {
      this.playTime += dt;
      this.updateWave(sdt);
      this.updateEnemies(sdt);
      if (this.cfg.autoTarget && !this.paused && (!this.target || this.target.dead || this.target.doomed)) {
        this.target = null;
        this.autoAim();
      }
    } else if (this.mode === 'demo') {
      this.updateDemo(sdt);
      this.updateEnemies(sdt);
    } else {
      this.overT += dt;
      if (!this.overSent && this.overT > 0.95) {
        this.overSent = true;
        this.cb.onGameOver(this.stats());
      }
    }
    this.updateShots(sdt);
    this.updateSweep(sdt);
    this.updateFx(sdt, dt);
  }

  private startWave(n: number) {
    const c = this.cfg;
    this.wave = n;
    this.clearing = false;
    const boss = n % 5 === 0 && !this.drill;
    const letters = n <= c.letterWaves; // vagues d'apprentissage : lettres isolées, rangée par rangée
    const raw = boss ? 4 + Math.floor(n / 2) : 5 + Math.floor(n * c.growth);
    const count = letters ? Math.min(this.drill || c.letterWaves >= 999 ? 14 : 99, 6 + 2 * n) : Math.max(3, Math.round(raw * c.countMul));
    const pates = n >= c.pateFrom && !letters ? 1 + Math.floor((n - c.pateFrom) / c.pateEvery) : 0;
    const gouttes = letters ? count : n >= c.goutteFrom ? c.goutteBase + Math.floor(n / c.goutteDiv) : 0;
    const taches = letters ? 0 : Math.max(2, count - pates - gouttes);
    const q: Kind[] = [];
    for (let i = 0; i < taches; i++) q.push('tache');
    for (let i = 0; i < pates; i++) q.push('pate');
    for (let i = 0; i < gouttes; i++) q.push('goutte');
    for (let i = q.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      const tmp = q[i];
      q[i] = q[j];
      q[j] = tmp;
    }
    if (n <= 3 && !letters) {
      // toujours ouvrir sur une tache facile
      const k = q.indexOf('tache');
      if (k > 0) {
        q[k] = q[0];
        q[0] = 'tache';
      }
    }
    if (boss) q.splice(1, 0, 'boss');
    this.queue = q;
    this.spawnT = n === 1 ? 0.25 : 0.7;
    let sub: string;
    if (this.drill) {
      sub = `Tes lettres : ${this.drill.split('').join(' ')}`;
    } else if (letters && c.letterWaves >= 999) {
      sub = 'Tapez les lettres';
    } else if (letters) {
      sub = n === 1 ? 'Rangée du milieu : suis la touche rouge' : n === 2 ? 'On ajoute la rangée du haut' : 'Et la rangée du bas';
    } else if (c.letterWaves > 0 && n === c.letterWaves + 1) {
      sub = 'Place aux mots !';
    } else {
      sub =
        n === 1
          ? 'Tapez les mots pour tirer'
          : n === 2
            ? 'Les gouttes filent vite'
            : n === 3
              ? 'Gare aux gros pâtés'
              : boss
                ? 'La Grande Rature approche'
                : FLAVOR[n % FLAVOR.length];
    }
    this.banner = { t: 0, text: `VAGUE ${n}`, sub };
    if (n > 1) this.snd('wave');
  }

  private updateWave(dt: number) {
    if (this.banner) {
      this.banner.t += dt;
      if (this.banner.t > 2.3) this.banner = null;
    }
    if (this.clearing) {
      this.clearT -= dt;
      if (this.clearT <= 0) this.startWave(this.wave + 1);
      return;
    }
    if (this.queue.length) {
      this.spawnT -= dt;
      // jamais de temps mort : il reste toujours de quoi viser
      const floor = this.wave === 1 ? this.cfg.floor1 : this.cfg.floor;
      if (this.spawnT > 0.3 && this.liveCount() < floor) this.spawnT = 0.3;
      if (this.spawnT <= 0) {
        const k = this.queue.shift() as Kind;
        this.spawn(k);
        const base = gapBase(this.cfg, this.wave);
        // les ennemis arrivent par grappes, suivies d'un court répit
        const cluster = this.wave > 1 && Math.random() < this.cfg.clusterP;
        const gap = cluster
          ? rand(0.25, 0.45)
          : base * (this.wave === 1 ? rand(0.8, 1.1) : rand(1.1, 1.6));
        this.spawnT = gap * (this.queue[0] === 'goutte' ? 0.6 : 1) * (k === 'boss' ? 2.5 : 1);
      }
    } else if (this.enemies.length === 0 && this.shots.length === 0) {
      const bonus = 100 * this.wave;
      this.score += bonus;
      this.scorePunch = 1;
      this.text(this.W / 2, this.hudH + this.travel * 0.4, 'VAGUE NETTOYÉE', INK, 24);
      this.text(this.W / 2, this.hudH + this.travel * 0.4 + 30, `+${bonus}`, RED, 22);
      this.snd('clear');
      this.clearing = true;
      this.clearT = 1.1;
    }
  }

  private updateDemo(dt: number) {
    this.spawnT -= dt;
    if (this.spawnT <= 0 && this.enemies.length < 7) {
      this.spawn(Math.random() < 0.18 ? 'pate' : 'tache');
      this.spawnT = rand(0.7, 1.3);
    }
    this.botT -= dt;
    if (this.botT <= 0) {
      this.botT = rand(0.09, 0.2);
      let t = this.target;
      if (!t || t.dead || t.doomed) {
        t = null;
        const minY = this.hudH + this.travel * 0.42;
        for (const e of this.enemies) {
          if (e.dead || e.doomed || e.y < minY) continue;
          if (!t || e.y > t.y) t = e;
        }
      }
      if (t && t.typed < t.word.length) this.key(t.word[t.typed], true);
    }
  }

  private firstLetters(): Set<string> {
    const s = new Set<string>();
    for (const e of this.enemies) {
      if (!e.dead && e.typed < e.word.length) s.add(e.word[e.typed]);
    }
    return s;
  }

  private laneX(): number {
    const pad = 44;
    const lanes = Math.max(3, Math.floor((this.W - pad * 2) / 96));
    let lane = 0;
    for (let i = 0; i < 8; i++) {
      lane = (Math.random() * lanes) | 0;
      if (lane !== this.lane1 && lane !== this.lane2) break;
    }
    this.lane2 = this.lane1;
    this.lane1 = lane;
    const lw = (this.W - pad * 2) / lanes;
    return pad + (lane + 0.5) * lw + rand(-lw * 0.2, lw * 0.2);
  }

  private spawn(kind: Kind, at?: { x: number; y: number; vx: number }): Enemy {
    const n = this.wave;
    const avoid = this.firstLetters();
    const queue: string[] = [];
    let word: string;
    const c = this.cfg;
    if (kind === 'goutte') {
      const pool = this.drill ?? c.allowed ?? (n <= c.letterWaves ? letterPool(this.layout, n) : undefined);
      word = pickLetter(avoid, pool);
    } else if (kind === 'tache') {
      const [lo, hi] = c.tache(n);
      word = pickWord(Math.min(lo, c.wordMax), Math.min(hi, c.wordMax), avoid, c.allowed);
    } else if (kind === 'pate') {
      const [lo, hi] = c.pate(n);
      word = pickWord(Math.min(lo, c.wordMax), Math.min(hi, c.wordMax), avoid, c.allowed);
    } else {
      const cnt = Math.min(c.bossMax, c.bossBase + Math.floor(n / c.bossDiv));
      const off = c.bossLenOff;
      for (let i = 0; i < cnt; i++) {
        const lo = Math.min(12, Math.max(3, 5 + Math.min(i, 3) + off));
        const hi = Math.min(c.wordMax, 12, Math.max(lo, 8 + Math.min(i, 3) + off));
        queue.push(pickWord(Math.min(lo, hi), hi, avoid, c.allowed));
      }
      word = queue.shift() as string;
    }
    const u = this.u;
    const cross = crossTime(c, n);
    const mul = kind === 'goutte' ? c.goutteMul : kind === 'pate' ? 0.6 : kind === 'boss' ? 0.2 : 1;
    const r0 =
      kind === 'boss'
        ? Math.min(this.W * 0.17, 76)
        : kind === 'goutte'
          ? 13 * u
          : kind === 'pate'
            ? (26 + word.length * 2.2) * u
            : (19 + word.length * 2.4) * u;
    const x = at ? at.x : kind === 'boss' ? this.W / 2 : this.laneX();
    const e: Enemy = {
      kind,
      word,
      typed: 0,
      queue,
      total: queue.length + 1,
      x,
      y: at ? at.y : this.hudH - r0,
      bx: x,
      vx: at ? at.vx : 0,
      speed: (this.travel / cross) * mul * rand(0.92, 1.08),
      // à l'apparition, l'encre dégouline vite dans le champ avant de ralentir
      kick: at ? -this.travel * 0.5 : this.travel * (kind === 'boss' ? 2.3 : rand(1.2, 2.1)),
      swayA: kind === 'boss' ? this.W * 0.16 : kind === 'goutte' ? rand(10, 22) : rand(4, 14),
      swayF: kind === 'boss' ? 0.45 : rand(0.8, 1.7),
      phase: kind === 'boss' ? 0 : rand(0, TAU),
      r: r0,
      r0,
      seed: rand(0, 100),
      age: 0,
      squash: 0,
      flash: 0,
      err: 0,
      doomed: false,
      doomT: 0,
      dead: false,
      swept: false,
      bonus: 0,
      spit: 2.5,
      dmg: kind === 'boss' ? c.bossDmg : 1,
    };
    this.enemies.push(e);
    return e;
  }

  private updateEnemies(dt: number) {
    const es = this.enemies;
    const minY = this.hudH;
    for (let i = 0, n = es.length; i < n; i++) {
      const e = es[i];
      if (e.dead) continue;
      e.age += dt;
      e.kick *= Math.exp(-8 * dt);
      e.vx *= Math.exp(-4 * dt);
      if (!e.doomed) e.y += e.speed * dt;
      // le recul ne renvoie jamais un ennemi se cacher sous l'en-tête
      const top = minY + e.r + 6;
      const ky = e.y + e.kick * dt;
      e.y = e.kick < 0 && ky < top ? Math.max(ky, Math.min(e.y, top)) : ky;
      e.bx = clamp(e.bx + e.vx * dt, e.r0 + 6, this.W - e.r0 - 6);
      e.x = e.bx + Math.sin(e.age * e.swayF + e.phase) * e.swayA;
      e.squash = Math.max(0, e.squash - dt * 4);
      e.flash -= dt;
      e.err = Math.max(0, e.err - dt);
      const left = 1 - e.typed / e.word.length;
      const frac = e.kind === 'boss' ? (e.queue.length + left) / e.total : left;
      e.r += (e.r0 * (0.6 + 0.4 * frac) - e.r) * Math.min(1, dt * 14);
      if (e.doomed) {
        e.doomT += dt;
        if (e.doomT > 0.22) this.explode(e);
        continue;
      }
      if (e.kind === 'boss') {
        e.spit -= dt;
        if (e.spit <= 0) {
          e.spit = rand(1.9, 2.9) * this.cfg.spitMul;
          let g = 0;
          for (const o of es) if (!o.dead && o.kind === 'goutte') g++;
          if (g < this.cfg.spitCap) {
            this.spawn('goutte', { x: e.x, y: e.y + e.r * 0.6, vx: rand(-200, 200) });
            e.squash = 0.3;
          }
        }
      }
      if (e.y + e.r >= this.dangerY) this.breach(e);
    }
    let j = 0;
    for (let i = 0; i < es.length; i++) {
      const e = es[i];
      if (!e.dead) es[j++] = e;
    }
    es.length = j;
  }

  private hit(t: Enemy, ch: string) {
    t.typed++;
    this.correct++;
    this.letterOk[ch] = (this.letterOk[ch] ?? 0) + 1;
    this.combo++;
    if (this.combo > this.maxCombo) this.maxCombo = this.combo;
    const m = multFor(this.combo);
    if (m > this.mult) {
      this.mult = m;
      this.multPunch = 1;
      if (this.mode === 'play') this.text(this.ox, this.oy - 64, `×${m}`, RED, 34);
      this.snd('mult');
    }
    this.score += 10 * this.mult;
    this.scorePunch = Math.max(this.scorePunch, 0.45);
    this.addCharge(this.cfg.chargeLetter);
    const final = t.typed >= t.word.length;
    const shot: Shot = { e: t, ch, t: 0, final, stage: false };
    this.shots.push(shot);
    this.snd('key');
    if (final) {
      this.target = null;
      this.addCharge(t.word.length * this.cfg.chargeWord); // la jauge récompense les mots terminés
      if (t.kind === 'boss') {
        shot.stage = true;
      } else {
        t.doomed = true;
        t.doomT = 0;
        this.kills++;
        const bonus = t.word.length * 15 * this.mult;
        this.score += bonus;
        t.bonus = bonus;
      }
    }
    this.emitHint();
  }

  /** Jauge du retour chariot. Une jauge pleine est acquise : les fautes ne la vident pas. */
  private addCharge(v: number) {
    if (this.mode !== 'play' || v === 0) return;
    const max = this.cfg.chargeMax;
    if (this.charge >= max) return;
    this.charge = clamp(this.charge + v, 0, max);
    if (this.charge >= max) {
      this.cb.onCharge(true);
      this.snd('ready');
      this.text(this.ox, this.oy - 64, 'RETOUR CHARIOT PRÊT', RED, 18);
    }
  }

  /** Pénalité de combo : aucune, un seul palier de multiplicateur, ou remise à zéro. */
  private penalize(kind: Penalty) {
    if (kind === 'none') return;
    if (kind === 'reset') {
      if (this.combo >= COMBO_STEP) this.text(this.ox, this.oy - 64, 'COMBO PERDU', RED, 17);
      this.combo = 0;
      this.mult = 1;
      return;
    }
    const next = Math.max(1, this.mult - 1);
    if (this.mult > 1) this.text(this.ox, this.oy - 64, `PALIER −1  ×${next}`, RED, 17);
    this.mult = next;
    this.combo = COMBO_STEP * (next - 1);
  }

  private miss(expected?: string) {
    this.errors++;
    if (expected) this.letterErr[expected] = (this.letterErr[expected] ?? 0) + 1;
    this.penalize(this.cfg.missPenalty);
    this.addCharge(-this.cfg.chargeMiss); // une faute coûte un peu de jauge (jamais si elle est déjà pleine)
    this.slugErr = 0.25;
    if (this.target) this.target.err = 0.3;
    this.addTrauma(this.cfg.missPenalty === 'none' ? 0.06 : 0.14);
    this.snd('error');
  }

  private updateShots(dt: number) {
    const ss = this.shots;
    for (let i = ss.length - 1; i >= 0; i--) {
      const s = ss[i];
      s.t += dt / 0.08;
      if (s.e.dead) {
        ss.splice(i, 1);
      } else if (s.t >= 1) {
        ss.splice(i, 1);
        this.impact(s);
      }
    }
  }

  private impact(s: Shot) {
    const e = s.e;
    e.squash = 0.4;
    e.flash = 0.07;
    if (!e.doomed) {
      const k = e.kind === 'boss' ? 0.04 : e.kind === 'pate' ? 0.11 : 0.2;
      e.kick -= this.travel * k;
    }
    this.spray(e.x, e.y + e.r * 0.5, 4, Math.PI / 2, 1.1, 70, 240);
    this.addTrauma(0.07);
    this.snd('hit');
    if (s.stage) this.bossStage(e);
    else if (s.final && e.doomed) this.explode(e);
  }

  private bossStage(e: Enemy) {
    if (e.dead) return;
    if (this.target === e) {
      this.target = null;
      this.emitHint();
    }
    if (e.queue.length === 0) {
      this.kills++;
      const bonus = 500 * this.mult;
      this.score += bonus;
      e.bonus = bonus;
      e.doomed = true;
      this.explode(e);
      if (this.mode === 'play' && this.cfg.bossLife && this.lives < this.cfg.maxLives) {
        this.lives = Math.min(MAX_LIVES, this.lives + 1);
        this.livesPunch = 1;
        this.text(this.W / 2, this.hudH + this.travel * 0.3 + 38, '+1 VIE', RED, 24);
        this.snd('mult');
      }
      return;
    }
    e.word = e.queue.shift() as string;
    e.typed = 0;
    e.kick = -this.travel * 1.3;
    e.squash = 0.5;
    e.flash = 0.14;
    const bonus = 100 * this.mult;
    this.score += bonus;
    this.scorePunch = 1;
    this.burst(e.x, e.y, 26, 120, 460, e.r * 0.6, false);
    this.rings.push({ x: e.x, y: e.y, r: e.r0 * 2.2, age: 0, life: 0.4, c: INK });
    this.text(e.x, e.y - e.r - 6, `TOUCHÉ +${bonus}`, RED, 22);
    this.addTrauma(0.45);
    if (this.mode === 'play') this.hitStop = Math.max(this.hitStop, 0.06);
    this.snd('kill');
  }

  private explode(e: Enemy) {
    if (e.dead) return;
    e.dead = true;
    if (this.target === e) {
      this.target = null;
      this.emitHint();
    }
    const big = e.kind === 'boss' ? 1 : e.kind === 'pate' ? 0.6 : e.kind === 'goutte' ? 0.08 : 0.3;
    this.burst(e.x, e.y, Math.round(9 + big * 55), 70, 260 + big * 320, e.r0 * 0.5, false);
    this.rings.push({ x: e.x, y: e.y, r: e.r0 * (1.6 + big * 1.6), age: 0, life: 0.32 + big * 0.3, c: INK });
    this.stain(e.x, e.y, e.r0 * (0.75 + big * 0.7), INK);
    this.addTrauma(0.2 + big * 0.65);
    if (this.mode === 'play') this.hitStop = Math.max(this.hitStop, 0.018 + big * 0.1);
    if (e.bonus > 0) {
      this.text(e.x, e.y - e.r * 0.6, `+${e.bonus}`, INK, 17 + big * 16);
      this.scorePunch = 1;
    }
    if (e.kind === 'boss') {
      this.text(this.W / 2, this.hudH + this.travel * 0.3, 'RATURE EFFACÉE !', RED, 28);
      this.flash = 0.5;
    }
    this.snd(big >= 0.6 ? 'bigkill' : 'kill');
    if (e.kind === 'pate') {
      // un gros pâté éclate en deux gouttes
      const y = Math.max(e.y, this.hudH + 20);
      this.spawn('goutte', { x: e.x - 8, y, vx: -rand(160, 260) });
      this.spawn('goutte', { x: e.x + 8, y, vx: rand(160, 260) });
    }
  }

  private breach(e: Enemy) {
    e.dead = true;
    if (this.target === e) {
      this.target = null;
      this.emitHint();
    }
    this.burst(e.x, this.dangerY, 28, 80, 440, e.r * 0.6, true);
    this.stain(e.x, this.dangerY, e.r0 * 1.15, RED);
    this.rings.push({ x: e.x, y: this.dangerY, r: e.r0 * 3.4, age: 0, life: 0.45, c: RED });
    if (this.mode !== 'play') return;
    this.lives = Math.max(0, this.lives - e.dmg);
    this.livesPunch = 1;
    this.flash = 1;
    this.addTrauma(0.85);
    this.slowT = 0.45;
    this.penalize(this.cfg.breachPenalty);
    this.text(e.x, this.dangerY - 34, e.dmg > 1 ? '−2 VIES' : '−1 VIE', RED, 22);
    for (const o of this.enemies) {
      if (!o.dead && o.kind !== 'boss') o.kick -= this.travel * 0.9; // petit répit
    }
    this.snd('breach');
    if (this.shakeOn && this.touch) {
      try {
        navigator.vibrate?.(70);
      } catch {
        /* sans vibreur */
      }
    }
    if (this.lives <= 0) {
      this.mode = 'over';
      this.overT = 0;
      this.overSent = false;
      this.slowT = 1;
      this.banner = null;
      this.target = null;
      this.lastHint = null;
      this.cb.onHint(null);
      this.sfx.play('over');
    }
  }

  private sweepX() {
    const p = clamp(this.sweep ? this.sweep.t : 0, 0, 1);
    return -30 + (this.W + 60) * (p * p * (3 - 2 * p));
  }

  private updateSweep(dt: number) {
    const s = this.sweep;
    if (!s) return;
    s.t += dt / 0.5;
    const x = this.sweepX();
    const es = this.enemies;
    for (let i = 0, n = es.length; i < n; i++) {
      const e = es[i];
      if (e.dead || e.swept || e.x > x) continue;
      e.swept = true;
      if (e.kind === 'boss') {
        this.bossStage(e);
      } else {
        if (!e.doomed) {
          this.kills++;
          const bonus = e.word.length * 10 * this.mult;
          this.score += bonus;
          e.bonus = bonus;
        }
        this.explode(e);
      }
    }
    if (s.t >= 1) this.sweep = null;
  }

  // ───────────────────────── Effets ─────────────────────────

  private part(x: number, y: number, vx: number, vy: number, r: number, life: number, red: boolean) {
    if (this.parts.length >= MAX_PARTS) return;
    this.parts.push({ x, y, vx, vy, r, life, max: life, red });
  }

  private burst(x: number, y: number, n: number, v0: number, v1: number, rad: number, red: boolean) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU);
      const v = rand(v0, v1);
      const d = rand(0, rad);
      this.part(
        x + Math.cos(a) * d,
        y + Math.sin(a) * d,
        Math.cos(a) * v,
        Math.sin(a) * v - 60,
        rand(1.6, 6.5),
        rand(0.35, 0.85),
        red,
      );
    }
  }

  private spray(x: number, y: number, n: number, ang: number, cone: number, v0: number, v1: number) {
    for (let i = 0; i < n; i++) {
      const a = ang + rand(-cone, cone);
      const v = rand(v0, v1);
      this.part(x, y, Math.cos(a) * v, Math.sin(a) * v, rand(1.4, 4), rand(0.25, 0.5), false);
    }
  }

  private stain(x: number, y: number, r: number, color: string) {
    const c = this.sctx;
    c.globalAlpha = 0.2;
    c.fillStyle = color;
    c.beginPath();
    c.arc(x, y, r * 0.7, 0, TAU);
    for (let k = 0; k < 11; k++) {
      const a = rand(0, TAU);
      const d = r * rand(0.6, 1.9);
      const sr = r * rand(0.05, 0.24);
      const sx = x + Math.cos(a) * d;
      const sy = y + Math.sin(a) * d;
      c.moveTo(sx + sr, sy);
      c.arc(sx, sy, sr, 0, TAU);
    }
    c.fill();
    c.globalAlpha = 1;
  }

  private text(x: number, y: number, s: string, c: string, size: number) {
    const half = s.length * size * 0.32;
    const cx = half * 2 > this.W - 16 ? this.W / 2 : clamp(x, half + 8, this.W - half - 8);
    this.texts.push({ x: cx, y, s, c, size, age: 0, life: 0.9 });
    if (this.texts.length > 24) this.texts.shift();
  }

  private updateFx(sdt: number, dt: number) {
    const ps = this.parts;
    const drag = Math.exp(-2.2 * sdt);
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i];
      p.life -= sdt;
      if (p.life <= 0) {
        // les plus grosses gouttes laissent une trace sur le papier
        if (p.r > 4.4 && p.y > this.hudH && p.y < this.oy) {
          const c = this.sctx;
          c.globalAlpha = 0.13;
          c.fillStyle = p.red ? RED : INK;
          c.beginPath();
          c.arc(p.x, p.y, p.r * 0.7, 0, TAU);
          c.fill();
          c.globalAlpha = 1;
        }
        ps[i] = ps[ps.length - 1];
        ps.pop();
        continue;
      }
      p.vy += 620 * sdt;
      p.vx *= drag;
      p.x += p.vx * sdt;
      p.y += p.vy * sdt;
    }
    const ts = this.texts;
    for (let i = ts.length - 1; i >= 0; i--) {
      const t = ts[i];
      t.age += dt;
      t.y -= 42 * dt;
      if (t.age >= t.life) ts.splice(i, 1);
    }
    const rs = this.rings;
    for (let i = rs.length - 1; i >= 0; i--) {
      rs[i].age += dt;
      if (rs[i].age >= rs[i].life) rs.splice(i, 1);
    }
    // l'encre sèche : les taches s'estompent doucement
    this.stainT += dt;
    if (this.stainT > 0.3) {
      this.stainT = 0;
      const c = this.sctx;
      c.globalCompositeOperation = 'destination-out';
      c.fillStyle = 'rgba(0,0,0,.06)';
      c.fillRect(0, 0, this.W, this.H);
      c.globalCompositeOperation = 'source-over';
    }
  }

  // ───────────────────────── Rendu ─────────────────────────

  private render() {
    const c = this.ctx;
    const { W, H, dpr } = this;
    if (!W || !H) return;
    this.dirty = false;
    let shx = 0;
    let shy = 0;
    if (this.shakeOn && this.trauma > 0 && !this.paused) {
      const amt = this.trauma * this.trauma * 15;
      shx = (Math.random() * 2 - 1) * amt;
      shy = (Math.random() * 2 - 1) * amt;
    }
    // décalage arrondi au pixel près : les grandes images (fond, taches) sont copiées telles quelles, sans
    // rééchantillonnage, ce qui coûte bien moins cher pendant les secousses
    const ox = Math.round(shx * dpr);
    const oy = Math.round(shy * dpr);
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalAlpha = 1;
    c.drawImage(this.bg, ox - Math.round(20 * dpr), oy - Math.round(20 * dpr));
    c.drawImage(this.stains, ox, oy);
    c.setTransform(dpr, 0, 0, dpr, ox, oy);

    const wf = `700 ${this.fs}px ${this.fWord}`;
    c.font = wf;
    // les lettres sont centrées dans des cases de largeur égale ; mesuré seulement quand la police change
    if (wf !== this.cwFont || !document.fonts || document.fonts.status !== 'loaded') {
      this.cw = Math.max(c.measureText('M').width, c.measureText('W').width);
      this.cwFont = wf;
    }

    this.drawBanner();
    this.drawDanger();
    this.drawBase();
    this.drawRings();

    const es = this.enemies;
    es.sort(byY);
    const tgt = this.target && !this.target.dead ? this.target : null;
    if (tgt) this.drawAim(tgt);
    for (let i = 0; i < es.length; i++) if (!es[i].dead) this.drawBlob(es[i]);
    for (let i = 0; i < es.length; i++) {
      const e = es[i];
      if (!e.dead && e !== tgt && !e.doomed) this.drawLabel(e, false);
    }
    if (tgt && !tgt.doomed) this.drawLabel(tgt, true);

    this.drawShots();
    this.drawParts();
    this.drawSweep();
    this.drawHud();
    this.drawTexts();

    if (this.flash > 0) {
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      c.fillStyle = `rgba(201,52,31,${(this.flash * 0.28).toFixed(3)})`;
      c.fillRect(0, 0, W, H);
      c.strokeStyle = `rgba(201,52,31,${(this.flash * 0.8).toFixed(3)})`;
      c.lineWidth = 10;
      c.strokeRect(0, 0, W, H);
    }
  }

  private drawBanner() {
    const b = this.banner;
    if (!b || this.mode === 'demo') return;
    const c = this.ctx;
    const alpha = b.t < 1.5 ? 1 : Math.max(0, 1 - (b.t - 1.5) / 0.7);
    const shownChars = Math.min(b.text.length, Math.floor(b.t / 0.045));
    const size = Math.min(58, this.W * 0.13, this.travel * 0.22);
    const y = this.hudH + this.travel * 0.36;
    c.globalAlpha = alpha * 0.9;
    c.textAlign = 'center';
    c.textBaseline = 'alphabetic';
    c.fillStyle = INK;
    c.font = `${size}px ${this.fDisp}`;
    const caret = shownChars < b.text.length || Math.sin(this.real * 12) > 0 ? '_' : ' ';
    c.fillText(b.text.slice(0, shownChars) + caret, this.W / 2, y);
    if (shownChars >= b.text.length) {
      c.fillStyle = RED;
      c.font = `${Math.max(13, size * 0.3)}px ${this.fDisp}`;
      c.fillText(b.sub, this.W / 2, y + Math.max(22, size * 0.5));
    }
    c.globalAlpha = 1;
  }

  private drawDanger() {
    const c = this.ctx;
    const y = this.dangerY;
    let near = 0;
    for (const e of this.enemies) {
      const p = (e.y + e.r - this.hudH) / this.travel;
      if (p > near) near = p;
    }
    const alarm = near > 0.72 && this.mode === 'play' ? 0.5 + 0.5 * Math.sin(this.real * 14) : 0;
    c.strokeStyle = RED;
    c.globalAlpha = 0.55 + alarm * 0.45;
    c.lineWidth = 1.5 + alarm * 1.5;
    c.setLineDash([10, 6]);
    c.beginPath();
    c.moveTo(-20, y);
    c.lineTo(this.W + 20, y);
    c.stroke();
    c.setLineDash([]);
    c.fillStyle = RED;
    c.font = `10px ${this.fDisp}`;
    c.textAlign = 'left';
    c.textBaseline = 'alphabetic';
    c.fillText('MARGE', 10, y - 5);
    c.globalAlpha = 1;
  }

  private drawBase() {
    const c = this.ctx;
    const { W, H } = this;
    const bh = this.baseH;
    const y = H - bh;
    c.fillStyle = INK;
    c.fillRect(-30, y, W + 60, bh + 30);
    if (this.mode !== 'demo') {
      const full = this.charge >= this.cfg.chargeMax;
      const p = this.charge / this.cfg.chargeMax;
      const label = full ? (this.touch ? '↵ RETOUR CHARIOT PRÊT' : 'ENTRÉE ↵ RETOUR CHARIOT') : 'CHARIOT';
      c.font = `11px ${this.fDisp}`;
      c.textAlign = 'left';
      c.textBaseline = 'middle';
      c.fillStyle = full ? RED_HI : PAPER;
      c.globalAlpha = full ? 0.65 + 0.35 * Math.sin(this.real * 10) : 0.75;
      c.fillText(label, 12, y + bh / 2 + 1);
      c.globalAlpha = 1;
      const gx = 12 + c.measureText(label).width + 10;
      const gw = W - gx - 12;
      if (gw > 20) {
        c.fillStyle = 'rgba(239,230,210,.16)';
        rr(c, gx, y + bh / 2 - 3, gw, 6, 3);
        c.fill();
        if (p > 0) {
          c.fillStyle = full ? RED_HI : PAPER;
          rr(c, gx, y + bh / 2 - 3, Math.max(6, gw * p), 6, 3);
          c.fill();
        }
      }
    }
    // le marteau : il frappe à chaque touche
    const errK = this.slugErr > 0 ? this.slugErr / 0.25 : 0;
    const sx = this.ox + (errK > 0 ? Math.sin(this.real * 90) * 4 * errK : 0);
    const sy = y - 24 - this.slugKick * 7;
    c.fillStyle = errK > 0 ? RED : INK;
    rr(c, sx - 15, sy, 30, 34, 5);
    c.fill();
    if (this.slugCh) {
      c.fillStyle = PAPER_HI;
      c.font = `700 17px ${this.fWord}`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(this.slugCh, sx, sy + 13);
    }
  }

  private drawRings() {
    const c = this.ctx;
    for (const r of this.rings) {
      const p = r.age / r.life;
      const q = 1 - (1 - p) * (1 - p);
      c.globalAlpha = 1 - p;
      c.strokeStyle = r.c;
      c.lineWidth = (1 - p) * 7 + 0.5;
      c.beginPath();
      c.arc(r.x, r.y, r.r * (0.25 + 0.75 * q), 0, TAU);
      c.stroke();
    }
    c.globalAlpha = 1;
  }

  private drawAim(e: Enemy) {
    const c = this.ctx;
    c.strokeStyle = RED;
    c.globalAlpha = 0.4;
    c.lineWidth = 1.5;
    c.setLineDash([3, 7]);
    c.lineDashOffset = -this.real * 60;
    c.beginPath();
    c.moveTo(this.ox, this.oy - 26);
    c.lineTo(e.x, e.y + e.r * 0.5);
    c.stroke();
    c.setLineDash([]);
    c.lineDashOffset = 0;
    c.globalAlpha = 0.9;
    c.lineWidth = 2.5;
    const rad = e.r * 1.2 + 9;
    const rot = this.real * 2.2;
    for (let k = 0; k < 4; k++) {
      c.beginPath();
      c.arc(e.x, e.y, rad, rot + k * (TAU / 4), rot + k * (TAU / 4) + 0.75);
      c.stroke();
    }
    c.globalAlpha = 1;
  }

  private drawBlob(e: Enemy) {
    const c = this.ctx;
    const t = this.time;
    const r = e.r;
    const sp = e.age < 0.3 ? Math.max(0.05, backOut(e.age / 0.3)) : 1;
    const sq = e.squash;
    const fill = e.flash > 0 ? RED : INK;
    c.save();
    c.translate(e.x, e.y);
    c.scale(sp * (1 + sq * 0.5), sp * (1 - sq * 0.45));
    const N = e.kind === 'boss' ? 16 : e.kind === 'goutte' ? 8 : 11;
    const px = this.px;
    const py = this.py;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * TAU;
      const w =
        1 +
        0.1 * Math.sin(t * 2.4 + i * 1.9 + e.seed) +
        0.07 * Math.sin(t * 3.9 - i * 2.7 + e.seed * 1.7);
      px[i] = Math.cos(a) * r * w;
      py[i] = Math.sin(a) * r * w;
    }
    c.fillStyle = fill;
    c.beginPath();
    c.moveTo((px[N - 1] + px[0]) / 2, (py[N - 1] + py[0]) / 2);
    for (let i = 0; i < N; i++) {
      const j = (i + 1) % N;
      c.quadraticCurveTo(px[i], py[i], (px[i] + px[j]) / 2, (py[i] + py[j]) / 2);
    }
    c.closePath();
    if (e.kind !== 'goutte') {
      for (let k = 0; k < 3; k++) {
        const a = e.seed + k * 2.1 + t * (k === 1 ? -0.5 : 0.4);
        const d = r * (1.3 + 0.08 * Math.sin(t * 2 + k));
        const sr = r * (0.09 + k * 0.03);
        const sx = Math.cos(a) * d;
        const sy = Math.sin(a) * d;
        c.moveTo(sx + sr, sy);
        c.arc(sx, sy, sr, 0, TAU);
      }
    }
    c.fill();

    const dx = this.ox - e.x;
    const dy = this.oy - e.y;
    const dl = Math.hypot(dx, dy) || 1;
    const lx = dx / dl;
    const ly = dy / dl;
    const hurt = e.flash > 0 || e.doomed;
    if (e.kind === 'goutte') {
      this.eye(0, -r * 0.05, r * 0.42, lx, ly, hurt, 0, fill);
    } else if (e.kind === 'boss') {
      this.eye(-r * 0.4, -r * 0.08, r * 0.17, lx, ly, hurt, -1, fill);
      this.eye(r * 0.4, -r * 0.08, r * 0.17, lx, ly, hurt, 1, fill);
      this.eye(0, -r * 0.42, r * 0.12, lx, ly, hurt, 0, fill);
    } else {
      const er = Math.max(3, r * 0.2);
      this.eye(-r * 0.34, -r * 0.12, er, lx, ly, hurt, -1, fill);
      this.eye(r * 0.34, -r * 0.12, er, lx, ly, hurt, 1, fill);
    }
    c.restore();
  }

  private eye(
    ex: number,
    ey: number,
    er: number,
    lx: number,
    ly: number,
    hurt: boolean,
    side: number,
    lid: string,
  ) {
    const c = this.ctx;
    if (hurt) {
      const s = side === 0 ? 1 : -side;
      c.strokeStyle = PAPER_HI;
      c.lineWidth = Math.max(1.5, er * 0.42);
      c.lineCap = 'round';
      c.lineJoin = 'round';
      c.beginPath();
      c.moveTo(ex - s * er * 0.8, ey - er * 0.7);
      c.lineTo(ex + s * er * 0.6, ey);
      c.lineTo(ex - s * er * 0.8, ey + er * 0.7);
      c.stroke();
      c.lineCap = 'butt';
      c.lineJoin = 'miter';
      return;
    }
    c.fillStyle = PAPER_HI;
    c.beginPath();
    c.arc(ex, ey, er, 0, TAU);
    c.fill();
    c.fillStyle = INK;
    c.beginPath();
    c.arc(ex + lx * er * 0.42, ey + ly * er * 0.42, er * 0.48, 0, TAU);
    c.fill();
    if (side !== 0) {
      c.fillStyle = lid;
      c.beginPath();
      c.moveTo(ex + side * er * 1.3, ey - er * 1.05);
      c.lineTo(ex - side * er * 1.3, ey - er * 0.15);
      c.lineTo(ex - side * er * 1.3, ey - er * 1.7);
      c.lineTo(ex + side * er * 1.3, ey - er * 1.7);
      c.closePath();
      c.fill();
    }
  }

  private drawLabel(e: Enemy, locked: boolean) {
    const c = this.ctx;
    const fs = this.fs;
    const cw = this.cw;
    const len = e.word.length;
    const tw = len * cw + 16;
    const th = fs + 11;
    let lx = clamp(e.x - tw / 2, 6, Math.max(6, this.W - tw - 6));
    if (e.err > 0) lx += Math.sin(this.real * 80) * 4 * (e.err / 0.3);
    const ly = e.y + e.r + 7;
    c.fillStyle = 'rgba(27,25,21,.24)';
    rr(c, lx + 2.5, ly + 3, tw, th, 5);
    c.fill();
    c.fillStyle = e.err > 0 ? '#f4c4b9' : PAPER_HI;
    rr(c, lx, ly, tw, th, 5);
    c.fill();
    c.strokeStyle = locked ? RED : INK;
    c.lineWidth = locked ? 2.5 : 1.5;
    c.stroke();

    c.font = `700 ${fs}px ${this.fWord}`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    const tx = lx + 8;
    const ty = ly + th / 2 + 1.5;
    for (let i = 0; i < len; i++) {
      c.fillStyle = i < e.typed ? 'rgba(27,25,21,.3)' : INK;
      c.fillText(e.word[i], tx + (i + 0.5) * cw, ty);
    }
    c.textAlign = 'left';
    if (e.typed > 0) {
      c.strokeStyle = RED;
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(tx - 1, ty - 1.5);
      c.lineTo(tx + e.typed * cw - 1, ty - 1.5);
      c.stroke();
    }
    if (locked && e.typed < len) {
      c.fillStyle = RED;
      c.fillRect(tx + e.typed * cw, ly + th - 5, cw - 1, 2.5);
    }
    if (e.kind === 'boss') {
      // un point par mot restant
      for (let k = 0; k < e.total; k++) {
        c.beginPath();
        c.arc(lx + 7 + k * 13, ly - 8, 4.5, 0, TAU);
        if (k <= e.queue.length) {
          c.fillStyle = RED;
          c.fill();
        } else {
          c.strokeStyle = INK;
          c.lineWidth = 1.5;
          c.stroke();
        }
      }
    }
  }

  private drawShots() {
    const c = this.ctx;
    const sy = this.oy - 26;
    c.strokeStyle = INK;
    c.fillStyle = INK;
    c.lineCap = 'round';
    c.font = `700 ${this.fs}px ${this.fWord}`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    for (const s of this.shots) {
      const p = clamp(s.t, 0, 1);
      const q = Math.max(0, p - 0.35);
      const tx = s.e.x;
      const ty = s.e.y + s.e.r * 0.5;
      const x = this.ox + (tx - this.ox) * p;
      const y = sy + (ty - sy) * p;
      c.lineWidth = 3;
      c.globalAlpha = 0.55;
      c.beginPath();
      c.moveTo(this.ox + (tx - this.ox) * q, sy + (ty - sy) * q);
      c.lineTo(x, y);
      c.stroke();
      c.globalAlpha = 1;
      c.fillText(s.ch, x, y);
    }
    c.lineCap = 'butt';
  }

  private drawParts() {
    const c = this.ctx;
    const ps = this.parts;
    for (let pass = 0; pass < 2; pass++) {
      const red = pass === 1;
      let any = false;
      c.beginPath();
      for (let i = 0; i < ps.length; i++) {
        const p = ps[i];
        if (p.red !== red) continue;
        const r = p.r * Math.min(1, (p.life / p.max) * 1.6);
        c.moveTo(p.x + r, p.y);
        c.arc(p.x, p.y, r, 0, TAU);
        any = true;
      }
      if (any) {
        c.fillStyle = red ? RED : INK;
        c.fill();
      }
    }
  }

  private drawSweep() {
    if (!this.sweep) return;
    const c = this.ctx;
    const x = this.sweepX();
    const top = this.hudH;
    const h = this.oy - top;
    const g = c.createLinearGradient(x - 140, 0, x, 0);
    g.addColorStop(0, 'rgba(201,52,31,0)');
    g.addColorStop(1, 'rgba(201,52,31,.4)');
    c.fillStyle = g;
    c.fillRect(x - 140, top, 140, h);
    c.fillStyle = INK;
    c.fillRect(x - 5, top, 10, h);
    c.fillStyle = RED;
    c.fillRect(x + 5, top, 3, h);
  }

  private drawTexts() {
    const c = this.ctx;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.lineJoin = 'round';
    for (const t of this.texts) {
      const pop = 1 + 0.6 * Math.max(0, 1 - t.age / 0.12);
      c.globalAlpha = Math.min(1, (t.life - t.age) / 0.3);
      c.font = `${Math.round(t.size * pop)}px ${this.fDisp}`;
      c.lineWidth = 5;
      c.strokeStyle = PAPER_HI;
      c.strokeText(t.s, t.x, t.y);
      c.fillStyle = t.c;
      c.fillText(t.s, t.x, t.y);
    }
    c.globalAlpha = 1;
    c.lineJoin = 'miter';
  }

  private heart(cx: number, cy: number, s: number, filled: boolean) {
    const c = this.ctx;
    c.beginPath();
    c.moveTo(cx, cy + s * 0.42);
    c.bezierCurveTo(cx - s * 0.75, cy - s * 0.05, cx - s * 0.38, cy - s * 0.62, cx, cy - s * 0.2);
    c.bezierCurveTo(cx + s * 0.38, cy - s * 0.62, cx + s * 0.75, cy - s * 0.05, cx, cy + s * 0.42);
    c.closePath();
    if (filled) {
      c.fillStyle = RED;
      c.fill();
    } else {
      c.strokeStyle = 'rgba(27,25,21,.35)';
      c.lineWidth = 1.5;
      c.stroke();
    }
  }

  private drawHud() {
    const c = this.ctx;
    const W = this.W;
    const h = this.hudH;
    c.fillStyle = HEAD;
    c.fillRect(-30, -30, W + 60, h + 30);
    c.fillStyle = INK;
    c.fillRect(-30, h - 2, W + 60, 2);
    if (this.mode === 'demo') return;
    const cp = this.compact;

    // score
    c.textAlign = 'left';
    c.textBaseline = 'alphabetic';
    c.fillStyle = 'rgba(27,25,21,.62)';
    c.font = `10px ${this.fDisp}`;
    c.fillText('SCORE', 14, cp ? 13 : 18);
    const sp = 1 + this.scorePunch * 0.22;
    const sSize = cp ? 21 : 28;
    c.fillStyle = INK;
    c.font = `${Math.round(sSize * sp)}px ${this.fDisp}`;
    const sTxt = fmt(Math.round(this.shown));
    const sBase = cp ? 35 : 47;
    c.fillText(sTxt, 14, sBase);
    const sw = c.measureText(sTxt).width;

    // multiplicateur + progression du combo
    if (this.mult > 1 || this.combo >= 3) {
      const mx = 14 + sw + 14;
      const mp = 1 + this.multPunch * 0.6;
      c.fillStyle = RED;
      c.font = `${Math.round((cp ? 17 : 21) * mp)}px ${this.fDisp}`;
      c.fillText(`×${this.mult}`, mx, sBase - 4);
      const prog = this.mult >= 6 ? 1 : (this.combo % 15) / 15;
      c.fillStyle = 'rgba(27,25,21,.18)';
      c.fillRect(mx, sBase, 34, 3);
      c.fillStyle = RED;
      c.fillRect(mx, sBase, 34 * prog, 3);
    }

    // vies + vague, alignées à droite (56 px réservés au bouton pause)
    const right = W - 62;
    const hs = cp ? 15 : 18;
    const hearts = Math.max(this.cfg.lives, this.lives);
    for (let i = 0; i < hearts; i++) {
      const filled = i < this.lives;
      const punch = (i === this.lives || i === this.lives - 1) && this.livesPunch > 0 ? 1 + this.livesPunch * 0.9 : 1;
      this.heart(right - hs * 0.6 - (hearts - 1 - i) * (hs + 5), cp ? 13 : 19, hs * punch, filled);
    }
    c.textAlign = 'right';
    c.fillStyle = INK;
    c.font = `${cp ? 12 : 13}px ${this.fDisp}`;
    c.fillText(`VAGUE ${this.wave}`, right, cp ? 36 : 46);
  }
}
