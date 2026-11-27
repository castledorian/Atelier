import type { Sfx, SfxName } from '../audio';
import { plain } from './data';
import { streakAfterLoss } from '../scoring';
import { edgeDistance, multFor, reachDistance, spreadAngles, winPoints } from './geometry';
import { LEX_TUNE, buildRound, enemyCount, lossNote, travelTime } from './rounds';
import type { LexDiff, LexLevel, LexWord, Rel, Round } from './rounds';
import { fmt } from '../format';
import { clamp, F_DISP, F_WORD, HEAD, INK, PAPER, PAPER_HI, rand, RED, rr, TAU } from '../canvas';

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

type Mode = 'demo' | 'play' | 'over';
/** wait : pause avant l'arrivée de la vague · live : les mots avancent · shock : onde de choc en cours · rest : temps de lecture après une erreur */
type Phase = 'wait' | 'live' | 'shock' | 'rest';

interface Enemy {
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
  r: number;
  v: number;
  age: number;
  life: number;
  c: string;
  w: number;
}

const BLUE = '#2f4f86';
const GREEN = '#2f6b3a';
const MAX_PARTS = 520;

const backOut = (x: number) => 1 + 2.70158 * Math.pow(x - 1, 3) + 1.70158 * Math.pow(x - 1, 2);

export class LexiqueGame {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly sfx: Sfx;
  private readonly cb: LexCallbacks;
  private readonly bg = document.createElement('canvas');
  private ro: ResizeObserver | null = null;
  private raf = 0;
  private last = 0;
  private dirty = true;
  /** qualité automatique : résolution maximale du canvas (1 = un pixel par pixel CSS) */
  private quality = 2;
  private slowAvg = 16.7;
  private slowFrames = 0;
  private demoStill = false;

  // Géométrie (pixels CSS)
  private W = 0;
  private H = 0;
  private dpr = 1;
  private hudH = 58;
  private cx = 0;
  private cy = 0;
  private fs = 20;
  private u = 1;
  private compact = false;

  // État
  private mode: Mode = 'demo';
  private phase: Phase = 'wait';
  private paused = false;
  private shakeOn = true;
  private wordScale = 1;
  private rel: Rel = 'melange';
  private level: LexLevel = 'cm1';
  private diff: LexDiff = 'standard';
  /** La démonstration joue ses sons (fenêtre d'extrait de l'accueil) ; dans le menu elle reste muette. */
  private demoSound = false;
  private used = new Set<string>();
  private round: Round | null = null;
  private next: Round | null = null;
  private enemies: Enemy[] = [];
  private target: Enemy | null = null;
  private link: { e: Enemy; t: number } | null = null;
  /** mot central saisi : le fil suit le pointeur */
  private armed = false;
  private drag = false;
  private px = 0;
  private py = 0;
  private bx = new Float32Array(10);
  private by = new Float32Array(10);
  private parts: Part[] = [];
  private texts: Txt[] = [];
  private rings: Ring[] = [];
  private note: { s: string; good: boolean; t: number; life: number } | null = null;
  private morph: { s: string; t: number } | null = null;

  private score = 0;
  private shown = 0;
  private streak = 0;
  private bestStreak = 0;
  private lives = 3;
  private wins = 0;
  private losses = 0;
  private roundNo = 0;
  private playTime = 0;
  private missed: LexResult['missed'] = [];
  private time = 0;
  private timer = 0;
  private shockR = 0;
  private overT = 0;
  private overSent = false;
  private botT = 0;
  private coreW = 120;
  private coreH = 50;
  private core = 0;

  // Ressenti
  private trauma = 0;
  private hitStop = 0;
  private slowT = 0;
  private flash = 0;
  private whiteFlash = 0;
  private scorePunch = 0;
  private livesPunch = 0;

  constructor(canvas: HTMLCanvasElement, sfx: Sfx, cb: LexCallbacks) {
    this.canvas = canvas;
    this.sfx = sfx;
    this.cb = cb;
    this.ctx = canvas.getContext('2d', { alpha: false }) as CanvasRenderingContext2D;
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

  start(rel: Rel, level: LexLevel, diff: LexDiff) {
    this.rel = rel;
    this.level = level;
    this.diff = diff;
    this.reset();
    this.mode = 'play';
    this.paused = false;
    this.lives = LEX_TUNE[diff].lives;
    if (this.demoStill && this.quality > 1) {
      this.quality = 1;
      this.resize();
    }
    this.snd('start');
    this.beginRound(true);
    this.last = performance.now();
  }

  setDemoSound(on: boolean) {
    this.demoSound = on;
  }

  startDemo() {
    this.rel = 'melange';
    this.level = 'cm1';
    this.diff = 'apprenti';
    this.reset();
    this.mode = 'demo';
    this.paused = false;
    this.beginRound(true);
    this.last = performance.now();
  }

  setPaused(p: boolean) {
    if (this.mode !== 'play') return;
    this.paused = p;
    this.dirty = true;
    this.last = performance.now();
  }

  setOptions(o: { shake: boolean; wordScale?: number }) {
    this.shakeOn = o.shake;
    if (o.wordScale) {
      this.wordScale = o.wordScale;
      this.resize();
    }
    this.dirty = true;
  }

  /** Le mot sous le doigt ou le pointeur (marge généreuse pour les doigts d'enfants), le plus proche du pointeur. */
  private enemyAt(x: number, y: number): Enemy | null {
    let best: Enemy | null = null;
    let bd = Infinity;
    const r = this.blobR();
    const th = this.fs + 11;
    for (const e of this.enemies) {
      if (e.dead || e.doomed || e.delay > 0) continue;
      // la tache d'encre (cercle) ou l'étiquette (rectangle), avec une marge pour les doigts
      const bdx = x - e.x;
      const bdy = y - e.y;
      const onBlob = bdx * bdx + bdy * bdy <= (r + 14) * (r + 14);
      const x0 = this.labelX(e);
      const y0 = e.y + r + 7;
      const onLabel = x >= x0 - 8 && x <= x0 + e.halfW * 2 + 8 && y >= y0 - 8 && y <= y0 + th + 10;
      if (!onBlob && !onLabel) continue;
      const lx = onLabel ? clamp(x, x0, x0 + e.halfW * 2) : e.x;
      const ly = onLabel ? y0 + th / 2 : e.y;
      const d = (x - lx) * (x - lx) + (y - ly) * (y - ly);
      if (d < bd) {
        bd = d;
        best = e;
      }
    }
    return best;
  }

  private onCore(x: number, y: number) {
    return Math.abs(x - this.cx) <= this.coreW / 2 + 16 && Math.abs(y - this.cy) <= this.coreH / 2 + 16;
  }

  private canPoint() {
    return !this.paused && this.mode === 'play' && this.phase === 'live' && !this.link;
  }

  /** Appui : un appui sur un mot qui arrive le valide tout de suite ; un appui sur le mot central le « saisit » pour tirer un fil. */
  downAt(x: number, y: number) {
    if (!this.canPoint()) return;
    this.px = x;
    this.py = y;
    const e = this.enemyAt(x, y);
    if (e) {
      this.choose(e);
      this.dirty = true;
      return;
    }
    if (this.onCore(x, y)) {
      this.armed = true;
      this.drag = true;
      this.core = 1;
      this.snd('select');
    } else this.armed = false;
    this.dirty = true;
  }

  /** Déplacement : le fil suit le doigt ; le mot visé est mis en valeur. */
  moveAt(x: number, y: number) {
    if (!this.canPoint() || !this.armed) return;
    this.px = x;
    this.py = y;
    const e = this.enemyAt(x, y);
    if (e !== this.target) this.target = e;
    this.dirty = true;
  }

  /** Relâchement : au-dessus d'un mot, la liaison est faite ; sinon le mot central reste saisi (on peut toucher ensuite le bon mot). */
  upAt(x: number, y: number) {
    if (!this.drag) return;
    this.drag = false;
    if (!this.canPoint()) return;
    const e = this.enemyAt(x, y);
    if (e) this.choose(e);
    else if (!this.onCore(x, y)) this.armed = false;
    this.dirty = true;
  }

  /** Au clavier : passe d'un mot au suivant (+1) ou au précédent (−1), du plus proche du centre au plus lointain. */
  cycle(dir: 1 | -1) {
    if (this.paused || this.mode !== 'play' || this.phase !== 'live' || this.link) return;
    const live = this.enemies.filter((e) => !e.dead && !e.doomed && e.delay <= 0).sort((a, b) => a.d - b.d);
    if (live.length === 0) return;
    const i = this.target ? live.indexOf(this.target) : -1;
    this.target = live[(i + dir + live.length) % live.length];
    this.snd('select');
    this.dirty = true;
  }

  /** Au clavier : relie le mot choisi au mot central (Entrée ou Espace). */
  confirm() {
    if (this.paused || this.mode !== 'play' || this.phase !== 'live' || this.link) return;
    const t = this.target;
    if (t && !t.dead && !t.doomed) this.choose(t);
  }

  private choose(e: Enemy) {
    this.target = e;
    this.link = { e, t: 0 };
    this.armed = false;
    this.drag = false;
    e.pop = 1;
    this.snd('attack');
    this.spark(e.x, e.y, 4, false);
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

  /** Trop lent pendant ~1,5 s → résolution plus basse (jamais remontée pendant la session). */
  private watchSpeed(ms: number) {
    if (ms <= 0 || ms > 200) return;
    this.slowAvg += (ms - this.slowAvg) * 0.05;
    if (this.slowAvg > 21) this.slowFrames++;
    else this.slowFrames = Math.max(0, this.slowFrames - 2);
    if (this.slowFrames < 60) return;
    if (this.mode === 'demo') {
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
    const fs = Math.round((W < 520 ? 17 : 21) * this.wordScale);
    if (W === this.W && H === this.H && dpr === this.dpr && fs === this.fs) return;
    this.W = W;
    this.H = H;
    this.dpr = dpr;
    this.fs = fs;
    this.canvas.width = Math.round(W * dpr);
    this.canvas.height = Math.round(H * dpr);
    this.compact = H < 360;
    this.hudH = this.compact ? 42 : 58;
    this.cx = W / 2;
    this.cy = this.hudH + (H - this.hudH) / 2;
    this.u = clamp(Math.min(W, H) / 620, 0.72, 1.1);
    this.buildBg();
    this.measureCore();
    this.render();
  };

  private buildBg() {
    const { W, H, dpr } = this;
    this.bg.width = Math.round(W * dpr);
    this.bg.height = Math.round(H * dpr);
    const c = this.bg.getContext('2d') as CanvasRenderingContext2D;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.fillStyle = PAPER;
    c.fillRect(0, 0, W, H);
    const specks = Math.min(3500, Math.round((W * H) / 360));
    for (let i = 0; i < specks; i++) {
      c.fillStyle = Math.random() < 0.5 ? 'rgba(90,70,40,.07)' : 'rgba(255,255,255,.22)';
      c.fillRect(rand(0, W), rand(0, H), rand(0.6, 1.6), rand(0.6, 1.6));
    }
    // cible de cahier : des cercles autour du mot central, comme des ondes déjà passées
    c.strokeStyle = 'rgba(59,91,140,.13)';
    c.lineWidth = 1;
    const max = Math.hypot(W, H) / 2;
    for (let r = 70 * this.u; r < max; r += 70 * this.u) {
      c.beginPath();
      c.arc(this.cx, this.cy, r, 0, TAU);
      c.stroke();
    }
    c.beginPath();
    c.moveTo(this.cx, this.hudH);
    c.lineTo(this.cx, H);
    c.moveTo(0, this.cy);
    c.lineTo(W, this.cy);
    c.stroke();
    const g = c.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
    g.addColorStop(0, 'rgba(120,90,40,0)');
    g.addColorStop(1, 'rgba(120,90,40,.2)');
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);
  }

  private reset() {
    this.used = new Set();
    this.round = null;
    this.next = null;
    this.enemies = [];
    this.target = null;
    this.parts = [];
    this.texts = [];
    this.rings = [];
    this.note = null;
    this.morph = null;
    this.score = 0;
    this.shown = 0;
    this.streak = 0;
    this.bestStreak = 0;
    this.wins = 0;
    this.losses = 0;
    this.roundNo = 0;
    this.playTime = 0;
    this.missed = [];
    this.time = 0;
    this.timer = 0;
    this.shockR = 0;
    this.overT = 0;
    this.overSent = false;
    this.botT = 0;
    this.trauma = 0;
    this.hitStop = 0;
    this.slowT = 0;
    this.flash = 0;
    this.whiteFlash = 0;
    this.phase = 'wait';
    this.dirty = true;
  }

  private snd(name: SfxName) {
    if (this.mode !== 'demo' || this.demoSound) this.sfx.play(name);
  }

  private addTrauma(v: number) {
    this.trauma = Math.min(1, this.trauma + (this.mode === 'demo' ? v * 0.25 : v));
  }

  // ───────────────────────── Manches ─────────────────────────

  /** Prépare la manche suivante : mot central, consigne, ennemis en attente d'apparition. */
  private beginRound(first: boolean) {
    const rnd = this.next ?? buildRound(this.rel, this.level, enemyCount(this.diff, this.roundNo), Math.random, this.used, this.diff);
    this.next = null;
    this.round = rnd;
    this.roundNo++;
    this.measureCore();
    this.enemies = [];
    this.target = null;
    this.link = null;
    this.armed = false;
    this.drag = false;
    this.phase = 'wait';
    this.timer = first ? 0.9 : 0.35;
    this.botT = 0;
    const words = rnd.words.map((w) => w.text).join(', ');
    this.cb.onAnnounce?.(`Manche ${this.roundNo}. ${rnd.prompt.toLowerCase()} : ${rnd.center}. Mots : ${words}.`);
    this.dirty = true;
  }

  /** Les mots arrivent : un par direction, avec un léger décalage. */
  private spawnWave() {
    const r = this.round;
    if (!r) return;
    const c = this.ctx;
    const travel = travelTime(this.diff, this.roundNo - 1);
    const angles = spreadAngles(r.words.length, Math.random);
    c.font = `700 ${this.fs}px ${F_WORD}`;
    const ey = this.blobR() + (7 + this.fs + 11) / 2;
    r.words.forEach((w, i) => {
      const halfW = Math.max(c.measureText(w.text.toUpperCase()).width / 2 + 14, this.blobR() * 1.2);
      const a = angles[i];
      const edge = edgeDistance(this.W, this.H, this.cx, this.cy, a);
      const d0 = Math.max(edge, 40) + halfW + 14;
      const reach = reachDistance(this.coreW / 2, this.coreH / 2, halfW, ey, a);
      const t = travel * rand(0.94, 1.06);
      const e: Enemy = {
        w,
        a,
        d: d0,
        d0,
        reach,
        speed: Math.max(10, (d0 - reach) / t),
        delay: i * 0.22 + rand(0, 0.12),
        halfW,
        sway: rand(3, 8),
        swayF: rand(1.2, 2.4),
        phase: rand(0, TAU),
        age: 0,
        x: this.cx + Math.cos(a) * d0,
        y: this.cy + Math.sin(a) * d0,
        flash: 0,
        err: 0,
        doomed: false,
        dead: false,
        pop: 0,
      };
      this.enemies.push(e);
    });
    this.phase = 'live';
    this.snd('wave');
  }

  /** Un mot est entièrement tapé. */
  private resolve(e: Enemy) {
    if (!this.round) return;
    if (e.w.role === 'answer') this.win(e);
    else this.lose(e);
  }

  private win(e: Enemy) {
    const r = this.round!;
    const left = e.d0 > e.reach ? clamp((e.d - e.reach) / (e.d0 - e.reach), 0, 1) : 0;
    this.streak++;
    this.bestStreak = Math.max(this.bestStreak, this.streak);
    const mult = multFor(this.streak);
    const pts = winPoints(left, mult);
    if (this.mode === 'play') {
      this.score += pts;
      this.wins++;
      this.scorePunch = 1;
    }
    if (this.mode !== 'demo') {
      this.texts.push({ x: this.cx, y: this.cy - this.coreH / 2 - 34 * this.u, s: `+${pts}${mult > 1 ? ` (×${mult})` : ''}`, c: GREEN, size: this.fs * 1.1, age: 0, life: 1.2 });
      this.note = { s: r.win, good: true, t: 0, life: 3.4 };
      this.cb.onAnnounce?.(r.win);
    }
    this.morph = e.w.morph ? { s: e.w.morph, t: 0 } : null;
    // onde de choc
    this.phase = 'shock';
    this.armed = false;
    this.shockR = 0;
    this.timer = 0;
    e.doomed = true;
    e.dead = true;
    this.burst(e.x, e.y, 22, false);
    this.snd('sweep');
    this.rings.push({ r: 0, v: 0, age: 0, life: 0.7, c: BLUE, w: 7 });
    this.rings.push({ r: 0, v: 0, age: -0.08, life: 0.7, c: INK, w: 3 });
    this.addTrauma(0.55);
    this.hitStop = Math.max(this.hitStop, 0.06);
    this.slowT = 0.22;
    this.whiteFlash = 1;
    this.snd(this.streak > 0 && this.streak % 3 === 0 ? 'bigkill' : 'kill');
    if (this.streak > 0 && this.streak % 3 === 0) this.snd('mult');
    // la manche suivante est prête dès maintenant (la vitesse monte à chaque manche gagnée)
    this.next = buildRound(this.rel, this.level, enemyCount(this.diff, this.roundNo), Math.random, this.used, this.diff);
  }

  private lose(e: Enemy | null) {
    const r = this.round!;
    this.streak = streakAfterLoss(this.streak, this.diff);
    if (this.mode === 'play') {
      this.losses++;
      this.lives--;
      this.livesPunch = 1;
      this.missed.push({ prompt: r.prompt, center: r.center, answer: r.answer.text, morph: r.answer.morph });
    }
    const s = lossNote(r, e ? e.w : null);
    if (this.mode !== 'demo') {
      this.note = { s, good: false, t: 0, life: 4.6 };
      this.cb.onAnnounce?.(s);
    }
    this.morph = r.answer.morph ? { s: r.answer.morph, t: 0 } : null;
    this.flash = 1;
    this.addTrauma(0.6);
    this.hitStop = Math.max(this.hitStop, 0.09);
    this.snd('breach');
    if (e) this.burst(e.x, e.y, 18, true);
    this.texts.push({ x: this.cx, y: this.cy - this.coreH / 2 - 34 * this.u, s: '−1 vie', c: RED, size: this.fs * 1.05, age: 0, life: 1.2 });
    // on laisse le temps de lire : les mots restants s'effacent, la bonne réponse reste visible un instant
    for (const o of this.enemies) {
      if (o === e || o.dead) continue;
      if (o.w.role !== 'answer') this.doom(o, true);
      else if (o.delay > 0) o.dead = true; // pas encore apparue : la phrase de bilan la nomme
    }
    if (e) {
      e.doomed = true;
      e.dead = true;
    }
    this.target = null;
    this.phase = 'rest';
    this.timer = 0;
    this.next = buildRound(this.rel, this.level, enemyCount(this.diff, this.roundNo), Math.random, this.used, this.diff);
  }

  // ───────────────────────── Mises à jour ─────────────────────────

  private update(dt: number) {
    this.trauma = Math.max(0, this.trauma - dt * 1.9);
    this.flash = Math.max(0, this.flash - dt * 2.2);
    this.whiteFlash = Math.max(0, this.whiteFlash - dt * 3.2);
    this.scorePunch = Math.max(0, this.scorePunch - dt * 5);
    this.livesPunch = Math.max(0, this.livesPunch - dt * 2.5);
    this.shown += (this.score - this.shown) * Math.min(1, dt * 12);
    if (this.score - this.shown < 1) this.shown = this.score;

    let sdt = dt;
    if (this.hitStop > 0) {
      this.hitStop -= dt;
      sdt = 0;
    } else if (this.slowT > 0) {
      this.slowT -= dt;
      sdt = dt * 0.35;
    }
    this.time += sdt;
    if (this.note) {
      this.note.t += dt;
      if (this.note.t > this.note.life) this.note = null;
    }
    if (this.morph) {
      this.morph.t += dt;
      if (this.morph.t > 3.2) this.morph = null;
    }

    if (this.mode === 'over') {
      this.overT += dt;
      this.updateEnemies(sdt);
      if (this.overT > 1.6 && !this.overSent) {
        this.overSent = true;
        this.cb.onOver(this.result());
      }
    } else {
      if (this.mode === 'play') this.playTime += dt;
      this.updatePhase(sdt);
      this.updateEnemies(sdt);
      this.updateBot(sdt);
    }
    this.updateFx(dt, sdt);
  }

  private updatePhase(dt: number) {
    this.timer += dt;
    if (this.link) {
      this.link.t += dt;
      if (this.phase !== 'live') this.link = null;
      else if (this.link.t >= 0.16) {
        const e = this.link.e;
        this.link = null;
        if (!e.dead && !e.doomed) this.resolve(e);
      }
    }
    if (this.phase === 'wait') {
      if (this.timer >= (this.roundNo === 1 ? 0.9 : 0.35)) this.spawnWave();
    } else if (this.phase === 'shock') {
      // l'onde grandit depuis le centre ; tout mot qu'elle touche explose
      this.shockR = this.timer < 0.6 ? Math.hypot(this.W, this.H) * 0.55 * (1 - Math.pow(1 - this.timer / 0.6, 3)) : this.shockR;
      for (const e of this.enemies) if (!e.dead && !e.doomed && e.d <= this.shockR + e.halfW) this.doom(e, false);
      // le mot central change au milieu de l'onde
      if (this.timer >= 0.32 && this.next && this.round !== this.next) {
        this.round = this.next;
        this.roundNo++;
        this.measureCore();
        this.core = 1;
        this.snd('ready');
        const r = this.round;
        this.cb.onAnnounce?.(`Manche ${this.roundNo}. ${r.prompt.toLowerCase()} : ${r.center}. Mots : ${r.words.map((w) => w.text).join(', ')}.`);
      }
      if (this.timer >= 0.85) {
        this.enemies = this.enemies.filter((e) => !e.dead);
        this.target = null;
        this.next = null;
        this.phase = 'wait';
        this.timer = 0;
        this.shockR = 0;
      }
    } else if (this.phase === 'rest') {
      // la bonne réponse reste affichée un moment, puis tout se dissout
      if (this.timer > 1.7 && this.mode === 'play' && this.lives <= 0) {
        this.mode = 'over';
        this.overT = 0;
        this.snd('over');
        return;
      }
      if (this.timer > (this.mode === 'play' && this.lives <= 0 ? 1.7 : 2.3)) {
        this.enemies = [];
        this.round = this.next;
        this.next = null;
        this.roundNo++;
        this.measureCore();
        this.core = 1;
        this.phase = 'wait';
        this.timer = 0;
        const r = this.round;
        if (r) this.cb.onAnnounce?.(`Manche ${this.roundNo}. ${r.prompt.toLowerCase()} : ${r.center}. Mots : ${r.words.map((w) => w.text).join(', ')}.`);
      }
    }
  }

  private doom(e: Enemy, quiet: boolean) {
    e.doomed = true;
    e.dead = true;
    if (e === this.target) this.target = null;
    this.burst(e.x, e.y, quiet ? 8 : 16, false);
  }

  private updateEnemies(dt: number) {
    let arrived: Enemy | null = null;
    for (const e of this.enemies) {
      if (e.dead) continue;
      e.flash = Math.max(0, e.flash - dt * 5);
      e.err = Math.max(0, e.err - dt * 4);
      e.pop = Math.max(0, e.pop - dt * 8);
      if (e.delay > 0) {
        if (this.phase === 'live') e.delay -= dt;
        continue;
      }
      e.age += dt;
      if (this.phase === 'live') e.d -= e.speed * dt;
      const sw = Math.sin(e.age * e.swayF + e.phase) * e.sway * Math.min(1, (e.d - e.reach) / 60 + 0.1);
      const px = -Math.sin(e.a);
      const py = Math.cos(e.a);
      e.x = this.cx + Math.cos(e.a) * e.d + px * sw;
      e.y = this.cy + Math.sin(e.a) * e.d + py * sw;
      if (this.phase === 'live' && !e.doomed && e.d <= e.reach) {
        if (e.w.role === 'answer') arrived = e;
        else {
          // un mot piège qui touche le centre se dissout sans faire de mal
          e.dead = true;
          if (e === this.target) {
            this.target = null;
                  }
          this.burst(e.x, e.y, 8, false);
        }
      }
    }
    if (arrived && this.mode !== 'over') {
      this.lose(null);
      this.burst(arrived.x, arrived.y, 14, true);
    }
    if (this.phase === 'live' && this.enemies.every((e) => e.dead) && this.enemies.length > 0) {
      // plus aucun mot (cas limite) : on passe à la manche suivante sans pénalité
      this.enemies = [];
      this.next = null;
      this.beginRound(false);
    }
  }

  /** Démonstration du menu : un joueur invisible tape la bonne réponse au bout d'un moment. */
  private updateBot(dt: number) {
    if (this.mode !== 'demo' || this.phase !== 'live') return;
    this.botT += dt;
    if (this.botT < 2.6) return;
    const a = this.enemies.find((e) => e.w.role === 'answer' && !e.dead);
    if (!a) return;
    this.botT = -1;
    this.win(a);
  }

  private updateFx(dt: number, sdt: number) {
    this.core = Math.max(0, this.core - dt * 4);
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.age += dt;
      if (r.age >= r.life) this.rings.splice(i, 1);
    }
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i];
      t.age += dt;
      if (t.age >= t.life) this.texts.splice(i, 1);
    }
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.life -= sdt;
      if (p.life <= 0) {
        this.parts[i] = this.parts[this.parts.length - 1];
        this.parts.pop();
        continue;
      }
      p.x += p.vx * sdt;
      p.y += p.vy * sdt;
      p.vx *= 1 - Math.min(1, sdt * 2.5);
      p.vy = p.vy * (1 - Math.min(1, sdt * 2.5)) + 260 * sdt;
    }
    if (this.parts.length > MAX_PARTS) this.parts.length = MAX_PARTS;
  }

  // ───────────────────────── Effets ─────────────────────────

  private burst(x: number, y: number, n: number, red: boolean) {
    const k = this.quality < 1 ? 0.5 : this.quality < 1.5 ? 0.75 : 1;
    const count = Math.round(n * k);
    for (let i = 0; i < count && this.parts.length < MAX_PARTS; i++) {
      const a = rand(0, TAU);
      const v = rand(60, 280);
      const life = rand(0.35, 0.9);
      this.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 40, r: rand(1.5, 4.5) * this.u, life, max: life, red });
    }
  }

  private spark(x: number, y: number, n: number, red: boolean) {
    for (let i = 0; i < n && this.parts.length < MAX_PARTS; i++) {
      const a = rand(0, TAU);
      const v = rand(30, 110);
      const life = rand(0.2, 0.4);
      this.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, r: rand(1, 2.4) * this.u, life, max: life, red });
    }
  }

  private measureCore() {
    const r = this.round;
    const c = this.ctx;
    const f = Math.round(this.fs * 1.9);
    c.font = `700 ${f}px ${F_WORD}`;
    const w = r ? c.measureText(r.center.toUpperCase()).width : 100;
    this.coreW = Math.min(this.W * 0.6, Math.max(110 * this.u, w + 36));
    this.coreH = f * 1.45;
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
      const amt = this.trauma * this.trauma * 14;
      shx = (Math.random() * 2 - 1) * amt;
      shy = (Math.random() * 2 - 1) * amt;
    }
    const ox = Math.round(shx * dpr);
    const oy = Math.round(shy * dpr);
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalAlpha = 1;
    c.fillStyle = PAPER;
    c.fillRect(0, 0, this.canvas.width, this.canvas.height);
    c.drawImage(this.bg, ox, oy);
    c.setTransform(dpr, 0, 0, dpr, ox, oy);

    this.drawRings();
    this.drawLinks();
    const es = this.enemies;
    const tgt = this.target && !this.target.dead ? this.target : null;
    for (let i = 0; i < es.length; i++) {
      const e = es[i];
      if (!e.dead && e.delay <= 0 && e !== tgt) this.drawEnemy(e, false);
    }
    if (tgt) this.drawEnemy(tgt, true);
    this.drawCore();
    this.drawMorph();
    this.drawParts();
    this.drawHud();
    this.drawNote();
    this.drawTexts();

    if (this.whiteFlash > 0) {
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      c.fillStyle = `rgba(250,245,232,${(this.whiteFlash * 0.55).toFixed(3)})`;
      c.fillRect(0, 0, W, H);
    }
    if (this.flash > 0) {
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      c.fillStyle = `rgba(201,52,31,${(this.flash * 0.24).toFixed(3)})`;
      c.fillRect(0, 0, W, H);
      c.strokeStyle = `rgba(201,52,31,${(this.flash * 0.8).toFixed(3)})`;
      c.lineWidth = 10;
      c.strokeRect(0, 0, W, H);
    }
  }

  private drawRings() {
    const c = this.ctx;
    for (const r of this.rings) {
      if (r.age < 0) continue;
      const p = r.age / r.life;
      const rad = Math.hypot(this.W, this.H) * 0.58 * (1 - Math.pow(1 - p, 3));
      c.globalAlpha = (1 - p) * 0.9;
      c.strokeStyle = r.c;
      c.lineWidth = r.w * (1 - p * 0.6);
      c.beginPath();
      c.arc(this.cx, this.cy, rad, 0, TAU);
      c.stroke();
    }
    c.globalAlpha = 1;
  }

  /** Le fil qui « relie » le mot central au mot choisi : il se tend en un instant. */
  private drawLinks() {
    const l = this.link;
    const c = this.ctx;
    if (!l && this.armed && this.phase === 'live') {
      // mot central saisi : le fil suit le doigt (ou s'accroche au mot visé)
      const t = this.target && !this.target.dead ? this.target : null;
      c.strokeStyle = RED;
      c.lineWidth = 3;
      c.lineCap = 'round';
      c.setLineDash([2, 8]);
      c.beginPath();
      c.moveTo(this.cx, this.cy);
      c.lineTo(t ? t.x : this.px, t ? t.y : this.py);
      c.stroke();
      c.setLineDash([]);
      return;
    }
    if (!l || l.e.dead || this.phase !== 'live') return;
    const p = Math.min(1, l.t / 0.16);
    c.strokeStyle = RED;
    c.lineWidth = 4;
    c.lineCap = 'round';
    c.globalAlpha = 0.95;
    c.beginPath();
    c.moveTo(this.cx, this.cy);
    c.lineTo(this.cx + (l.e.x - this.cx) * p, this.cy + (l.e.y - this.cy) * p);
    c.stroke();
    c.globalAlpha = 1;
  }

  /** Un œil : blanc + pupille tournée vers le mot central ; en « souffrance » (erreur, dissolution) deux traits en chevron. */
  private eye(ex: number, ey: number, er: number, lx: number, ly: number, hurt: boolean, side: number, lid: string) {
    const c = this.ctx;
    if (hurt) {
      const s = -side;
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
    c.fillStyle = lid;
    c.beginPath();
    c.moveTo(ex + side * er * 1.3, ey - er * 1.05);
    c.lineTo(ex - side * er * 1.3, ey - er * 0.15);
    c.lineTo(ex - side * er * 1.3, ey - er * 1.7);
    c.lineTo(ex + side * er * 1.3, ey - er * 1.7);
    c.closePath();
    c.fill();
  }

  /** Rayon de la tache d'encre d'un ennemi. */
  private blobR() {
    return this.fs * 0.95;
  }

  /** Abscisse du bord gauche de l'étiquette (elle reste toujours dans l'écran). */
  private labelX(e: Enemy) {
    const tw = e.halfW * 2;
    return clamp(e.x - tw / 2, 6, Math.max(6, this.W - tw - 6));
  }

  /** Un ennemi : une tache d'encre qui ondule, ses yeux regardent le mot central, et son mot le suit juste en dessous. */
  private drawEnemy(e: Enemy, isTarget: boolean) {
    const c = this.ctx;
    const t = this.time;
    const r = this.blobR();
    const seed = e.phase;
    const sp = e.age < 0.3 ? Math.max(0.05, backOut(e.age / 0.3)) : 1;
    const reveal = this.phase === 'rest' && e.w.role === 'answer';
    const fill = reveal ? GREEN : e.err > 0 ? RED : INK;
    const k = sp * (1 + e.pop * 0.12);
    c.save();
    c.translate(e.x, e.y);
    c.scale(k, k);
    const N = 10;
    const bx = this.bx;
    const by = this.by;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * TAU;
      const w = 1 + 0.1 * Math.sin(t * 2.4 + i * 1.9 + seed) + 0.07 * Math.sin(t * 3.9 - i * 2.7 + seed * 1.7);
      bx[i] = Math.cos(a) * r * w;
      by[i] = Math.sin(a) * r * w;
    }
    c.fillStyle = fill;
    c.beginPath();
    c.moveTo((bx[N - 1] + bx[0]) / 2, (by[N - 1] + by[0]) / 2);
    for (let i = 0; i < N; i++) {
      const j = (i + 1) % N;
      c.quadraticCurveTo(bx[i], by[i], (bx[i] + bx[j]) / 2, (by[i] + by[j]) / 2);
    }
    c.closePath();
    if (this.quality >= 1) {
      for (let q = 0; q < 3; q++) {
        const a = seed + q * 2.1 + t * (q === 1 ? -0.5 : 0.4);
        const d = r * (1.3 + 0.08 * Math.sin(t * 2 + q));
        const sr = r * (0.09 + q * 0.03);
        c.moveTo(Math.cos(a) * d + sr, Math.sin(a) * d);
        c.arc(Math.cos(a) * d, Math.sin(a) * d, sr, 0, TAU);
      }
    }
    c.fill();
    // les yeux regardent vers le mot central
    const dx = this.cx - e.x;
    const dy = this.cy - e.y;
    const dl = Math.hypot(dx, dy) || 1;
    const lx = dx / dl;
    const ly = dy / dl;
    const er = Math.max(3, r * 0.22);
    this.eye(-r * 0.34, -r * 0.12, er, lx, ly, e.err > 0 || e.doomed, -1, fill);
    this.eye(r * 0.34, -r * 0.12, er, lx, ly, e.err > 0 || e.doomed, 1, fill);
    c.restore();

    // l'étiquette : le mot suit l'ennemi
    const fs = this.fs;
    const tw = e.halfW * 2;
    const th = fs + 11;
    let x0 = this.labelX(e);
    if (e.err > 0) x0 += Math.sin(this.time * 80) * 4 * Math.min(1, e.err / 0.3);
    const y0 = e.y + r * k + 7;
    c.fillStyle = 'rgba(27,25,21,.26)';
    rr(c, x0 + 2.5, y0 + 3, tw, th, 5);
    c.fill();
    c.fillStyle = reveal ? '#d6ead3' : e.err > 0 ? '#f3c9bd' : PAPER_HI;
    rr(c, x0, y0, tw, th, 5);
    c.fill();
    c.strokeStyle = reveal ? GREEN : isTarget || e.err > 0 ? RED : INK;
    c.lineWidth = isTarget || reveal ? 3 : 1.8;
    c.stroke();
    c.font = `700 ${fs}px ${F_WORD}`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillStyle = INK;
    c.fillText(e.w.text.toUpperCase(), x0 + tw / 2, y0 + th / 2 + 1);
  }

  private drawCore() {
    const r = this.round;
    if (!r) return;
    const c = this.ctx;
    const f = Math.round(this.fs * 1.9);
    const w = this.coreW;
    const h = this.coreH;
    const k = 1 + this.core * 0.14;
    c.save();
    c.translate(this.cx, this.cy);
    c.scale(k, k);
    c.fillStyle = 'rgba(27,25,21,.3)';
    rr(c, -w / 2 + 4, -h / 2 + 5, w, h, 12);
    c.fill();
    c.fillStyle = PAPER_HI;
    c.strokeStyle = this.armed ? RED : INK;
    c.lineWidth = this.armed ? 6 : 4;
    rr(c, -w / 2, -h / 2, w, h, 12);
    c.fill();
    c.stroke();
    c.font = `700 ${f}px ${F_WORD}`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillStyle = INK;
    c.fillText(r.center.toUpperCase(), 0, 2);
    // consigne
    c.font = `${Math.round(this.fs * 0.78)}px ${F_DISP}`;
    c.fillStyle = RED;
    c.textBaseline = 'bottom';
    c.fillText(r.prompt, 0, -h / 2 - 6);
    c.restore();
  }

  /** Après la manche : le mot trouvé découpé en préfixe / racine / suffixe. */
  private drawMorph() {
    const m = this.morph;
    if (!m) return;
    const c = this.ctx;
    const parts = m.s.split(/\s+/).filter(Boolean);
    const f = Math.round(this.fs * 1.1);
    c.font = `700 ${f}px ${F_WORD}`;
    c.textAlign = 'left';
    c.textBaseline = 'middle';
    const gap = 8;
    const items = parts.map((p) => {
      const kind = p.endsWith('-') ? 'préfixe' : p.startsWith('-') ? 'suffixe' : 'racine';
      const txt = p.replace(/-/g, '');
      return { kind, txt, w: c.measureText(txt.toUpperCase()).width + 20 };
    });
    const total = items.reduce((s, i) => s + i.w, 0) + gap * (items.length - 1);
    let x = this.cx - total / 2;
    const y = this.cy + this.coreH / 2 + 62 * this.u;
    const a = clamp(m.t < 0.25 ? m.t / 0.25 : m.t > 2.8 ? (3.2 - m.t) / 0.4 : 1, 0, 1);
    c.globalAlpha = a;
    // le mot entier, pour qu'on sache de quel mot on parle même si le mot central a déjà changé
    c.font = `700 ${Math.round(this.fs * 0.85)}px ${F_DISP}`;
    c.textAlign = 'center';
    c.fillStyle = INK;
    c.fillText(plain(m.s).toUpperCase(), this.cx, y - f * 1.35);
    c.textAlign = 'left';
    c.font = `700 ${f}px ${F_WORD}`;
    for (const it of items) {
      const col = it.kind === 'préfixe' ? BLUE : it.kind === 'suffixe' ? RED : INK;
      c.fillStyle = PAPER_HI;
      c.strokeStyle = col;
      c.lineWidth = 2.5;
      rr(c, x, y - f * 0.85, it.w, f * 1.7, 6);
      c.fill();
      c.stroke();
      c.fillStyle = col;
      c.font = `700 ${f}px ${F_WORD}`;
      c.fillText(it.txt.toUpperCase(), x + 10, y + 1);
      c.font = `${Math.max(11, Math.round(this.fs * 0.6))}px ${F_DISP}`;
      c.fillText(it.kind, x + 2, y + f * 1.25);
      x += it.w + gap;
    }
    c.globalAlpha = 1;
  }

  private drawParts() {
    const c = this.ctx;
    const ps = this.parts;
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i];
      c.globalAlpha = Math.min(1, (p.life / p.max) * 1.4);
      c.fillStyle = p.red ? RED : INK;
      c.beginPath();
      c.arc(p.x, p.y, p.r, 0, TAU);
      c.fill();
    }
    c.globalAlpha = 1;
  }

  private drawHud() {
    const c = this.ctx;
    const { W, hudH } = this;
    c.fillStyle = HEAD;
    c.fillRect(-20, -20, W + 40, hudH + 20);
    c.fillStyle = INK;
    c.fillRect(0, hudH - 2, W, 2);
    const f = this.compact ? 15 : 19;
    c.textBaseline = 'middle';
    c.textAlign = 'left';
    c.font = `${f}px ${F_DISP}`;
    c.fillStyle = INK;
    const sc = fmt(this.shown);
    const k = 1 + this.scorePunch * 0.2;
    c.save();
    c.translate(12, hudH / 2);
    c.scale(k, k);
    c.fillText(`${sc} pts`, 0, 0);
    c.restore();
    const w0 = c.measureText(`${sc} pts`).width;
    if (this.mode !== 'demo') {
      c.fillStyle = 'rgba(27,25,21,.7)';
      c.font = `${Math.round(f * 0.8)}px ${F_DISP}`;
      const mult = multFor(this.streak);
      c.fillText(`Manche ${Math.max(1, this.roundNo)}${mult > 1 ? ` · série ×${mult}` : ''}`, 12 + w0 * 1.2 + 14, hudH / 2);
    }
    // vies : à gauche du bouton pause
    if (this.mode !== 'demo') {
      const max = LEX_TUNE[this.diff].lives;
      c.textAlign = 'right';
      const size = this.compact ? 16 : 22;
      c.font = `${size}px ${F_DISP}`;
      let x = W - 62;
      for (let i = max - 1; i >= 0; i--) {
        const k2 = i === this.lives && this.livesPunch > 0 ? 1 + this.livesPunch * 0.5 : 1;
        c.save();
        c.translate(x, hudH / 2);
        c.scale(k2, k2);
        c.fillStyle = i < this.lives ? RED : 'rgba(27,25,21,.28)';
        c.fillText(i < this.lives ? '♥' : '♡', 0, 0);
        c.restore();
        x -= size * 1.15;
      }
    }
  }

  private wrap(text: string, maxW: number): string[] {
    const c = this.ctx;
    const words = text.split(' ');
    const lines: string[] = [];
    let cur = '';
    for (const w of words) {
      const t = cur ? `${cur} ${w}` : w;
      if (cur && c.measureText(t).width > maxW) {
        lines.push(cur);
        cur = w;
      } else cur = t;
    }
    if (cur) lines.push(cur);
    return lines;
  }

  /** Bilan sous le jeu : pourquoi c'était la bonne réponse, ou ce qu'il fallait trouver. */
  private drawNote() {
    const n = this.note;
    if (!n) return;
    const c = this.ctx;
    const f = Math.max(14, Math.round(this.fs * 0.82));
    c.font = `${f}px ${F_WORD}`;
    c.textBaseline = 'middle';
    c.textAlign = 'left';
    const maxW = Math.min(this.W - 28, 760);
    const lines = this.wrap(n.s, maxW - 30).slice(0, 3);
    const lh = f * 1.35;
    const h = lines.length * lh + 14;
    const a = clamp(n.t < 0.2 ? n.t / 0.2 : n.t > n.life - 0.4 ? (n.life - n.t) / 0.4 : 1, 0, 1);
    const x = (this.W - maxW) / 2;
    const y = this.H - h - 12;
    c.globalAlpha = a;
    c.fillStyle = PAPER_HI;
    c.strokeStyle = n.good ? GREEN : RED;
    c.lineWidth = 3;
    rr(c, x, y, maxW, h, 8);
    c.fill();
    c.stroke();
    c.fillStyle = n.good ? GREEN : RED;
    c.fillRect(x + 6, y + 6, 5, h - 12);
    c.fillStyle = INK;
    lines.forEach((l, i) => c.fillText(l, x + 22, y + 7 + lh * (i + 0.5)));
    c.globalAlpha = 1;
  }

  private drawTexts() {
    const c = this.ctx;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    for (const t of this.texts) {
      const p = t.age / t.life;
      c.globalAlpha = p < 0.7 ? 1 : (1 - p) / 0.3;
      c.fillStyle = t.c;
      c.font = `700 ${Math.round(t.size)}px ${F_WORD}`;
      c.fillText(t.s, t.x, t.y - p * 28);
    }
    c.globalAlpha = 1;
  }

  /** Bilan de la partie. */
  result(): LexResult {
    return {
      score: this.score,
      correct: this.wins,
      wrong: this.losses,
      wave: Math.max(1, this.wins + this.losses),
      bestStreak: this.bestStreak,
      time: this.playTime,
      rel: this.rel,
      level: this.level,
      diff: this.diff,
      missed: this.missed.slice(0, 6),
    };
  }
}
