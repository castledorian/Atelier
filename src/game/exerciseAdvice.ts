import type { ItemSpreadRow, ItemStatRow } from '../server/admin';
import { TOLERANCE, diffName, gameName, levelName, picksText, targetOf } from './balanceView';
import { clusteredWilson, designEffect, readAgainstTarget, roundsNeeded } from './reliability';
import type { Interval } from './reliability';

/**
 * Conseils exercice par exercice (espace administrateur). Chaque famille de calculs, règle ou mot reçoit UNE action :
 *  - « Diminuer »   : trop difficile pour son niveau → baisser la difficulté ou la fréquence ;
 *  - « Équilibrer » : trop facile → relever un peu, ou le proposer moins souvent ;
 *  - « Améliorer »  : le contenu lui-même est en cause (réponse toujours confondue avec la même autre, exercice bien plus raté que les autres) ;
 *  - « Garder »     : bien réglé.
 * Ce sont des règles de calcul transparentes (intervalle de confiance + objectif du niveau), pas une estimation cachée :
 * chaque conseil donne le chiffre qui l'explique.
 *
 * Fiabilité : un même élève répond à beaucoup de manches. On compte donc aussi les ÉLÈVES différents (jamais de conclusion
 * avec moins de 10 élèves) et on élargit la marge d'incertitude selon la dispersion entre élèves (effet de grappe, voir reliability.ts).
 */

/** Jamais de « à diminuer / à équilibrer » avec moins d'élèves différents que ça. */
export const MIN_PLAYERS = 10;
/** Jamais de « à améliorer » pour un exercice précis vu par moins d'élèves que ça (une seule réponse répétée par un élève ne suffit pas). */
export const MIN_ITEM_PLAYERS = 5;
/** Effet de grappe supposé quand on ne peut pas le mesurer (prudent : chaque élève compte comme s'il avait répondu deux fois moins). */
export const DEFAULT_DEFF = 2;

/** Ce qu'on sait des élèves derrière une ligne. */
interface Crowd {
  /** élèves différents, ou null si on ne le sait pas (données plus anciennes que le suivi par élève) */
  players: number | null;
  /** effet de grappe utilisé (1 = chaque manche compte pleinement) */
  deff: number;
}

export type Action = 'diminuer' | 'equilibrer' | 'ameliorer' | 'garder' | 'attendre';

export const ACTION_LABEL: Record<Action, string> = {
  diminuer: 'À diminuer',
  equilibrer: 'À équilibrer',
  ameliorer: 'À améliorer',
  garder: 'Bien réglé',
  attendre: 'Trop tôt pour juger',
};

export interface ExerciseAdvice {
  game: string;
  level: string;
  difficulty: string;
  kind: 'famille' | 'exercice';
  id: string;
  label: string;
  shown: number;
  wrong: number;
  /** réussite observée, en % */
  success: number | null;
  interval: Interval | null;
  target: number | null;
  /** élèves différents (null : pas encore connu) */
  players: number | null;
  /** effet de grappe appliqué à la marge d'incertitude */
  deff: number;
  action: Action;
  /** 1 = à traiter d'abord */
  priority: 1 | 2 | 3;
  /** phrase qui explique le conseil, chiffres à l'appui */
  reason: string;
  /** ce qu'on peut faire concrètement */
  todo: string;
}

const pct = (n: number | null | undefined) => (n === null || n === undefined ? '—' : `${String(n).replace('.', ',')} %`);
/** En dessous, un exercice précis n'est pas jugé (trop peu posé). */
export const MIN_ITEM_SHOWN = 12;

const TODO: Record<'diminuer' | 'equilibrer', Record<string, string>> = {
  diminuer: {
    math: 'Laisser plus de temps, retirer les calculs les plus ratés ou les introduire plus tard dans la progression.',
    spelling: 'Simplifier les phrases les plus ratées ou proposer la règle plus tard dans la progression.',
    facteur: 'Ralentir le niveau, ou revoir les mots les plus ratés et les boîtes trop proches.',
    lexique: 'Laisser plus de temps ou proposer des mots plus fréquents.',
  },
  equilibrer: {
    math: 'Accélérer un peu ou ajouter des calculs plus exigeants.',
    spelling: 'Ajouter des phrases plus exigeantes ou ne plus proposer cette règle aussi souvent.',
    facteur: 'Relever le niveau (mots plus longs, boîtes plus proches).',
    lexique: 'Accélérer un peu ou ajouter des mots plus rares.',
  },
};

const todoFor = (kind: 'diminuer' | 'equilibrer', game: string) => TODO[kind][game] ?? TODO[kind].math;

const keyOf = (game: string, level: string, difficulty: string, kind: 'rule' | 'item', item: string) => `${game}|${level}|${difficulty}|${kind}|${item}`;

/**
 * Élèves et effet de grappe d'une ligne. Le nombre d'élèves n'est retenu que si le suivi par élève couvre au moins la moitié des manches
 * de la ligne : sinon (historique plus ancien que ce suivi), il serait sous-estimé et bloquerait à tort.
 */
function crowdFinder(spread: readonly ItemSpreadRow[] | null | undefined) {
  const map = new Map<string, ItemSpreadRow>();
  for (const r of spread ?? []) map.set(keyOf(r.game, r.level, r.difficulty, r.kind, r.item), r);
  // effet de grappe typique de chaque jeu (médiane des familles assez suivies), pour les lignes sans mesure propre
  const byGame = new Map<string, number[]>();
  for (const r of spread ?? []) {
    if (r.kind !== 'rule' || r.players < 5) continue;
    const d = designEffect(r);
    if (d !== null) byGame.set(r.game, [...(byGame.get(r.game) ?? []), d]);
  }
  const median = (l: number[]) => [...l].sort((a, b) => a - b)[Math.floor(l.length / 2)];
  return (row: ItemStatRow, kind: 'rule' | 'item'): Crowd => {
    const sp = map.get(keyOf(row.game, row.level, row.difficulty, kind, row.item));
    const own = sp && sp.players >= 5 ? designEffect(sp) : null;
    const typical = (byGame.get(row.game) ?? []).length >= 3 ? median(byGame.get(row.game) as number[]) : null;
    const covered = sp !== undefined && sp.shown >= 0.5 * row.shown;
    return { players: covered ? sp.players : null, deff: own ?? typical ?? DEFAULT_DEFF };
  };
}

/** Les familles et exercices d'un jeu, jugés un par un contre l'objectif de leur difficulté. */
export function exerciseAdvice(rules: readonly ItemStatRow[], items: readonly ItemStatRow[], spread?: readonly ItemSpreadRow[] | null): ExerciseAdvice[] {
  const out: ExerciseAdvice[] = [];
  const crowdOf = crowdFinder(spread);
  // taux d'échec de la famille d'un niveau, pour repérer un exercice bien plus raté que ses voisins
  const familyErr = new Map<string, number>();
  for (const r of rules) {
    if (r.shown >= 30) familyErr.set(`${r.game}|${r.level}|${r.difficulty}`, r.wrong / r.shown);
  }
  const base = (r: ItemStatRow, kind: 'famille' | 'exercice'): Omit<ExerciseAdvice, 'action' | 'priority' | 'reason' | 'todo'> => {
    const ok = r.shown - r.wrong;
    const crowd = crowdOf(r, kind === 'famille' ? 'rule' : 'item');
    return {
      game: r.game,
      level: r.level,
      difficulty: r.difficulty,
      kind,
      id: r.item,
      label: r.label,
      shown: r.shown,
      wrong: r.wrong,
      success: r.shown > 0 ? Math.round((1000 * ok) / r.shown) / 10 : null,
      interval: clusteredWilson(ok, r.shown, crowd.deff),
      target: targetOf(r.game, r.difficulty) ?? null,
      players: crowd.players,
      deff: crowd.deff,
    };
  };
  const where = (r: ItemStatRow) => `${gameName(r.game)} · ${levelName(r.level)} · ${diffName(r.difficulty)}`;

  for (const r of rules) {
    const b = base(r, 'famille');
    if (b.target === null || r.shown === 0) continue;
    const { reading, interval } = readAgainstTarget(r.shown - r.wrong, r.shown, b.target, TOLERANCE, b.deff);
    const range = interval ? `entre ${pct(interval.lo)} et ${pct(interval.hi)}` : '';
    const topic = `${where(r)} — ${r.label}`;
    if (b.players !== null && b.players < MIN_PLAYERS && (reading === 'hard' || reading === 'easy'))
      out.push({ ...b, action: 'attendre', priority: 3, reason: `${topic} : ${pct(b.success)} de réussite, mais seulement ${b.players} élève${b.players > 1 ? 's' : ''} : quelques élèves ne suffisent pas pour régler un jeu.`, todo: `Attendre au moins ${MIN_PLAYERS} élèves différents.` });
    else if (reading === 'few') out.push({ ...b, action: 'attendre', priority: 3, reason: `${topic} : ${r.shown} manches, pas encore assez pour conclure.`, todo: 'Attendre plus de parties.' });
    else if (reading === 'hard')
      out.push({ ...b, action: 'diminuer', priority: b.target - (interval?.hi ?? 0) > 15 ? 1 : 2, reason: `${topic} : ${pct(b.success)} de réussite (sûr à 95 % : ${range}) pour ${b.target} % visés.`, todo: todoFor('diminuer', r.game) });
    else if (reading === 'easy')
      out.push({ ...b, action: 'equilibrer', priority: 2, reason: `${topic} : ${pct(b.success)} de réussite (sûr à 95 % : ${range}) pour ${b.target} % visés.`, todo: todoFor('equilibrer', r.game) });
    else if (reading === 'unsure')
      out.push({ ...b, action: 'attendre', priority: 3, reason: `${topic} : ${pct(b.success)}, mais l'intervalle (${range}) touche la limite de l'objectif (${b.target} %). Il faudrait environ ${Math.round(roundsNeeded(b.success ?? 50, TOLERANCE) * b.deff)} manches pour trancher.`, todo: 'Ne rien changer pour l’instant.' });
    else out.push({ ...b, action: 'garder', priority: 3, reason: `${topic} : ${pct(b.success)} de réussite, dans l'objectif (${b.target} %).`, todo: 'Rien à changer.' });
  }

  for (const r of items) {
    if (r.shown < MIN_ITEM_SHOWN) continue;
    const b = base(r, 'exercice');
    if (b.players !== null && b.players < MIN_ITEM_PLAYERS) continue;
    const iv = b.interval;
    if (!iv) continue;
    const fam = familyErr.get(`${r.game}|${r.level}|${r.difficulty}`);
    const errPct = 100 - iv.p;
    const confused = Object.entries(r.picks).sort((x, y) => y[1] - x[1]);
    const picksTotal = confused.reduce((s, [, n]) => s + n, 0);
    const topShare = picksTotal >= 5 && confused.length > 0 ? confused[0][1] / picksTotal : 0;
    const wayWorse = fam !== undefined && 100 - iv.hi > 100 * fam + 20; // la meilleure estimation de réussite reste 20 points sous sa famille
    if (topShare >= 0.6 && r.wrong >= 6) {
      out.push({ ...b, action: 'ameliorer', priority: 1, reason: `« ${r.label} » : raté ${pct(errPct)} (posé ${r.shown} fois), et ${Math.round(100 * topShare)} % des erreurs sont la même réponse (${picksText(r.picks, 2)}).`, todo: 'Une seule mauvaise réponse revient : consigne ambiguë, image ou réponse attendue à vérifier.' });
    } else if (wayWorse) {
      out.push({ ...b, action: 'ameliorer', priority: 2, reason: `« ${r.label} » : raté ${pct(errPct)} (posé ${r.shown} fois), très au-dessus des autres exercices de sa famille.`, todo: 'Exercice à revoir : formulation, réponse attendue, ou niveau trop élevé pour cette classe.' });
    }
  }
  return out.sort((a, c) => a.priority - c.priority || (c.shown - a.shown));
}

/** Résumé par action, pour les pastilles de synthèse. */
export function countByAction(list: readonly ExerciseAdvice[]): Record<Action, number> {
  const n: Record<Action, number> = { diminuer: 0, equilibrer: 0, ameliorer: 0, garder: 0, attendre: 0 };
  for (const a of list) n[a.action]++;
  return n;
}

/** Texte brut à coller dans une conversation. */
export function adviceText(list: readonly ExerciseAdvice[]): string {
  const lines: string[] = ['CONSEILS EXERCICE PAR EXERCICE'];
  for (const a of list.filter((x) => x.action !== 'garder' && x.action !== 'attendre')) lines.push(`- [${ACTION_LABEL[a.action]}] ${a.reason} → ${a.todo}`);
  if (lines.length === 1) lines.push('(rien à régler pour l’instant)');
  return lines.join('\n') + '\n';
}
