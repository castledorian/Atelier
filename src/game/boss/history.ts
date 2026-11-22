/**
 * Courbe d'évolution de la grotte : à partir des fautes et réussites de chaque jour, les points de vie de la créature
 * et la force de la classe, jour après jour (cumulés). Fonctions pures, testées.
 */

export interface DayPoint {
  /** AAAA-MM-JJ */
  d: string;
  /** points de vie de la créature ce soir-là (BASE_HP + fautes cumulées) */
  hp: number;
  /** force de la classe (réussites cumulées) */
  power: number;
}

const DAY_MS = 86_400_000;
const toMs = (d: string) => Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10)));

/** Jours triés et cumulés ; un jour sans partie ne crée pas de point (la courbe reste plate entre deux points). */
export function cumulate(days: ReadonlyArray<{ d: string; ink: number; power: number }>, baseHp: number): DayPoint[] {
  const byDay = new Map<string, [number, number]>();
  for (const x of days) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(x.d)) continue;
    const cur = byDay.get(x.d) ?? [0, 0];
    byDay.set(x.d, [cur[0] + (Number(x.ink) || 0), cur[1] + Math.max(0, Number(x.power) || 0)]);
  }
  let ink = 0;
  let power = 0;
  return [...byDay.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([d, [i, p]]) => {
      ink = Math.max(0, ink + i);
      power += p;
      return { d, hp: baseHp + ink, power };
    });
}

/** Position horizontale (0 à 1) de chaque point, selon sa date entre le premier jour et `today`. */
export function xOf(points: readonly DayPoint[], today: string): number[] {
  if (points.length === 0) return [];
  const a = toMs(points[0].d);
  const b = Math.max(toMs(today), toMs(points[points.length - 1].d), a + DAY_MS);
  return points.map((p) => (toMs(p.d) - a) / (b - a));
}

/** Ce qui a changé sur les 7 derniers jours (pour la phrase sous la courbe). */
export function lastWeek(points: readonly DayPoint[], today: string, baseHp: number): { hp: number; power: number } {
  const limit = toMs(today) - 7 * DAY_MS;
  const before = [...points].reverse().find((p) => toMs(p.d) <= limit);
  const last = points[points.length - 1];
  if (!last) return { hp: 0, power: 0 };
  return { hp: last.hp - (before?.hp ?? baseHp), power: last.power - (before?.power ?? 0) };
}

export const shortDate = (d: string) => {
  const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  return `${Number(d.slice(8, 10))} ${MONTHS[Number(d.slice(5, 7)) - 1]}`;
};
