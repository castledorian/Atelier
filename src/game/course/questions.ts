import type { Grade } from '../grade';

/**
 * Calculs de « Course à l'encre ». Le contenu suit les repères annuels de progression de mathématiques du cycle 3
 * (Éduscol) pour le CALCUL MENTAL :
 *  CM1 — tables de multiplication et divisions associées, doubles et moitiés, compléments à 100 et à 1 000,
 *        ajouter/soustraire 9, 19…, multiplier par 10, 100, 1 000 et par les dizaines, quatre premiers multiples
 *        de 25 et de 50, quotient et reste d'une division, fractions décimales et nombres décimaux (×10, ÷10).
 *  CM2 — calcul astucieux (×9, ×11, ×19, ×21, ×5, ×50 par distributivité), multiplier/diviser les décimaux par
 *        10, 100, 1 000, compléments au nombre entier supérieur, additions/soustractions de décimaux,
 *        fractions simples d'une quantité, pourcentages 10 %, 25 %, 50 %, 75 %, ×0,1 et ×0,5.
 *  Cycle 2 (programme 2024, calcul mental) :
 *  CP  — ajouter 1, compléments à 10, doubles, additions et soustractions jusqu'à 20 puis 60, dizaines entières.
 *  CE1 — tables d'addition, tables de 2, 3, 4, 5 et 10, ajouter/retrancher 10, compléments à 100 (dizaines).
 *  CE2 — toutes les tables et premières divisions, doubles et moitiés, compléments à 100 et à 1 000, ×10 et ×100.
 *  Au CP et au CE1, les calculs ne s'écrivent qu'avec des chiffres et des signes : aucune lecture n'est nécessaire.
 * Pour chaque calcul, deux fausses réponses PLAUSIBLES (les erreurs que font vraiment les élèves).
 * Une partie = 6 « pages » de 8 calculs : un thème par page, de plus en plus difficile.
 */

/** Le niveau de contenu est la classe : CP, CE1, CE2, CM1, CM2. */
export type Level = Grade;
export const LEVEL_IDS: readonly Level[] = ['cp', 'ce1', 'ce2', 'cm1', 'cm2'];
export const isLevel = (v: unknown): v is Level => LEVEL_IDS.includes(v as Level);
export type Rng = () => number;

export interface Question {
  /** ex. « 7 × 8 = ? » */
  text: string;
  answer: number;
  /** erreurs plausibles (positives, différentes de la bonne réponse) */
  near: number[];
}

/** Un calcul raté pendant la partie, gardé pour le bilan « à retravailler ». */
export interface Missed {
  text: string;
  answer: number;
  near: number[];
  count: number;
}

export const PAGES = 6;
export const PER_PAGE = 8;
export const TOTAL = PAGES * PER_PAGE;

const r3 = (v: number) => Math.round(v * 1000) / 1000;

/** Écriture française : virgule décimale, espace insécable entre les milliers. */
export function fmtNum(n: number): string {
  const [i, d] = String(r3(n)).split('.');
  const g = i.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return d ? `${g},${d}` : g;
}
const N = fmtNum;

const ri = (r: Rng, a: number, b: number) => a + Math.floor(r() * (b - a + 1));
const pick = <T,>(r: Rng, a: readonly T[]): T => a[Math.floor(r() * a.length)];
const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

/** Chiffres des unités et des dizaines inversés (47 → 74). */
function swapLast2(n: number): number {
  if (!Number.isInteger(n) || n < 10) return n;
  const s = String(n);
  return Number(s.slice(0, -2) + s[s.length - 1] + s[s.length - 2]);
}

const q = (text: string, answer: number, extra: number[] = [], strict = false): Question => {
  answer = r3(answer);
  const isInt = Number.isInteger(answer);
  if (strict) {
    // erreurs « de décalage » (virgule ou zéro oubliés…) : on n'utilise que celles-là
    const ex = [...new Set(extra.map(r3))].filter((v) => Number.isFinite(v) && v > 0 && v !== answer);
    if (ex.length >= 2) return { text, answer, near: ex };
  }
  const base = isInt
    ? [answer + 1, answer - 1, answer + 10, answer - 10, swapLast2(answer)]
    : [answer * 10, answer / 10, answer + 0.1, answer - 0.1, answer + 1, answer - 1];
  const near = [...new Set([...extra, ...base].map(r3))].filter(
    (v) => Number.isFinite(v) && v > 0 && v !== answer && (!isInt || Number.isInteger(v)),
  );
  return { text, answer, near };
};

// ───────────────────────── Générateurs ─────────────────────────

type Gen = (r: Rng) => Question;

const T_ALL = range(2, 9);

/** Table de multiplication : a × b, dans un sens ou dans l'autre. */
const mulT =
  (tables: readonly number[], bmin = 2, bmax = 10): Gen =>
  (r) => {
    const a = pick(r, tables);
    const b = ri(r, bmin, bmax);
    const [x, y] = r() < 0.5 ? [a, b] : [b, a];
    return q(`${x} × ${y} = ?`, a * b, [(a + 1) * b, (a - 1) * b, a * (b + 1), a * (b - 1)]);
  };

/** Division exacte (réciproque d'une table). */
const divT =
  (tables: readonly number[], qmin = 2, qmax = 10): Gen =>
  (r) => {
    const d = pick(r, tables);
    const k = ri(r, qmin, qmax);
    return q(`${d * k} ÷ ${d} = ?`, k, [k + 2, k - 2, d, k * 10]);
  };

const dbl =
  (max: number): Gen =>
  (r) => {
    const n = ri(r, 6, max);
    return q(`Double de ${N(n)} = ?`, 2 * n, [n + 2, 2 * n + 20, 2 * n - 20]);
  };

const half =
  (max: number): Gen =>
  (r) => {
    const n = 2 * ri(r, 4, Math.floor(max / 2));
    return q(`Moitié de ${N(n)} = ?`, n / 2, [n / 2 + 5, n / 2 - 5, n / 4]);
  };

const add =
  (xmin: number, xmax: number, ymin: number, ymax: number): Gen =>
  (r) => {
    const x = ri(r, xmin, xmax);
    const y = ri(r, ymin, ymax);
    return q(`${N(x)} + ${N(y)} = ?`, x + y, [x + y + 100, x + y - 100]);
  };

/** Complément : « 64 + ? = 100 ». */
const comp =
  (target: number, step: number): Gen =>
  (r) => {
    const x = ri(r, 1, target / step - 1) * step;
    const a = target - x;
    return q(`${N(x)} + ? = ${N(target)}`, a, [a + 100, a - 100, x]);
  };

/** Ajouter 8, 9, 18, 19… (on ajoute la dizaine et on enlève 1 ou 2). */
const plus9 =
  (xmin: number, xmax: number): Gen =>
  (r) => {
    const y = pick(r, [8, 9, 18, 19, 28, 29]);
    const x = ri(r, xmin, xmax);
    const t = Math.ceil(y / 10) * 10;
    return q(`${N(x)} + ${y} = ?`, x + y, [x + t, x + t + 1, x + y + 10, x + y - 10]);
  };

const minus9 =
  (xmin: number, xmax: number): Gen =>
  (r) => {
    const y = pick(r, [9, 19, 29, 39]);
    const x = ri(r, xmin, xmax);
    const t = Math.ceil(y / 10) * 10;
    return q(`${N(x)} − ${y} = ?`, x - y, [x - t, x - t - 1, x - y + 10, x - y - 10]);
  };

/** × 10, × 100, × 1 000 sur des entiers. */
const mulPow =
  (maxPow: 100 | 1000, amax: number): Gen =>
  (r) => {
    const a = ri(r, 2, amax);
    const f = pick(r, maxPow === 1000 ? [10, 100, 1000] : [10, 100]);
    return q(`${N(a)} × ${N(f)} = ?`, a * f, [a * f * 10, (a * f) / 10, a * f + a], true);
  };

/** × dizaines : 4 × 30. */
const mulTens: Gen = (r) => {
  const a = ri(r, 2, 9);
  const t = ri(r, 2, 9) * 10;
  return q(`${a} × ${t} = ?`, a * t, [a * t * 10, (a * t) / 10, (a + 1) * t], true);
};

/** Quatre premiers multiples de 25 et de 50 (puis davantage en CM2). */
const mul25 =
  (kmax: number): Gen =>
  (r) => {
    const b = pick(r, [25, 50]);
    const k = ri(r, 2, kmax);
    return q(`${k} × ${b} = ?`, k * b, [(k + 1) * b - 25, (k - 1) * b + 25, k * b * 2]);
  };

/** Division euclidienne : quotient. */
const quotient =
  (dmax: number, kmin: number, kmax: number): Gen =>
  (r) => {
    const d = ri(r, 2, dmax);
    const k = ri(r, kmin, kmax);
    const rem = ri(r, 1, d - 1);
    return q(`Quotient de ${N(d * k + rem)} ÷ ${d} = ?`, k, [k + 1, k - 1, rem + (d - rem)]);
  };

/** Division euclidienne : reste. */
const reste =
  (dmax: number, kmin: number, kmax: number): Gen =>
  (r) => {
    const d = ri(r, 3, dmax);
    const k = ri(r, kmin, kmax);
    const rem = ri(r, 1, d - 1);
    return q(`Reste de ${N(d * k + rem)} ÷ ${d} = ?`, rem, [k, d - rem, rem + 1, rem - 1]);
  };

/** Fractions décimales (et simples) écrites avec une virgule. */
const fracDec =
  (kind: 'dixiemes' | 'centiemes' | 'simples'): Gen =>
  (r) => {
    if (kind === 'simples') {
      const [n, d] = pick(r, [
        [1, 2],
        [1, 4],
        [3, 4],
        [1, 5],
        [2, 5],
        [3, 5],
        [4, 5],
      ] as const);
      return q(`${n}/${d} = ?`, n / d, [n / d + 0.5, n / (d * 10), n / 10, n / d / 2], true);
    }
    if (kind === 'dixiemes') {
      const n = ri(r, 1, 9);
      return q(`${n}/10 = ?`, n / 10, [n / 100, n, n / 10 + 0.1], true);
    }
    const n = ri(r, 1, 99);
    return q(`${n}/100 = ?`, n / 100, [n / 10, n / 1000, n / 100 + 0.1, n / 100 + 0.01], true);
  };

/** Décimal × 10, × 100. */
const decMul =
  (places: 1 | 2): Gen =>
  (r) => {
    const v = places === 1 ? ri(r, 11, 99) / 10 : ri(r, 101, 999) / 100;
    const f = pick(r, [10, 100]);
    return q(`${N(v)} × ${f} = ?`, v * f, [v * f * 10, (v * f) / 10, v + f / 10], true);
  };

/** Nombre (entier ou décimal) ÷ 10, ÷ 100. */
const decDiv =
  (decimal: boolean): Gen =>
  (r) => {
    const f = pick(r, [10, 100]);
    const v = decimal ? ri(r, 11, 99) / 10 : ri(r, 12, 999);
    return q(`${N(v)} ÷ ${f} = ?`, v / f, [(v / f) * 10, v / f / 10, v / 10], true);
  };

/** Décimal × 1 000. */
const mul1000: Gen = (r) => {
  const v = pick(r, [ri(r, 11, 99) / 10, ri(r, 101, 999) / 100]);
  return q(`${N(v)} × 1 000 = ?`, v * 1000, [v * 100, v * 10000, v * 10], true);
};

/** Complément au nombre entier supérieur : 7,4 + ? = 8. */
const compDec: Gen = (r) => {
  const w = ri(r, 2, 9);
  const places = r() < 0.65 ? 1 : 2;
  const fr = places === 1 ? ri(r, 1, 9) / 10 : ri(r, 1, 99) / 100;
  const x = w - 1 + fr;
  return q(`${N(x)} + ? = ${w}`, 1 - fr, [fr, 1 - fr + 0.1, 1 - fr - 0.1, 1 + fr], true);
};

const addDec: Gen = (r) => {
  const a = ri(r, 11, 99) / 10;
  const b = ri(r, 11, 99) / 10;
  return q(`${N(a)} + ${N(b)} = ?`, a + b, [a + b + 1, a + b - 1, Math.round(a) + Math.round(b)]);
};

const subDec: Gen = (r) => {
  const a = ri(r, 31, 99) / 10;
  const b = ri(r, 11, Math.floor(a * 10) - 6) / 10;
  return q(`${N(a)} − ${N(b)} = ?`, a - b, [a - b + 1, a - b - 1, a + b]);
};

/** Pourcentages simples : 10 %, 25 %, 50 %, 75 %. */
const pct: Gen = (r) => {
  const p = pick(r, [10, 25, 50, 75]);
  const base = p === 10 ? ri(r, 2, 50) * 10 : p === 50 ? ri(r, 5, 100) * 2 : ri(r, 2, 50) * 4;
  return q(`${p} % de ${N(base)} = ?`, (base * p) / 100, [base / 2, base / 4, base / 10, base - (base * p) / 100], true);
};

/** Fraction d'une quantité : 3/4 de 60. */
const fracOf: Gen = (r) => {
  const [n, d] = pick(r, [
    [1, 2],
    [1, 4],
    [3, 4],
    [1, 3],
    [2, 3],
    [1, 5],
    [1, 10],
  ] as const);
  const k = ri(r, 2, 12);
  return q(`${n}/${d} de ${d * k} = ?`, n * k, [d * k - n * k, k * (n + 1), k + n, k * d / 2], true);
};

/** × 0,1 et × 0,5. */
const mulSmall: Gen = (r) => {
  const n = ri(r, 12, 99);
  if (r() < 0.5) return q(`0,5 × ${n} = ?`, n / 2, [n * 5, n / 10, n / 4], true);
  return q(`0,1 × ${n} = ?`, n / 10, [n * 10, n / 100, n / 2], true);
};

/** × 9, × 11, × 19, × 21 (distributivité). */
const mulNear =
  (amin: number, amax: number): Gen =>
  (r) => {
    const a = ri(r, amin, amax);
    const b = pick(r, [9, 11, 19, 21]);
    return q(`${a} × ${b} = ?`, a * b, [a * (b + 1), a * (b - 1), a * b + 10, a * b - 10]);
  };

/** × 5 et × 50 (moitié de × 10). */
const mul5 =
  (amin: number, amax: number): Gen =>
  (r) => {
    const a = ri(r, amin, amax);
    const f = pick(r, [5, 50]);
    return q(`${a} × ${f} = ?`, a * f, [a * f * 2, (a * f) / 2, a * (f / 5), a * f + 10]);
  };

/** Nombre à 2 chiffres × nombre à 1 chiffre. */
const mul2d =
  (amin: number, amax: number, bmin: number, bmax: number): Gen =>
  (r) => {
    const a = ri(r, amin, amax);
    const b = ri(r, bmin, bmax);
    // oubli de la retenue : (dizaines × b) × 10 + (unités × b), sans retenue
    const noCarry = Math.floor(a / 10) * b * 10 + ((a % 10) * b) % 10;
    return q(`${a} × ${b} = ?`, a * b, [a * (b + 1), a * (b - 1), noCarry]);
  };

// ───────── Cycle 2 : petits nombres, écrits seulement avec des chiffres et des signes ─────────

/** a + b, avec un total compris entre `minTotal` et `max`. */
const addMax =
  (max: number, minTotal = 3): Gen =>
  (r) => {
    const total = ri(r, minTotal, max);
    const a = ri(r, 1, total - 1);
    return q(`${a} + ${total - a} = ?`, total, [total + 1, total - 1, total + 2, a], true);
  };

/** a − b, avec un départ compris entre `minTotal` et `max` (le résultat reste au moins 1). */
const subMax =
  (max: number, minTotal = 3): Gen =>
  (r) => {
    const total = ri(r, minTotal, max);
    const b = ri(r, 1, total - 1);
    return q(`${total} − ${b} = ?`, total - b, [total - b + 1, total - b - 1, total + b], true);
  };

const plus1 =
  (xmin: number, xmax: number): Gen =>
  (r) => {
    const x = ri(r, xmin, xmax);
    return q(`${x} + 1 = ?`, x + 1, [x, x + 2], true);
  };

const minus1 =
  (xmin: number, xmax: number): Gen =>
  (r) => {
    const x = ri(r, xmin, xmax);
    return q(`${x} − 1 = ?`, x - 1, [x, x - 2], true);
  };

/** Complément : « 7 + ? = 10 ». */
const compTo =
  (target: number): Gen =>
  (r) => {
    const x = ri(r, 1, target - 1);
    const a = target - x;
    return q(`${x} + ? = ${target}`, a, [x, a + 1, a - 1], true);
  };

/** Complément à 100 avec des dizaines : « 60 + ? = 100 ». */
const compH =
  (target: number, step: number): Gen =>
  (r) => {
    const x = ri(r, 1, target / step - 1) * step;
    const a = target - x;
    return q(`${x} + ? = ${target}`, a, [a + 10, a - 10, x], true);
  };

/** Double écrit « n + n ». */
const dblR =
  (min: number, max: number): Gen =>
  (r) => {
    const n = ri(r, min, max);
    return q(`${n} + ${n} = ?`, 2 * n, [2 * n + 2, 2 * n - 2, n], true);
  };

const addTens: Gen = (r) => {
  const a = ri(r, 1, 8);
  const b = ri(r, 1, 9 - a + 1);
  return q(`${10 * a} + ${10 * b} = ?`, 10 * (a + b), [10 * (a + b) + 10, 10 * (a + b) - 10, a + b], true);
};

const subTens: Gen = (r) => {
  const a = ri(r, 3, 10);
  const b = ri(r, 1, a - 1);
  return q(`${10 * a} − ${10 * b} = ?`, 10 * (a - b), [10 * (a - b) + 10, 10 * (a - b) - 10, a - b], true);
};

const plusTen =
  (xmin: number, xmax: number): Gen =>
  (r) => {
    const x = ri(r, xmin, xmax);
    return q(`${x} + 10 = ?`, x + 10, [x + 1, x + 20, x - 10], true);
  };

const minusTen =
  (xmin: number, xmax: number): Gen =>
  (r) => {
    const x = ri(r, xmin, xmax);
    return q(`${x} − 10 = ?`, x - 10, [x - 1, x - 20, x + 10], true);
  };

/** Un nombre à deux chiffres plus des unités, sans retenue : 34 + 5. */
const addUnits =
  (xmin: number, xmax: number): Gen =>
  (r) => {
    const x = ri(r, xmin, xmax);
    const u = x % 10;
    const b = ri(r, 1, Math.max(1, 9 - u));
    return q(`${x} + ${b} = ?`, x + b, [x + b + 10, x + b - 10, x + b + 1], true);
  };

/** Un nombre à deux chiffres moins des unités, sans passer la dizaine : 38 − 5. */
const subUnits =
  (xmin: number, xmax: number): Gen =>
  (r) => {
    const x = ri(r, xmin, xmax);
    const u = Math.max(2, x % 10);
    const b = ri(r, 1, u - 1);
    return q(`${x} − ${b} = ?`, x - b, [x - b + 10, x - b - 10, x - b - 1], true);
  };

/** Addition avec passage de la dizaine : 38 + 27. */
const addC =
  (xmin: number, xmax: number, ymin: number, ymax: number): Gen =>
  (r) => {
    const x = ri(r, xmin, xmax);
    const y = ri(r, ymin, ymax);
    return q(`${x} + ${y} = ?`, x + y, [x + y + 10, x + y - 10, x + y + 1], true);
  };

/** Soustraction : x − y avec x > y. */
const subC =
  (xmin: number, xmax: number, ymin: number, ymax: number): Gen =>
  (r) => {
    const x = ri(r, xmin, xmax);
    const y = ri(r, ymin, Math.min(ymax, x - 2));
    return q(`${x} − ${y} = ?`, x - y, [x - y + 10, x - y - 10, x - y + 1], true);
  };

const GENS: Record<Level, Gen[][]> = {
  cp: [
    // 1 · Échauffement : jusqu'à 10
    [addMax(6), addMax(10), plus1(2, 19), minus1(3, 20), compTo(10), compTo(10)],
    // 2 · Jusqu'à 20
    [addMax(20), addMax(20), subMax(10), subMax(20), dblR(2, 10), compTo(20)],
    // 3 · Doubles et compléments
    [dblR(2, 10), dblR(3, 10), compTo(10), compTo(20), subMax(20), addMax(20)],
    // 4 · Les dizaines
    [addTens, subTens, plusTen(10, 80), minusTen(20, 90), plus1(20, 59), minus1(21, 60)],
    // 5 · Jusqu'à 60
    [addUnits(20, 55), subUnits(23, 59), plusTen(10, 50), minusTen(20, 60), compTo(20), addTens],
    // 6 · Le grand défi
    [addMax(20), subMax(20), addUnits(20, 80), subUnits(30, 90), addTens, subTens, compTo(10), dblR(5, 10)],
  ],
  ce1: [
    // 1 · Échauffement
    [addMax(10), addMax(20), subMax(20), compTo(10), compTo(20), dblR(3, 10)],
    // 2 · Tables d'addition (on passe la dizaine)
    [addMax(20, 11), addMax(20, 11), subMax(20, 11), dblR(5, 10), plusTen(10, 90), minusTen(20, 100)],
    // 3 · Tables de 2, 5 et 10
    [mulT([2, 5, 10]), mulT([2, 5, 10]), mulT([2, 5, 10]), dblR(4, 15), plusTen(10, 90), minusTen(20, 100)],
    // 4 · Tables de 3 et 4
    [mulT([3, 4]), mulT([3, 4]), mulT([2, 3, 4, 5, 10]), mulT([2, 5, 10]), dblR(6, 20), compH(100, 10)],
    // 5 · Les dizaines
    [addTens, subTens, compH(100, 10), compH(100, 10), addUnits(20, 80), subUnits(30, 95)],
    // 6 · Le grand défi
    [addC(10, 60, 6, 30), subC(30, 90, 6, 29), compH(100, 10), mulT([2, 3, 4, 5, 10]), mulT([2, 3, 4, 5, 10]), addTens, dblR(10, 30)],
  ],
  ce2: [
    // 1 · Échauffement
    [mulT([2, 3, 4, 5, 10]), mulT([2, 5, 10]), dbl(50), half(60), addC(10, 60, 6, 30), subC(30, 90, 6, 29)],
    // 2 · Les tables
    [mulT(T_ALL), mulT(T_ALL), mulT([6, 7, 8, 9]), mulT([3, 4, 6, 7]), mulT([2, 5, 10]), dbl(60)],
    // 3 · Compléments et astuces
    [compH(100, 10), compH(100, 5), comp(100, 1), comp(1000, 100), plus9(21, 90), minus9(40, 100)],
    // 4 · × 10 et × 100
    [mulPow(100, 99), mulPow(100, 99), mulTens, mulT([2, 3, 4, 5]), dbl(100), half(200)],
    // 5 · Additions et soustractions
    [addC(25, 150, 15, 90), addC(25, 150, 15, 90), subC(60, 200, 15, 90), subC(60, 200, 15, 90), mul2d(12, 25, 2, 4), half(200)],
    // 6 · Le grand défi
    [mulT(T_ALL), divT([2, 3, 4, 5], 2, 10), compH(100, 10), comp(1000, 100), mulPow(100, 99), plus9(21, 90), mul2d(12, 30, 2, 5)],
  ],
  cm1: [
    // 1 · Échauffement : tables faciles, doubles, moitiés
    [mulT([2, 5, 10]), mulT([2, 5, 10]), mulT([3, 4]), dbl(50), half(100), add(5, 30, 5, 30)],
    // 2 · Toutes les tables
    [mulT(T_ALL), mulT(T_ALL), mulT([6, 7, 8, 9]), divT(T_ALL), divT([2, 3, 4, 5, 10], 2, 10)],
    // 3 · Compléments et astuces
    [comp(100, 10), comp(100, 5), comp(100, 1), comp(1000, 50), plus9(21, 200), minus9(40, 200)],
    // 4 · × 10, × 100, × 1 000
    [mulPow(1000, 99), mulPow(1000, 99), mulPow(100, 999), mulTens, mul25(4), dbl(150)],
    // 5 · Divisions, quotient et reste
    [quotient(5, 3, 15), quotient(9, 3, 12), reste(7, 3, 12), reste(9, 3, 12), divT(T_ALL, 5, 12), mul25(4)],
    // 6 · Défi : décimaux et mélanges
    [fracDec('dixiemes'), fracDec('centiemes'), decMul(1), decDiv(false), quotient(9, 5, 20), comp(1000, 10), mul2d(12, 40, 2, 5)],
  ],
  cm2: [
    // 1 · Les tables (révisions)
    [mulT(T_ALL), mulT([6, 7, 8, 9]), divT(T_ALL), divT([6, 7, 8, 9], 3, 12), dbl(500), half(400)],
    // 2 · Calcul astucieux
    [mulNear(12, 40), mul5(12, 98), mul25(8), plus9(120, 900), minus9(120, 900), mul2d(12, 60, 3, 6)],
    // 3 · × et ÷ par 10, 100, 1 000 avec des décimaux
    [decMul(1), decMul(2), decDiv(true), decDiv(false), mul1000, mulPow(1000, 99)],
    // 4 · Compléments et décimaux
    [compDec, compDec, addDec, subDec, comp(1000, 5), comp(1000, 1)],
    // 5 · Fractions et pourcentages
    [fracDec('simples'), fracOf, pct, pct, mulSmall, fracDec('centiemes')],
    // 6 · Défi du cahier : mélanges
    [mul2d(25, 99, 4, 9), mulNear(25, 80), quotient(9, 12, 60), reste(9, 12, 60), addDec, subDec, pct, fracOf, decMul(2), compDec],
  ],
};

export const PAGE_TITLES: Record<Level, string[]> = {
  cp: ['Échauffement', 'Jusqu’à 20', 'Doubles et compléments', 'Les dizaines', 'Jusqu’à 60', 'Le grand défi'],
  ce1: ['Échauffement', 'Tables d’addition', 'Tables de 2, 5, 10', 'Tables de 3 et 4', 'Les dizaines', 'Le grand défi'],
  ce2: ['Échauffement', 'Les tables', 'Compléments et astuces', '× 10 et × 100', 'Additions et soustractions', 'Le grand défi'],
  cm1: ['Échauffement', 'Toutes les tables', 'Compléments et astuces', '× 10, × 100, × 1 000', 'Divisions et restes', 'Défi des décimaux'],
  cm2: ['Les tables', 'Calcul astucieux', 'Décimaux : × et ÷ 10, 100', 'Compléments et décimaux', 'Fractions et pourcentages', 'Le grand défi'],
};

/** Page (0 à 5) du n-ième calcul de la partie. */
export const stageOf = (n: number) => Math.min(PAGES - 1, Math.floor(n / PER_PAGE));

/** Prochain calcul. `recent` : textes déjà posés récemment, pour ne pas se répéter. */
export function makeQuestion(level: Level, n: number, r: Rng = Math.random, recent: readonly string[] = []): Question {
  const pool = GENS[level][stageOf(n)];
  let out = pool[Math.floor(r() * pool.length)](r);
  for (let i = 0; i < 10 && recent.includes(out.text); i++) out = pool[Math.floor(r() * pool.length)](r);
  return out;
}

/**
 * `count` calculs qui répondent à `match` (par exemple ceux d'une même règle), tirés dans toutes les pages du niveau.
 * Sert à l'entraînement sur une règle et au retour d'une règle à revoir en cours de partie.
 */
export function questionsMatching(level: Level, match: (text: string) => boolean, count: number, r: Rng = Math.random): Question[] {
  const pool = GENS[level].flat();
  const out: Question[] = [];
  const seen = new Set<string>();
  for (let tries = 0; out.length < count && tries < 600; tries++) {
    const cand = pool[Math.floor(r() * pool.length)](r);
    if (match(cand.text) && !seen.has(cand.text)) {
      seen.add(cand.text);
      out.push(cand);
    }
  }
  return out;
}

/** Un calcul à retravailler (entraînement ciblé). */
export const fromMissed = (m: Missed): Question => ({ text: m.text, answer: m.answer, near: m.near });

/** Trois réponses dans un ordre aléatoire : la bonne et deux erreurs plausibles. */
export function makeChoices(question: Question, r: Rng = Math.random): { choices: number[]; correct: number } {
  const wrong: number[] = [];
  const near = [...question.near];
  while (near.length && wrong.length < 2) {
    const v = near.splice(Math.floor(r() * near.length), 1)[0];
    if (v > 0 && v !== question.answer && !wrong.includes(v)) wrong.push(v);
  }
  // sécurité : si le calcul n'a pas assez d'erreurs plausibles, on complète avec un petit écart
  const step = Number.isInteger(question.answer) ? 1 : 0.1;
  for (let k = 1; wrong.length < 2; k++) {
    const v = r3(question.answer + k * step * (r() < 0.5 ? 1 : 2));
    if (v > 0 && v !== question.answer && !wrong.includes(v)) wrong.push(v);
    else if (k > 20) wrong.push(r3(question.answer + 100 + wrong.length));
  }
  const choices = [question.answer, ...wrong];
  for (let i = choices.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [choices[i], choices[j]] = [choices[j], choices[i]];
  }
  return { choices, correct: choices.indexOf(question.answer) };
}

export type CourseDiff = 'apprenti' | 'standard' | 'expert';
export const COURSE_DIFFS: Array<{ id: CourseDiff; label: string; hint: string }> = [
  { id: 'apprenti', label: 'Apprenti', hint: 'Beaucoup de temps, l’encre monte doucement, une erreur coûte peu : pour découvrir et bien démarrer.' },
  { id: 'standard', label: 'Standard', hint: 'Le rythme de référence pour la classe.' },
  { id: 'expert', label: 'Expert', hint: 'Un peu moins de temps, l’encre monte vite et une erreur coûte cher : pour les plus rapides.' },
];

/** Réglages de chaque difficulté (les calculs, eux, ne changent pas : ils suivent le programme du niveau). */
export interface CourseTuning {
  /** multiplicateur du temps de chute de l'étiquette */
  time: number;
  /** multiplicateur de la montée lente de l'encre */
  drain: number;
  /** encre ajoutée par une erreur (0 à 1) */
  wrong: number;
  /** encre retirée par une bonne réponse (0 à 1) */
  heal: number;
}
export const COURSE_TUNING: Record<CourseDiff, CourseTuning> = {
  apprenti: { time: 1.6, drain: 0.58, wrong: 0.14, heal: 0.1 },
  standard: { time: 1.2, drain: 0.86, wrong: 0.275, heal: 0.086 },
  expert: { time: 0.95, drain: 1.17, wrong: 0.61, heal: 0.065 },
};

/**
 * Réglage par classe, appliqué en plus de la difficulté : les plus jeunes laissent moins vite l'encre monter
 * et sont moins punis d'une erreur (ils découvrent le calcul), les CM2 sont au rythme de référence ou un peu au-dessus.
 * Réglées par simulation d'élèves fragiles, moyens et à l'aise de chaque classe (cibles : Apprenti = presque tous finissent le cahier, Standard = les deux tiers des élèves moyens, Expert = les plus rapides) ; à confirmer avec les parties réelles (serveur/stats-equilibrage.sql).
 */
export const LEVEL_TUNING: Record<Level, { drain: number; wrong: number }> = {
  cp: { drain: 0.75, wrong: 0.88 },
  ce1: { drain: 0.8, wrong: 0.9 },
  ce2: { drain: 0.85, wrong: 0.94 },
  cm1: { drain: 0.9, wrong: 0.97 },
  cm2: { drain: 0.95, wrong: 1 },
};

export const isCourseDiff = (v: unknown): v is CourseDiff => v === 'apprenti' || v === 'standard' || v === 'expert';

/** Clé d'un classement : « cm1 » = Standard (comme avant l'ajout des difficultés), « cm1-apprenti », « cm1-expert »… */
export type BoardKey = Level | `${Level}-apprenti` | `${Level}-expert`;
export const boardKey = (level: Level, diff: CourseDiff): BoardKey => (diff === 'standard' ? level : `${level}-${diff}`);

/** Secondes que met l'étiquette à tomber si l'élève ne valide pas : un peu moins à chaque calcul. */
export function travelTime(level: Level, n: number, diff: CourseDiff = 'standard'): number {
  // départ et plancher (en secondes) selon la classe : plus de temps pour les plus jeunes
  const [start, floor] = { cp: [14, 10], ce1: [12, 8.5], ce2: [11, 7.5], cm1: [10, 6.5], cm2: [10, 5.5] }[level];
  return Math.max(floor, start - 0.08 * n) * COURSE_TUNING[diff].time;
}

export const LEVELS: Array<{ id: Level; label: string; hint: string }> = [
  { id: 'cp', label: 'CP', hint: 'Jusqu’à 20 puis 60, compléments à 10, doubles, dizaines' },
  { id: 'ce1', label: 'CE1', hint: 'Tables d’addition, tables de 2, 3, 4, 5 et 10, compléments à 100' },
  { id: 'ce2', label: 'CE2', hint: 'Toutes les tables, compléments, × 10 et × 100' },
  { id: 'cm1', label: 'CM1', hint: 'Tables, compléments, ×\u00a010\u00a0/\u00a0100\u00a0/\u00a01\u00a0000, divisions, premiers décimaux' },
  { id: 'cm2', label: 'CM2', hint: 'Calcul astucieux, décimaux, fractions simples, pourcentages' },
];
