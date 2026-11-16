/**
 * Les règles à revoir : chaque faute est rangée dans une règle (la retenue, les homophones…), avec l'astuce qui aide
 * à la retenir. Le suivi reste sur l'appareil de l'élève.
 */

export type RuleId = 'retenue' | 'table-fantome' | 'zero-voleur' | 'doublon' | 'jumeaux' | 'accordeur';
export type Family = 'calcul' | 'orthographe';

export interface RuleInfo {
  id: RuleId;
  /** nom de la règle : « La retenue » */
  name: string;
  family: Family;
  /** la faute fréquente, en une phrase */
  fault: string;
  /** l'astuce pour la retenir, en une phrase d'élève */
  parade: string;
}

export const RULES: RuleInfo[] = [
  {
    id: 'retenue',
    name: 'La retenue',
    family: 'calcul',
    fault: 'Un report oublié dans une addition ou une multiplication.',
    parade: 'Pose la retenue au-dessus de la colonne suivante.',
  },
  {
    id: 'table-fantome',
    name: 'Les tables de 6 à 9',
    family: 'calcul',
    fault: 'Un produit des tables de 6 à 9 que l’on confond.',
    parade: 'Appuie-toi sur une table connue : 9 × 7, c’est 10 × 7 moins 7.',
  },
  {
    id: 'zero-voleur',
    name: '× et ÷ par 10, 100, 1 000',
    family: 'calcul',
    fault: 'Un chiffre ou un zéro mal placé en multipliant ou en divisant par 10, 100, 1 000.',
    parade: '× 10, × 100, × 1 000 décalent les chiffres vers la gauche ; ÷ 10, ÷ 100, vers la droite.',
  },
  {
    id: 'doublon',
    name: 'Les lettres doubles',
    family: 'orthographe',
    fault: 'Une lettre double oubliée ou ajoutée.',
    parade: 'Cherche un mot de la même famille.',
  },
  {
    id: 'jumeaux',
    name: 'Les mots qui sonnent pareil',
    family: 'orthographe',
    fault: 'Deux mots qui sonnent pareil et que l’on échange (a / à, et / est, on / ont…).',
    parade: 'Essaie avec « avait », ou avec « était ».',
  },
  {
    id: 'accordeur',
    name: 'Les accords',
    family: 'orthographe',
    fault: 'Un accord oublié (nombre, genre, verbe).',
    parade: 'Qui fait l’action ? Accorde avec lui.',
  },
];

export const ruleInfo = (id: RuleId): RuleInfo => RULES.find((c) => c.id === id) as RuleInfo;
export const isRuleId = (v: unknown): v is RuleId => RULES.some((c) => c.id === v);
export const rulesOf = (family: Family): RuleId[] => RULES.filter((c) => c.family === family).map((c) => c.id);

// ───────────── Classement des calculs de « Course à l'encre » ─────────────

const norm = (s: string) => s.replace(/[\s  ]/g, '');

/**
 * Règle d'un calcul, d'après son écriture (« 7 × 8 = ? », « 3,4 × 100 = ? »…).
 * `null` : pas de règle propre (la faute est simplement comptée dans le score).
 */
export function ruleOfCalc(text: string): RuleId | null {
  const t = norm(text);
  // décalage des chiffres : × 10, × 100, × 1 000, ÷ 10, ÷ 100, × dizaines, × 0,1, × 0,5, n/10, n/100
  if (/×(10|100|1000)=\?$/.test(t) || /÷(10|100)=\?$/.test(t)) return 'zero-voleur';
  if (/^\d+×[2-9]0=\?$/.test(t)) return 'zero-voleur';
  if (/^0,[15]×\d+=\?$/.test(t)) return 'zero-voleur';
  if (/^\d+\/(10|100)=\?$/.test(t)) return 'zero-voleur';
  const mul = /^(\d+)×(\d+)=\?$/.exec(t);
  if (mul) {
    const a = Number(mul[1]);
    const b = Number(mul[2]);
    // tables : deux facteurs de 2 à 10, dont un de 6 à 9
    if (a <= 10 && b <= 10 && [a, b].some((v) => v >= 6 && v <= 9)) return 'table-fantome';
    // un nombre à plusieurs chiffres fois un chiffre : il y a une retenue
    if (Math.max(a, b) >= 11 && Math.min(a, b) >= 2 && Math.min(a, b) <= 9) return 'retenue';
    return null;
  }
  const add = /^(\d+)\+(\d+)=\?$/.exec(t);
  if (add && Number(add[1]) >= 10 && Number(add[2]) >= 10) return 'retenue';
  return null;
}
