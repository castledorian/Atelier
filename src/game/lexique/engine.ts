import type { Sfx, SfxName } from '../audio';
import { streakAfterLoss } from '../scoring';
import { edgeDistance, multFor, reachDistance, spreadAngles, winPoints } from './geometry';
import { buildRound, enemyCount, LEX_TUNE, lossNote, travelTime } from './rounds';
import type { LexDiff, LexLevel, Rel } from './rounds';
import { clamp, F_DISP, F_WORD, INK, PAPER, rand, RED, TAU } from '../canvas';
import { BLUE, GREEN, MAX_PARTS } from './parts';
import type { Enemy, LexCallbacks } from './parts';
import { LexiqueRender } from './render';
export * from './parts';


export class LexiqueGame extends LexiqueRender {
  constructor(canvas: HTMLCanvasElement, sfx: Sfx, cb: LexCallbacks) {
    super();
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
  protected enemyAt(x: number, y: number): Enemy | null {
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

  protected onCore(x: number, y: number) {
    return Math.abs(x - this.cx) <= this.coreW / 2 + 16 && Math.abs(y - this.cy) <= this.coreH / 2 + 16;
  }

  protected canPoint() {
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

  protected choose(e: Enemy) {
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

  protected frame = (now: number) => {
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
  protected watchSpeed(ms: number) {
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

  protected resize = () => {
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

  protected buildBg() {
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

  protected reset() {
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

  protected snd(name: SfxName) {
    if (this.mode !== 'demo' || this.demoSound) this.sfx.play(name);
  }

  protected addTrauma(v: number) {
    this.trauma = Math.min(1, this.trauma + (this.mode === 'demo' ? v * 0.25 : v));
  }

  // ───────────────────────── Manches ─────────────────────────

  /** Prépare la manche suivante : mot central, consigne, ennemis en attente d'apparition. */
  protected beginRound(first: boolean) {
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
  protected spawnWave() {
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
  protected resolve(e: Enemy) {
    if (!this.round) return;
    if (e.w.role === 'answer') this.win(e);
    else this.lose(e);
  }

  protected win(e: Enemy) {
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

  protected lose(e: Enemy | null) {
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

  protected update(dt: number) {
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

  protected updatePhase(dt: number) {
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

  protected doom(e: Enemy, quiet: boolean) {
    e.doomed = true;
    e.dead = true;
    if (e === this.target) this.target = null;
    this.burst(e.x, e.y, quiet ? 8 : 16, false);
  }

  protected updateEnemies(dt: number) {
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
  protected updateBot(dt: number) {
    if (this.mode !== 'demo' || this.phase !== 'live') return;
    this.botT += dt;
    if (this.botT < 2.6) return;
    const a = this.enemies.find((e) => e.w.role === 'answer' && !e.dead);
    if (!a) return;
    this.botT = -1;
    this.win(a);
  }

  protected updateFx(dt: number, sdt: number) {
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

  protected burst(x: number, y: number, n: number, red: boolean) {
    const k = this.quality < 1 ? 0.5 : this.quality < 1.5 ? 0.75 : 1;
    const count = Math.round(n * k);
    for (let i = 0; i < count && this.parts.length < MAX_PARTS; i++) {
      const a = rand(0, TAU);
      const v = rand(60, 280);
      const life = rand(0.35, 0.9);
      this.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 40, r: rand(1.5, 4.5) * this.u, life, max: life, red });
    }
  }

  protected spark(x: number, y: number, n: number, red: boolean) {
    for (let i = 0; i < n && this.parts.length < MAX_PARTS; i++) {
      const a = rand(0, TAU);
      const v = rand(30, 110);
      const life = rand(0.2, 0.4);
      this.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, r: rand(1, 2.4) * this.u, life, max: life, red });
    }
  }

  protected measureCore() {
    const r = this.round;
    const c = this.ctx;
    const f = Math.round(this.fs * 1.9);
    c.font = `700 ${f}px ${F_WORD}`;
    const w = r ? c.measureText(r.center.toUpperCase()).width : 100;
    this.coreW = Math.min(this.W * 0.6, Math.max(110 * this.u, w + 36));
    this.coreH = f * 1.45;
  }
}
