/**
 * Fiabilité des pourcentages : une moyenne sur 12 manches ne dit pas la même chose qu'une moyenne sur 1 200.
 * Tout pourcentage de réussite est donc accompagné d'un intervalle de confiance (méthode de Wilson, 95 %),
 * et une conclusion (« trop difficile », « trop facile ») n'est tirée que si l'intervalle entier est du même côté de l'objectif.
 */

export interface Interval {
  /** réussite observée, en % (0 à 100) */
  p: number;
  /** bornes de l'intervalle de confiance à 95 %, en % */
  lo: number;
  hi: number;
  /** nombre de manches observées */
  n: number;
}

const Z = 1.96;
const round1 = (x: number) => Math.round(x * 10) / 10;

/** Intervalle de Wilson pour `ok` réussites sur `n` essais (null s'il n'y a aucun essai). */
export function wilson(ok: number, n: number): Interval | null {
  if (!(n > 0) || ok < 0 || ok > n) return null;
  const p = ok / n;
  const z2 = Z * Z;
  const centre = (p + z2 / (2 * n)) / (1 + z2 / n);
  const half = (Z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / (1 + z2 / n);
  return { p: round1(100 * p), lo: round1(100 * Math.max(0, centre - half)), hi: round1(100 * Math.min(1, centre + half)), n };
}

export type Confidence = 'low' | 'medium' | 'high';

/** Niveau de confiance affiché : peu de manches = prudence. */
export function confidenceOf(n: number): Confidence {
  if (n < 30) return 'low';
  if (n < 150) return 'medium';
  return 'high';
}

export const CONFIDENCE_LABEL: Record<Confidence, string> = {
  low: 'Peu de données',
  medium: 'Données correctes',
  high: 'Données solides',
};

export type Reading = 'few' | 'hard' | 'easy' | 'ok' | 'unsure';

/**
 * Compare une réussite à son objectif.
 * - « few » : moins de 30 manches, on ne conclut pas ;
 * - « hard » / « easy » : l'intervalle entier est en dessous / au-dessus de la zone acceptable ;
 * - « ok » : l'intervalle entier est dans la zone acceptable ;
 * - « unsure » : l'intervalle chevauche la limite, il faut plus de données avant de décider.
 */
export function readAgainstTarget(ok: number, n: number, target: number, tolerance: number, deff = 1): { reading: Reading; interval: Interval | null } {
  const interval = deff > 1 ? clusteredWilson(ok, n, deff) : wilson(ok, n);
  if (!interval || n / Math.max(1, deff) < 30) return { reading: 'few', interval };
  if (interval.hi < target - tolerance) return { reading: 'hard', interval };
  if (interval.lo > target + tolerance) return { reading: 'easy', interval };
  if (interval.lo >= target - tolerance && interval.hi <= target + tolerance) return { reading: 'ok', interval };
  return { reading: 'unsure', interval };
}

/** Combien de manches faudrait-il pour que l'intervalle tienne dans ± `half` points (estimation, à p observé) ? */
export function roundsNeeded(p: number, half: number): number {
  const q = Math.min(0.99, Math.max(0.01, p / 100));
  return Math.ceil((Z * Z * q * (1 - q)) / ((half / 100) * (half / 100)));
}

/**
 * Les manches ne sont pas indépendantes : un même élève répond à beaucoup de calculs de la même famille. Si quelques élèves ratent
 * presque tout, ils pèsent lourd, et l'intervalle de Wilson « naïf » serait trop étroit. L'effet de grappe (design effect) mesure
 * de combien la dispersion réelle ENTRE ÉLÈVES dépasse celle qu'on aurait si chaque manche venait d'un élève différent.
 * On divise ensuite le nombre de manches par cet effet : c'est le « nombre de manches utiles ».
 *
 * Données : par élève i, w_i ratés sur n_i posés ; on reçoit seulement les sommes Σw², Σw·n, Σn² (aucun élève n'est identifiable).
 */
export interface Spread {
  players: number;
  shown: number;
  wrong: number;
  ww: number;
  wn: number;
  nn: number;
}

/** Effet de grappe (au moins 1), ou null s'il ne peut pas être estimé (moins de 2 élèves, ou tout réussi / tout raté). */
export function designEffect(s: Spread): number | null {
  const N = s.shown;
  const g = s.players;
  if (!(N > 0) || g < 2) return null;
  const p = s.wrong / N;
  if (p <= 0 || p >= 1) return null;
  const between = Math.max(0, s.ww - 2 * p * s.wn + p * p * s.nn); // Σ (w_i − p·n_i)²
  const vCluster = ((g / (g - 1)) * between) / (N * N);
  const vBinomial = (p * (1 - p)) / N;
  return Math.max(1, Math.round((vCluster / vBinomial) * 100) / 100);
}

/** Intervalle de Wilson calculé sur le nombre de manches UTILES (manches ÷ effet de grappe). */
export function clusteredWilson(ok: number, n: number, deff: number): Interval | null {
  const d = Math.max(1, deff);
  const w = wilson(ok / d, n / d);
  return w ? { ...w, n } : null;
}
