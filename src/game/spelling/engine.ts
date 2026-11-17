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
export const HP: Record<CourseDiff, number> = { apprenti: 7, standard: 6, expert: 5 };
/** Seconde chance : à zéro vie, l'élève revient une seule fois par partie avec ce nombre de vies. */
export const REVIVE_HP = 2;
/** Répétition espacée : jusqu'à RETRY_MAX phrases ratées reviennent dans la partie suivante, aux manches RETRY_SLOTS. */
export const RETRY_MAX = 6;
export const RETRY_SLOTS: readonly number[] = [2, 5, 7];
/** Après combien d'ennemis vaincus on choisit un bonus (le dernier ennemi, le 10e, est le boss). */
export const BOON_AFTER: readonly number[] = [2, 4, 6];
/** Les derniers ennemis forment le boss : trois phrases à enchaîner (le total reste de 10 phrases). */
export const BOSS_PHASES = 3;

export type BoonId = 'vie' | 'bouclier' | 'loupe' | 'gomme';
export interface Boon {
  id: BoonId;
  name: string;
  text: string;
}
export const BOONS: readonly Boon[] = [
  { id: 'vie', name: 'Goutte de vie', text: 'Tu récupères 2 vies.' },
  { id: 'bouclier', name: 'Bouclier de buvard', text: 'Il absorbe ta prochaine erreur.' },
  { id: 'gomme', name: 'Gomme', text: 'Efface une mauvaise proposition, 3 fois.' },
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
  ITEMS.filter((i) => (level === 'cm2' || i.level === 1) && wordCount(i) <= (MAX_WORDS[level] ?? 99) && (!rules || rules.includes(i.rule)));

/** Longueur maximale d'une phrase (en mots) pour les plus jeunes : on lit moins, on cherche mieux. Le CE1 et le CE2 piochent dans les phrases les plus courtes. */
export const MAX_WORDS: Partial<Record<Level, number>> = { ce1: 5, ce2: 7 };

/** Expert : on écrit soi-même la bonne orthographe (CM1 et CM2). Avant, Expert = quatre propositions et aucun indice. */
export const isTyped = (diff: CourseDiff, level: Level): boolean => diff === 'expert' && (level === 'cm1' || level === 'cm2');

/** Vies au départ : un cœur de plus au CE1 (la lecture demande déjà beaucoup d'attention) ; un de moins en Expert quand on ne tape pas la réponse (c'est ce qui le distingue du Standard). */
export const hpFor = (diff: CourseDiff, level: Level): number => HP[diff] + (level === 'ce1' ? 1 : 0) - (diff === 'expert' && !isTyped(diff, level) ? 1 : 0);

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
  const written = shuffle(item.others.filter((o) => o !== item.right && o !== item.wrong), r);
  // les phrases écrites à la main n'offrent qu'une autre proposition : on complète avec des erreurs plausibles
  const pool = written.length >= n - 1 ? written : [...written, ...shuffle(extraDistractors(item), r)];
  return shuffle([item.right, ...pool.slice(0, n - 1)], r);
}

const FAMILIES: readonly (readonly string[])[] = [
  ['a', 'à', 'as', 'ah'],
  ['et', 'est', 'es', 'ai'],
  ['on', 'ont', 'ons', 'un'],
  ['son', 'sont', 'sons', 'sonts'],
  ['ou', 'où', 'u', 'oû'],
  ['ce', 'se', 'ces', 'ses', 'ça', 'sa'],
  ['peu', 'peut', 'peux', 'peus'],
  ['la', 'là', 'las', 'l’a'],
];
const lower = (w: string) => w.toLowerCase();

/** Des erreurs plausibles pour compléter les propositions (jamais la bonne réponse, jamais le mot déjà écrit). */
export function extraDistractors(item: Item): string[] {
  const right = item.right;
  const taken = new Set([lower(right), lower(item.wrong), ...item.others.map(lower)]);
  const out: string[] = [];
  const add = (w: string) => {
    if (w.length >= 2 && !taken.has(lower(w)) && !/(.)\1\1/.test(w) && !/[sx]s$|xx$/.test(w)) {
      taken.add(lower(w));
      out.push(w);
    }
  };
  if (item.rule === 'jumeaux') {
    const fam = FAMILIES.find((f) => f.includes(lower(right)));
    if (fam) fam.forEach(add);
    return out;
  }
  if (item.rule === 'doublon') {
    // une lettre doublée en plus, ou une lettre double réduite
    for (let i = 1; i < right.length; i++) {
      if (/[bcdfgjklmnpqrstvz]/.test(right[i]) && right[i] !== right[i - 1] && right[i] !== right[i + 1]) add(right.slice(0, i) + right[i] + right.slice(i));
      if (right[i] === right[i + 1]) add(right.slice(0, i) + right.slice(i + 1));
    }
    // dernier recours : une consonne doublée ailleurs (même au début), pour toujours avoir assez de propositions
    for (let i = right.length - 1; i >= 0 && out.length < 2; i--) {
      if (/[bcdfglmnprstv]/.test(right[i]) && right[i] !== right[i + 1] && right[i] !== right[i - 1]) add(right.slice(0, i) + right[i] + right.slice(i));
    }
    // une lettre double déplacée : « ville » → « vilel » serait absurde, on ne garde que les doubles voisines d'une voyelle
    if (out.length < 2 && /[bcdfglmnprst]{2}/.test(right)) add(right.replace(/([bcdfglmnprst])\1/, '$1'));
    return out;
  }
  // accord : la même racine avec une autre terminaison
  add(right + 's');
  add(right + 'e');
  add(right + 'es');
  add(right.replace(/(es|s|x)$/, ''));
  add(right.replace(/e$/, ''));
  add(right.replace(/(ent)$/, 'e'));
  add(right.replace(/e$/, 'ent'));
  add(right.replace(/(ons|ez)$/, 'ent'));
  return out;
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
  const cands = pool.filter((i) => seen(i.rule) === lowest).sort((a, b) => difficultyOf(a) - difficultyOf(b));
  // courbe de difficulté : les phrases faciles d'abord, les plus longues et les plus fines à la fin
  const t = Math.min(1, asked / (ROUNDS - 1));
  const at = Math.round(t * (cands.length - 1) + (r() - 0.5) * 0.35 * cands.length);
  return { item: cands[Math.max(0, Math.min(cands.length - 1, at))], summoned: null };
}

/** Difficulté d'une phrase : le niveau compte plus que la longueur. */
export const difficultyOf = (i: Item) => i.level * 12 + wordCount(i);

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

/** Trois bonus différents à proposer (la Gomme n'a de sens qu'avec trois propositions : seulement en Standard). */
export function offerBoons(r: Rng = Math.random, diff: CourseDiff = 'standard'): Boon[] {
  const a = BOONS.filter((b) => b.id !== 'gomme' || diff === 'standard');
  const out: Boon[] = [];
  while (out.length < 3 && a.length) out.push(a.splice(Math.floor(r() * a.length), 1)[0]);
  return out;
}

/** Réponse tapée au clavier (Expert) : on ignore les majuscules, les espaces autour et le type d'apostrophe. */
const norm = (t: string) => t.normalize('NFC').trim().replace(/\s+/g, ' ').replace(/'/g, '’').toLowerCase();
export const isTypedRight = (item: Item, text: string) => norm(text) === norm(item.right);

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

/**
 * Un message court (une seule ligne) qui explique la nature de l'erreur quand l'élève choisit une mauvaise proposition.
 * Il ne donne pas la réponse : il oriente vers le bon réflexe.
 */
export function pickFeedback(item: Item, pick: string): string {
  const right = item.right;
  if (item.rule === 'doublon') {
    if (pick.length < right.length) return 'Il manque une lettre double.';
    if (pick.length > right.length) return 'Il y a une lettre en trop.';
    return 'Une lettre n’est pas la bonne.';
  }
  if (item.rule === 'jumeaux') return `« ${pick} » ne va pas ici.`;
  const plural = (w: string) => /(s|x|nt)$/.test(w);
  const fem = (w: string) => /e(s|nt)?$/.test(w);
  if (plural(pick) && !plural(right)) return 'Est-ce vraiment au pluriel ?';
  if (!plural(pick) && plural(right)) return 'Y en a-t-il plusieurs ?';
  if (fem(pick) !== fem(right)) return 'Pense au masculin ou au féminin.';
  return 'Regarde bien la fin du mot.';
}
