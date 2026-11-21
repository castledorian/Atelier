import type { BalanceLevel, ItemStatRow } from '../server/admin';
import { toCsv } from './history';
import { GAME_NAMES } from './sessionConfig';

/**
 * Lecture des statistiques d'équilibrage (espace administrateur) : à quel point chaque niveau est-il réussi,
 * et quels exercices font échouer le plus souvent.
 *
 * Objectif visé : les élèves réussissent la plupart des manches sans que ce soit jamais gagné d'avance
 * (Apprenti ≈ 95 %, Standard ≈ 85 %, Expert ≈ 65 % de réussite) et ne perdent pas tout le temps non plus.
 */

/** Réussite visée par difficulté, en % des manches (calculs ou phrases réussis du premier coup). */
export const TARGET: Record<string, number> = { apprenti: 95, standard: 85, expert: 65 };
/** Écart toléré autour de l'objectif, en points. */
export const TOLERANCE = 5;
/** En dessous, une moyenne n'est pas assez solide pour décider de régler quoi que ce soit. */
export const MIN_ROUNDS = 150;
/** Jeux dont la réussite est mesurée par manche. (Frappe ! et Mémoire d'encre se règlent autrement.) */
export const RATED_GAMES = ['math', 'spelling', 'lexique', 'facteur'];
/** Jeux sans fin de partie gagnante (on joue jusqu'à la fin de la séance, ou jusqu'à perdre) : « parties gagnées » n'y a pas de sens. */
export const NO_END = ['facteur', 'lexique'];
/** Le facteur (CP) : colis rangés du premier coup visés, quel que soit le niveau (le seuil des 3 étoiles). */
export const FACTEUR_TARGET = 85;

const DIFFS = ['apprenti', 'standard', 'expert'];
/** Difficulté d'un classement : « cm1-expert » → expert, « synonyme » → standard, « apprenti » → apprenti. */
export function diffOf(mode: string): string {
  if (DIFFS.includes(mode)) return mode;
  const tail = mode.split('-').pop() ?? '';
  return DIFFS.includes(tail) ? tail : 'standard';
}

/** Réussite visée pour un jeu et une difficulté (undefined si le jeu ne se règle pas ainsi). */
export function targetOf(game: string, difficulty: string): number | undefined {
  if (!RATED_GAMES.includes(game)) return undefined;
  if (game === 'facteur') return FACTEUR_TARGET;
  return TARGET[diffOf(difficulty)];
}

export type Verdict = 'few' | 'easy' | 'ok' | 'hard' | 'none';

export interface LevelVerdict {
  verdict: Verdict;
  /** texte affiché : ne repose jamais sur la seule couleur */
  label: string;
  /** écart à l'objectif en points (réussite − objectif), null si non évalué */
  gap: number | null;
  /** précision courte affichée sous le verdict : « −22,2 points », « 112 manches sur 150 nécessaires » */
  detail: string;
  /** remarque sur les parties gagnées ou perdues, sinon vide */
  note: string;
}

const LEVEL_NAME: Record<string, string> = { cp: 'CP', ce1: 'CE1', ce2: 'CE2', cm1: 'CM1', cm2: 'CM2', '-': '—' };
export const levelName = (l: string) => LEVEL_NAME[l] ?? l.toUpperCase();
export const gameName = (g: string) => (GAME_NAMES as Record<string, string>)[g] ?? g;
const DIFF_NAME: Record<string, string> = { apprenti: 'Apprenti', standard: 'Standard', expert: 'Expert', perso: 'Personnalisé' };
const PART_NAME: Record<string, string> = {
  ...DIFF_NAME,
  ...LEVEL_NAME,
  synonyme: 'Synonymes',
  contraire: 'Contraires',
  famille: 'Familles',
  melange: 'Mélange',
  suite: 'La Suite',
  cases: 'Les Cases',
  n1: 'Niveau 1',
  n2: 'Niveau 2',
  n3: 'Niveau 3',
  n4: 'Niveau 4',
  n5: 'Niveau 5',
};
/** « cm1-expert » → « CM1 · Expert », « synonyme » → « Synonymes », « n2 » → « Niveau 2 ». */
export const diffName = (d: string) =>
  d
    .split('-')
    .map((p) => PART_NAME[p] ?? p)
    .join(' · ');

export function verdictOf(l: Pick<BalanceLevel, 'game' | 'difficulty' | 'runs' | 'ok' | 'err' | 'success_pct' | 'finished_pct'>): LevelVerdict {
  const target = targetOf(l.game, l.difficulty);
  const rounds = l.ok + l.err;
  let note = '';
  if (l.runs >= 10 && l.finished_pct !== null && !NO_END.includes(l.game)) {
    if (l.finished_pct >= 95) note = 'presque toutes les parties sont gagnées';
    else if (l.finished_pct <= 15) note = 'presque toutes les parties sont perdues';
  }
  if (target === undefined || l.success_pct === null) return { verdict: 'none', label: 'Non évalué', gap: null, detail: '', note };
  if (rounds < MIN_ROUNDS) return { verdict: 'few', label: 'Trop peu de données', gap: null, detail: `${rounds} manches sur ${MIN_ROUNDS} nécessaires`, note };
  const gap = Math.round((l.success_pct - target) * 10) / 10;
  const detail = gap === 0 ? 'pile sur l’objectif' : `${gap > 0 ? '+' : '−'}${String(Math.abs(gap)).replace('.', ',')} point${Math.abs(gap) >= 2 ? 's' : ''}`;
  if (gap > TOLERANCE) return { verdict: 'easy', label: 'Trop facile', gap, detail, note };
  if (gap < -TOLERANCE) return { verdict: 'hard', label: 'Trop difficile', gap, detail, note };
  return { verdict: 'ok', label: 'Bien réglé', gap, detail, note };
}

export interface Filter {
  game: string;
  level: string;
  difficulty: string;
}

/** Retient les lignes du filtre (« all » = pas de filtre) et additionne les versions et difficultés d'un même exercice. */
export function mergeRows(rows: readonly ItemStatRow[], f: Filter): ItemStatRow[] {
  const out = new Map<string, ItemStatRow>();
  for (const r of rows) {
    if ((f.game !== 'all' && r.game !== f.game) || (f.level !== 'all' && r.level !== f.level) || (f.difficulty !== 'all' && r.difficulty !== f.difficulty)) continue;
    const key = `${r.game}|${r.level}|${r.item}`;
    const cur = out.get(key);
    if (!cur) {
      out.set(key, { ...r, difficulty: f.difficulty === 'all' ? 'toutes' : r.difficulty, picks: { ...r.picks } });
      continue;
    }
    cur.shown += r.shown;
    cur.wrong += r.wrong;
    for (const [k, n] of Object.entries(r.picks)) cur.picks[k] = (cur.picks[k] ?? 0) + n;
  }
  return [...out.values()].map((r) => ({ ...r, err_pct: r.shown > 0 ? Math.round((1000 * r.wrong) / r.shown) / 10 : null }));
}

/** Du plus raté au moins raté ; à égalité, le plus souvent posé d'abord. Les exercices trop peu posés sont écartés. */
export function rank(rows: readonly ItemStatRow[], minShown: number): ItemStatRow[] {
  return rows
    .filter((r) => r.shown >= minShown)
    .sort((a, b) => (b.err_pct ?? -1) - (a.err_pct ?? -1) || b.shown - a.shown || a.label.localeCompare(b.label, 'fr'));
}

/** « 54 (×3), 56 (×2) » : les mauvaises réponses les plus choisies. */
export function picksText(picks: Record<string, number>, max = 3): string {
  return Object.entries(picks)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'fr'))
    .slice(0, max)
    .map(([k, n]) => `${k} (×${n})`)
    .join(', ');
}

// ───────────── Exports ─────────────

export function levelsCsv(levels: readonly BalanceLevel[]): string {
  return toCsv(
    ['Jeu', 'Niveau', 'Difficulté', 'Version', 'Parties', 'Manches réussies', 'Manches ratées', 'Réussite %', 'Objectif %', 'Verdict', 'Écart (points)', 'Parties gagnées %', 'Score moyen', 'Durée moyenne (s)'],
    levels.map((l) => {
      const v = verdictOf(l);
      return [gameName(l.game), levelName(l.level), diffName(l.difficulty), l.version, l.runs, l.ok, l.err, l.success_pct ?? '', targetOf(l.game, l.difficulty) ?? '', v.label, v.gap ?? '', l.finished_pct ?? '', l.avg_score ?? '', l.avg_duration ?? ''];
    }),
  );
}

export function itemsCsv(rules: readonly ItemStatRow[], items: readonly ItemStatRow[]): string {
  const rows = (kind: string, list: readonly ItemStatRow[]) =>
    list.map((r) => [gameName(r.game), levelName(r.level), diffName(r.difficulty), r.version, kind, r.item, r.label, r.shown, r.wrong, r.err_pct ?? '', picksText(r.picks, 8)]);
  return toCsv(['Jeu', 'Niveau', 'Difficulté', 'Version', 'Type', 'Identifiant', 'Exercice', 'Posé', 'Raté', 'Erreurs %', 'Mauvaises réponses choisies'], [...rows('famille', rules), ...rows('exercice', items)]);
}

/** Résumé en texte brut, à coller dans une conversation pour régler les niveaux. */
export function summaryText(levels: readonly BalanceLevel[], rules: readonly ItemStatRow[], items: readonly ItemStatRow[], today: string): string {
  const out: string[] = [];
  out.push(`Bilan d’équilibrage d’Atelier — ${today}`);
  out.push(`Objectif : Apprenti ≈ ${TARGET.apprenti} %, Standard ≈ ${TARGET.standard} %, Expert ≈ ${TARGET.expert} % de manches réussies (± ${TOLERANCE} points), sans parties toujours gagnées ni toujours perdues.`);
  out.push('');
  out.push('RÉUSSITE PAR NIVEAU');
  const rated = levels.filter((l) => RATED_GAMES.includes(l.game));
  if (rated.length === 0) out.push('(aucune donnée)');
  for (const l of rated) {
    const v = verdictOf(l);
    const gap = v.gap === null ? (v.detail ? ` (${v.detail})` : '') : ` (${v.detail} par rapport à l’objectif)`;
    out.push(`- ${gameName(l.game)} · ${levelName(l.level)} · ${diffName(l.difficulty)} (v${l.version}) : ${l.success_pct ?? '—'} % sur ${l.ok + l.err} manches, ${l.runs} parties, ${l.finished_pct ?? '—'} % gagnées → ${v.label}${gap}${v.note ? ` ; ${v.note}` : ''}`);
  }
  const groups = new Set<string>();
  for (const r of [...rules, ...items]) groups.add(`${r.game}|${r.level}`);
  for (const g of [...groups].sort()) {
    const [game, level] = g.split('|');
    const f: Filter = { game, level, difficulty: 'all' };
    const fam = rank(mergeRows(rules, f), 5).slice(0, 6);
    const its = rank(mergeRows(items, f), 5).slice(0, 10);
    if (fam.length === 0 && its.length === 0) continue;
    out.push('');
    out.push(`LES PLUS RATÉS — ${gameName(game)} · ${levelName(level)} (toutes difficultés)`);
    if (fam.length) out.push('Familles : ' + fam.map((r) => `${r.label} ${r.err_pct} % (posé ${r.shown} fois)`).join(' ; '));
    for (const r of its) out.push(`- ${r.label} : ${r.err_pct} % raté sur ${r.shown}${Object.keys(r.picks).length ? ` ; réponses choisies à tort : ${picksText(r.picks)}` : ''}`);
  }
  return out.join('\n') + '\n';
}
