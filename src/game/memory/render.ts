import { multFor } from '../scoring';
import { MAX_LIVES, MEMORY_DIFF, PAGES, perPage, stageOf, suiteStep, totalOf } from './rounds';
import { clamp, F_DISP, INK, PAPER_HI, rand, RED, TAU } from '../canvas';
import { backOut, BLOT, fmt, FRONT, GOLD, GOLD_D, GREEN, heart, HINT, LEAD, PART_COLORS, smooth, VARIANTS } from './parts';
import { MemoryBase } from './base';

/** Le dessin du jeu : tout ce qui s'affiche sur le canevas, sans toucher à la logique de la partie. */
export abstract class MemoryRender extends MemoryBase {

  // ───────────────────────── Géométrie ─────────────────────────

  protected gap() {
    return clamp((this.gs / this.size) * 0.1, 5, 14);
  }

  protected tileSize() {
    return (this.gs - this.gap() * (this.size - 1)) / this.size;
  }

  protected coinR() {
    return this.tileSize() * 0.47;
  }

  protected tileRect(i: number): { x: number; y: number; s: number } | null {
    const n = this.size;
    if (i < 0 || i >= n * n) return null;
    const gap = this.gap();
    const s = this.tileSize();
    return { x: this.gx + (i % n) * (s + gap), y: this.gy + Math.floor(i / n) * (s + gap), s };
  }

  protected tileAt(x: number, y: number): number {
    const n = this.size;
    const gap = this.gap();
    const s = this.tileSize();
    const pad = gap / 2;
    for (let i = 0; i < n * n; i++) {
      const tx = this.gx + (i % n) * (s + gap);
      const ty = this.gy + Math.floor(i / n) * (s + gap);
      if (x >= tx - pad && x <= tx + s + pad && y >= ty - pad && y <= ty + s + pad) return i;
    }
    return -1;
  }

  // ───────────────────────── Dessin ─────────────────────────

  protected render() {
    this.dirty = false;
    const c = this.ctx;
    const { W, H, dpr } = this;
    let ox = 0;
    let oy = 0;
    if (this.shakeOn && !this.reduced && this.shake > 0.5) {
      ox = Math.round(rand(-1, 1) * this.shake);
      oy = Math.round(rand(-1, 1) * this.shake);
    }
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.drawImage(this.bg, 0, 0);
    c.setTransform(dpr, 0, 0, dpr, Math.round(ox * dpr), Math.round(oy * dpr));
    this.drawMotes(c);
    this.drawBlots(c);
    this.drawRings(c);
    this.drawParts(c);
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.drawHud(c);
    this.drawPrompt(c);
    this.drawTexts(c);
    this.drawBanner(c);
    if (this.flash > 0.02) {
      c.globalAlpha = this.flash * (this.reduced ? 0.07 : 0.12);
      c.fillStyle = this.flashC;
      c.fillRect(0, 0, W, H);
      c.globalAlpha = 1;
    }
  }

  protected drawMotes(c: CanvasRenderingContext2D) {
    c.fillStyle = INK;
    for (const m of this.motes) {
      c.globalAlpha = m.a;
      c.beginPath();
      c.arc(m.x, m.y, m.r, 0, TAU);
      c.fill();
    }
    c.globalAlpha = 1;
  }

  protected drawBlots(c: CanvasRenderingContext2D) {
    const n = this.size;
    const R = this.coinR();
    const faces = this.faces;
    const halo = this.halo;
    if (faces.length < 6 * VARIANTS || !halo) return;
    const fw = faces[0].width / this.dpr;
    const hw = halo.width / this.dpr;
    const playing = this.run === 'play' && !this.over;
    const recent = this.pulse - this.lookT < 1.2;
    for (let i = 0; i < n * n; i++) {
      const r = this.tileRect(i)!;
      const cx = r.x + r.s / 2;
      let cy = r.y + r.s / 2;
      // apparition de la grille : les taches « poussent » l'une après l'autre
      const b = this.born[i];
      if (b <= 0) continue;
      const appear = backOut(clamp(b / 0.32, 0, 1));
      const ph = this.ph[i];
      const flipping = this.flipT[i] >= 0;
      // réveil : fondu de la tache pâle vers l'encre noire (ou l'inverse), avec un petit bond, SANS retournement
      const p = flipping ? smooth(clamp(this.flipT[i], 0, 1)) : 1;
      const bump = flipping ? Math.sin(Math.PI * p) : 0;
      const face = this.shown[i];
      const from = this.flipTo[i];
      const dark = face === BLOT || face === HINT;
      const v = (i * 5 + 2) % VARIANTS;
      // survol : la tache se soulève un peu (seulement tant que la souris ou le doigt bouge, ou au curseur clavier)
      const hovered =
        playing &&
        this.st === 'input' &&
        ((recent && this.lookX >= 0 && Math.hypot(this.lookX - cx, this.lookY - cy) < R) || (this.showCursor && i === this.cursor));
      const lift = bump * R * 0.1 + (hovered ? R * 0.06 : 0);
      cy += dark ? 0 : Math.sin(this.pulse * 1.5 + ph) * 1.4;
      // rebond à l'atterrissage (écrasement puis étirement)
      const lk = this.land[i] / 0.22;
      const squash = lk > 0 ? Math.sin(lk * Math.PI) * 0.1 : 0;
      const jelly = dark && !flipping ? 0.02 * Math.sin(this.pulse * 8 + ph) : 0;
      const sc = appear * (1 + bump * 0.08 + (hovered ? 0.05 : 0));
      const tilt = dark && !flipping ? 0.035 * Math.sin(this.pulse * 4.5 + ph) : 0;
      let y = cy - lift;
      // au repos, on pose la tache sur un pixel entier : l'image est recopiée telle quelle (beaucoup plus rapide sur les vieux ordinateurs)
      const rest = !flipping && !dark && lk <= 0 && appear >= 0.999 && !hovered;
      if (rest) y = Math.round(y * this.dpr) / this.dpr;
      // à quel point la tache est « noire » en ce moment (0 pâle · 1 encre) : ombre et halo suivent
      const fromDark = from === BLOT || from === HINT;
      const ink = flipping ? (dark ? p : 0) + (fromDark ? 1 - p : 0) : dark ? 1 : 0;

      // ombre au sol
      c.fillStyle = INK;
      c.globalAlpha = (0.16 + 0.1 * ink) * Math.min(1, appear);
      c.beginPath();
      c.ellipse(cx, r.y + r.s / 2 + R * 0.92 + 2, R * 0.78 * (1 - 0.1 * bump) * sc, R * 0.2 * sc, 0, 0, TAU);
      c.fill();
      // halo d'encre
      if (ink > 0.01) {
        const hs = hw * sc;
        c.globalAlpha = (0.8 + 0.1 * Math.sin(this.pulse * 3 + ph)) * Math.min(1, appear) * ink;
        c.drawImage(halo, cx - hs / 2, y - hs / 2, hs, hs);
      }
      c.globalAlpha = 1;

      c.save();
      c.translate(rest ? Math.round(cx * this.dpr) / this.dpr : cx, y);
      if (tilt !== 0) c.rotate(tilt);
      c.scale(sc * (1 + squash + jelly), sc * (1 - squash - jelly));
      const spr = (f: number) => faces[(f === FRONT ? 5 : f) * VARIANTS + v];
      if (flipping) {
        c.globalAlpha = 1 - p;
        c.drawImage(spr(from), -fw / 2, -fw / 2, fw, fw);
        c.globalAlpha = p;
        c.drawImage(spr(face), -fw / 2, -fw / 2, fw, fw);
        c.globalAlpha = 1;
        // les yeux s'ouvrent (réveil) ou se ferment (endormissement)
        if (dark) this.drawEyes(c, R, ph, cx, y, face === HINT, p, p);
        else if (fromDark) this.drawEyes(c, R, ph, cx, y, from === HINT, 1 - p, 1 - p);
      } else {
        c.drawImage(spr(face), -fw / 2, -fw / 2, fw, fw);
        if (dark) this.drawEyes(c, R, ph, cx, y, face === HINT, 1, 1);
      }
      c.restore();

      // petites gouttes qui flottent autour d'une tache réveillée, et jaillissent quand elle se pose
      if (face === BLOT && !flipping) {
        c.fillStyle = INK;
        for (let k = 0; k < 3; k++) {
          const a = ph + k * 2.1 + Math.sin(this.pulse * 1.4 + k + ph) * 0.3;
          const d = R * (1.1 + 0.04 * Math.sin(this.pulse * 2.2 + k * 1.7 + ph)) + R * 0.35 * Math.max(0, lk);
          c.beginPath();
          c.arc(cx + Math.cos(a) * d * sc, y + Math.sin(a) * d * sc, R * (0.05 + 0.022 * k) * sc, 0, TAU);
          c.fill();
        }
      }

      // curseur clavier : anneau doré qui tourne
      if (this.showCursor && i === this.cursor && playing) {
        c.strokeStyle = GOLD;
        c.lineWidth = 4;
        c.setLineDash([10, 7]);
        c.lineDashOffset = -this.pulse * 26;
        c.beginPath();
        c.arc(cx, y, R + 6, 0, TAU);
        c.stroke();
        c.setLineDash([]);
      }
    }
  }

  /** Regard d'une tache : balade lente, attiré par le doigt / la souris, avec des clignements. Résultat dans this.gz. */
  protected gaze(R: number, ph: number, wx: number, wy: number) {
    const t = this.pulse;
    let lx = Math.sin(t * 1.7 + ph * 3) * 0.55 + Math.sin(t * 0.55 + ph) * 0.35;
    let ly = Math.cos(t * 1.3 + ph * 2) * 0.45;
    if (this.lookX >= 0) {
      const dx = this.lookX - wx;
      const dy = this.lookY - wy;
      const d = Math.hypot(dx, dy) || 1;
      const k = clamp(d / (R * 2.5), 0.4, 1);
      lx = lx * 0.25 + (dx / d) * k;
      ly = ly * 0.25 + (dy / d) * k;
    }
    const bt = (t * 0.85 + ph) % 3.6;
    this.gz.lx = lx;
    this.gz.ly = ly;
    this.gz.blink = bt < 0.14 ? Math.sin((bt / 0.14) * Math.PI) : 0;
  }

  /** Deux yeux vivants : ils regardent autour d'eux, suivent le doigt, clignent et froncent les sourcils. */
  protected drawEyes(c: CanvasRenderingContext2D, R: number, ph: number, wx: number, wy: number, dim: boolean, open: number, alpha: number) {
    const er = R * 0.2;
    const t = this.pulse;
    this.gaze(R, ph, wx, wy);
    const { lx, ly } = this.gz;
    const blink = Math.max(this.gz.blink, 1 - open);
    c.globalAlpha = (dim ? 0.8 : 1) * alpha;
    for (const sx of [-1, 1]) {
      const ex = sx * R * 0.3;
      const ey = -R * 0.04;
      c.fillStyle = PAPER_HI;
      c.beginPath();
      c.ellipse(ex, ey, er, Math.max(er * 0.08, er * (1 - 0.92 * blink)), 0, 0, TAU);
      c.fill();
      if (blink < 0.7) {
        c.fillStyle = INK;
        c.beginPath();
        c.arc(ex + lx * er * 0.42, ey + ly * er * 0.42, er * 0.5, 0, TAU);
        c.fill();
        c.fillStyle = PAPER_HI;
        c.beginPath();
        c.arc(ex + lx * er * 0.42 - er * 0.14, ey + ly * er * 0.42 - er * 0.16, er * 0.13, 0, TAU);
        c.fill();
      }
      // sourcil froncé qui bouge un peu
      const tw = Math.sin(t * 3 + ph + sx) * 0.05;
      c.strokeStyle = PAPER_HI;
      c.lineWidth = Math.max(2.5, R * 0.055);
      c.lineCap = 'round';
      c.beginPath();
      c.moveTo(ex + sx * er * 1.05, ey - er * (1.6 + tw));
      c.lineTo(ex - sx * er * 1.0, ey - er * (1.1 - tw));
      c.stroke();
    }
    c.globalAlpha = 1;
  }

  protected drawRings(c: CanvasRenderingContext2D) {
    for (const r of this.rings) {
      const p = r.age / 0.5;
      c.globalAlpha = (1 - p) * 0.55;
      c.strokeStyle = r.c;
      c.lineWidth = 3 * (1 - p) + 1;
      c.beginPath();
      c.arc(r.x, r.y, r.r * (0.95 + p * 0.55), 0, TAU);
      c.stroke();
    }
    c.globalAlpha = 1;
  }

  protected drawParts(c: CanvasRenderingContext2D) {
    for (const p of this.parts) {
      c.globalAlpha = clamp(p.life / (p.max * 0.5), 0, 1);
      c.fillStyle = PART_COLORS[p.c];
      c.beginPath();
      c.arc(p.x, p.y, p.r, 0, TAU);
      c.fill();
    }
    c.globalAlpha = 1;
  }

  /** En-tête sobre : libellé au-dessus d'un grand chiffre, cœurs, progression vers la page (ou le palier) suivant. */
  protected drawHud(c: CanvasRenderingContext2D) {
    const { W, hudH, u } = this;
    c.textBaseline = 'middle';
    if (this.run !== 'play') return;
    const right = W - 62;
    const suite = this.mode === 'suite';
    const per = perPage(this.mode);
    const maxLen = totalOf('suite');
    const page = `${Math.min(PAGES, stageOf(this.mode, this.n) + 1)}/${PAGES}`;
    const len = Math.min(maxLen, this.n + 1);
    const midLabel = suite ? (this.record > 0 ? `SUITE · RECORD ${this.record}` : 'SUITE') : 'PAGE';
    const midValue = suite ? String(len) : page;
    const label = (txt: string, x: number, y: number, al: CanvasTextAlign) => {
      c.textAlign = al;
      c.font = `${Math.round(clamp(hudH * 0.2, 9, 11))}px ${F_DISP}`;
      c.fillStyle = 'rgba(27,25,21,0.62)';
      c.fillText(txt, x, y);
    };
    const value = (txt: string, x: number, y: number, al: CanvasTextAlign, k = 1) => {
      c.textAlign = al;
      c.font = `${Math.round(clamp(hudH * 0.4, 16, 24) * k)}px ${F_DISP}`;
      c.fillStyle = INK;
      c.fillText(txt, x, y);
    };
    const mult = multFor(this.streak);
    const scoreTxt = fmt(this.scoreDisp);
    const pop = 1 + 0.2 * this.scorePop;
    if (this.compact) {
      c.font = `${Math.round(clamp(hudH * 0.42, 14, 18) * pop)}px ${F_DISP}`;
      c.fillStyle = INK;
      c.textAlign = 'left';
      c.fillText(`SCORE ${scoreTxt}`, 14, hudH / 2 - 2);
      c.textAlign = 'center';
      c.font = `${Math.round(clamp(hudH * 0.42, 14, 18))}px ${F_DISP}`;
      c.fillText(suite ? `SUITE ${midValue}` : `PAGE ${page}`, W / 2, hudH / 2 - 2);
    } else {
      label('SCORE', 14, hudH * 0.28, 'left');
      value(scoreTxt, 14, hudH * 0.62, 'left', pop);
      label(midLabel, W / 2, hudH * 0.28, 'center');
      value(midValue, W / 2, hudH * 0.62, 'center');
    }
    // série en cours : un badge doré qui bat doucement
    if (mult > 1) {
      c.font = `${Math.round(clamp(hudH * 0.4, 16, 24))}px ${F_DISP}`;
      const bx = 14 + c.measureText(this.compact ? `SCORE ${scoreTxt}` : scoreTxt).width + 12;
      c.font = `${Math.round(clamp(hudH * 0.36, 14, 20) * (1 + 0.08 * Math.sin(this.pulse * 6)))}px ${F_DISP}`;
      c.textAlign = 'left';
      c.fillStyle = GOLD_D;
      c.fillText(`×${mult}`, bx, this.compact ? hudH / 2 - 2 : hudH * 0.62);
    }
    // vies : la dernière bat comme un cœur
    const maxL = MEMORY_DIFF[this.diff].lives;
    const hz = maxL > MAX_LIVES ? 0.78 : 1; // cinq cœurs tiennent dans la même largeur que trois
    for (let i = 0; i < maxL; i++) {
      const beat = this.lives === 1 && i === 0 ? 1 + 0.16 * Math.max(0, Math.sin(this.pulse * 7)) : 1;
      const hs = 8 * u * beat * hz;
      const hx = right - (maxL - 1 - i) * (8 * u * 2.7 * hz) - 8 * u * hz;
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
    // progression : une case par page, qui se remplit au fil des manches (la dernière manche d'une page fait clignoter la case)
    const gap = 4;
    const x0 = 14;
    const x1 = right + 6;
    const bw = (x1 - x0 - gap * (PAGES - 1)) / PAGES;
    const done = this.over && !this.won ? this.n : this.n + (this.st === 'ok' ? 1 : 0);
    for (let i = 0; i < PAGES; i++) {
      const x = x0 + i * (bw + gap);
      const f = clamp((done - i * per) / per, 0, 1);
      c.fillStyle = 'rgba(27,25,21,0.14)';
      c.fillRect(x, hudH - 9, bw, 4);
      if (f > 0) {
        const last = f < 1 && (1 - f) * per < 1.5;
        c.globalAlpha = last ? 0.65 + 0.35 * Math.sin(this.pulse * 7) : 1;
        c.fillStyle = f >= 1 ? INK : GOLD;
        c.fillRect(x, hudH - 9, bw * f, last ? 5 : 4);
        c.globalAlpha = 1;
      }
    }
    c.textAlign = 'left';
  }

  /** Consigne : grand texte sur le papier (pas de boîte), souligné à la plume, avec des pastilles de progression. */
  protected drawPrompt(c: CanvasRenderingContext2D) {
    const { W, qH } = this;
    if (this.run === 'demo') return;
    let s = '';
    if (this.st === 'banner') s = this.first ? 'Prêt ?' : '';
    else if (this.st === 'show') s = 'Regarde bien…';
    else if (this.st === 'input') s = 'À toi !';
    else if (this.st === 'ok') s = this.okWord;
    else if (this.st === 'bad') s = this.nearMiss ? 'Presque\u00a0!' : this.mode === 'suite' ? 'Réécoute…' : 'Pas de panique !';
    if (s !== this.promptKey) {
      this.promptKey = s;
      this.promptT = 0;
    }
    if (!s) return;
    const y0 = this.hudH + 8;
    const fs = Math.round(clamp(qH * 0.46, 20, 32));
    const pop = 1 + 0.22 * Math.max(0, 1 - this.promptT / 0.22);
    const ty = y0 + qH * 0.3;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.font = `${Math.round(fs * pop)}px ${F_DISP}`;
    c.fillStyle = INK;
    c.fillText(s, W / 2, ty);
    // soulignement à la plume qui se dessine
    const tw = c.measureText(s).width;
    const prog = clamp(this.promptT / 0.28, 0, 1);
    c.strokeStyle = this.st === 'bad' ? RED : this.st === 'ok' ? GREEN : GOLD;
    c.lineWidth = 3;
    c.lineCap = 'round';
    c.beginPath();
    const x0 = W / 2 - tw / 2;
    const uy = ty + fs * 0.62;
    for (let x = 0; x <= tw * prog; x += 5) {
      const y = uy + Math.sin(x * 0.18) * 2;
      if (x === 0) c.moveTo(x0 + x, y);
      else c.lineTo(x0 + x, y);
    }
    c.stroke();

    // pastilles : une par tache à retenir
    const total = this.mode === 'suite' ? this.seq.length : this.targets.length;
    if (total > 0 && (this.st === 'show' || this.st === 'input' || this.st === 'ok')) {
      let filled = 0;
      let col = INK;
      if (this.st === 'input') filled = this.mode === 'suite' ? this.k : this.found.size;
      else if (this.st === 'ok') {
        filled = total;
        col = GREEN;
      } else if (this.mode === 'suite') {
        filled = clamp(Math.floor((this.tt - LEAD) / suiteStep(this.n, this.grade, this.diff)) + 1, 0, total);
        col = GOLD_D;
      }
      const sp = Math.min(clamp(qH * 0.075, 3.5, 6) * 3.3, (W - 48) / total);
      const pr = Math.min(clamp(qH * 0.075, 3.5, 6), sp * 0.38);
      const py = ty + fs * 1.18;
      const x00 = W / 2 - ((total - 1) * sp) / 2;
      for (let i = 0; i < total; i++) {
        const on = i < filled;
        const popK = on && i === filled - 1 ? 1 + 0.35 * Math.max(0, 1 - (this.tt % 0.4) / 0.2) : 1;
        c.beginPath();
        c.arc(x00 + i * sp, py, pr * popK, 0, TAU);
        if (on) {
          c.fillStyle = col;
          c.fill();
        } else {
          c.strokeStyle = 'rgba(27,25,21,0.4)';
          c.lineWidth = 2;
          c.stroke();
        }
      }
      // Les Cases : le temps d'observation fond sous les pastilles
      if (this.st === 'show' && this.mode === 'cases' && this.tt >= 0.5) {
        const p = clamp((this.tt - 0.5) / (this.showT + this.targets.length * 0.06), 0, 1);
        const bw = Math.max(total * sp, 120);
        c.fillStyle = 'rgba(27,25,21,0.14)';
        c.fillRect(W / 2 - bw / 2, py + pr + 5, bw, 3);
        c.fillStyle = GOLD;
        c.fillRect(W / 2 - bw / 2, py + pr + 5, bw * (1 - p), 3);
      }
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
