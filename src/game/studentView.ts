import { wilson } from './reliability';

/**
 * Fiche d'un élève (espace enseignant) : de simples calculs sur ses parties et ses compteurs d'exercices.
 * Aucune note, aucun classement : on montre où l'élève progresse et où il bute, pour l'aider.
 */

export interface StudentRun {
  at: number;
  game: string;
  mode: string;
  kind: 'game' | 'drill';
  session: boolean;
  score: number;
  wave: number;
  wpm: number;
  acc: number;
  correct: number;
  duration: number;
}

export interface StudentItem {
  game: string;
  level: string;
  k: 'rule' | 'item';
  item: string;
  label: string;
  shown: number;
  wrong: number;
  picks: Record<string, number>;
}

export interface StudentDetail {
  student: { id: string; name: string; class_id: string; class_name: string; grade: string | null };
  runs: StudentRun[];
  items: StudentItem[];
}

const DAY = 86_400_000;

export interface GameSummary {
  game: string;
  runs: number;
  best: number;
  /** réussite moyenne des parties (% ), null s'il n'y en a pas */
  acc: number | null;
  seconds: number;
  last: number;
}

/** Une ligne par jeu joué, du plus joué au moins joué. Les entraînements ne comptent pas comme des parties. */
export function gameSummaries(runs: readonly StudentRun[]): GameSummary[] {
  const m = new Map<string, { n: number; best: number; acc: number; sec: number; last: number }>();
  for (const r of runs) {
    if (r.kind !== 'game') continue;
    const c = m.get(r.game) ?? { n: 0, best: 0, acc: 0, sec: 0, last: 0 };
    c.n++;
    c.best = Math.max(c.best, r.score);
    c.acc += r.acc;
    c.sec += r.duration;
    c.last = Math.max(c.last, r.at);
    m.set(r.game, c);
  }
  return [...m.entries()].map(([game, c]) => ({ game, runs: c.n, best: c.best, acc: c.n ? Math.round((10 * c.acc) / c.n) / 10 : null, seconds: c.sec, last: c.last })).sort((a, b) => b.runs - a.runs);
}

export interface SeriesPoint {
  at: number;
  /** réussite de la partie, en % */
  acc: number;
  /** moyenne des 3 dernières parties (lisse les hauts et les bas) */
  smooth: number;
  score: number;
  mode: string;
}

/** Courbe de réussite d'un jeu, de la plus ancienne partie à la plus récente (60 dernières parties au plus). */
export function progressSeries(runs: readonly StudentRun[], game: string): SeriesPoint[] {
  const own = runs.filter((r) => r.game === game && r.kind === 'game').sort((a, b) => a.at - b.at).slice(-60);
  return own.map((r, i) => {
    const w = own.slice(Math.max(0, i - 2), i + 1);
    return { at: r.at, acc: r.acc, smooth: Math.round((10 * w.reduce((s, x) => s + x.acc, 0)) / w.length) / 10, score: r.score, mode: r.mode };
  });
}

export type Trend = { kind: 'few' } | { kind: 'up' | 'down' | 'flat'; delta: number };

/** Tendance : moyenne des 5 dernières parties contre les 5 précédentes (au moins 6 parties). Écart de 5 points ou plus = tendance. */
export function trendOf(series: readonly SeriesPoint[]): Trend {
  if (series.length < 6) return { kind: 'few' };
  const last = series.slice(-5);
  const before = series.slice(-10, -5);
  const avg = (l: readonly SeriesPoint[]) => l.reduce((s, p) => s + p.acc, 0) / l.length;
  const delta = Math.round(avg(last) - avg(before));
  return { kind: delta >= 5 ? 'up' : delta <= -5 ? 'down' : 'flat', delta };
}

export interface RuleStat {
  game: string;
  level: string;
  label: string;
  shown: number;
  wrong: number;
  /** pourcentage d'erreurs */
  err: number;
  /** pourcentage d'erreurs possible au plus bas (prudence : peu de données = estimation floue) */
  errLo: number;
  picks: Record<string, number>;
}

const toStat = (i: StudentItem): RuleStat => {
  const w = wilson(i.wrong, i.shown);
  return { game: i.game, level: i.level, label: i.label, shown: i.shown, wrong: i.wrong, err: Math.round((1000 * i.wrong) / i.shown) / 10, errLo: w ? w.lo : 0, picks: i.picks };
};

/** Cumule les compteurs d'un même exercice rencontré à plusieurs niveaux ou en plusieurs fois. */
function mergeItems(list: readonly StudentItem[]): StudentItem[] {
  const m = new Map<string, StudentItem>();
  for (const i of list) {
    const key = `${i.game}|${i.k}|${i.item}`;
    const c = m.get(key);
    if (!c) m.set(key, { ...i, picks: { ...i.picks } });
    else {
      c.shown += i.shown;
      c.wrong += i.wrong;
      for (const [p, n] of Object.entries(i.picks)) c.picks[p] = (c.picks[p] ?? 0) + n;
    }
  }
  return [...m.values()];
}

/** Au moins ce nombre de manches avant de dire d'un point qu'il est faible ou fort. */
export const MIN_SHOWN = 8;

/** Familles de calculs ou règles : celles à retravailler (au plus d'erreurs) et celles bien maîtrisées. */
export function strengthsAndWeaknesses(items: readonly StudentItem[]): { weak: RuleStat[]; strong: RuleStat[] } {
  const rules = mergeItems(items.filter((i) => i.k === 'rule' && i.shown >= MIN_SHOWN)).map(toStat);
  const weak = rules.filter((r) => r.err >= 30 && r.errLo >= 15).sort((a, b) => b.err - a.err || b.shown - a.shown).slice(0, 5);
  const strong = rules.filter((r) => r.err <= 10 && r.shown >= 15).sort((a, b) => b.shown - a.shown).slice(0, 5);
  return { weak, strong };
}

/** Exercices précis les plus ratés (un calcul, un mot, une phrase), avec ce que l'élève a répondu à la place. */
export function missedItems(items: readonly StudentItem[], max = 8): RuleStat[] {
  return mergeItems(items.filter((i) => i.k === 'item' && i.wrong >= 2))
    .map(toStat)
    .sort((a, b) => b.wrong - a.wrong || b.err - a.err)
    .slice(0, max);
}

/** Parties par semaine sur les 8 dernières semaines (de la plus ancienne à la plus récente). */
export function weeklyActivity(runs: readonly StudentRun[], now: number, weeks = 8): { start: number; runs: number }[] {
  const out = Array.from({ length: weeks }, (_, i) => ({ start: now - (weeks - i) * 7 * DAY, runs: 0 }));
  for (const r of runs) {
    if (r.kind !== 'game') continue;
    const idx = weeks - 1 - Math.floor((now - r.at) / (7 * DAY));
    if (idx >= 0 && idx < weeks) out[idx].runs++;
  }
  return out;
}

export type Flag = 'never' | 'inactive' | 'struggling' | 'rising' | 'steady';

export interface FlagInfo {
  flag: Flag;
  label: string;
}

/** Un seul repère par élève, pour repérer d'un coup d'œil qui a besoin d'attention. Jamais une note. */
export function flagOf(recent: { last_played: number | null; runs_30d: number; acc_recent: number | null; acc_prev: number | null }, now: number): FlagInfo {
  if (recent.last_played === null) return { flag: 'never', label: 'N’a pas encore joué' };
  if (now - recent.last_played > 14 * DAY) return { flag: 'inactive', label: 'N’a pas joué depuis 2 semaines' };
  if (recent.acc_recent !== null && recent.runs_30d >= 3 && recent.acc_recent < 60) return { flag: 'struggling', label: 'Réussite basse en ce moment' };
  if (recent.acc_recent !== null && recent.acc_prev !== null && recent.acc_recent - recent.acc_prev >= 8) return { flag: 'rising', label: 'En progrès' };
  return { flag: 'steady', label: 'Régulier' };
}

/** Phrase d'accompagnement générée à partir des chiffres (aucune supposition au-delà des données). */
export function summarySentence(name: string, runs: readonly StudentRun[], weak: readonly RuleStat[], strong: readonly RuleStat[], trend: Trend): string {
  const games = runs.filter((r) => r.kind === 'game').length;
  if (games === 0) return `${name} n’a pas encore joué.`;
  const parts: string[] = [];
  if (trend.kind === 'up') parts.push(`sa réussite progresse (+${trend.delta} points sur ses dernières parties)`);
  else if (trend.kind === 'down') parts.push(`sa réussite baisse (${trend.delta} points sur ses dernières parties)`);
  if (weak.length) parts.push(`à retravailler : ${weak.slice(0, 2).map((w) => w.label.toLowerCase()).join(' et ')}`);
  if (strong.length) parts.push(`bien maîtrisé : ${strong.slice(0, 2).map((w) => w.label.toLowerCase()).join(' et ')}`);
  return parts.length ? `${name} — ${parts.join(' ; ')}.` : `${name} a joué ${games} partie${games > 1 ? 's' : ''} ; pas encore assez de données pour une tendance.`;
}
