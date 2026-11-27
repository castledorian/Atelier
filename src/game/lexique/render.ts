import { plain } from './data';
import { multFor } from './geometry';
import { LEX_TUNE } from './rounds';
import { fmt } from '../format';
import { clamp, F_DISP, F_WORD, HEAD, INK, PAPER, PAPER_HI, RED, rr, TAU } from '../canvas';
import { backOut, BLUE, GREEN } from './parts';
import type { Enemy, LexResult } from './parts';
import { LexiqueBase } from './base';

/** Le dessin du jeu : tout ce qui s'affiche sur le canevas, sans toucher à la logique de la partie. */
export abstract class LexiqueRender extends LexiqueBase {

  // ───────────────────────── Rendu ─────────────────────────

  protected render() {
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

  protected drawRings() {
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
  protected drawLinks() {
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
  protected eye(ex: number, ey: number, er: number, lx: number, ly: number, hurt: boolean, side: number, lid: string) {
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
  protected blobR() {
    return this.fs * 0.95;
  }

  /** Abscisse du bord gauche de l'étiquette (elle reste toujours dans l'écran). */
  protected labelX(e: Enemy) {
    const tw = e.halfW * 2;
    return clamp(e.x - tw / 2, 6, Math.max(6, this.W - tw - 6));
  }

  /** Un ennemi : une tache d'encre qui ondule, ses yeux regardent le mot central, et son mot le suit juste en dessous. */
  protected drawEnemy(e: Enemy, isTarget: boolean) {
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

  protected drawCore() {
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
  protected drawMorph() {
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

  protected drawParts() {
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

  protected drawHud() {
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

  protected wrap(text: string, maxW: number): string[] {
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
  protected drawNote() {
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

  protected drawTexts() {
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
