/**
 * Suivi anonyme des exercices : pour régler la difficulté, le site compte quels calculs et quelles phrases
 * font échouer le plus souvent. Aucun nom, aucune classe : seulement « posé N fois, raté E fois, mauvaises réponses ».
 * Seules les parties libres sont comptées (ni séance de classe, ni entraînement, ni réglages personnalisés).
 */

/** À changer quand les exercices d'un jeu sont refaits : les anciens compteurs restent séparés des nouveaux. */
export const ITEM_STATS_VERSION = 1;

export interface ItemOutcome {
  /** famille de calcul ou règle d'orthographe */
  rule: string;
  ruleLabel: string;
  /** exercice précis (un calcul, une phrase), ou null s'il n'a pas de sens de le suivre */
  item: string | null;
  itemLabel: string;
  /** réussi du premier coup */
  ok: boolean;
  /** mauvaises réponses choisies (jamais du texte tapé librement) */
  picks: string[];
}

export interface ItemEntry {
  k: 'rule' | 'item';
  i: string;
  l: string;
  n: number;
  e: number;
  p?: Record<string, number>;
}

// ───────────── Familles de calculs (Course à l'encre) ─────────────

export const MATH_FAMILIES: Record<string, string> = {
  tables: 'Tables de multiplication',
  'tables-envers': 'Tables à l’envers (÷ et facteur manquant)',
  decalage: '× et ÷ par 10, 100, 1 000',
  'decalage-dec': 'Décimaux × et ÷ par 10, 100, 1 000',
  dizaines: 'Multiplier des dizaines et des centaines',
  mul: 'Multiplications d’un grand nombre',
  div: 'Divisions et quotients',
  add: 'Additions',
  sub: 'Soustractions',
  comp: 'Compléments (… + ? = …)',
  double: 'Doubles et moitiés',
  frac: 'Fractions',
  'dec-add': 'Additions et soustractions de décimaux',
  'dec-autre': 'Autres calculs avec décimaux',
  autre: 'Autres calculs',
};

const clean = (s: string) => s.replace(/[\s\u00a0\u202f]/g, '').replace(/−/g, '-');

/** Famille d'un calcul, d'après son écriture (« 7 × 8 = ? », « 3/4 = ?/8 », « Double de 16 = ? »…). */
export function familyOfCalc(text: string): string {
  const raw = text.trim();
  if (/^(double|moiti)/i.test(raw)) return 'double';
  if (/^quotient/i.test(raw)) return 'div';
  const t = clean(raw);
  if (t.includes('/')) return 'frac';
  const comma = t.includes(',');
  if (comma) {
    if (/(×|÷)(10|100|1000)=\?$/.test(t)) return 'decalage-dec';
    if (/[+-]/.test(t.replace(/^-/, ''))) return 'dec-add';
    return 'dec-autre';
  }
  if (/(×|÷)(10|100|1000)=\?$/.test(t)) return 'decalage';
  const mulMissing = /^(\d+)×\?=(\d+)$/.exec(t) ?? /^\?×(\d+)=(\d+)$/.exec(t);
  if (mulMissing) return 'tables-envers';
  if (/\?/.test(t) && !/=\?$/.test(t)) return 'comp';
  const mul = /^(\d+)×(\d+)=\?$/.exec(t);
  if (mul) {
    const a = Number(mul[1]);
    const b = Number(mul[2]);
    if (a <= 10 && b <= 10) return 'tables';
    if (/0$/.test(mul[1]) || /0$/.test(mul[2])) return 'dizaines';
    return 'mul';
  }
  const div = /^(\d+)÷(\d+)=\?$/.exec(t);
  if (div) return Number(div[1]) <= 100 && Number(div[2]) <= 10 ? 'tables-envers' : 'div';
  if (/^\d+\+\d+=\?$/.test(t)) return 'add';
  if (/^\d+-\d+=\?$/.test(t)) return 'sub';
  return 'autre';
}

/** Un calcul précis n'est suivi que s'il revient souvent : petits nombres, tables, ×10/100/1 000. */
export function trackableCalc(text: string): boolean {
  const nums = text.match(/\d{1,3}(?:[\u00a0\u202f ]\d{3})+|\d+(?:,\d+)?/g) ?? [];
  if (nums.length === 0) return false;
  return nums.every((n) => /^\d{1,2}(?:,\d)?$/.test(n) || n === '100' || /^1[\u00a0\u202f ]?000$/.test(n));
}

/** « 7 × 8 = ? » → « 7 × 8 » (espaces normalisés). */
export const calcLabel = (text: string) => text.replace(/\s*=\s*\?\s*$/, '').replace(/[\u00a0\u202f]/g, ' ').trim();

/** Résultat d'un calcul de « Course à l'encre ». */
export function mathOutcome(text: string, ok: boolean, pick: number | null): ItemOutcome {
  const fam = familyOfCalc(text);
  const label = calcLabel(text);
  return {
    rule: fam,
    ruleLabel: MATH_FAMILIES[fam] ?? MATH_FAMILIES.autre,
    item: trackableCalc(text) ? label.slice(0, 80) : null,
    itemLabel: label.slice(0, 160),
    ok,
    picks: !ok && pick !== null && Number.isFinite(pick) ? [String(pick)] : [],
  };
}

// ───────────── Phrases de « Chasse aux fautes » ─────────────

/**
 * Résultat d'une phrase. `picks` : les mauvaises propositions choisies. Quand l'élève tape la correction lui-même (Expert),
 * on ne garde RIEN de ce qu'il a écrit : un texte libre pourrait contenir autre chose qu'un mot de la phrase.
 */
export function spellingOutcome(rule: string, ruleLabel: string, id: string, sentence: string, ok: boolean, picks: string[], typed: boolean): ItemOutcome {
  return {
    rule,
    ruleLabel,
    item: id.slice(0, 80),
    itemLabel: sentence.slice(0, 160),
    ok,
    picks: typed ? [] : picks.filter((p) => p.length > 0 && p.length <= 40),
  };
}

// ───────────── Mots du « Facteur » ─────────────

/** Un colis : le mot, rangé du premier coup ou non, et les mauvaises boîtes touchées (des mots du jeu, jamais du texte libre). */
export function facteurOutcome(word: string, level: number, ok: boolean, picks: readonly string[]): ItemOutcome {
  return {
    rule: `n${level}`,
    ruleLabel: `Mots du niveau ${level}`,
    item: word.slice(0, 80),
    itemLabel: word.slice(0, 160),
    ok,
    picks: picks.filter((p) => p.length > 0 && p.length <= 40),
  };
}

// ───────────── Regroupement avant envoi ─────────────

/** Regroupe les résultats d'une partie en compteurs. Les exercices précis qui reviennent plus de 5 fois sont plafonnés. */
export function summarize(outcomes: readonly ItemOutcome[]): ItemEntry[] {
  const rules = new Map<string, ItemEntry>();
  const items = new Map<string, ItemEntry>();
  const bump = (m: Map<string, ItemEntry>, k: 'rule' | 'item', id: string, label: string, o: ItemOutcome, cap: number) => {
    let e = m.get(id);
    if (!e) {
      e = { k, i: id, l: label, n: 0, e: 0 };
      m.set(id, e);
    }
    if (e.n >= cap) return;
    e.n++;
    if (!o.ok) {
      e.e++;
      for (const p of o.picks.slice(0, 2)) {
        const key = p.slice(0, 40);
        if (!key) continue;
        e.p = e.p ?? {};
        if (Object.keys(e.p).length < 3 || key in e.p) e.p[key] = Math.min(5, (e.p[key] ?? 0) + 1);
      }
    }
  };
  for (const o of outcomes) {
    bump(rules, 'rule', o.rule, o.ruleLabel, o, 100);
    if (o.item) bump(items, 'item', o.item, o.itemLabel, o, 5);
  }
  return [...rules.values(), ...items.values()].slice(0, 120);
}
