import { ruleInfo } from '../encre/rules';
import type { RuleId } from '../encre/rules';
import { shouldSummon } from '../encre/tracker';
import type { CourseDiff, Level } from '../course/questions';
import { BANK } from './bank';
import type { SpellGrade } from './bank';

/** Moteur de « Chasse aux fautes » : choix des phrases, propositions, points. Aucune dépendance à l'interface.
 * Pas de bonus ni de seconde chance : chaque erreur coûte une vie, la partie compte 10 phrases. */

export const ROUNDS = 10;
/** Nombre de propositions de correction, selon la difficulté. */
export const CHOICES: Record<CourseDiff, number> = { apprenti: 2, standard: 3, expert: 4 };

/** Indice (la parade de la règle) : donné d'office aux Apprentis, au prix de points pour les Standard, absent pour les Experts. */
export const HINT: Record<CourseDiff, 'free' | 'cost' | 'none'> = { apprenti: 'free', standard: 'cost', expert: 'none' };

/** Vies du joueur au début d'une partie, selon la difficulté : chaque erreur en coûte une. */
export const HP: Record<CourseDiff, number> = { apprenti: 7, standard: 6, expert: 5 };
/** Répétition espacée : jusqu'à RETRY_MAX phrases ratées reviennent dans la partie suivante, aux manches RETRY_SLOTS. */
export const RETRY_MAX = 6;
export const RETRY_SLOTS: readonly number[] = [2, 5, 7];
/** Le dernier ennemi de la partie est le « boss » : plus grand, il écrit la dernière phrase. */
export const BOSS_AT = ROUNDS - 1;

export type Rng = () => number;

export interface Item {
  id: string;
  rule: RuleId;
  /** classe à partir de laquelle la phrase est proposée (programmes 2024-2025) */
  grade: SpellGrade;
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

/** Empreinte courte et stable d'une phrase : l'identifiant ne dépend pas de sa place dans la banque. */
function hashOf(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(36);
}

export function parseEntry(rule: RuleId, grade: SpellGrade, template: string, tip?: string): Item {
  const m = TEMPLATE.exec(template);
  if (!m) throw new Error(`phrase sans mot faux : ${template}`);
  const [, pre, inside, rest] = m;
  const sm = /^([.,;:!?…»)]+)(.*)$/.exec(rest);
  const suffix = sm ? sm[1] : '';
  const post = sm ? sm[2] : rest;
  const [wrong, right, ...others] = inside.split('|');
  if (!wrong || !right) throw new Error(`mot faux ou bonne réponse manquant : ${template}`);
  const words = (s: string) => s.split(' ').filter(Boolean);
  const fixed = `${pre}${right}${suffix}${post}`.replace(/\s+/g, ' ').trim();
  return {
    id: `${rule}-${hashOf(fixed)}`,
    rule,
    grade,
    before: words(pre),
    after: words(post),
    wrong,
    suffix,
    right,
    others,
    tip: tip ?? ruleInfo(rule).parade,
    fixed,
  };
}

export const ITEMS: readonly Item[] = BANK.map(([rule, grade, template, tip]) => parseEntry(rule, grade, template, tip));

/** Rang d'une classe (le CP, sans jeu d'orthographe, prend les phrases du CE1). */
export const GRADE_RANK: Record<Level, number> = { cp: 0, ce1: 0, ce2: 1, cm1: 2, cm2: 3 };

/**
 * Phrases d'une classe : celles de la classe, plus celles de la classe précédente en révision (reprise espacée des
 * notions de l'année d'avant). Une même notion revient d'une classe à l'autre dans des phrases plus complexes.
 */
export const itemsFor = (level: Level, rules?: readonly RuleId[]): Item[] => {
  const k = GRADE_RANK[level];
  return ITEMS.filter((i) => {
    const g = GRADE_RANK[i.grade];
    return g <= k && g >= k - 1 && (!rules || rules.includes(i.rule));
  });
};

/** Règles travaillées dans une classe (les finales en [é] commencent au CE2). */
export const rulesFor = (level: Level): RuleId[] => [...new Set(itemsFor(level).map((i) => i.rule))];

/**
 * Poids de chaque règle dans une partie : l'orthographe grammaticale concentre l'essentiel des erreurs en fin d'école
 * (DEPP, 2022), alors que voir des mots mal écrits peut brouiller la mémoire de leur orthographe (Brown, 1988) :
 * les lettres doubles sont un peu moins fréquentes que les accords et les homophones.
 */
/** Nombre de premières phrases où la classe précédente peut revenir, en révision. */
export const REVIEW_ROUNDS = 3;

export const RULE_WEIGHT: Partial<Record<RuleId, number>> = { doublon: 0.7, jumeaux: 1, accordeur: 1.2, terminaisons: 1 };

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
  // on complète avec des erreurs plausibles, les plus vraisemblables d'abord
  const pool = written.length >= n - 1 ? written : [...written, ...extraDistractors(item)];
  return shuffle([item.right, ...pool.slice(0, n - 1)], r);
}

const FAMILIES: readonly (readonly string[])[] = [
  ['leur', 'leurs', 'l’heure', 'leure'],
  ['c’est', 's’est', 'ces', 'ses', 'sais'],
  ['quel', 'quelle', 'qu’elle', 'quels'],
  ['n’ont', 'n’on', 'non', 'nom'],
  ['a', 'à', 'as'],
  ['et', 'est', 'es', 'ai'],
  ['on', 'ont', 'ons', 'un'],
  ['son', 'sont', 'sons', 'ont'],
  ['ou', 'où', 'u', 'oû'],
  ['ce', 'se', 'ces', 'ses', 'ça', 'sa'],
  ['peu', 'peut', 'peux', 'peus'],
  ['la', 'là', 'las', 'l’a'],
];
const lower = (w: string) => w.toLowerCase();

const VOWELS = 'aeiouyéèêàâîôûœ';
const isVowel = (c: string | undefined) => !!c && VOWELS.includes(c);

/**
 * Des erreurs plausibles pour compléter les propositions (jamais la bonne réponse, jamais le mot déjà écrit), de la plus
 * vraisemblable à la moins vraisemblable. Seules des fautes que font réellement les élèves sont fabriquées : lettre
 * double simplifiée ou ajoutée entre deux voyelles, « è » à la place d'une double (« bèle »), autre fin de verbe qui se
 * prononce pareil, marque de nombre ou de genre oubliée ou ajoutée. Pas de lettre triplée, pas de double en début ou en
 * fin de mot : s'il n'y a pas d'erreur vraisemblable, il y a simplement une proposition de moins.
 */
export function extraDistractors(item: Item): string[] {
  const right = item.right;
  const taken = new Set([lower(right), lower(item.wrong), ...item.others.map(lower)]);
  const out: string[] = [];
  const add = (w: string) => {
    const ok =
      w.length >= 2 &&
      !taken.has(lower(w)) &&
      !/(.)\1\1/.test(w) &&
      !/^(.)\1/.test(w.replace(/^[a-z]’/i, '')) &&
      !/([bcdfghjklmnpqrstvwxz])\1$/.test(w) &&
      !/[sx]s$|xx$|eé|éé|ee$/.test(w);
    if (ok) {
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
    const doubles = [...right.matchAll(/([bcdfglmnprst])\1/g)].map((m) => m.index as number);
    // toutes les lettres doubles simplifiées, puis une seule à la fois
    if (doubles.length) add(right.replace(/([bcdfglmnprst])\1/g, '$1'));
    for (const k of doubles) add(right.slice(0, k) + right.slice(k + 1));
    // « è » à la place d'un e suivi d'une double (« belle » → « bèle »)
    for (const k of doubles) if (right[k - 1] === 'e') add(right.slice(0, k - 1) + 'è' + right.slice(k + 1));
    // mot sans lettre double : une consonne souvent doublée (l, m, n, p, r, s, t), entre deux voyelles, doublée à tort
    if (!doubles.length)
      for (let k = 1; k < right.length - 1; k++)
        if (/[lmnprst]/.test(right[k]) && isVowel(right[k - 1]) && isVowel(right[k + 1])) add(right.slice(0, k) + right[k] + right.slice(k));
    return out;
  }
  if (item.rule === 'terminaisons') {
    const imp = /^(.*?)(aient|ais|ait)$/.exec(right);
    if (imp) {
      const base = imp[1];
      for (const end of ['ais', 'ait', 'aient']) add(base + end);
      const inf = base.replace(/ge$/, 'g').replace(/ç$/, 'c');
      for (const end of ['é', 'er']) add(inf + end);
      return out;
    }
    const base = right.replace(/(ées|és|ée|é|er|ez)$/, '');
    for (const end of ['é', 'er', 'ez']) add(base + end);
    add(base + (base.endsWith('g') ? 'e' : '') + 'ait');
    return out;
  }
  // accords : seules les variations sûres sont fabriquées (fin de verbe, participe passé) ; pour un nom ou un adjectif,
  // les propositions sont écrites à la main dans la banque.
  if (/ent$/.test(right) && right.length > 4 && [item.wrong, ...item.others].some((w) => w.startsWith(right.slice(0, -3)))) {
    const stem = right.slice(0, -3);
    for (const end of ['e', 'es', 'ez']) add(stem + end);
    return out;
  }
  const pp = /^(.*)(ées|és|ée|é)$/.exec(right);
  if (pp) for (const end of ['é', 'ée', 'és', 'ées']) add(pp[1] + end);
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
  let pool = free.length ? free : all;
  // les premières phrases peuvent reprendre la classe précédente (échauffement et révision) ; ensuite, la classe de l'élève
  if (asked >= REVIEW_ROUNDS) {
    const own = pool.filter((i) => GRADE_RANK[i.grade] === GRADE_RANK[level]);
    if (own.length >= 3) pool = own;
  }
  if (shouldSummon(asked, lastOk, active)) {
    const rule = active[Math.floor(r() * active.length)];
    const of = pool.filter((i) => i.rule === rule);
    if (of.length) return { item: of[Math.floor(r() * of.length)], summoned: rule };
  }
  // sinon, la règle la moins vue dans cette partie passe en premier : toutes sont travaillées
  // (pondérée : les accords et les homophones reviennent un peu plus souvent que les lettres doubles)
  const seen = (rule: RuleId) => [...used].filter((id) => id.startsWith(rule + '-')).length / (RULE_WEIGHT[rule] ?? 1);
  const rules = [...new Set(pool.map((i) => i.rule))];
  const lowest = Math.min(...rules.map(seen));
  const cands = pool.filter((i) => seen(i.rule) === lowest).sort((a, b) => difficultyOf(a) - difficultyOf(b));
  // courbe de difficulté : les phrases faciles d'abord, les plus longues et les plus fines à la fin
  const t = Math.min(1, asked / (ROUNDS - 1));
  const at = Math.round(t * (cands.length - 1) + (r() - 0.5) * 0.35 * cands.length);
  return { item: cands[Math.max(0, Math.min(cands.length - 1, at))], summoned: null };
}

/** Difficulté d'une phrase : la classe compte plus que la longueur (les phrases de révision passent en premier). */
export const difficultyOf = (i: Item) => GRADE_RANK[i.grade] * 12 + wordCount(i);

/** Phrases d'un duel : trois phrases distinctes de la même règle. */
export function duelItems(level: Level, rule: RuleId, count: number, r: Rng = Math.random): Item[] {
  return shuffle(itemsFor(level, [rule]), r).slice(0, count);
}

/**
 * Rôle d'un ennemi, qui fixe son dessin et sa taille : éclaboussure (phrase courte), tache (standard), pâté (phrase longue
 * ou difficile), boss (le dernier).
 */
export type EnemyRole = 'splash' | 'tache' | 'pate' | 'boss';
export const wordCount = (i: Item) => i.before.length + 1 + i.after.length;
export function roleOf(item: Item, boss: boolean): EnemyRole {
  if (boss) return 'boss';
  const n = wordCount(item);
  if (n >= 9 || (n >= 7 && GRADE_RANK[item.grade] >= 3)) return 'pate';
  return n <= 5 ? 'splash' : 'tache';
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
    if (pick.length < right.length) return 'Il manque une consonne double.';
    if (pick.length > right.length) return 'Il y a une consonne en trop.';
    return 'Pense à un mot de la même famille.';
  }
  if (item.rule === 'jumeaux') return `« ${pick} » ne va pas ici.`;
  if (item.rule === 'terminaisons') {
    if (/(ais|ait|aient)$/.test(right)) return 'Qui fait l’action ? Vois la fin.';
    if (/ez$/.test(right)) return 'Avec « vous », quelle fin ?';
    return 'Essaie « vendre » ou « vendu ».';
  }
  const plural = (w: string) => /(s|x|nt)$/.test(w);
  const fem = (w: string) => /e(s|nt)?$/.test(w);
  if (plural(pick) && !plural(right)) return 'Vraiment plusieurs ? Vérifie.';
  if (!plural(pick) && plural(right)) return 'Y en a-t-il plusieurs ?';
  if (fem(pick) !== fem(right)) return 'Pense au masculin ou au féminin.';
  return 'Regarde bien la fin du mot.';
}
