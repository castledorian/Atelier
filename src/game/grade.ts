/**
 * La classe de l'élève (CP → CM2), choisie une fois à l'accueil et gardée sur l'appareil.
 * Chaque jeu déclare les classes pour lesquelles il est pertinent : les autres ne le voient simplement pas.
 */

export type Grade = 'cp' | 'ce1' | 'ce2' | 'cm1' | 'cm2';
export type GameKey = 'typing' | 'math' | 'spelling' | 'memory' | 'lexique' | 'facteur';

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
  math: ALL,
  spelling: ['ce1', 'ce2', 'cm1', 'cm2'],
  memory: ALL,
  lexique: ['ce1', 'ce2', 'cm1', 'cm2'],
  facteur: ['cp'],
};

export const isGrade = (v: unknown): v is Grade => ALL.includes(v as Grade);
export const gradeLabel = (g: Grade) => GRADES.find((x) => x.id === g)?.label ?? g.toUpperCase();
export const isAvailable = (game: GameKey, grade: Grade | null): boolean => grade !== null && AVAILABLE[game].includes(grade);

/** Niveau de contenu (calculs, phrases) pour une classe ; sans classe choisie, on prend le CM1. */
export const levelOf = (grade: Grade | null): Grade => grade ?? 'cm1';

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

// ───────────── Niveau fixé par l'enseignant pour la classe d'un élève connecté ─────────────

const CLASS_KEY = 'atelier.grade.class.v1';

/** Niveau de la classe de cet élève, tel que l'enseignant l'a fixé (gardé pour jouer sans réseau). */
export function loadClassGrade(studentId: string | null): Grade | null {
  if (!studentId) return null;
  try {
    const v = JSON.parse(localStorage.getItem(CLASS_KEY) ?? 'null') as { id?: unknown; grade?: unknown } | null;
    return v && v.id === studentId && isGrade(v.grade) ? v.grade : null;
  } catch {
    return null;
  }
}

export function saveClassGrade(studentId: string, grade: Grade | null) {
  try {
    if (grade) localStorage.setItem(CLASS_KEY, JSON.stringify({ id: studentId, grade }));
    else localStorage.removeItem(CLASS_KEY);
  } catch {
    /* ignoré */
  }
}

// ───────────── Niveau d'entraînement choisi par l'élève (descendre pour réviser, monter pour prendre de l'avance) ─────────────

const PRACTICE_KEY = 'atelier.grade.practice.v1';

/**
 * Niveau choisi par l'élève connecté pour ses parties libres, s'il diffère de celui de sa classe.
 * Les séances de l'enseignant gardent toujours leur propre réglage : ce choix ne touche que le jeu libre.
 */
export function loadPracticeGrade(studentId: string | null): Grade | null {
  if (!studentId) return null;
  try {
    const v = JSON.parse(localStorage.getItem(PRACTICE_KEY) ?? 'null') as { id?: unknown; grade?: unknown } | null;
    return v && v.id === studentId && isGrade(v.grade) ? v.grade : null;
  } catch {
    return null;
  }
}

/** `null` = revenir au niveau de la classe. */
export function savePracticeGrade(studentId: string, grade: Grade | null) {
  try {
    if (grade) localStorage.setItem(PRACTICE_KEY, JSON.stringify({ id: studentId, grade }));
    else localStorage.removeItem(PRACTICE_KEY);
  } catch {
    /* ignoré */
  }
}

/** Écart entre le niveau joué et celui de la classe : négatif = révision, positif = avance. */
export const gradeShift = (played: Grade, home: Grade): number => ALL.indexOf(played) - ALL.indexOf(home);

/**
 * Classe à utiliser pour le jeu libre : le choix d'entraînement de l'élève, sinon celle fixée par l'enseignant (valeur par défaut),
 * sinon celle choisie sur cet appareil.
 */
export const effectiveGrade = (studentId: string | null): Grade | null => loadPracticeGrade(studentId) ?? loadClassGrade(studentId) ?? loadGrade();
