/**
 * « Le Boss de l'encre » — la grotte de fin d'année.
 *
 * Tout au long de l'année, les fautes des parties nourrissent la créature qui dort au fond de la grotte,
 * et les réussites donnent de la force à la classe. En fin d'année, la classe descend dans la grotte et
 * l'affronte : le combat est écrit d'avance, la classe gagne toujours — mais elle doit y croire.
 *
 * Tout est gardé SUR L'APPAREIL (localStorage) : aucun prénom, aucun compteur n'est envoyé au serveur.
 * Les prénoms du combat final sont saisis par la classe (ou l'enseignant) et restent sur cet appareil.
 *
 * Visible seulement pour un élève ou un enseignant connecté (sans compte, la porte n'apparaît pas).
 * Mettre CAVE_ON à false la masque pour tout le monde : la porte disparaît, la page est inaccessible
 * et plus rien n'est compté (aucune donnée n'est écrite sur l'appareil).
 */

/** Interrupteur unique de la grotte : passer à `true` pour la rendre de nouveau visible. */
export const CAVE_ON = true;

export interface BossState {
  /** année scolaire en cours, ex. « 2026-2027 » (tout repart à zéro à la rentrée) */
  year: string;
  /** fautes avalées par la créature : sa taille */
  ink: number;
  /** réponses justes de la classe : la force de ses attaques */
  power: number;
  /** parties jouées depuis la rentrée */
  games: number;
  /** date de la victoire finale (null tant que le boss n'est pas vaincu) */
  wonAt: number | null;
  /** la grotte a déjà été ouverte au moins une fois */
  seen: boolean;
}

const KEY = 'atelier.boss.v1';
const NAMES_KEY = 'atelier.boss.names.v1';

/** Une règle revue (duel gagné) retire cette quantité d'encre à la créature. */
export const CALM = 8;
/** Prénoms gardés au maximum pour le combat (une classe). */
export const MAX_NAMES = 36;

/** Année scolaire : elle commence en août (le mois 7) et porte les deux millésimes. */
export function schoolYear(d: Date = new Date()): string {
  const y = d.getFullYear();
  return d.getMonth() >= 7 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
}

const blank = (d?: Date): BossState => ({ year: schoolYear(d), ink: 0, power: 0, games: 0, wonAt: null, seen: false });

const clean = (v: unknown, d?: Date): BossState => {
  const s = v as Partial<BossState> | null;
  if (!s || typeof s !== 'object' || typeof s.year !== 'string' || s.year !== schoolYear(d)) return blank(d);
  return {
    year: s.year,
    ink: Number.isFinite(s.ink) ? Math.max(0, Number(s.ink)) : 0,
    power: Number.isFinite(s.power) ? Math.max(0, Number(s.power)) : 0,
    games: Number.isFinite(s.games) ? Math.max(0, Number(s.games)) : 0,
    wonAt: Number.isFinite(s.wonAt) ? Number(s.wonAt) : null,
    seen: s.seen === true,
  };
};

export function loadBoss(d?: Date): BossState {
  try {
    return clean(JSON.parse(localStorage.getItem(KEY) ?? 'null'), d);
  } catch {
    return blank(d);
  }
}

function save(s: BossState): BossState {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* stockage refusé : la grotte est un bonus */
  }
  return s;
}

/** Fin de partie : les fautes nourrissent la créature, les réussites renforcent la classe. */
export function feedBoss(ok: number, err: number, d?: Date): BossState {
  const s = loadBoss(d);
  if (!CAVE_ON || ok + err <= 0) return s;
  return save({ ...s, ink: s.ink + Math.max(0, err), power: s.power + Math.max(0, ok), games: s.games + 1 });
}

/** Une règle retravaillée (entraînement réussi) : on retire de l'encre à la créature. */
export function calmBoss(n: number = CALM, d?: Date): BossState {
  const s = loadBoss(d);
  if (!CAVE_ON) return s;
  return save({ ...s, ink: Math.max(0, s.ink - Math.max(0, n)) });
}

export function markSeen(d?: Date): BossState {
  const s = loadBoss(d);
  return s.seen ? s : save({ ...s, seen: true });
}

/** Victoire de fin d'année (seul le vrai combat de fin d'année la garde). */
export function winBoss(when: number = Date.now(), d?: Date): BossState {
  return save({ ...loadBoss(d), wonAt: when });
}

/** Remet la grotte à zéro (fin de l'année, ou essai de l'enseignant). */
export function resetBoss(d?: Date): BossState {
  return save(blank(d));
}

// ───────────────────────── Taille, force, étapes ─────────────────────────

/** Fautes nécessaires pour chaque taille (7 tailles, de la goutte au colosse). */
export const INK_STEPS = [0, 25, 70, 150, 300, 550, 900];
/** Réponses justes nécessaires pour chaque niveau de puissance de la classe. */
export const POWER_STEPS = [0, 60, 180, 400, 750, 1200, 1800];

export const BOSS_NAMES = ['Petite Goutte', 'Flaque', 'Gros Pâté', 'Mare d’encre', 'Monstre d’encre', 'Colosse d’encre', 'Le Grand Pâté'];

/** Niveau (0 à 6) atteint pour une valeur donnée. */
export function stepOf(value: number, steps: readonly number[]): number {
  let n = 0;
  for (let i = 0; i < steps.length; i++) if (value >= steps[i]) n = i;
  return n;
}

/** Dessin de la créature selon sa taille : une goutte, puis une tache, un gros pâté, et enfin le boss. */
export const bossKind = (level: number): number => (level <= 0 ? 2 : level <= 1 ? 0 : level <= 2 ? 4 : level <= 4 ? 7 : 6);

export const inkLevel = (s: BossState) => stepOf(s.ink, INK_STEPS);
export const powerLevel = (s: BossState) => stepOf(s.power, POWER_STEPS);
export const bossName = (s: BossState) => BOSS_NAMES[inkLevel(s)];

/** Part du palier en cours, de 0 à 1 (pour la jauge). Au dernier palier, la jauge est pleine. */
export function fillOf(value: number, steps: readonly number[]): number {
  const n = stepOf(value, steps);
  if (n >= steps.length - 1) return 1;
  const from = steps[n];
  const to = steps[n + 1];
  return Math.max(0, Math.min(1, (value - from) / (to - from)));
}

// ───────────────────────── Moments de l'année ─────────────────────────

export type BossPhase = 'early' | 'growing' | 'final' | 'won';

/**
 * Où en est l'année : la créature dort jusqu'en février, grossit visiblement de mars à mai,
 * et le grand combat s'ouvre en juin. (L'enseignant peut lancer un combat d'entraînement avant.)
 */
export function phaseOf(s: BossState, d: Date = new Date()): BossPhase {
  if (s.wonAt) return 'won';
  const m = d.getMonth();
  if (m >= 5 && m <= 7) return 'final';
  if (m >= 2 && m <= 4) return 'growing';
  return 'early';
}

/** Mois restants avant l'ouverture du grand combat (0 si c'est déjà ouvert). */
export function monthsToFinal(d: Date = new Date()): number {
  const m = d.getMonth();
  if (m >= 5 && m <= 7) return 0;
  return m > 7 ? 5 + 12 - m : 5 - m;
}

// ───────────────────────── Prénoms de la classe (appareil seulement) ─────────────────────────

export function loadNames(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(NAMES_KEY) ?? 'null');
    return Array.isArray(v) ? v.filter((n) => typeof n === 'string' && n.trim()).map((n) => n.trim().slice(0, 14)).slice(0, MAX_NAMES) : [];
  } catch {
    return [];
  }
}

export function saveNames(list: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of list) {
    const n = String(raw).trim().replace(/\s+/g, ' ').slice(0, 14);
    const k = n.toLowerCase();
    if (!n || seen.has(k)) continue;
    seen.add(k);
    out.push(n);
    if (out.length >= MAX_NAMES) break;
  }
  try {
    localStorage.setItem(NAMES_KEY, JSON.stringify(out));
  } catch {
    /* ignoré */
  }
  return out;
}

/** Ajoute un prénom s'il manque (l'élève connecté, par exemple). */
export const addName = (name: string): string[] => saveNames([...loadNames(), name]);

/** Découpe une liste collée (un prénom par ligne, ou séparés par des virgules). */
export const parseNames = (text: string): string[] => text.split(/[\n,;]+/).map((n) => n.trim()).filter(Boolean);
