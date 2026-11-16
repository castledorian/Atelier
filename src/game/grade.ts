import type { Level } from './course/questions';

/**
 * La classe de l'élève (CP → CM2), choisie une fois à l'accueil et gardée sur l'appareil.
 * Chaque jeu déclare les classes pour lesquelles il est pertinent : les autres ne le voient simplement pas.
 */

export type Grade = 'cp' | 'ce1' | 'ce2' | 'cm1' | 'cm2';
export type GameKey = 'typing' | 'math' | 'spelling' | 'memory';

export const GRADES: Array<{ id: Grade; label: string; cycle: string }> = [
  { id: 'cp', label: 'CP', cycle: 'cycle 2' },
  { id: 'ce1', label: 'CE1', cycle: 'cycle 2' },
  { id: 'ce2', label: 'CE2', cycle: 'cycle 2' },
  { id: 'cm1', label: 'CM1', cycle: 'cycle 3' },
  { id: 'cm2', label: 'CM2', cycle: 'cycle 3' },
];

const ALL: Grade[] = ['cp', 'ce1', 'ce2', 'cm1', 'cm2'];

/** Classes pour lesquelles chaque jeu existe. À élargir au fur et à mesure que le contenu est écrit. */
export const AVAILABLE: Record<GameKey, Grade[]> = {
  typing: ['ce1', 'ce2', 'cm1', 'cm2'],
  math: ['cm1', 'cm2'],
  spelling: ['cm1', 'cm2'],
  memory: ALL,
};

export const isGrade = (v: unknown): v is Grade => ALL.includes(v as Grade);
export const gradeLabel = (g: Grade) => GRADES.find((x) => x.id === g)?.label ?? g.toUpperCase();
export const isAvailable = (game: GameKey, grade: Grade | null): boolean => grade !== null && AVAILABLE[game].includes(grade);

/** Niveau de contenu (calculs, phrases) pour une classe. Seuls CM1 et CM2 existent pour l'instant. */
export const levelOf = (grade: Grade | null): Level => (grade === 'cm2' ? 'cm2' : 'cm1');

const KEY = 'atelier.grade.v1';

export function loadGrade(): Grade | null {
  try {
    const v = localStorage.getItem(KEY);
    return isGrade(v) ? v : null;
  } catch {
    return null;
  }
}

export function saveGrade(g: Grade) {
  try {
    localStorage.setItem(KEY, g);
  } catch {
    /* stockage refusé : la classe sera redemandée */
  }
}
