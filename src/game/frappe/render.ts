import { clamp, HEAD, INK, PAPER, PAPER_HI, RED, RED_HI, rr, TAU } from '../canvas';
import { backOut, byY, fmt } from './parts';
import type { Enemy } from './parts';
import { GameBase } from './base';

/** Le dessin du jeu : tout ce qui s'affiche sur le canevas, sans toucher à la logique de la partie. */
export abstract class GameRender extends GameBase {
  protected sweepX() {
    const p = clamp(this.sweep ? this.sweep.t : 0, 0, 1);
    return -30 + (this.W + 60) * (p * p * (3 - 2 * p));
  }

  // ───────────────────────── Rendu ─────────────────────────

  protected render() {
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

  protected drawBanner() {
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

  protected drawDanger() {
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

  protected drawBase() {
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

  protected drawRings() {
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

  protected drawAim(e: Enemy) {
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

  protected drawBlob(e: Enemy) {
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

  protected eye(
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

  protected drawLabel(e: Enemy, locked: boolean) {
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

  protected drawShots() {
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

  protected drawParts() {
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

  protected drawSweep() {
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

  protected drawTexts() {
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

  protected heart(cx: number, cy: number, s: number, filled: boolean) {
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

  protected drawHud() {
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
