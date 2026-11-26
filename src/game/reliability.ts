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
export function readAgainstTarget(ok: number, n: number, target: number, tolerance: number): { reading: Reading; interval: Interval | null } {
  const interval = wilson(ok, n);
  if (!interval || n < 30) return { reading: 'few', interval };
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
