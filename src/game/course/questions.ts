import type { Grade } from '../grade';

/**
 * Calculs de « Course à l'encre ».
 *
 * CONTENU — chaque page suit les objectifs « Calcul mental » des programmes en vigueur :
 *  - cycle 2 : programme de mathématiques du BOENJS du 31 octobre 2024 (CP, CE1, CE2, en vigueur depuis la rentrée 2025) ;
 *  - cycle 3 : programme du BO n° 16 du 17 avril 2025 (CM1 depuis la rentrée 2025, CM2 depuis la rentrée 2026).
 *  Les trois volets du programme sont représentés : faits numériques à mémoriser, calculs appuyés sur la numération,
 *  procédures de calcul mental.
 *  CP  — nombres jusqu'à 100 : tables d'addition, doubles, ajouter ou soustraire 1, 2, 10 et des dizaines entières,
 *        complément à la dizaine supérieure, ajouter 9, ajouter deux nombres inférieurs à 100, dizaine entière − unités.
 *  CE1 — nombres jusqu'à 1 000 : tables d'addition et de multiplication « dans les deux sens » (a × ? = p), ajouter ou
 *        soustraire des dizaines et des centaines entières, ajouter 9, 19, 29, soustraire 9 ou un nombre < 9,
 *        produit d'un nombre de 11 à 19 par un nombre < 10 (distributivité).
 *  CE2 — nombres jusqu'à 10 000 : toutes les tables dans les deux sens, × 10 et × 100, ajouter 8, 9, 18, 19… 39,
 *        soustraire 9, 19, 29, 39, × 4 et × 8, chiffre × dizaines, 11–99 × un chiffre (distributivité).
 *  CM1 — × 10, × 100, × 1 000 d'un entier ; décimal × 10 et ÷ 10 (pas encore × 100) ; ajouter ou soustraire des unités,
 *        dizaines, dixièmes ou centièmes à un décimal sans retenue ; ± 8, 9, 18… 39 ; chiffre × dizaines ou centaines ;
 *        × 4, × 8, × 5 ; écriture décimale et relations des fractions usuelles. Pas de pourcentages (programme 2025).
 *  CM2 — moitié des nombres impairs jusqu'à 15 ; décimaux × et ÷ 10, 100, 1 000 ; entier + décimal avec ou sans retenue ;
 *        somme de deux décimaux < 10 à un chiffre après la virgule ; ± 8, 9… 98, 99 ; dizaines × centaines ;
 *        double et moitié d'un décimal simple ; entier ÷ 4 et ÷ 8 ; décimal × 5 et × 50 ; fraction d'un entier.
 *        Les pourcentages, les multiples de 25 et × 0,1 (anciens repères) ont été retirés : ils relèvent de la 6e.
 *  Au CP et au CE1, les calculs ne s'écrivent qu'avec des chiffres et des signes : aucune lecture n'est nécessaire.
 *
 * SCIENCES DE L'APPRENTISSAGE —
 *  - Choix multiples « compétitifs » : chaque fausse réponse est une ERREUR RÉELLE et documentée (compensation à
 *    l'envers pour + 9, zéro « ajouté » à un décimal, virgule mal placée, « 3,6 + 2,7 = 5,13 », 1/4 lu « 1,4 »…).
 *    Des distracteurs plausibles obligent à retrouver la bonne réponse et à écarter les autres, ce qui rend le QCM
 *    aussi profitable qu'une réponse libre (Little, Bjork, Bjork & Angello, 2012 ; Little & Bjork, 2015).
 *  - Révision espacée et entrelacée : à partir de la 2e page, environ un calcul sur quatre reprend une page
 *    précédente, et la dernière page mélange tout (pratique entrelacée : Rohrer, Dedrick, Hartwig & Cheung, 2020).
 *  - Une page = un thème, du plus simple au plus fin (« les cas les plus canoniques d'abord »).
 * Une partie = 6 « pages » de 8 calculs.
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
/** Part des calculs d'une page (de la 2e à la 5e) qui reprennent une page précédente : révision espacée. */
export const SPIRAL = 0.25;

const r3 = (v: number) => Math.round(v * 1000) / 1000;

/** Écriture française : virgule décimale, espace insécable entre les milliers. */
export function fmtNum(n: number): string {
  const [i, d] = String(r3(n)).split('.');
  const g = i.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
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

/**
 * Un calcul et ses erreurs plausibles. `strict` : on n'utilise que les erreurs fournies (les erreurs réelles propres au
 * calcul) tant qu'il y en a au moins deux ; sinon on complète avec des écarts génériques.
 */
const q = (text: string, answer: number, extra: number[] = [], strict = false): Question => {
  answer = r3(answer);
  const isInt = Number.isInteger(answer);
  if (strict) {
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
const NEAR_8_39 = [8, 9, 18, 19, 28, 29, 38, 39] as const;
const NEAR_8_99 = [8, 9, 18, 19, 28, 29, 38, 39, 48, 49, 58, 59, 68, 69, 78, 79, 88, 89, 98, 99] as const;

/** Table de multiplication : a × b, dans un sens ou dans l'autre. Erreurs : le produit voisin dans la table. */
const mulT =
  (tables: readonly number[], bmin = 2, bmax = 10): Gen =>
  (r) => {
    const a = pick(r, tables);
    const b = ri(r, bmin, bmax);
    const [x, y] = r() < 0.5 ? [a, b] : [b, a];
    return q(`${x} × ${y} = ?`, a * b, [(a + 1) * b, (a - 1) * b, a * (b + 1), a * (b - 1)], true);
  };

/** Table « dans l'autre sens » : 6 × ? = 42 (facteur manquant). */
const mulMiss =
  (tables: readonly number[], bmin = 2, bmax = 10): Gen =>
  (r) => {
    const a = pick(r, tables);
    const b = ri(r, bmin, bmax);
    return q(`${a} × ? = ${a * b}`, b, [b + 1, b - 1, a !== b ? a : b + 2], true);
  };

/** Division exacte (réciproque d'une table). */
const divT =
  (tables: readonly number[], qmin = 2, qmax = 10): Gen =>
  (r) => {
    const d = pick(r, tables);
    const k = ri(r, qmin, qmax);
    return q(`${d * k} ÷ ${d} = ?`, k, [k + 1, k - 1, d !== k ? d : k + 2], true);
  };

const dbl =
  (max: number): Gen =>
  (r) => {
    const n = ri(r, 6, max);
    return q(`Double de ${N(n)} = ?`, 2 * n, [n + 2, 2 * n + 10, 2 * n - 10], true);
  };

const half =
  (max: number): Gen =>
  (r) => {
    const n = 2 * ri(r, 4, Math.floor(max / 2));
    return q(`Moitié de ${N(n)} = ?`, n / 2, [n / 2 + 5, n / 2 - 5, n / 4, n - 2], true);
  };

/** Complément : « 64 + ? = 100 ». Erreur fréquente : compléter chaque chiffre à 10 (64 → 46). */
const comp =
  (target: number, step: number): Gen =>
  (r) => {
    const x = ri(r, 1, target / step - 1) * step;
    const a = target - x;
    const digitWise = target === 100 && x % 10 ? (10 - Math.floor(x / 10)) * 10 + (10 - (x % 10)) : a + 10;
    return q(`${N(x)} + ? = ${N(target)}`, a, [digitWise, a + 10, a - 10, a + 100], true);
  };

/**
 * Ajouter 8, 9, 18, 19… : on ajoute la dizaine supérieure puis on corrige. Erreurs : oublier de corriger (x + 20 pour
 * x + 19) ou corriger dans le mauvais sens (x + 21).
 */
const addNear =
  (list: readonly number[], xmin: number, xmax: number): Gen =>
  (r) => {
    const y = pick(r, list);
    const x = ri(r, xmin, xmax);
    const t = Math.ceil(y / 10) * 10;
    return q(`${N(x)} + ${y} = ?`, x + y, [x + t, x + t + (t - y), x + y + 10, x + y - 10], true);
  };

/** Soustraire 8, 9, 19… : erreurs symétriques (x − 20 pour x − 19, ou x − 21). */
const subNear =
  (list: readonly number[], xmin: number, xmax: number): Gen =>
  (r) => {
    const y = pick(r, list);
    const x = ri(r, Math.max(xmin, y + 25), Math.max(xmax, y + 25));
    const t = Math.ceil(y / 10) * 10;
    return q(`${N(x)} − ${y} = ?`, x - y, [x - t, x - t - (t - y), x - y + 10, x - y - 10], true);
  };

/** × 10, × 100, × 1 000 sur des entiers : erreurs de zéros. */
const mulPow =
  (maxPow: 100 | 1000, amax: number): Gen =>
  (r) => {
    const a = ri(r, 2, amax);
    const f = pick(r, maxPow === 1000 ? [10, 100, 1000] : [10, 100]);
    return q(`${N(a)} × ${N(f)} = ?`, a * f, [a * f * 10, (a * f) / 10, a * f + a], true);
  };

/** Un chiffre × des dizaines entières : 4 × 30. */
const mulTens: Gen = (r) => {
  const a = ri(r, 2, 9);
  const t = ri(r, 2, 9) * 10;
  return q(`${a} × ${t} = ?`, a * t, [a * t * 10, (a * t) / 10, (a + 1) * t], true);
};

/** Un chiffre × des centaines entières : 7 × 300. */
const mulHund: Gen = (r) => {
  const a = ri(r, 2, 9);
  const h = ri(r, 2, 9) * 100;
  return q(`${a} × ${N(h)} = ?`, a * h, [a * h * 10, (a * h) / 10, (a + 1) * h], true);
};

/** Dizaines ou centaines entières entre elles : 30 × 200. */
const tensMul: Gen = (r) => {
  const a = ri(r, 2, 9);
  const b = ri(r, 2, 9);
  const p = pick(r, [10, 100]);
  const s = pick(r, [10, 100]);
  const v = a * p * b * s;
  return q(`${N(a * p)} × ${N(b * s)} = ?`, v, [v * 10, v / 10, a * b * (p + s)], true);
};

/** × 4 (double du double) et × 8 (trois fois le double). Erreur : s'arrêter en route. */
const mul48 =
  (f: 4 | 8, amin: number, amax: number): Gen =>
  (r) => {
    const a = ri(r, amin, amax);
    return q(`${a} × ${f} = ?`, a * f, [(a * f) / 2, a * f + 10, a * f - 10, a * (f + 1)], true);
  };

/** × 5 (la moitié de × 10). Erreur : oublier de prendre la moitié. */
const mul5 =
  (amin: number, amax: number): Gen =>
  (r) => {
    const a = ri(r, amin, amax);
    return q(`${a} × 5 = ?`, a * 5, [a * 10, a * 5 + 5, a * 5 - 5, a * 4], true);
  };

/** Division euclidienne : quotient (la division posée à un chiffre est au programme du CM1). */
const quotient =
  (dmax: number, kmin: number, kmax: number): Gen =>
  (r) => {
    const d = ri(r, 2, dmax);
    const k = ri(r, kmin, kmax);
    const rem = ri(r, 1, d - 1);
    return q(`Quotient de ${N(d * k + rem)} ÷ ${d} = ?`, k, [k + 1, k - 1, rem !== k ? rem : k + 2], true);
  };

/** Fractions décimales écrites avec une virgule : 7/10, 35/100. Erreurs de position. */
const fracDec =
  (kind: 'dixiemes' | 'centiemes'): Gen =>
  (r) => {
    if (kind === 'dixiemes') {
      const n = ri(r, 1, 9);
      return q(`${n}/10 = ?`, n / 10, [n / 100, n, n / 10 + 0.1], true);
    }
    const n = ri(r, 1, 99);
    return q(`${n}/100 = ?`, n / 100, [n / 10, n / 1000, n / 100 + 0.1, n / 100 + 0.01], true);
  };

/**
 * Écriture décimale des fractions usuelles : 1/2 = 0,5 ; 3/4 = 0,75… Erreur classique : lire la fraction comme un
 * nombre à virgule (1/4 → 1,4 ou 0,14).
 */
const fracUsual =
  (level: 'cm1' | 'cm2'): Gen =>
  (r) => {
    const pairs: ReadonlyArray<readonly [number, number]> =
      level === 'cm1'
        ? [[1, 2], [1, 4], [3, 4], [1, 2], [3, 2], [5, 2]]
        : [[1, 2], [1, 4], [3, 4], [1, 5], [2, 5], [3, 5], [1, 8], [5, 4], [3, 2], [7, 4]];
    const [n, d] = pick(r, pairs);
    const read = Number(`${n}.${d}`);
    const read0 = Number(`0.${n}${d}`);
    return q(`${n}/${d} = ?`, n / d, [read, read0, n / d + 0.5, (n / d) * 10], true);
  };

/** Relations entre fractions usuelles : 1/2 = ?/10. Erreur : reporter le numérateur ou ajouter au lieu de multiplier. */
const fracRel =
  (level: 'cm1' | 'cm2'): Gen =>
  (r) => {
    const triples: ReadonlyArray<readonly [number, number, number]> =
      level === 'cm1'
        ? [[1, 2, 4], [1, 2, 10], [1, 4, 8], [3, 4, 8], [1, 5, 10], [1, 2, 6], [3, 2, 4], [1, 10, 100]]
        : [[1, 3, 6], [2, 3, 12], [3, 5, 10], [1, 4, 12], [3, 4, 12], [2, 5, 20], [1, 10, 100], [7, 10, 100], [5, 4, 8]];
    const [n, d, D] = pick(r, triples);
    const a = (n * D) / d;
    return q(`${n}/${d} = ?/${D}`, a, [n, n + (D - d), a + 1, a - 1], true);
  };

/** Fraction d'une quantité : 3/4 de 20 (multiplier un entier par une fraction, CM2). */
const fracOf: Gen = (r) => {
  const [n, d] = pick(r, [
    [1, 2],
    [1, 4],
    [3, 4],
    [1, 3],
    [2, 3],
    [1, 5],
    [2, 5],
    [1, 10],
    [3, 10],
  ] as const);
  const k = ri(r, 2, 12);
  return q(`${n}/${d} de ${d * k} = ?`, n * k, [d * k - n * k, k, n * d * k, n * k + n], true);
};

/** Décimal × 10, 100, 1 000. Erreurs : un rang de trop ou de moins, ou « ajouter un zéro » (3,4 × 10 → 3,40 = 3,4). */
const decMul =
  (factors: readonly number[], places: 1 | 2 | 'mix'): Gen =>
  (r) => {
    const p = places === 'mix' ? pick(r, [1, 2]) : places;
    const v = p === 1 ? ri(r, 11, 99) / 10 : ri(r, 101, 999) / 100;
    const f = pick(r, factors);
    return q(`${N(v)} × ${N(f)} = ?`, v * f, [v * f * 10, (v * f) / 10, v, v * f * 100], true);
  };

/** Nombre ÷ 10, 100, 1 000. Erreurs : un rang de trop ou de moins. */
const decDiv =
  (factors: readonly number[], decimal: boolean): Gen =>
  (r) => {
    const f = pick(r, factors);
    const v = decimal ? ri(r, 11, 99) / 10 : ri(r, 12, 999);
    return q(`${N(v)} ÷ ${N(f)} = ?`, v / f, [(v / f) * 10, v / f / 10, (v / f) * 100], true);
  };

/**
 * CM1 : ajouter ou soustraire des unités, des dixièmes ou des centièmes à un décimal, sans retenue.
 * Erreur : ajouter au mauvais rang (3,4 + 0,2 → 5,4 ; 3,4 + 2 → 3,6).
 */
const decPart: Gen = (r) => {
  const kind = pick(r, ['unite', 'dixieme', 'centieme'] as const);
  let a = ri(r, 2, 30);
  if (a % 10 === 9) a -= 1; // aucune retenue sur les unités
  const sub = r() < 0.4 && a % 10 >= 1;
  const t = ri(r, 1, 8);
  const c = ri(r, 1, 8);
  const v = kind === 'centieme' ? a + t / 10 + c / 100 : a + t / 10;
  const units = a % 10;
  if (kind === 'unite') {
    const k = sub ? ri(r, 1, Math.max(1, units)) : ri(r, 1, Math.max(1, 9 - units));
    const ans = sub ? v - k : v + k;
    if (ans <= 0) return q(`${N(v)} + 1 = ?`, v + 1, [v + 0.1, v + 0.01], true);
    return q(`${N(v)} ${sub ? '−' : '+'} ${k} = ?`, ans, [sub ? v - k / 10 : v + k / 10, sub ? v - k / 100 : v + k / 100], true);
  }
  if (kind === 'dixieme') {
    const k = sub ? ri(r, 1, t) : ri(r, 1, 9 - t);
    const s = k / 10;
    const ans = sub ? v - s : v + s;
    return q(`${N(v)} ${sub ? '−' : '+'} ${N(s)} = ?`, ans, [sub ? v - k : v + k, sub ? v - k / 100 : v + k / 100], true);
  }
  const k = sub ? ri(r, 1, c) : ri(r, 1, 9 - c);
  const s = k / 100;
  const ans = sub ? v - s : v + s;
  return q(`${N(v)} ${sub ? '−' : '+'} ${N(s)} = ?`, ans, [sub ? v - k / 10 : v + k / 10, sub ? v - k : v + k], true);
};

/**
 * CM2 : entier + décimal, avec ou sans retenue (47,3 + 8). Erreurs : oublier la retenue (45,3), ajouter l'entier aux
 * dixièmes (47,11 lu comme 47 + 0,11).
 */
const intDec =
  (carry: boolean): Gen =>
  (r) => {
    let a = ri(r, 11, 88);
    if (carry && a % 10 === 0) a += 5; // il faut des unités pour qu'il y ait une retenue
    if (!carry && a % 10 === 9) a -= 1; // et aucune quand il n'en faut pas
    const t = ri(r, 1, 9);
    const v = a + t / 10;
    const u = a % 10;
    const sub = !carry && r() < 0.35 && u >= 2;
    const k = carry ? ri(r, Math.max(1, 10 - u), 9) : sub ? ri(r, 1, u) : ri(r, 1, Math.max(1, 9 - u));
    if (sub) return q(`${N(v)} − ${k} = ?`, v - k, [v - k / 10, v - k + 10, v - k - 1], true);
    const ans = v + k;
    return q(`${N(v)} + ${k} = ?`, ans, carry ? [ans - 10, t + k >= 10 ? a + (t + k) / 100 : v + k / 10, ans + 1] : [v + k / 10, ans + 10, ans + 1], true);
  };

/**
 * Somme de deux décimaux inférieurs à 10, à un chiffre après la virgule (CM2).
 * Erreur classique : additionner séparément les entiers et les dixièmes (3,6 + 2,7 → 5,13).
 */
const addDec: Gen = (r) => {
  const a = ri(r, 11, 89) / 10;
  const b = ri(r, 11, 89) / 10;
  const ia = Math.floor(a);
  const ib = Math.floor(b);
  const tenths = Math.round((a - ia) * 10) + Math.round((b - ib) * 10);
  const wrongConcat = tenths >= 10 ? ia + ib + tenths / 100 : ia + ib + 1 + tenths / 10;
  return q(`${N(a)} + ${N(b)} = ?`, a + b, [wrongConcat, a + b + 1, a + b - 1, ia + ib], true);
};

/** CM2 : moitié des nombres impairs jusqu'à 15 (13 → 6,5). */
const halfOdd: Gen = (r) => {
  const n = pick(r, [3, 5, 7, 9, 11, 13, 15]);
  return q(`Moitié de ${n} = ?`, n / 2, [(n - 1) / 2, (n + 1) / 2, n / 2 + 1, n * 2], true);
};

/** CM2 : double d'un décimal simple (3,4 → 6,8). Erreur : ne doubler que la partie entière (6,4). */
const dblDec: Gen = (r) => {
  const a = ri(r, 1, 40);
  const t = ri(r, 1, 4);
  const v = a + t / 10;
  return q(`Double de ${N(v)} = ?`, 2 * v, [2 * a + t / 10, 2 * v + 1, 2 * v + 0.1, v + 2], true);
};

/** CM2 : moitié d'un décimal simple (8,6 → 4,3). Erreur : ne prendre la moitié que de la partie entière (4,6). */
const halfDec: Gen = (r) => {
  const a = 2 * ri(r, 2, 20);
  const t = 2 * ri(r, 1, 4);
  const v = a + t / 10;
  return q(`Moitié de ${N(v)} = ?`, v / 2, [a / 2 + t / 10, v / 2 + 1, v / 2 + 0.1, v / 2 - 1], true);
};

/** CM2 : entier ÷ 4 et ÷ 8 (moitié de la moitié…). Erreur : s'arrêter à la moitié. */
const div48: Gen = (r) => {
  const f = pick(r, [4, 8] as const);
  const k = f === 4 ? ri(r, 11, 30) : ri(r, 11, 20);
  const n = k * f;
  return q(`${N(n)} ÷ ${f} = ?`, k, [n / 2, k + 1, k - 1, k * 2], true);
};

/** CM2 : décimal × 5 et × 50 (la moitié de × 10 et de × 100). */
const decMul5: Gen = (r) => {
  const f = pick(r, [5, 50] as const);
  const v = 2 * ri(r, 6, 49) / 10;
  const ans = v * f;
  return q(`${N(v)} × ${f} = ?`, ans, f === 5 ? [v * 10, ans / 10, ans * 10] : [v * 100, ans / 10, v * 5], true);
};

/** × 9, × 11, × 19, × 21 (distributivité : 23 × 9 = 23 × 10 − 23). */
const mulNear =
  (amin: number, amax: number): Gen =>
  (r) => {
    const a = ri(r, amin, amax);
    const b = pick(r, [9, 11, 19, 21]);
    return q(`${a} × ${b} = ?`, a * b, [a * (b + 1), a * (b - 1), a * b + 10, a * b - 10], true);
  };

/** Nombre à 2 chiffres × nombre à 1 chiffre, par décomposition (distributivité). */
const mul2d =
  (amin: number, amax: number, bmin: number, bmax: number): Gen =>
  (r) => {
    const a = ri(r, amin, amax);
    const b = ri(r, bmin, bmax);
    // oubli de multiplier les dizaines, ou oubli de la retenue
    const onlyUnits = Math.floor(a / 10) * 10 + (a % 10) * b;
    const noCarry = Math.floor(a / 10) * b * 10 + ((a % 10) * b) % 10;
    return q(`${a} × ${b} = ?`, a * b, [onlyUnits, noCarry, a * (b + 1), a * (b - 1)], true);
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

/** Table d'addition « dans l'autre sens » : 7 + ? = 15. */
const addMiss =
  (max: number): Gen =>
  (r) => {
    const total = ri(r, 11, max);
    const hi = Math.min(9, total - 2);
    const a = ri(r, Math.min(hi, Math.max(2, total - 9)), hi);
    const b = total - a;
    return q(`${a} + ? = ${total}`, b, [total, b + 1, b - 1], true);
  };

/** Ajouter ou soustraire 1 ou 2. */
const addSmall =
  (xmin: number, xmax: number): Gen =>
  (r) => {
    const x = ri(r, xmin, xmax);
    const k = pick(r, [1, 2]);
    return q(`${x} + ${k} = ?`, x + k, [x + k + 1, x + k - 1, x], true);
  };

const subSmall =
  (xmin: number, xmax: number): Gen =>
  (r) => {
    const x = ri(r, Math.max(4, xmin), xmax);
    const k = pick(r, [1, 2]);
    return q(`${x} − ${k} = ?`, x - k, [x - k + 1, x - k - 1, x], true);
  };

/** Complément : « 7 + ? = 10 ». */
const compTo =
  (target: number): Gen =>
  (r) => {
    const x = ri(r, 1, target - 1);
    const a = target - x;
    return q(`${x} + ? = ${target}`, a, [x, a + 1, a - 1], true);
  };

/** Complément à la dizaine supérieure : « 47 + ? = 50 ». Erreur : écrire le chiffre des unités (7). */
const compNextTen =
  (xmin: number, xmax: number): Gen =>
  (r) => {
    let x = ri(r, xmin, xmax);
    if (x % 10 === 0) x += ri(r, 1, 9);
    const t = Math.ceil(x / 10) * 10;
    const a = t - x;
    return q(`${x} + ? = ${t}`, a, [x % 10, a + 1, a - 1, 10], true);
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
    return q(`${n} + ${n} = ?`, 2 * n, [2 * n + 2, 2 * n - 2, n, 2 * n + 10], true);
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
    return q(`${N(x)} + 10 = ?`, x + 10, [x + 1, x + 20, x - 10], true);
  };

const minusTen =
  (xmin: number, xmax: number): Gen =>
  (r) => {
    const x = ri(r, xmin, xmax);
    return q(`${N(x)} − 10 = ?`, x - 10, [x - 1, x - 20, x + 10], true);
  };

/** Ajouter des dizaines entières : 34 + 30. Erreur : ajouter aux unités (37). Résultat ≤ `max`. */
const addDiz =
  (xmin: number, xmax: number, max: number): Gen =>
  (r) => {
    const x = ri(r, xmin, Math.min(xmax, max - 10));
    const k = ri(r, 1, Math.min(9, Math.floor((max - x) / 10)));
    return q(`${N(x)} + ${10 * k} = ?`, x + 10 * k, [x + 10 * k + 10, x + 10 * k - 10, x + k], true);
  };

/** Soustraire des dizaines entières : 74 − 30. */
const subDiz =
  (xmin: number, xmax: number): Gen =>
  (r) => {
    const x = ri(r, Math.max(21, xmin), xmax);
    const k = ri(r, 1, Math.min(9, Math.floor((x - 1) / 10)));
    return q(`${N(x)} − ${10 * k} = ?`, x - 10 * k, [x - 10 * k + 10, x - 10 * k - 10, x - k], true);
  };

/** Ajouter des centaines entières (CE1, jusqu'à 999) : 245 + 300. */
const addCent =
  (xmin: number, xmax: number): Gen =>
  (r) => {
    const x = ri(r, xmin, Math.min(xmax, 899));
    const k = ri(r, 1, Math.min(9, Math.floor((999 - x) / 100)));
    return q(`${N(x)} + ${100 * k} = ?`, x + 100 * k, [x + 100 * k + 100, x + 100 * k - 100, x + 10 * k], true);
  };

/** Soustraire des centaines entières : 745 − 300. */
const subCent =
  (xmin: number, xmax: number): Gen =>
  (r) => {
    const x = ri(r, Math.max(110, xmin), xmax);
    const k = ri(r, 1, Math.min(9, Math.floor((x - 1) / 100)));
    return q(`${N(x)} − ${100 * k} = ?`, x - 100 * k, [x - 100 * k + 100, x - 100 * k - 100, x - 10 * k], true);
  };

/** Une dizaine entière moins des unités : 40 − 3. Erreurs : 43 (on « colle » le chiffre), 33. */
const subFromTens =
  (min: number, max: number): Gen =>
  (r) => {
    const x = 10 * ri(r, Math.ceil(min / 10), Math.floor(max / 10));
    const b = ri(r, 1, 9);
    return q(`${x} − ${b} = ?`, x - b, [x + b, x - 10 + b, x - b + 1], true);
  };

/** Un nombre à deux chiffres plus des unités : 34 + 5 (sans passer la dizaine) ou 38 + 5 (en la passant). */
const addUnits =
  (xmin: number, xmax: number): Gen =>
  (r) => {
    const x = ri(r, xmin, xmax);
    const b = ri(r, 2, 8);
    return q(`${x} + ${b} = ?`, x + b, [x + b + 10, x + b - 10, x + b + 1, x + b - 1], true);
  };

/** Un nombre à deux chiffres moins des unités : 38 − 5 ou 53 − 6. Erreur : « le plus petit du plus grand » (53 − 6 → 53). */
const subUnits =
  (xmin: number, xmax: number): Gen =>
  (r) => {
    const x = ri(r, xmin, xmax);
    const b = ri(r, 2, 8);
    const u = x % 10;
    const smallFromBig = Math.floor(x / 10) * 10 + Math.abs(u - b);
    return q(`${x} − ${b} = ?`, x - b, [smallFromBig, x - b + 10, x - b - 1, x - b + 1], true);
  };

/** Addition de deux nombres : 38 + 27. Erreur : oublier la retenue. */
const addC =
  (xmin: number, xmax: number, ymin: number, ymax: number): Gen =>
  (r) => {
    const x = ri(r, xmin, xmax);
    const y = ri(r, ymin, ymax);
    return q(`${N(x)} + ${N(y)} = ?`, x + y, [x + y + 10, x + y - 10, x + y + 1], true);
  };

const GENS: Record<Level, Gen[][]> = {
  cp: [
    // 1 · Jusqu'à 10 : petites sommes, ± 1 ou 2, compléments à 10, doubles
    [addMax(10), addMax(10), addSmall(1, 17), subSmall(4, 19), compTo(10), dblR(1, 5)],
    // 2 · Tables d'addition (on passe la dizaine, dans les deux sens)
    [addMax(20, 11), addMax(20, 11), subMax(20, 11), addMiss(18), dblR(5, 10), compTo(10)],
    // 3 · Ajouter et retrancher 10 et des dizaines
    [plusTen(1, 89), minusTen(11, 99), addDiz(1, 69, 99), subDiz(31, 99), addTens, subTens],
    // 4 · Vers la dizaine : compléments, + 9, + unités
    [compNextTen(11, 89), compNextTen(11, 89), addNear([9], 10, 80), addUnits(11, 85), addSmall(20, 97), dblR(5, 10)],
    // 5 · Jusqu'à 100 : dizaine − unités, deux nombres, − unités
    [subFromTens(20, 90), subFromTens(20, 90), addC(11, 59, 11, 39), subUnits(23, 99), addUnits(20, 89), addNear([9], 10, 89)],
    // 6 · Le grand défi : tout mélangé
    [addMax(20, 11), subMax(20, 11), addC(11, 59, 11, 39), subFromTens(20, 90), compNextTen(11, 89), addNear([9], 10, 89), addDiz(1, 69, 99), dblR(5, 10)],
  ],
  ce1: [
    // 1 · Tables d'addition dans les deux sens
    [addMax(20, 11), subMax(20, 11), addMiss(20), dblR(5, 10), compTo(10), compNextTen(11, 99)],
    // 2 · Dizaines et centaines entières (jusqu'à 1 000)
    [addDiz(10, 899, 999), subDiz(30, 999), addCent(10, 899), subCent(110, 999), addDiz(10, 899, 999), subCent(110, 999)],
    // 3 · Tables de 2, 3, 4, 5 et 10, dans les deux sens
    [mulT([2, 5, 10]), mulT([2, 5, 10]), mulT([3, 4]), mulT([3, 4]), mulMiss([2, 5, 10]), mulMiss([3, 4])],
    // 4 · Ajouter 9, 19, 29 ; soustraire 9 ou un petit nombre
    [addNear([9, 19, 29], 11, 90), addNear([9, 19, 29], 11, 90), addNear([9], 100, 890), subNear([9], 21, 99), subUnits(21, 99), compH(100, 10)],
    // 5 · Tables de 6 à 9, et 13 × 4 en décomposant
    [mulT([6, 7, 8, 9]), mulT([6, 7, 8, 9]), mulT([2, 3, 4, 5, 10]), mulMiss([2, 3, 4, 5]), mul2d(11, 19, 2, 5), mul2d(11, 19, 2, 9)],
    // 6 · Le grand défi
    [mulT(T_ALL), mulMiss([2, 3, 4, 5, 10]), addNear([9, 19, 29], 11, 90), subNear([9], 21, 99), addCent(10, 899), subDiz(30, 999), mul2d(11, 19, 2, 9), addMiss(20)],
  ],
  ce2: [
    // 1 · Échauffement : tables d'addition, petites tables, doubles et moitiés
    [addMiss(20), mulT([2, 3, 4, 5, 10]), dbl(50), half(100), compH(100, 10), addC(20, 80, 12, 19)],
    // 2 · Toutes les tables, dans les deux sens
    [mulT(T_ALL), mulT([6, 7, 8, 9]), mulT([6, 7, 8, 9]), mulMiss(T_ALL), mulMiss([6, 7, 8, 9]), divT([2, 3, 4, 5, 10])],
    // 3 · × 10 et × 100, × dizaines
    [mulPow(100, 99), mulPow(100, 99), mulTens, mulTens, dbl(100), compH(100, 10)],
    // 4 · Ajouter 8, 9, 18… 39 ; soustraire 9, 19, 29, 39
    [addNear(NEAR_8_39, 21, 950), addNear(NEAR_8_39, 21, 950), subNear([9, 19, 29, 39], 60, 990), subNear([9, 19, 29, 39], 60, 990), comp(1000, 100), compH(100, 10)],
    // 5 · × 4, × 8 et 11–99 × un chiffre
    [mul48(4, 11, 49), mul48(8, 11, 25), mul48(4, 11, 49), mul2d(11, 99, 2, 9), mul2d(11, 49, 2, 9), mulTens],
    // 6 · Le grand défi
    [mulT(T_ALL), mulMiss(T_ALL), mulPow(100, 99), addNear(NEAR_8_39, 21, 950), subNear([9, 19, 29, 39], 60, 990), mul48(4, 11, 49), mul2d(11, 49, 2, 9), dbl(100)],
  ],
  cm1: [
    // 1 · Tables (deux sens), doubles et moitiés
    [mulT(T_ALL), mulT([6, 7, 8, 9]), mulMiss(T_ALL), divT(T_ALL), dbl(100), half(200)],
    // 2 · Ajouter ou soustraire 8, 9, 18… 39
    [addNear(NEAR_8_39, 50, 950), addNear(NEAR_8_39, 50, 950), subNear(NEAR_8_39, 60, 999), subNear(NEAR_8_39, 60, 999), comp(100, 1), comp(1000, 10)],
    // 3 · × 10, × 100, × 1 000 ; chiffre × dizaines ou centaines
    [mulPow(1000, 99), mulPow(1000, 99), mulPow(100, 999), mulTens, mulHund, mulHund],
    // 4 · × 4, × 8, × 5 et décompositions
    [mul48(4, 12, 60), mul48(8, 11, 30), mul5(12, 98), mul5(12, 98), mul2d(12, 40, 3, 9), mulTens],
    // 5 · Fractions usuelles et décimaux (× 10, ÷ 10)
    [fracUsual('cm1'), fracRel('cm1'), fracDec('dixiemes'), fracDec('centiemes'), decMul([10], 'mix'), decDiv([10], true)],
    // 6 · Défi des décimaux
    [decPart, decPart, decMul([10], 'mix'), decDiv([10], true), fracUsual('cm1'), quotient(9, 3, 12), mul48(4, 12, 60), addNear(NEAR_8_39, 50, 950)],
  ],
  cm2: [
    // 1 · Faits numériques : tables, moitiés des impairs, doubles
    [mulT([6, 7, 8, 9]), mulMiss(T_ALL), divT([6, 7, 8, 9], 3, 10), halfOdd, halfOdd, dbl(500)],
    // 2 · Calcul astucieux : ± 9… 99, distributivité, ÷ 4 et ÷ 8
    [addNear(NEAR_8_99, 120, 900), subNear(NEAR_8_99, 200, 999), mulNear(12, 40), mul2d(12, 60, 3, 9), div48, div48],
    // 3 · Décimaux × et ÷ 10, 100, 1 000
    [decMul([10, 100, 1000], 'mix'), decMul([10, 100, 1000], 'mix'), decDiv([10, 100, 1000], true), decDiv([10, 100, 1000], false), mulPow(1000, 99), tensMul],
    // 4 · Additionner avec des décimaux, doubles et moitiés
    [addDec, addDec, intDec(false), intDec(true), dblDec, halfDec],
    // 5 · Fractions
    [fracUsual('cm2'), fracUsual('cm2'), fracRel('cm2'), fracOf, fracOf, fracDec('centiemes')],
    // 6 · Le grand défi du cahier
    [decMul5, decMul5, div48, tensMul, mulNear(25, 80), addDec, intDec(true), fracOf, decDiv([10, 100, 1000], true), halfOdd],
  ],
};

export const PAGE_TITLES: Record<Level, string[]> = {
  cp: ['Jusqu’à 10', 'Tables d’addition', 'Les dizaines', 'Vers la dizaine', 'Jusqu’à 100', 'Le grand défi'],
  ce1: ['Tables d’addition', 'Dizaines et centaines', 'Tables de 2 à 5', '+ 9, + 19, + 29', 'Tables de 6 à 9', 'Le grand défi'],
  ce2: ['Échauffement', 'Toutes les tables', '× 10 et × 100', '+ 9, + 19… − 39', '× 4 et × 8', 'Le grand défi'],
  cm1: ['Tables et doubles', '+ 9, + 19… − 39', '× 10, × 100, × 1 000', '× 4, × 8, × 5', 'Fractions et décimaux', 'Défi des décimaux'],
  cm2: ['Faits numériques', 'Calcul astucieux', 'Décimaux : × et ÷ 10, 100, 1 000', 'Additionner des décimaux', 'Fractions', 'Le grand défi'],
};

/** Page (0 à 5) du n-ième calcul de la partie. */
export const stageOf = (n: number) => Math.min(PAGES - 1, Math.floor(n / PER_PAGE));

/**
 * Prochain calcul. `recent` : textes déjà posés récemment, pour ne pas se répéter.
 * De la 2e à la 5e page, environ un calcul sur quatre reprend une page précédente (révision espacée) ;
 * la dernière page mélange déjà tous les thèmes.
 */
export function makeQuestion(level: Level, n: number, r: Rng = Math.random, recent: readonly string[] = []): Question {
  const st = stageOf(n);
  const draw = () => {
    const page = st > 0 && st < PAGES - 1 && r() < SPIRAL ? Math.floor(r() * st) : st;
    const pool = GENS[level][page];
    return pool[Math.floor(r() * pool.length)](r);
  };
  let out = draw();
  for (let i = 0; i < 10 && recent.includes(out.text); i++) out = draw();
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
  { id: 'cp', label: 'CP', hint: 'Jusqu’à 100 : tables d’addition, doubles, dizaines, compléments, + 9' },
  { id: 'ce1', label: 'CE1', hint: 'Jusqu’à 1 000 : tables d’addition et de multiplication, dizaines et centaines, + 9, + 19' },
  { id: 'ce2', label: 'CE2', hint: 'Toutes les tables, × 10 et × 100, + 9… + 39, × 4 et × 8' },
  { id: 'cm1', label: 'CM1', hint: 'Tables, ×\u00a010\u00a0/\u00a0100\u00a0/\u00a01\u00a0000, × 4, × 8, × 5, fractions usuelles, premiers décimaux' },
  { id: 'cm2', label: 'CM2', hint: 'Calcul astucieux, décimaux, × et ÷ 10, 100, 1 000, fractions' },
];
