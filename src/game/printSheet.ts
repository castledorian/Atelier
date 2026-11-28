/**
 * Fiche élève imprimable : ce que l'enseignant choisit d'y mettre. Le choix est gardé sur l'appareil de l'enseignant
 * (jamais envoyé nulle part) ; l'appréciation tapée n'est pas gardée : elle vaut pour l'impression en cours.
 */
import type { StudentRun } from './studentView';

export type Period = 'all' | '90' | '30';

export interface PrintOpts {
  period: Period;
  /** phrase de synthèse en tête */
  summary: boolean;
  /** repères chiffrés en tête */
  figures: boolean;
  /** un graphique d'évolution par jeu */
  charts: boolean;
  weak: boolean;
  strong: boolean;
  missed: boolean;
  weeks: boolean;
  recent: boolean;
  /** appréciation de l'enseignant et signature */
  note: boolean;
  /** jeux dont le graphique n'est pas imprimé */
  hidden: string[];
}

/**
 * Réglage conseillé : ce qu'attendent les familles et l'équipe éducative — où en est l'élève (synthèse, repères),
 * comment il progresse (graphique par jeu), ce qui est acquis et ce qui reste à travailler, dit sans jugement.
 * Le détail (exercices ratés, régularité, parties une à une) et l'appréciation restent à cocher : à chacun selon l'usage.
 */
export const DEFAULT_OPTS: PrintOpts = { period: 'all', summary: true, figures: true, charts: true, weak: true, strong: true, missed: false, weeks: false, recent: false, note: false, hidden: [] };

export const PERIODS: Array<{ id: Period; label: string; days: number | null }> = [
  { id: 'all', label: 'Tout', days: null },
  { id: '90', label: '90 jours', days: 90 },
  { id: '30', label: '30 jours', days: 30 },
];

export const periodLabel = (p: Period) => (p === 'all' ? 'Toutes les parties' : `${p} derniers jours`);

const KEY = 'atelier.print.v2';
const DAY = 86_400_000;

/** Valeurs lues du stockage, vérifiées une à une : une valeur abîmée retombe sur la valeur par défaut. */
export function sanitizeOpts(v: unknown): PrintOpts {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const bool = (k: keyof PrintOpts) => (typeof o[k] === 'boolean' ? (o[k] as boolean) : (DEFAULT_OPTS[k] as boolean));
  return {
    period: o.period === '30' || o.period === '90' || o.period === 'all' ? o.period : DEFAULT_OPTS.period,
    summary: bool('summary'),
    figures: bool('figures'),
    charts: bool('charts'),
    weak: bool('weak'),
    strong: bool('strong'),
    missed: bool('missed'),
    weeks: bool('weeks'),
    recent: bool('recent'),
    note: bool('note'),
    hidden: Array.isArray(o.hidden) ? o.hidden.filter((x): x is string => typeof x === 'string').slice(0, 12) : [],
  };
}

export function loadOpts(): PrintOpts {
  try {
    return sanitizeOpts(JSON.parse(localStorage.getItem(KEY) ?? 'null'));
  } catch {
    return DEFAULT_OPTS;
  }
}

export function saveOpts(o: PrintOpts) {
  try {
    localStorage.setItem(KEY, JSON.stringify(o));
  } catch {
    /* stockage refusé : le choix ne sera pas gardé */
  }
}

/** Parties de la période choisie. */
export function runsInPeriod(runs: readonly StudentRun[], period: Period, now: number): StudentRun[] {
  const days = PERIODS.find((p) => p.id === period)?.days ?? null;
  return days === null ? [...runs] : runs.filter((r) => r.at >= now - days * DAY);
}
