/**
 * « Mots en orbite » — règles, difficulté et fabrication des manches.
 *
 * Une manche = un mot au centre, une consigne (même sens / contraire / même famille) et plusieurs mots ennemis qui arrivent de
 * partout. Un seul est la bonne réponse ; les autres sont des pièges : le contraire quand on cherche un synonyme, le synonyme
 * quand on cherche un contraire, un mot qui RESSEMBLE sans être de la famille, ou un mot au hasard de la même nature.
 * Tout est pur (aucun accès à l'écran) : le hasard est fourni par l'appelant, pour pouvoir tester.
 */

import { CONTRAIRES, FAMILLES, SYNONYMES, morphOf, morphText, norm, plain } from './data';
import type { FamEntry, Kind, RelEntry, Tier } from './data';

export type Relation = 'synonyme' | 'contraire' | 'famille';
/** Ce que l'on joue : une relation, ou un mélange des trois. */
export type Rel = Relation | 'melange';
export type LexDiff = 'apprenti' | 'standard' | 'expert';
/** Niveau des mots : CE2 (mots de tous les jours), CM1, CM2 (mots plus rares). */
export type LexLevel = 'ce2' | 'cm1' | 'cm2';
export type Rng = () => number;

export const LEX_RELS: Array<{ id: Rel; label: string; hint: string }> = [
  { id: 'synonyme', label: 'Synonymes', hint: 'Trouve le mot qui veut dire presque la même chose.' },
  { id: 'contraire', label: 'Contraires', hint: 'Trouve le mot qui veut dire l’inverse (attention aux préfixes : in-, dé-, mal-…).' },
  { id: 'famille', label: 'Familles', hint: 'Trouve le mot construit sur la même racine : préfixes et suffixes.' },
  { id: 'melange', label: 'Mélange', hint: 'Les trois consignes, dans le désordre.' },
];
export const isRel = (v: unknown): v is Rel => v === 'synonyme' || v === 'contraire' || v === 'famille' || v === 'melange';

export const LEX_LEVELS: Array<{ id: LexLevel; label: string }> = [
  { id: 'ce2', label: 'CE2' },
  { id: 'cm1', label: 'CM1' },
  { id: 'cm2', label: 'CM2' },
];
export const isLexLevel = (v: unknown): v is LexLevel => v === 'ce2' || v === 'cm1' || v === 'cm2';
/** Niveau des mots pour une classe (CP à CE2 → CE2). */
export const lexLevelOf = (grade: string | null | undefined): LexLevel => (grade === 'cm2' ? 'cm2' : grade === 'cm1' ? 'cm1' : grade ? 'ce2' : 'cm1');

export const LEX_DIFFS: Array<{ id: LexDiff; label: string; hint: string }> = [
  { id: 'apprenti', label: 'Apprenti', hint: '5 vies, les mots arrivent lentement et ils sont moins nombreux : pour découvrir le jeu.' },
  { id: 'standard', label: 'Standard', hint: '3 vies : le rythme de référence pour la classe.' },
  { id: 'expert', label: 'Expert', hint: 'Plus de mots, qui arrivent vite : pour les lecteurs rapides.' },
];
export const isLexDiff = (v: unknown): v is LexDiff => v === 'apprenti' || v === 'standard' || v === 'expert';

export interface LexTune {
  lives: number;
  /** secondes pour qu'un mot traverse l'écran, à la première manche */
  travel: number;
  /** multiplicateur appliqué à chaque manche gagnée : la vitesse monte doucement */
  step: number;
  /** plancher du multiplicateur (jamais plus vite que travel × floor) */
  floor: number;
  /** nombre de mots à la première manche, et au plus */
  count: number;
  max: number;
}
export const LEX_TUNE: Record<LexDiff, LexTune> = {
  apprenti: { lives: 5, travel: 17, step: 0.975, floor: 0.6, count: 3, max: 4 },
  standard: { lives: 3, travel: 13, step: 0.965, floor: 0.45, count: 4, max: 5 },
  expert: { lives: 3, travel: 10, step: 0.955, floor: 0.4, count: 4, max: 6 },
};

/** Durée de traversée à la manche n (0 = la première) : elle raccourcit à chaque manche, jusqu'au plancher. */
export const travelTime = (diff: LexDiff, n: number): number => {
  const t = LEX_TUNE[diff];
  return t.travel * Math.max(t.floor, Math.pow(t.step, Math.max(0, n)));
};
/** Nombre de mots ennemis à la manche n : un de plus toutes les 8 manches. */
export const enemyCount = (diff: LexDiff, n: number): number => {
  const t = LEX_TUNE[diff];
  return Math.min(t.max, t.count + Math.floor(Math.max(0, n) / 8));
};

/** Clé d'un classement : « synonyme » = Standard, « synonyme-apprenti », « melange-expert »… */
export type LexBoard = Rel | `${Rel}-apprenti` | `${Rel}-expert`;
export const lexBoard = (rel: Rel, diff: LexDiff): LexBoard => (diff === 'standard' ? rel : `${rel}-${diff}`);

// ───────────────────────── Les manches ─────────────────────────

export type Role = 'answer' | 'trap' | 'faux' | 'other';

export interface LexWord {
  /** le mot, en toutes lettres et avec ses accents */
  text: string;
  /** ce qu'il faut taper (sans accent) */
  key: string;
  role: Role;
  /** découpage « en- terr -er » si on en connaît un */
  morph: string | null;
}

export interface Round {
  rel: Relation;
  center: string;
  /** « MÊME SENS QUE » */
  prompt: string;
  /** les mots ennemis, dans le désordre ; la bonne réponse est celui dont le rôle est « answer » */
  words: LexWord[];
  answer: LexWord;
  /** phrase de bilan après une bonne réponse */
  win: string;
}

export const PROMPT: Record<Relation, string> = { synonyme: 'MÊME SENS QUE', contraire: 'LE CONTRAIRE DE', famille: 'MÊME FAMILLE QUE' };
const SHORT: Record<Relation, string> = { synonyme: 'même sens que', contraire: 'le contraire de', famille: 'de la famille de' };

const tierMax = (l: LexLevel): Tier => (l === 'cm2' ? 3 : l === 'cm1' ? 2 : 1);
const MAX_LEN = 12;

interface Info {
  text: string;
  key: string;
  k: Kind;
  t: Tier;
  morph: string | null;
}

const wordOf = (raw: string, role: Role): LexWord => ({ text: plain(raw), key: norm(raw), role, morph: morphOf(raw) ? raw : null });

// ───────────── Index (construits une fois) ─────────────

interface Index {
  /** mot (clé) → tout ce qu'on en sait, pour les rondes synonymes/contraires */
  words: Map<string, Info>;
  /** mots reliés (synonymes ou contraires, dans les deux sens) */
  graph: Map<string, Set<string>>;
  syn: Map<string, Set<string>>;
  ant: Map<string, Set<string>>;
  /** familles : mot → racines des familles où il apparaît */
  famWords: Map<string, Info>;
  famOf: Map<string, Set<string>>;
}
let INDEX: Index | null = null;

function link(g: Map<string, Set<string>>, a: string, b: string) {
  if (a === b) return;
  if (!g.has(a)) g.set(a, new Set());
  if (!g.has(b)) g.set(b, new Set());
  g.get(a)!.add(b);
  g.get(b)!.add(a);
}

function index(): Index {
  if (INDEX) return INDEX;
  const words = new Map<string, Info>();
  const graph = new Map<string, Set<string>>();
  const syn = new Map<string, Set<string>>();
  const ant = new Map<string, Set<string>>();
  const put = (m: Map<string, Info>, raw: string, k: Kind, t: Tier) => {
    const key = norm(raw);
    const cur = m.get(key);
    if (!cur || t < cur.t) m.set(key, { text: plain(raw), key, k, t, morph: morphOf(raw) ? raw : null });
  };
  const feed = (list: RelEntry[], rel: Map<string, Set<string>>) => {
    for (const e of list) {
      const c = norm(e.w);
      put(words, e.w, e.k, e.t);
      for (const a of e.r) {
        put(words, a, e.k, e.t);
        link(rel, c, norm(a));
        link(graph, c, norm(a));
      }
      // les réponses d'une même entrée se ressemblent entre elles
      for (let i = 0; i < e.r.length; i++) for (let j = i + 1; j < e.r.length; j++) link(graph, norm(e.r[i]), norm(e.r[j]));
    }
  };
  feed(SYNONYMES, syn);
  feed(CONTRAIRES, ant);
  const famWords = new Map<string, Info>();
  const famOf = new Map<string, Set<string>>();
  for (const f of FAMILLES) {
    const root = norm(f.w);
    put(famWords, f.w, 'o', f.t);
    for (const m of f.r) {
      put(famWords, m, 'o', f.t);
      const key = norm(m);
      if (!famOf.has(key)) famOf.set(key, new Set());
      famOf.get(key)!.add(root);
    }
    if (!famOf.has(root)) famOf.set(root, new Set());
    famOf.get(root)!.add(root);
  }
  INDEX = { words, graph, syn, ant, famWords, famOf };
  return INDEX;
}

/** Les mots à moins de `depth` pas du mot (synonymes, contraires, synonymes de leurs synonymes…) : jamais proposés comme pièges. */
function nearby(key: string, depth: number): Set<string> {
  const { graph } = index();
  const seen = new Set<string>([key]);
  let front = [key];
  for (let d = 0; d < depth; d++) {
    const next: string[] = [];
    for (const k of front) {
      for (const n of graph.get(k) ?? []) {
        if (!seen.has(n)) {
          seen.add(n);
          next.push(n);
        }
      }
    }
    front = next;
  }
  return seen;
}

/** Tous les mots de toutes les familles où figure ce mot. */
function familyMates(key: string): Set<string> {
  const { famOf } = index();
  const roots = famOf.get(key) ?? new Set<string>();
  const out = new Set<string>([key]);
  for (const f of FAMILLES) {
    if (!roots.has(norm(f.w))) continue;
    out.add(norm(f.w));
    for (const m of f.r) out.add(norm(m));
  }
  return out;
}

// ───────────── Aides ─────────────

const shuffle = <T>(a: T[], rng: Rng): T[] => {
  const b = a.slice();
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
};
const pick = <T>(a: T[], rng: Rng): T => a[Math.floor(rng() * a.length)];

/** Mots ennemis d'une manche : des premières lettres toutes différentes (la première touche suffit à choisir), pas trop longs. */
function fits(w: { key: string }, taken: Set<string>, centerKey: string): boolean {
  return w.key.length >= 2 && w.key.length <= MAX_LEN && w.key !== centerKey && !taken.has(w.key[0]);
}

export type RoundKey = string;
export const roundKey = (rel: Relation, center: string): RoundKey => `${rel}:${norm(center)}`;

/** Les manches possibles pour une relation et un niveau. */
export function candidates(rel: Relation, level: LexLevel): Array<RelEntry | FamEntry> {
  const max = tierMax(level);
  const list: Array<RelEntry | FamEntry> = rel === 'synonyme' ? SYNONYMES : rel === 'contraire' ? CONTRAIRES : FAMILLES;
  return list.filter((e) => e.t <= max);
}

/**
 * Fabrique une manche. `used` garde les manches déjà jouées pour ne pas les répéter (il est vidé quand tout a été vu).
 * `count` = nombre de mots ennemis (la bonne réponse comprise).
 */
export function buildRound(rel: Rel, level: LexLevel, count: number, rng: Rng, used: Set<RoundKey>): Round {
  const kind: Relation = rel === 'melange' ? pick(['synonyme', 'contraire', 'famille'] as Relation[], rng) : rel;
  const pool = candidates(kind, level);
  let fresh = pool.filter((e) => !used.has(roundKey(kind, e.w)));
  if (fresh.length === 0) {
    for (const e of pool) used.delete(roundKey(kind, e.w));
    fresh = pool;
  }
  const entry = pick(fresh, rng);
  used.add(roundKey(kind, entry.w));
  return kind === 'famille' ? familyRound(entry as FamEntry, level, count, rng) : relRound(kind, entry as RelEntry, level, count, rng);
}

function finish(kind: Relation, center: string, answer: LexWord, others: LexWord[], rng: Rng): Round {
  const words = shuffle([answer, ...others], rng);
  const m = answer.morph ? ` (${morphText(answer.morph)})` : '';
  const win = kind === 'famille' ? `« ${answer.text} »${m} est de la famille de « ${center} ».` : `« ${answer.text} »${m} : ${SHORT[kind]} « ${center} ».`;
  return { rel: kind, center, prompt: PROMPT[kind], words, answer, win };
}

/** Choisit la bonne réponse parmi `answers`, de préférence avec une autre initiale que les mots déjà retenus (une seule frappe doit suffire à choisir). */
function pickAnswer(answers: string[], avoid: Set<string>, rng: Rng): string | null {
  const ok = answers.filter((a) => {
    const k = norm(a);
    return k.length >= 2 && k.length <= MAX_LEN && !avoid.has(k[0]);
  });
  return ok.length ? pick(ok, rng) : null;
}

function relRound(kind: Relation, e: RelEntry, level: LexLevel, count: number, rng: Rng): Round {
  const { words, syn, ant } = index();
  const c = norm(e.w);
  const max = tierMax(level);
  const near = nearby(c, 3);
  const accepted = new Set(e.r.map(norm));
  const out: LexWord[] = [];
  const taken = new Set<string>();

  // le piège : le contraire quand on cherche un synonyme, et inversement (un mot sur deux, à partir du CM1)
  const opposite = (kind === 'synonyme' ? ant : syn).get(c);
  let trap: Info | undefined;
  if (opposite && opposite.size > 0 && (level !== 'ce2' || rng() < 0.5) && rng() < 0.75) {
    for (const k of shuffle([...opposite], rng)) {
      const info = words.get(k);
      if (info && !accepted.has(k) && fits(info, new Set(), c) && pickAnswer(e.r, new Set([info.key[0]]), rng)) {
        trap = info;
        break;
      }
    }
  }
  // la bonne réponse (avec une autre initiale que le piège), sinon n'importe laquelle
  const raw = (trap ? pickAnswer(e.r, new Set([trap.key[0]]), rng) : null) ?? pickAnswer(e.r, new Set(), rng) ?? pick(e.r, rng);
  const answer = wordOf(raw, 'answer');
  taken.add(answer.key[0]);
  if (trap && !taken.has(trap.key[0])) {
    out.push({ text: trap.text, key: trap.key, role: 'trap', morph: trap.morph });
    taken.add(trap.key[0]);
  }

  // les autres : au hasard, de la même nature de préférence, hors du voisinage du mot du centre
  const all = [...words.values()].filter((w) => w.t <= max && !near.has(w.key) && !accepted.has(w.key));
  const same = shuffle(all.filter((w) => w.k === e.k), rng);
  const rest = shuffle(all.filter((w) => w.k !== e.k), rng);
  for (const w of [...same, ...rest]) {
    if (out.length >= count - 1) break;
    if (!fits(w, taken, c)) continue;
    out.push({ text: w.text, key: w.key, role: 'other', morph: w.morph });
    taken.add(w.key[0]);
  }
  return finish(kind, e.w, answer, out, rng);
}

function familyRound(e: FamEntry, level: LexLevel, count: number, rng: Rng): Round {
  const { famWords } = index();
  const c = norm(e.w);
  const max = tierMax(level);
  const mates = familyMates(c);
  const out: LexWord[] = [];
  const taken = new Set<string>();

  // le piège : un mot qui ressemble sans être de la famille (souvent avec la même initiale : la bonne réponse en prend alors une autre)
  let faux: string | undefined;
  for (const f of shuffle(e.faux ?? [], rng)) {
    const k = norm(f);
    if (k.length >= 2 && k.length <= MAX_LEN && !mates.has(k) && pickAnswer(e.r, new Set([k[0]]), rng)) {
      faux = f;
      break;
    }
  }
  const raw = (faux ? pickAnswer(e.r, new Set([norm(faux)[0]]), rng) : null) ?? pickAnswer(e.r, new Set(), rng) ?? pick(e.r, rng);
  const answer = wordOf(raw, 'answer');
  taken.add(answer.key[0]);
  if (faux && !taken.has(norm(faux)[0])) {
    out.push({ text: plain(faux), key: norm(faux), role: 'faux', morph: null });
    taken.add(norm(faux)[0]);
  }
  const all = shuffle(
    [...famWords.values()].filter((w) => w.t <= max && !mates.has(w.key)),
    rng,
  );
  for (const w of all) {
    if (out.length >= count - 1) break;
    if (!fits(w, taken, c)) continue;
    out.push({ text: w.text, key: w.key, role: 'other', morph: null });
    taken.add(w.key[0]);
  }
  return finish('famille', e.w, answer, out, rng);
}

/** Phrase de bilan quand l'élève tape un mauvais mot (ou laisse passer la bonne réponse). */
export function lossNote(round: Round, wrong: LexWord | null): string {
  const a = round.answer;
  const ans = `La bonne réponse était « ${a.text} »${a.morph ? ` (${morphText(a.morph)})` : ''}.`;
  if (!wrong) return `Trop lent… ${ans}`;
  const c = round.center;
  if (round.rel === 'synonyme') {
    return wrong.role === 'trap' ? `« ${wrong.text} » veut dire le contraire de « ${c} ». ${ans}` : `« ${wrong.text} » n’a pas le même sens que « ${c} ». ${ans}`;
  }
  if (round.rel === 'contraire') {
    return wrong.role === 'trap' ? `« ${wrong.text} » veut dire presque la même chose que « ${c} », pas son contraire. ${ans}` : `« ${wrong.text} » n’est pas le contraire de « ${c} ». ${ans}`;
  }
  return wrong.role === 'faux'
    ? `« ${wrong.text} » ressemble à « ${c} », mais n’est pas de sa famille. ${ans}`
    : `« ${wrong.text} » n’est pas de la famille de « ${c} ». ${ans}`;
}
