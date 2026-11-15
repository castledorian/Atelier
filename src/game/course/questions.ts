/**
 * Calculs de « Course à l'encre ». Le contenu suit les repères annuels de progression de mathématiques du cycle 3
 * (Éduscol) pour le CALCUL MENTAL :
 *  CM1 — tables de multiplication et divisions associées, doubles et moitiés, compléments à 100 et à 1 000,
 *        ajouter/soustraire 9, 19…, multiplier par 10, 100, 1 000 et par les dizaines, quatre premiers multiples
 *        de 25 et de 50, quotient et reste d'une division, fractions décimales et nombres décimaux (×10, ÷10).
 *  CM2 — calcul astucieux (×9, ×11, ×19, ×21, ×5, ×50 par distributivité), multiplier/diviser les décimaux par
 *        10, 100, 1 000, compléments au nombre entier supérieur, additions/soustractions de décimaux,
 *        fractions simples d'une quantité, pourcentages 10 %, 25 %, 50 %, 75 %, ×0,1 et ×0,5.
 * Pour chaque calcul, deux fausses réponses PLAUSIBLES (les erreurs que font vraiment les élèves).
 * Une partie = 6 « pages » de 8 calculs : un thème par page, de plus en plus difficile.
 */

export type Level = 'cm1' | 'cm2';
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

const GENS: Record<Level, Gen[][]> = {
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

/** Secondes que met l'étiquette à tomber si l'élève ne valide pas : un peu moins à chaque calcul. */
export function travelTime(level: Level, n: number): number {
  const floor = level === 'cm1' ? 6.5 : 5.5;
  return Math.max(floor, 10 - 0.08 * n);
}

export const LEVELS: Array<{ id: Level; label: string; hint: string }> = [
  { id: 'cm1', label: 'CM1', hint: 'Tables, compléments, ×\u00a010\u00a0/\u00a0100\u00a0/\u00a01\u00a0000, divisions, premiers décimaux' },
  { id: 'cm2', label: 'CM2', hint: 'Calcul astucieux, décimaux, fractions simples, pourcentages' },
];
