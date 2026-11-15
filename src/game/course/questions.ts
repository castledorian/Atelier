/**
 * Calculs de « Course à l'encre » : des paliers de difficulté croissante pour le CM1 et le CM2,
 * et pour chaque calcul, deux fausses réponses PLAUSIBLES (les erreurs que font vraiment les élèves :
 * un de trop, une dizaine d'écart, chiffres inversés, mauvaise table voisine…).
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

const ri = (r: Rng, a: number, b: number) => a + Math.floor(r() * (b - a + 1));
const pick = <T,>(r: Rng, a: readonly T[]): T => a[Math.floor(r() * a.length)];
const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

/** Chiffres des unités et des dizaines inversés (47 → 74). */
function swapLast2(n: number): number {
  if (n < 10) return n;
  const s = String(n);
  return Number(s.slice(0, -2) + s[s.length - 1] + s[s.length - 2]);
}

const q = (text: string, answer: number, extra: number[] = []): Question => ({
  text,
  answer,
  near: [...new Set([...extra, answer + 1, answer - 1, answer + 10, answer - 10, swapLast2(answer)])].filter(
    (v) => Number.isInteger(v) && v > 0 && v !== answer,
  ),
});

// ───────────────────────── Générateurs ─────────────────────────

type Gen = (r: Rng) => Question;

/** Table de multiplication : a × b, dans un sens ou dans l'autre. */
const mulT =
  (tables: readonly number[], bmin = 1, bmax = 10): Gen =>
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

const add =
  (xmin: number, xmax: number, ymin: number, ymax: number): Gen =>
  (r) => {
    const x = ri(r, xmin, xmax);
    const y = ri(r, ymin, ymax);
    return q(`${x} + ${y} = ?`, x + y, [x + y + 100, x + y - 100]);
  };

const sub =
  (xmin: number, xmax: number, ymin: number, ymax: number): Gen =>
  (r) => {
    const x = ri(r, xmin, xmax);
    const y = ri(r, ymin, Math.max(ymin, Math.min(ymax, x - 1)));
    return q(`${x} − ${y} = ?`, x - y, [x - y + 100, x - y - 100, x + y]);
  };

/** Complément : « 64 + ? = 100 ». */
const comp =
  (target: number, step: number): Gen =>
  (r) => {
    const x = ri(r, 1, target / step - 1) * step;
    const a = target - x;
    return q(`${x} + ? = ${target}`, a, [a + 100, a - 100, x]);
  };

/** Multiplier par des dizaines ou des centaines : 4 × 30. */
const mulTens =
  (hundreds: number): Gen =>
  (r) => {
    const a = ri(r, 2, 9);
    const t = ri(r, 2, 9) * (r() < hundreds ? 100 : 10);
    return q(`${a} × ${t} = ?`, a * t, [(a * t) / 10, a * t * 10, (a + 1) * t]);
  };

/** Nombre à 2 chiffres × nombre à 1 chiffre : 23 × 4. */
const mul2d =
  (amin: number, amax: number, bmin: number, bmax: number): Gen =>
  (r) => {
    const a = ri(r, amin, amax);
    const b = ri(r, bmin, bmax);
    // oubli de la retenue : (dizaines × b) × 10 + (unités × b), sans retenue
    const noCarry = Math.floor(a / 10) * b * 10 + ((a % 10) * b) % 10;
    return q(`${a} × ${b} = ?`, a * b, [a * (b + 1), a * (b - 1), noCarry]);
  };

/** Division d'un nombre à 2 ou 3 chiffres par un nombre à 1 chiffre. */
const div2d =
  (qmin: number, qmax: number): Gen =>
  (r) => {
    const d = ri(r, 2, 9);
    const k = ri(r, qmin, qmax);
    return q(`${d * k} ÷ ${d} = ?`, k, [k + 1, k - 1, k + 10, k - 10]);
  };

const T_ALL = range(2, 9);

const GENS: Record<Level, Gen[][]> = {
  cm1: [
    [mulT([2, 5, 10]), mulT([2, 5, 10]), mulT([2, 3, 4, 5, 10]), add(5, 30, 5, 30)],
    [mulT([2, 3, 4, 5, 10]), mulT([3, 4]), add(10, 60, 10, 40), sub(20, 60, 5, 30), divT([2, 5, 10])],
    [mulT([3, 4, 6, 7]), mulT([6, 7, 3, 4]), divT([2, 3, 4, 5]), add(30, 99, 10, 60), sub(30, 99, 10, 50)],
    [mulT([6, 7, 8, 9]), mulT(T_ALL), divT(T_ALL), comp(100, 5), sub(50, 200, 10, 99)],
    [mulT(T_ALL), divT(T_ALL), add(100, 700, 50, 300), sub(200, 900, 50, 400), mulTens(0), comp(100, 1)],
    [mulT([6, 7, 8, 9]), divT([6, 7, 8, 9]), add(100, 900, 100, 600), sub(300, 999, 100, 500), mulTens(0), comp(100, 1), comp(1000, 10)],
  ],
  cm2: [
    [mulT(T_ALL), mulT([6, 7, 8, 9]), divT(T_ALL), add(30, 99, 20, 99)],
    [mul2d(11, 30, 2, 5), mulT([6, 7, 8, 9]), divT(T_ALL, 5, 12), comp(100, 1), sub(40, 150, 15, 90)],
    [mul2d(12, 60, 3, 7), div2d(10, 30), add(100, 900, 100, 500), sub(200, 900, 50, 500), comp(100, 1)],
    [mul2d(25, 99, 3, 9), div2d(12, 40), add(300, 2000, 100, 999), sub(500, 2000, 100, 900), comp(1000, 10), mulTens(0.4)],
    [mul2d(35, 99, 4, 9), div2d(20, 110), add(1000, 5000, 300, 2500), sub(1500, 5000, 300, 2500), comp(1000, 5), mulTens(0.6)],
    [mul2d(45, 99, 6, 9), div2d(30, 120), add(1000, 7000, 500, 3000), sub(2000, 8000, 500, 3500), comp(1000, 5), mulTens(0.6)],
  ],
};

/** Palier de difficulté après `n` calculs réussis ou tentés (monte tous les 7 calculs, plafonné à 5). */
export const stageOf = (n: number) => Math.min(5, Math.floor(n / 7));

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
  for (let k = 1; wrong.length < 2; k++) {
    const v = question.answer + k * (r() < 0.5 ? 1 : 2);
    if (v > 0 && v !== question.answer && !wrong.includes(v)) wrong.push(v);
    else if (k > 20) wrong.push(question.answer + 100 + wrong.length);
  }
  const choices = [question.answer, ...wrong];
  for (let i = choices.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [choices[i], choices[j]] = [choices[j], choices[i]];
  }
  return { choices, correct: choices.indexOf(question.answer) };
}

/** Durée (secondes) pendant laquelle les portes avancent avant d'atteindre la plume : elle diminue avec les calculs. */
export function travelTime(level: Level, n: number): number {
  const floor = level === 'cm1' ? 2.7 : 2.3;
  return Math.max(floor, 3.8 - 0.05 * n);
}

export const LEVELS: Array<{ id: Level; label: string; hint: string }> = [
  { id: 'cm1', label: 'CM1', hint: 'Tables de multiplication, divisions, additions et soustractions jusqu’à 1 000' },
  { id: 'cm2', label: 'CM2', hint: 'Multiplications à 2 chiffres, divisions, compléments à 100 et à 1 000, grands nombres' },
];
