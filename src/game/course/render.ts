import { multFor } from '../scoring';
import { fmtNum, PAGES, PER_PAGE, stageOf } from './questions';
import { clamp, F_DISP, INK, PAPER, PAPER_HI, rand, RED, rr, TAU } from '../canvas';
import { backOut, F_NUM, fmt, GOLD, GOLD_D, GREEN, INK_HI, lerp, MAX_BONUS, PART_COLORS, SURFACE_STEPS } from './parts';
import type { Gate } from './parts';
import { CourseBase } from './base';

/** Le dessin du jeu : tout ce qui s'affiche sur le canevas, sans toucher à la logique de la partie. */
export abstract class CourseRender extends CourseBase {
  protected colX(l: number) {
    return this.colW * (l + 0.5);
  }

  protected eyeR() {
    return clamp(this.W * 0.026, 9, 17);
  }

  protected buildBg() {
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


  // ───────────────────────── Dessin ─────────────────────────

  /** Hauteur de la surface de la mare : plus la jauge est basse, plus elle monte vers la plume. */
  protected inkTop() {
    if (this.over && !this.won && this.mode === 'play') {
      const p = clamp(this.overT / 0.9, 0, 1);
      return lerp(this.penY + 14, -30, p * p);
    }
    const f = clamp(this.inkShown, 0, 1);
    return lerp(this.penY + 14, this.H - this.barH, f);
  }

  protected render() {
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
  protected drawBeam(c: CanvasRenderingContext2D) {
    if (this.mode !== 'play') return;
    c.fillStyle = 'rgba(212,154,26,0.07)';
    c.fillRect(this.penX - this.colW / 2, this.hudH + 2, this.colW, this.penY - this.hudH + 40 * this.u - 2);
  }

  protected drawInk(c: CanvasRenderingContext2D) {
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

  protected eye(c: CanvasRenderingContext2D, ex: number, ey: number, er: number, side: number, angry: boolean) {
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

  protected drawPen(c: CanvasRenderingContext2D) {
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

  protected drawGate(c: CanvasRenderingContext2D, g: Gate) {
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
      // étiquette : ombre douce, papier légèrement dégradé, reflet, trou de ficelle
      for (let k = 0; k < 4; k++) {
        c.fillStyle = `rgba(27,25,21,${selected ? 0.07 : 0.055})`;
        rr(c, -gw / 2 - k * 2.5, -gh / 2 + 3 + k * 2.5 + (selected ? 3 : 0), gw + k * 5, gh + k * 2, 12 + k * 2);
        c.fill();
      }
      const grad = c.createLinearGradient(0, -gh / 2, 0, gh / 2);
      grad.addColorStop(0, fill);
      grad.addColorStop(1, fill === PAPER_HI ? '#efe5cc' : fill);
      c.fillStyle = grad;
      c.strokeStyle = selected ? GOLD : ink;
      c.lineWidth = selected ? 4 : 2.5;
      rr(c, -gw / 2, -gh / 2, gw, gh, 12);
      c.fill();
      c.stroke();
      c.strokeStyle = 'rgba(255,255,255,0.7)';
      c.lineWidth = 2;
      c.lineCap = 'round';
      c.beginPath();
      c.moveTo(-gw / 2 + 14, -gh / 2 + 7);
      c.lineTo(-gw / 2 + gw * 0.38, -gh / 2 + 7);
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

  protected drawParts(c: CanvasRenderingContext2D) {
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
  protected drawHud(c: CanvasRenderingContext2D) {
    const { W, hudH, u } = this;
    c.textBaseline = 'middle';
    if (this.mode !== 'play') return;
    const drill = this.drillTotal > 0;
    const mult = multFor(this.streak);
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

  protected drawQuestion(c: CanvasRenderingContext2D) {
    if (this.mode === 'demo' && !this.demoQuestion) return;
    const g = this.gate;
    const { W, qH } = this;
    const y0 = this.hudH + 4;
    let s = '';
    if (g) s = g.state === 0 || g.state === 2 ? g.q.text : g.q.text.replace('?', fmtNum(g.q.answer));
    else if (this.mode === 'play' && this.t < 1) s = 'Prêt ?';
    if (!s) return;
    const w = Math.min(W - 20, 560);
    c.fillStyle = INK;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    const showBonus = this.mode === 'play' && !this.compact;
    let fs = Math.round(clamp(qH * 0.56, 24, 50));
    c.font = `700 ${fs}px ${F_NUM}`;
    const room = w - 24 - (showBonus ? 156 : 0); // place réservée des DEUX côtés : le calcul reste toujours au centre
    while (c.measureText(s).width > room && fs > 16) {
      fs -= 2;
      c.font = `700 ${fs}px ${F_NUM}`;
    }
    c.lineJoin = 'round';
    c.lineWidth = 9;
    c.strokeStyle = PAPER_HI;
    c.strokeText(s, W / 2, y0 + (qH - 6) / 2 + 2);
    c.fillText(s, W / 2, y0 + (qH - 6) / 2 + 2);
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
      const bw = Math.min(w - 16, 380);
      c.fillStyle = 'rgba(27,25,21,0.14)';
      c.fillRect((W - bw) / 2, y0 + qH - 12, bw, 4);
      c.fillStyle = bonus > 8 ? GOLD : INK;
      c.fillRect((W - bw) / 2, y0 + qH - 12, bw * (1 - p), 4);
    }
    c.textAlign = 'left';
  }

  protected drawTexts(c: CanvasRenderingContext2D) {
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

  protected drawBanner(c: CanvasRenderingContext2D) {
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

  protected drawHint(c: CanvasRenderingContext2D) {
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
