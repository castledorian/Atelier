import { ANSWER_POINTS, multFor, streakAfterLoss, SURVIVE_BONUS } from '../scoring';
import type { Sfx } from '../audio';
import { ruleOfCalc } from '../encre/rules';
import { mathOutcome } from '../itemstats';
import { shouldSummon } from '../encre/tracker';
import { COURSE_TUNING, fmtNum, fromMissed, LEVEL_TUNING, makeChoices, makeQuestion, PAGE_TITLES, PAGES, PER_PAGE, questionsMatching, stageOf, TOTAL, travelTime } from './questions';
import type { Level, Question } from './questions';
import { clamp, INK, rand, RED, TAU } from '../canvas';
import { GOLD, GOLD_D, GREEN, MAX_BONUS, MAX_PARTS, PERFECT_PAGE, WIN_BONUS } from './parts';
import type { CourseCallbacks, CourseResult, Gate, StartOptions } from './parts';
import { CourseRender } from './render';
export * from './parts';


export class CourseGame extends CourseRender {
  constructor(canvas: HTMLCanvasElement, sfx: Sfx, cb: CourseCallbacks) {
    super();
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
    this.diff = opts.diff ?? 'standard';
    this.mode = 'play';
    this.reset();
    this.focus = opts.drill && opts.drill.length ? [] : (opts.focus ?? []);
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

  startDemo(level: Level = 'cm1', withQuestion = false) {
    this.demoQuestion = withQuestion;
    this.mode = 'demo';
    this.level = level;
    this.diff = 'standard';
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

  protected reset() {
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
    this.pageA = [0, 0, 0, 0, 0, 0];
    this.pageE = [0, 0, 0, 0, 0, 0];
    this.shield = false;
    this.gate = null;
    this.spawnIn = 0.9;
    this.recent = [];
    this.lastOk = [];
    this.missed = new Map();
    this.outcomes = [];
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

  /** Images trop lentes pendant ~1,5 s → résolution plus basse (jamais remontée pendant la session). */
  protected watchSpeed(ms: number) {
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

  protected resize = () => {
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

  // ───────────────────────── Mise à jour ─────────────────────────

  protected update(dt: number) {
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
    if (this.drillQueue === null) this.flood -= (0.004 + 0.001 * stageOf(this.asked)) * COURSE_TUNING[this.diff].drain * LEVEL_TUNING[this.level].drain * dt;
    if (this.flood <= 0 && !this.over) this.swallow();
  }

  /** Chute des étiquettes et apparition des suivantes. */
  protected flow(dt: number) {
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

  protected spawn() {
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
      if (this.mode === 'play' && shouldSummon(this.asked, this.lastOk, this.focus)) {
        const rule = this.focus[Math.floor(Math.random() * this.focus.length)];
        const found = questionsMatching(this.level, (t) => ruleOfCalc(t) === rule, 1)[0];
        if (found && !this.recent.includes(found.text)) {
          q = found;
          this.cb.onSummon?.(rule);
        }
      }
    }
    this.recent.push(q.text);
    if (this.recent.length > 4) this.recent.shift();
    const { choices, correct } = makeChoices(q);
    const T = this.mode === 'demo' ? 5 : this.drillQueue ? 11 : travelTime(this.level, this.asked, this.diff);
    const y = this.topY + this.gh / 2;
    this.gate = { q, choices, correct, y, speed: (this.resolveY - y) / T, t0: this.t, T, state: 0, picked: -1, age: 0, retry, bonus: 0 };
    this.demoWait = rand(1.4, 2.6);
    if (this.mode === 'play' && !this.drillQueue && this.asked % PER_PAGE === 0) {
      this.pageBanner();
      this.pageWrong = 0;
      if (this.asked > 0) this.sfx.play('wave');
    }
  }

  protected pageBanner() {
    const p = stageOf(this.asked);
    this.banner = `PAGE ${p + 1} / ${PAGES}`;
    this.bannerSub = PAGE_TITLES[this.level][p];
    this.bannerDur = 1.7;
    this.bannerT = 1.7;
  }

  /** Les 6 pages sont finies : le cahier est terminé. */
  protected victory() {
    if (this.over) return;
    const bonus = WIN_BONUS + Math.round(clamp(this.flood, 0, 1) * 2 * SURVIVE_BONUS) + (this.shield ? SURVIVE_BONUS : 0);
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
  protected resolve(g: Gate) {
    const validated = g.state === 2;
    g.state = 1;
    g.age = 0;
    if (!validated) g.picked = this.lane;
    const ok = g.picked === g.correct;
    const demo = this.mode === 'demo';
    const x = this.colX(g.picked);
    const y = this.penY - 24 * this.u;
    if (!demo) this.asked++;
    if (!demo && !this.drillQueue) this.pageA[Math.min(PAGES - 1, stageOf(this.asked - 1))]++;
    if (!demo && !this.drillQueue) {
      this.lastOk.push(ok);
      this.outcomes.push(mathOutcome(g.q.text, ok, g.choices[g.picked] ?? null));
    }
    if (ok) {
      if (demo) {
        this.burst(x, y, 8, 2, 120);
        return;
      }
      this.correct++;
      this.streak++;
      this.best = Math.max(this.best, this.streak);
      const mult = multFor(this.streak);
      const prevMult = multFor(this.streak - 1);
      const pts = (ANSWER_POINTS + g.bonus) * mult;
      this.score += pts;
      this.flood = Math.min(1, this.flood + COURSE_TUNING[this.diff].heal + (this.streak >= 3 ? 0.03 : 0));
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
      if (!this.drillQueue) this.pageE[Math.min(PAGES - 1, stageOf(this.asked - 1))]++;
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
        this.streak = streakAfterLoss(this.streak, this.diff);
        this.flood -= COURSE_TUNING[this.diff].wrong * LEVEL_TUNING[this.level].wrong;
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

  protected finishDrill() {
    if (this.over) return;
    this.over = true;
    this.overT = 0;
    this.sfx.play('clear');
    this.reported = true;
    window.setTimeout(() => this.cb.onOver(this.result(true)), 500);
  }

  protected swallow() {
    this.over = true;
    this.overT = 0;
    this.shake = 16;
    this.sfx.play('breach');
    window.setTimeout(() => this.sfx.play('over'), 250);
  }

  protected result(cleared: boolean): CourseResult {
    return {
      level: this.level,
      diff: this.diff,
      pages: this.pageA.map((a, i) => ({ a, e: this.pageE[i] })),
      score: this.score,
      correct: this.correct,
      wrong: this.wrong,
      bestStreak: this.best,
      time: Math.round(this.t),
      missed: [...this.missed.values()].sort((a, b) => b.count - a.count),
      outcomes: this.outcomes,
      cleared,
      drill: this.drillTotal > 0,
      won: this.won,
      page: this.won ? PAGES : stageOf(this.asked) + 1,
    };
  }

  /** Décor du menu : la plume joue toute seule. */
  protected botStep(dt: number) {
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

  protected burst(x: number, y: number, n: number, c: number, speed: number) {
    for (let i = 0; i < n; i++) {
      if (this.parts.length >= MAX_PARTS) this.parts.shift();
      const a = rand(0, TAU);
      const s = rand(0.25, 1) * speed;
      const life = rand(0.35, 0.85);
      this.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 90, r: rand(2, 6) * this.u, life, max: life, c });
    }
  }

  protected stain(x: number, y: number, r: number) {
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

  protected text(x: number, y: number, s: string, c: string, size: number) {
    if (this.texts.length > 12) this.texts.shift();
    const half = s.length * size * 0.32;
    const cx = half * 2 > this.W - 16 ? this.W / 2 : clamp(x, half + 8, this.W - half - 8);
    this.texts.push({ x: cx, y, s, c: c === GOLD ? GOLD_D : c, size: Math.round(size * this.u), age: 0, life: 1 });
  }

  protected fx(dt: number) {
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
}
