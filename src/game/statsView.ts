import type { AdminItems, BalanceLevel, GameStats, GradeStat, PeriodBalance } from '../server/admin';
import { MIN_ROUNDS, diffName, gameName, levelName, mergeRows, picksText, rank, summaryText, targetOf, verdictOf } from './balanceView';

/**
 * Lecture des statistiques détaillées (espace administrateur) : ce qu'il faut régler en priorité, jeu par jeu et niveau par niveau.
 * Tout part de comptes et de moyennes anonymes (voir public.admin_game_stats) ; ces fonctions ne font que les lire et les trier.
 */

/** Pas de conclusion en dessous de ce nombre de parties pour un groupe (jeu × mode × niveau). */
export const MIN_RUNS = 20;
/** Seuils des signaux (en %). */
export const SIGNAL = { earlyLoss: 30, short: 40, low: 35, once: 50, itemErr: 50, mismatch: 40 } as const;

export type AdvicePriority = 1 | 2 | 3;
export interface Advice {
  /** 1 = à régler d'abord, 2 = à surveiller, 3 = pour information */
  priority: AdvicePriority;
  /** de quoi on parle : « Course à l’encre · CM1 · Expert » */
  topic: string;
  /** ce qu'on observe, chiffres à l'appui */
  fact: string;
  /** piste de réglage */
  hint: string;
}

const GRADES = ['cp', 'ce1', 'ce2', 'cm1', 'cm2'];
const pct = (n: number | null | undefined) => (n === null || n === undefined ? '—' : `${String(n).replace('.', ',')} %`);

/** Le niveau scolaire d'un mode, s'il en contient un (« cm1-expert » → cm1), sinon null. */
export function gradeOfMode(mode: string): string | null {
  const head = mode.split('-')[0];
  return GRADES.includes(head) ? head : null;
}

/** « Classes de CM1 » ou « Classes sans niveau » */
export const gradeGroup = (g: string) => (g === '?' ? 'Classes sans niveau fixé' : `Classes de ${levelName(g)}`);

/** Lignes d'équilibrage de la période, au format du tableau historique. */
export const asLevels = (rows: readonly PeriodBalance[]): BalanceLevel[] =>
  rows.map((r) => ({ game: r.game, level: r.level, difficulty: r.difficulty, version: 0, runs: r.runs, ok: r.ok, err: r.err, success_pct: r.success_pct, finished_pct: r.finished_pct, avg_score: null, avg_duration: r.dur_med }));

const topicOf = (game: string, level: string, difficulty: string) => [gameName(game), level && level !== '-' && !gradeOfMode(difficulty) ? levelName(level) : '', diffName(difficulty)].filter(Boolean).join(' · ');

/** Ce qu'il faut régler, du plus urgent au moins urgent (15 au plus). */
export function adviceOf(g: GameStats, items: AdminItems | null): Advice[] {
  const out: Advice[] = [];

  // 1. Réussite par manche, comparée à l'objectif du jeu et de la difficulté
  for (const b of g.balance) {
    const v = verdictOf(b);
    if (v.gap === null || (v.verdict !== 'hard' && v.verdict !== 'easy')) continue;
    const big = Math.abs(v.gap) > 15;
    out.push({
      priority: big ? 1 : 2,
      topic: topicOf(b.game, b.level, b.difficulty),
      fact: `${pct(b.success_pct)} de réussite pour ${targetOf(b.game, b.difficulty)} % visés (${b.ok + b.err} manches, ${b.runs} parties).`,
      hint:
        v.verdict === 'hard'
          ? 'Trop difficile : ralentir, laisser plus de temps ou retirer les exercices les plus ratés (voir plus bas).'
          : 'Trop facile : accélérer un peu ou ajouter des exercices plus exigeants.',
    });
  }
  // 2. Parties perdues tout de suite
  for (const b of g.balance) {
    if (b.runs < MIN_RUNS || b.early_loss_pct < SIGNAL.earlyLoss) continue;
    out.push({
      priority: 2,
      topic: topicOf(b.game, b.level, b.difficulty),
      fact: `${pct(b.early_loss_pct)} des parties sont perdues en moins de 45 s.`,
      hint: 'Le début est trop dur : premières manches plus lentes ou plus simples.',
    });
  }
  // 3. Par niveau de classe : parties très courtes, beaucoup d'échecs, niveau joué plus bas que celui de la classe
  for (const r of g.by_grade) {
    if (r.runs < MIN_RUNS) continue;
    const topic = `${gameName(r.game)} · ${diffName(r.mode)} · ${gradeGroup(r.grade)}`;
    if (r.short_pct >= SIGNAL.short)
      out.push({ priority: 2, topic, fact: `${pct(r.short_pct)} des parties durent moins de 30 s.`, hint: 'Consigne mal comprise ou jeu vite abandonné : relire la consigne, regarder une partie en classe.' });
    if (r.low_pct >= SIGNAL.low)
      out.push({ priority: 2, topic, fact: `${pct(r.low_pct)} des parties sous 60 % de réussite (médiane ${pct(r.acc_med)}).`, hint: 'Beaucoup d’élèves en difficulté à ce niveau : proposer une difficulté plus douce par défaut.' });
  }
  const byGradeGame = new Map<string, number>();
  for (const r of g.by_grade) byGradeGame.set(`${r.game}|${r.grade}`, (byGradeGame.get(`${r.game}|${r.grade}`) ?? 0) + r.runs);
  const lower = new Map<string, number>();
  for (const r of g.by_grade) {
    const m = gradeOfMode(r.mode);
    if (!m || r.grade === '?' || GRADES.indexOf(m) >= GRADES.indexOf(r.grade)) continue;
    lower.set(`${r.game}|${r.grade}`, (lower.get(`${r.game}|${r.grade}`) ?? 0) + r.runs);
  }
  for (const [key, n] of lower) {
    const total = byGradeGame.get(key) ?? 0;
    if (total < MIN_RUNS || (100 * n) / total < SIGNAL.mismatch) continue;
    const [game, grade] = key.split('|');
    out.push({
      priority: 3,
      topic: `${gameName(game)} · ${gradeGroup(grade)}`,
      fact: `${Math.round((100 * n) / total)} % des parties se jouent à un niveau inférieur à celui de la classe.`,
      hint: 'Le niveau de la classe est peut-être trop dur, ou les élèves le contournent pour gagner plus facilement.',
    });
  }
  // 4. Jeux essayés une fois puis délaissés
  for (const l of g.loyalty) {
    if (l.players < 10 || l.once_pct < SIGNAL.once) continue;
    out.push({ priority: 3, topic: gameName(l.game), fact: `${pct(l.once_pct)} des élèves n’y ont joué qu’une fois.`, hint: 'Jeu peu rejoué : premier contact trop dur, trop long, ou peu motivant.' });
  }
  // 5. Anti-triche : une borne qui refuse souvent de vrais élèves est trop stricte
  for (const c of g.cheats) {
    if (c.n < 5 || c.players < 3) continue;
    out.push({ priority: 2, topic: `Anti-triche · ${gameName(c.game)}`, fact: `« ${c.reason} » : ${c.n} parties refusées, ${c.players} élèves.`, hint: 'Si ce sont de bons élèves, la borne du serveur est trop stricte : à élargir.' });
  }
  // 6. Exercices précis très ratés
  if (items) {
    for (const game of [...new Set(items.items.map((i) => i.game))]) {
      for (const r of rank(mergeRows(items.items, { game, level: 'all', difficulty: 'all' }), 10).slice(0, 3)) {
        if ((r.err_pct ?? 0) < SIGNAL.itemErr) continue;
        out.push({
          priority: 2,
          topic: `${gameName(game)} · ${levelName(r.level)}`,
          fact: `« ${r.label} » raté ${pct(r.err_pct)} (posé ${r.shown} fois)${Object.keys(r.picks).length ? `, confondu avec ${picksText(r.picks, 2)}` : ''}.`,
          hint: game === 'facteur' ? 'Image peut-être ambiguë, ou mauvais mots trop proches : revoir l’image ou les mots proposés.' : 'Exercice à vérifier : formulation, réponse attendue, ou niveau trop élevé.',
        });
      }
    }
  }
  return out.sort((a, b) => a.priority - b.priority).slice(0, 15);
}

/** Total des parties par semaine (tous jeux), dans l'ordre. */
export function weeklyTotals(g: GameStats): { week: string; runs: number }[] {
  const m = new Map<string, number>();
  for (const w of g.weekly) m.set(w.week, (m.get(w.week) ?? 0) + w.runs);
  return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([week, runs]) => ({ week, runs }));
}

/** Parties par heure de la journée (0 à 23), et part jouée sur le temps scolaire (lundi, mardi, jeudi, vendredi, 8 h à 17 h ; mercredi matin). */
export function hourly(g: GameStats): { hours: number[]; schoolPct: number } {
  const hours = Array.from({ length: 24 }, () => 0);
  let school = 0;
  let total = 0;
  for (const h of g.hours) {
    hours[h.hour] += h.runs;
    total += h.runs;
    const day = h.dow >= 1 && h.dow <= 5 && h.dow !== 3 && h.hour >= 8 && h.hour < 17;
    const wed = h.dow === 3 && h.hour >= 8 && h.hour < 12;
    if (day || wed) school += h.runs;
  }
  return { hours, schoolPct: total ? Math.round((100 * school) / total) : 0 };
}

/** Lignes d'un jeu, par niveau de classe puis par mode. */
export const gradeRows = (g: GameStats, game: string): GradeStat[] =>
  g.by_grade
    .filter((r) => r.game === game)
    .sort((a, b) => gradeIndex(a.grade) - gradeIndex(b.grade) || a.mode.localeCompare(b.mode));
const gradeIndex = (g: string) => (g === '?' ? 99 : GRADES.indexOf(g));

/** Bilan complet en texte brut, à coller dans une conversation pour régler les jeux. */
export function statsText(g: GameStats, items: AdminItems, today: string): string {
  const out: string[] = [];
  const t = g.totals;
  out.push(`Statistiques d’Atelier — ${today} — ${g.days} derniers jours`);
  out.push(`${t.runs} parties (${t.session_runs} en séance, ${t.drills} entraînements), ${t.players} élèves, ${t.classes} classes, ${t.schools} écoles, ${t.minutes} minutes de jeu.`);
  const h = hourly(g);
  out.push(`${h.schoolPct} % des parties sur le temps scolaire.`);
  out.push('');
  out.push('À RÉGLER EN PRIORITÉ');
  const adv = adviceOf(g, items);
  if (adv.length === 0) out.push('(rien de net : pas assez de données ou tout est bien réglé)');
  for (const a of adv) out.push(`- [${a.priority}] ${a.topic} : ${a.fact} → ${a.hint}`);
  out.push('');
  out.push('PAR NIVEAU DE CLASSE (parties libres)');
  for (const game of [...new Set(g.by_grade.map((r) => r.game))].sort()) {
    out.push(`${gameName(game)} :`);
    for (const r of gradeRows(g, game)) {
      out.push(
        `  - ${gradeGroup(r.grade)} · ${diffName(r.mode)} : ${r.runs} parties, ${r.players} élèves, ${r.classes} classes ; réussite moyenne ${pct(r.acc)} (médiane ${pct(r.acc_med)}) ; score médian ${r.score_med ?? '—'} (${r.score_p25 ?? '—'}–${r.score_p75 ?? '—'}) ; durée médiane ${r.dur_med ?? '—'} s ; <60 % : ${pct(r.low_pct)}, ≥95 % : ${pct(r.high_pct)}, <30 s : ${pct(r.short_pct)}`,
      );
    }
  }
  if (g.loyalty.length) {
    out.push('');
    out.push('FIDÉLITÉ');
    for (const l of g.loyalty) out.push(`- ${gameName(l.game)} : ${l.players} élèves, ${l.runs_per_player} parties chacun en moyenne ; revenus un autre jour ${pct(l.back_pct)} ; 10 parties ou plus ${pct(l.ten_pct)} ; une seule partie ${pct(l.once_pct)}`);
  }
  if (g.cheats.length) {
    out.push('');
    out.push('PARTIES REFUSÉES PAR LE SERVEUR');
    for (const c of g.cheats) out.push(`- ${gameName(c.game)} · ${c.reason} : ${c.n} (${c.players} élèves)`);
  }
  out.push('');
  const periodLevels = asLevels(g.balance);
  out.push(summaryText(periodLevels, items.rules, items.items, today).replace(/^Bilan d’équilibrage d’Atelier — .*\n/, ''));
  for (const b of g.balance) {
    if (b.runs >= MIN_RUNS && b.early_loss_pct > 0) out.push(`(perdues en moins de 45 s — ${topicOf(b.game, b.level, b.difficulty)} : ${pct(b.early_loss_pct)})`);
  }
  out.push(`(manches nécessaires avant de juger un niveau : ${MIN_ROUNDS})`);
  return out.join('\n') + '\n';
}
