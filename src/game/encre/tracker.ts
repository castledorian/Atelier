import { RULES, isRuleId } from './rules';
import type { Family, RuleId } from './rules';

/**
 * Suivi LOCAL des fautes par règle. Rien n'est envoyé : tout reste sur l'appareil de l'élève.
 * Une faute isolée ne compte pas ; la même règle ratée 3 fois en 10 parties passe « à revoir ».
 * Réussir un entraînement de 3 questions la fait « progresser » ; réussi sur 3 jours différents, elle est « acquise ».
 */

/** Nombre de parties récentes regardées pour une règle. */
export const WINDOW = 10;
/** Fautes sur cette fenêtre pour qu'une Bavure devienne une Rature. */
export const PROMOTE_FAULTS = 3;
/** Jours différents de victoire pour passer au crayon. */
export const CRAYON_DAYS = 3;
/** Le duel est gagné à partir de ce nombre de calculs réussis du premier coup (sur 3). */
export const DUEL_SIZE = 3;

export interface RuleState {
  /** fautes de la règle dans chacune des dernières parties (la plus ancienne d'abord) */
  hist: number[];
  /** total de fautes depuis le début */
  total: number;
  /** la Rature est apparue (reste vrai ensuite) */
  met: boolean;
  /** jours (AAAA-MM-JJ) où le duel a été gagné */
  wins: string[];
}

export type Store = Partial<Record<RuleId, RuleState>>;
export type RuleStatus = 'neuve' | 'isolee' | 'a-revoir' | 'progres' | 'acquise';

const KEY = 'atelier.encre.v1';

const blank = (): RuleState => ({ hist: [], total: 0, met: false, wins: [] });

export function loadStore(): Store {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (!v || typeof v !== 'object') return {};
    const out: Store = {};
    for (const [k, s] of Object.entries(v as Record<string, RuleState>)) {
      if (!isRuleId(k) || !s || typeof s !== 'object') continue;
      out[k] = {
        hist: Array.isArray(s.hist) ? s.hist.filter((n) => Number.isFinite(n) && n >= 0).slice(-WINDOW) : [],
        total: Number.isFinite(s.total) ? Math.max(0, s.total) : 0,
        met: s.met === true,
        wins: Array.isArray(s.wins) ? s.wins.filter((d) => typeof d === 'string').slice(-30) : [],
      };
    }
    return out;
  } catch {
    return {};
  }
}

export function saveStore(s: Store) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* stockage refusé : le suivi des règles est un bonus */
  }
}

export function stateOf(s: RuleState | undefined): RuleStatus {
  if (!s) return 'neuve';
  if (s.met) {
    const days = new Set(s.wins).size;
    return days >= CRAYON_DAYS ? 'acquise' : days >= 1 ? 'progres' : 'a-revoir';
  }
  return s.total > 0 ? 'isolee' : 'neuve';
}

/** Fautes de la règle sur les dernières parties. */
export const recentFaults = (s: RuleState | undefined) => (s ? s.hist.reduce((a, b) => a + b, 0) : 0);

/**
 * Enregistre une partie. `rules` : les règles que la partie pouvait rencontrer (chacune reçoit une ligne,
 * même sans faute) ; `faults` : fautes par règle. Renvoie les règles dont la Rature vient d'apparaître.
 */
export function recordGame(store: Store, rules: readonly RuleId[], faults: Partial<Record<RuleId, number>>): { store: Store; promoted: RuleId[] } {
  const next: Store = { ...store };
  const promoted: RuleId[] = [];
  for (const id of rules) {
    const prev = next[id] ?? blank();
    const n = Math.max(0, Math.floor(faults[id] ?? 0));
    const s: RuleState = { ...prev, hist: [...prev.hist, n].slice(-WINDOW), total: prev.total + n };
    if (!s.met && recentFaults(s) >= PROMOTE_FAULTS) {
      s.met = true;
      promoted.push(id);
    }
    next[id] = s;
  }
  return { store: next, promoted };
}

/** Enregistre un duel. Une victoire est comptée une fois par jour. */
export function recordDuel(store: Store, id: RuleId, won: boolean, today: string): { store: Store; before: RuleStatus; after: RuleStatus } {
  const prev = store[id] ?? blank();
  const before = stateOf(prev);
  const s: RuleState = { ...prev, wins: won && !prev.wins.includes(today) ? [...prev.wins, today] : prev.wins };
  // une victoire sur une règle jamais promue la fait apparaître : le duel n'est proposé qu'à une Rature, mais on reste sûr
  if (won) s.met = true;
  return { store: { ...store, [id]: s }, before, after: stateOf(s) };
}

export const dayKey = (t: number = Date.now()): string => {
  const d = new Date(t);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

/** Règles qui reviennent en jeu : une Rature apparue, pas encore dessinée au crayon. */
export function activeRules(store: Store, family: Family): RuleId[] {
  return RULES.filter((c) => c.family === family)
    .map((c) => c.id)
    .filter((id) => {
      const st = stateOf(store[id]);
      return st === 'a-revoir' || st === 'progres';
    });
}

// ───────────── Pression de l'Encre (présence, jamais puissance) ─────────────

/** Une Rature revient au plus une fois toutes les 6 questions (donc au plus 2 fois par page de 8). */
export const RETURN_EVERY = 6;
/** Sous ce taux de réussite sur les 10 dernières questions, plus aucune Rature ne revient. */
export const RELIEF_BELOW = 0.7;

/**
 * Faut-il poser une question d'une Rature à ce moment ? `asked` : nombre de questions déjà posées dans la partie ;
 * `last` : réussites (true) et fautes (false) récentes, la plus récente en dernier.
 */
export function shouldSummon(asked: number, last: readonly boolean[], active: readonly RuleId[]): boolean {
  if (active.length === 0) return false;
  if (asked % RETURN_EVERY !== RETURN_EVERY / 2) return false; // 3, 9, 15… : jamais la première question
  const recent = last.slice(-10);
  if (recent.length >= 5 && recent.filter(Boolean).length / recent.length < RELIEF_BELOW) return false;
  return true;
}
