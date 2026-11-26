/**
 * Les 10 formes du monstre de la grotte : elles suivent le CALENDRIER, pas les fautes.
 *
 * La forme 1 apparaît à la rentrée (1er septembre), la forme 10 le 1er juin, quand s'ouvre le grand combat :
 * une évolution par mois environ, et entre deux formes le monstre enfle doucement (`grow`, de 0 à 1).
 * Les points de vie, eux, restent calculés sur les fautes des élèves (voir `bossHp` dans state.ts).
 *
 * Fonctions pures : la date est toujours passée en paramètre, pour pouvoir tester n'importe quel jour de l'année.
 */

export const FORM_NAMES = [
  'Petite Goutte',
  'Flaque',
  'Tache',
  'Gros Pâté',
  'Mare d’encre',
  'Griffonneur',
  'Monstre d’encre',
  'Gardien des pages',
  'Colosse d’encre',
  'Le Grand Pâté',
] as const;

export const FORM_COUNT = FORM_NAMES.length;
export const LAST_FORM = FORM_COUNT - 1;

/** Rentrée : 1er septembre. Dernière forme : 1er juin. */
const START = { month: 8, day: 1 };
const END = { month: 5, day: 1 };
const DAY_MS = 86400000;

const dayNumber = (y: number, m: number, d: number) => Math.floor(Date.UTC(y, m, d) / DAY_MS);

/** Année de départ de l'année scolaire qui contient la date (août appartient déjà à la nouvelle année). */
const startYear = (d: Date) => (d.getMonth() >= 7 ? d.getFullYear() : d.getFullYear() - 1);

/** Nombre de jours entre la rentrée et la dernière forme (273 en année ordinaire). */
function spanDays(y: number): number {
  return dayNumber(y + 1, END.month, END.day) - dayNumber(y, START.month, START.day);
}

/** Avancée dans l'année, de 0 (rentrée) à LAST_FORM (1er juin et après), à virgule. */
export function formProgress(d: Date = new Date()): number {
  const y = startYear(d);
  const t = (dayNumber(d.getFullYear(), d.getMonth(), d.getDate()) - dayNumber(y, START.month, START.day)) / spanDays(y);
  return Math.max(0, Math.min(1, t)) * LAST_FORM;
}

/** Forme du jour (0 à 9) et part du chemin vers la suivante (0 à 1) ; à la dernière forme, `grow` vaut 1. */
export function formAt(d: Date = new Date()): { form: number; grow: number } {
  const p = formProgress(d);
  const form = Math.min(LAST_FORM, Math.floor(p + 1e-9));
  return { form, grow: form >= LAST_FORM ? 1 : Math.max(0, Math.min(1, p - form)) };
}

/** Jour où la forme apparaît, dans l'année scolaire qui contient la date `d`. */
export function unlockDate(form: number, d: Date = new Date()): Date {
  const y = startYear(d);
  const f = Math.max(0, Math.min(LAST_FORM, Math.round(form)));
  const day = dayNumber(y, START.month, START.day) + Math.ceil((f * spanDays(y)) / LAST_FORM - 1e-9);
  const t = new Date(day * DAY_MS);
  return new Date(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate(), 12);
}

/** Jours avant la forme suivante (null à la dernière forme). */
export function daysToNextForm(d: Date = new Date()): number | null {
  const { form } = formAt(d);
  if (form >= LAST_FORM) return null;
  const next = unlockDate(form + 1, d);
  const today = dayNumber(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.max(0, dayNumber(next.getFullYear(), next.getMonth(), next.getDate()) - today);
}

/** Étape du décor (0 à 6) : la grotte s'encre peu à peu, au rythme des formes. */
export const sceneStageOf = (form: number): number => Math.round((Math.max(0, Math.min(LAST_FORM, form)) * 6) / LAST_FORM);

export const formName = (form: number): string => FORM_NAMES[Math.max(0, Math.min(LAST_FORM, Math.round(form)))];

/**
 * Taille du monstre à chaque forme (1 = toute la scène) : elle ne fait que grandir, de la petite goutte au Grand Pâté.
 * Les illustrations sont toutes cadrées pareil : c'est cette échelle qui donne la vraie taille à l'écran.
 */
export const FORM_SCALE: readonly number[] = [0.34, 0.42, 0.5, 0.58, 0.65, 0.72, 0.8, 0.87, 0.94, 1];

/** Taille affichée : entre deux formes, le monstre enfle vers la suivante sans jamais l'atteindre. */
export function sizeOf(form: number, grow = 0): number {
  const f = Math.max(0, Math.min(LAST_FORM, Math.round(form)));
  if (f >= LAST_FORM) return FORM_SCALE[LAST_FORM];
  const g = Math.max(0, Math.min(1, grow));
  return FORM_SCALE[f] + (FORM_SCALE[f + 1] - FORM_SCALE[f]) * 0.6 * g;
}
