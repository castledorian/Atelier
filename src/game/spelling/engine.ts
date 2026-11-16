import { ruleInfo } from '../encre/rules';
import type { RuleId } from '../encre/rules';
import { shouldSummon } from '../encre/tracker';
import type { CourseDiff, Level } from '../course/questions';
import { BANK } from './bank';

/** Moteur de « Chasse aux fautes » : choix des phrases, propositions, points. Aucune dépendance à l'interface. */

export const ROUNDS = 10;
/** Nombre de propositions de correction, selon la difficulté. */
export const CHOICES: Record<CourseDiff, number> = { apprenti: 2, standard: 3, expert: 4 };

/** Indice (la parade de la règle) : donné d'office aux Apprentis, au prix de points pour les Standard, absent pour les Experts. */
export const HINT: Record<CourseDiff, 'free' | 'cost' | 'none'> = { apprenti: 'free', standard: 'cost', expert: 'none' };

/** Vies du joueur au début d'une partie, selon la difficulté : chaque erreur en coûte une. */
export const HP: Record<CourseDiff, number> = { apprenti: 6, standard: 5, expert: 4 };
/** Après combien d'ennemis vaincus on choisit un bonus (le dernier ennemi, le 10e, est le boss). */
/** Seconde chance : à zéro vie, l'élève revient une seule fois par partie avec ce nombre de vies. */
export const REVIVE_HP = 2;
/** Répétition espacée : jusqu'à RETRY_MAX phrases ratées reviennent dans la partie suivante, aux manches RETRY_SLOTS. */
export const RETRY_MAX = 6;
export const RETRY_SLOTS: readonly number[] = [2, 5, 7];
export const BOON_AFTER: readonly number[] = [3, 6];

export type BoonId = 'vie' | 'bouclier' | 'loupe';
export interface Boon {
  id: BoonId;
  name: string;
  text: string;
}
export const BOONS: readonly Boon[] = [
  { id: 'vie', name: 'Goutte de vie', text: 'Tu récupères 2 vies.' },
  { id: 'bouclier', name: 'Bouclier de buvard', text: 'Il absorbe ta prochaine erreur.' },
  { id: 'loupe', name: 'Loupe', text: 'L’astuce s’affiche toute seule pendant 3 ennemis, sans retirer de points.' },
];

export type Rng = () => number;

export interface Item {
  id: string;
  rule: RuleId;
  level: 1 | 2;
  /** mots avant et après le mot faux */
  before: string[];
  after: string[];
  wrong: string;
  /** ponctuation collée au mot faux (« . », « ? »…) */
  suffix: string;
  right: string;
  /** autres propositions possibles (sans la bonne ni la fausse) */
  others: string[];
  tip: string;
  /** phrase correcte, pour l'afficher à la fin */
  fixed: string;
}

const TEMPLATE = /^(.*)\[([^\]]+)\](.*)$/;

export function parseEntry(rule: RuleId, level: 1 | 2, template: string, tip?: string, n = 0): Item {
  const m = TEMPLATE.exec(template);
  if (!m) throw new Error(`phrase sans mot faux : ${template}`);
  const [, pre, inside, rest] = m;
  const sm = /^([.,;:!?…»)]+)(.*)$/.exec(rest);
  const suffix = sm ? sm[1] : '';
  const post = sm ? sm[2] : rest;
  const [wrong, right, ...others] = inside.split('|');
  if (!wrong || !right) throw new Error(`mot faux ou bonne réponse manquant : ${template}`);
  const words = (s: string) => s.split(' ').filter(Boolean);
  return {
    id: `${rule}-${n}`,
    rule,
    level,
    before: words(pre),
    after: words(post),
    wrong,
    suffix,
    right,
    others,
    tip: tip ?? ruleInfo(rule).parade,
    fixed: `${pre}${right}${suffix}${post}`.replace(/\s+/g, ' ').trim(),
  };
}

export const ITEMS: readonly Item[] = BANK.map(([rule, level, template, tip], n) => parseEntry(rule, level, template, tip, n));

/** Phrases disponibles pour un niveau (le CM1 n'a que le niveau 1). */
export const itemsFor = (level: Level, rules?: readonly RuleId[]): Item[] =>
  ITEMS.filter((i) => (level === 'cm2' || i.level === 1) && (!rules || rules.includes(i.rule)));

export function shuffle<T>(list: readonly T[], r: Rng = Math.random): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Les propositions de correction : toujours la bonne, jamais le mot déjà écrit. */
export function choicesFor(item: Item, diff: CourseDiff, r: Rng = Math.random): string[] {
  const n = CHOICES[diff];
  const pool = shuffle(item.others.filter((o) => o !== item.right && o !== item.wrong), r);
  return shuffle([item.right, ...pool.slice(0, n - 1)], r);
}

/**
 * Prochaine phrase : on mélange toutes les règles ; quand une Rature est en cours, sa règle revient de temps en temps
 * (jamais plus d'une fois toutes les 6 questions, et plus du tout si l'élève peine : voir `shouldSummon`).
 */
export function nextItem(
  level: Level,
  asked: number,
  lastOk: readonly boolean[],
  active: readonly RuleId[],
  used: ReadonlySet<string>,
  r: Rng = Math.random,
  /** phrases vues dans les parties précédentes : évitées tant qu'il en reste d'autres */
  avoid: ReadonlySet<string> = new Set(),
): { item: Item; summoned: RuleId | null } {
  const all = itemsFor(level);
  const fresh = all.filter((i) => !used.has(i.id) && !avoid.has(i.id));
  const free = fresh.length >= 3 ? fresh : all.filter((i) => !used.has(i.id));
  const pool = free.length ? free : all;
  if (shouldSummon(asked, lastOk, active)) {
    const rule = active[Math.floor(r() * active.length)];
    const of = pool.filter((i) => i.rule === rule);
    if (of.length) return { item: of[Math.floor(r() * of.length)], summoned: rule };
  }
  // sinon, la règle la moins vue dans cette partie passe en premier : toutes sont travaillées
  const seen = (rule: RuleId) => [...used].filter((id) => id.startsWith(rule + '-')).length;
  const rules = [...new Set(pool.map((i) => i.rule))];
  const lowest = Math.min(...rules.map(seen));
  const cands = pool.filter((i) => seen(i.rule) === lowest);
  return { item: cands[Math.floor(r() * cands.length)], summoned: null };
}

/** Phrases d'un duel : trois phrases distinctes de la même règle. */
export function duelItems(level: Level, rule: RuleId, count: number, r: Rng = Math.random): Item[] {
  return shuffle(itemsFor(level, [rule]), r).slice(0, count);
}

/**
 * Rôle d'un ennemi, qui fixe son dessin et sa taille :
 * éclaboussure (phrase courte, petite et vive), tache (standard), pâté (phrase longue ou difficile, costaud : le vaincre sans
 * erreur redonne une vie), boss (le dernier).
 */
export type EnemyRole = 'splash' | 'tache' | 'pate' | 'boss';
export const wordCount = (i: Item) => i.before.length + 1 + i.after.length;
export function roleOf(item: Item, boss: boolean): EnemyRole {
  if (boss) return 'boss';
  const n = wordCount(item);
  if (item.level === 2 || n >= 9) return 'pate';
  return n <= 5 ? 'splash' : 'tache';
}

/** Deux bonus différents à proposer. */
export function offerBoons(r: Rng = Math.random): Boon[] {
  const a = [...BOONS];
  const out: Boon[] = [];
  while (out.length < 2) out.push(a.splice(Math.floor(r() * a.length), 1)[0]);
  return out;
}

// ───────────── Points ─────────────

export interface RoundOutcome {
  /** le mot faux a été trouvé du premier coup */
  tapFirst: boolean;
  /** essais pour la correction (1 à 3 ; 3 = la réponse a été donnée) */
  fixTries: number;
  /** l'indice a été demandé */
  hint: boolean;
}

export const isPerfect = (o: RoundOutcome) => o.tapFirst && o.fixTries === 1 && !o.hint;
/** Une faute pour la règle : une mauvaise correction au moins (l'indice et le mot touché à tort ne comptent pas). */
export const isFault = (o: RoundOutcome) => o.fixTries > 1;

/** Points d'une phrase : 5 pour le mot faux, 10 pour la correction (5 avec indice ou au 2e essai), bonus de série. */
export function pointsFor(o: RoundOutcome, streakBefore: number): number {
  const tap = o.tapFirst ? 5 : 0;
  const fix = o.fixTries === 1 ? (o.hint ? 5 : 10) : o.fixTries === 2 ? 5 : 0;
  const bonus = isPerfect(o) ? 2 * Math.min(5, streakBefore + 1) : 0;
  return tap + fix + bonus;
}

/** Une phrase ratée à reproposer à cette manche (ou null) : elle existe pour ce niveau et n'a pas déjà été jouée. */
export function pickRetry(level: Level, asked: number, used: ReadonlySet<string>, retry: readonly string[]): Item | null {
  const k = RETRY_SLOTS.indexOf(asked);
  if (k < 0) return null;
  const ok = itemsFor(level);
  const todo = retry.map((id) => ok.find((i) => i.id === id)).filter((i): i is Item => !!i && !used.has(i.id));
  return todo[0] ?? null;
}
