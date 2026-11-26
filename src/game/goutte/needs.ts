/**
 * Les besoins de la goutte, à la façon d'un Tamagotchi… mais bienveillant.
 *  - Ventre : se vide doucement (vide en 2 jours et demi) ; une friandise le remplit.
 *  - Bonheur : baisse en 3 jours ; jouer une partie, la nourrir et la caresser le font monter.
 * Rien de grave n'arrive jamais : elle réclame, elle s'endort, elle ne tombe pas malade et ne disparaît pas.
 * Le ventre plein empêche de tout donner d'un coup : on revient la nourrir un autre jour (c'est ce qui fait revenir).
 * Les besoins sont gardés sur l'appareil (ils ne comptent pour rien dans la progression ni pour le serveur).
 */

export interface Need {
  /** valeur au moment `at` (0 à 100) */
  v: number;
  at: number;
}

const HOUR = 3_600_000;
/** heures pour passer de plein à vide */
export const SAT_HOURS = 60;
export const JOY_HOURS = 72;
/** au-dessus, la goutte n'a plus faim */
export const FULL = 92;
/** en dessous, elle réclame */
export const HUNGRY = 30;
/** câlins qui rendent heureux, par jour (au-delà, elle rit quand même) */
export const PETS_PER_DAY = 3;

const clamp = (n: number) => Math.max(0, Math.min(100, n));

/** Valeur actuelle d'un besoin qui se vide avec le temps. */
export function needNow(n: Need, hours: number, now: number = Date.now()): number {
  return clamp(n.v - (Math.max(0, now - n.at) / HOUR) * (100 / hours));
}

/** Ajoute (ou retire) à un besoin, en partant de sa valeur actuelle. */
export function bump(n: Need, add: number, hours: number, now: number = Date.now()): Need {
  return { v: clamp(needNow(n, hours, now) + add), at: now };
}

export const cleanNeed = (x: unknown, fallback: Need): Need => {
  const o = x as Partial<Need> | null;
  return o && typeof o.v === 'number' && Number.isFinite(o.v) && typeof o.at === 'number' && Number.isFinite(o.at) ? { v: clamp(o.v), at: o.at } : fallback;
};

export type LiveMood = 'sleep' | 'hungry' | 'happy' | 'radiant';

/** Humeur affichée : endormie après 2 jours sans partie, affamée si le ventre est presque vide, rayonnante si tout va bien. */
export function liveMood(sat: number, joy: number, lastGame: number, now: number = Date.now()): LiveMood {
  if (lastGame > 0 && now - lastGame > 48 * HOUR) return 'sleep';
  if (sat < HUNGRY) return 'hungry';
  if (sat >= 60 && joy >= 75) return 'radiant';
  return 'happy';
}
