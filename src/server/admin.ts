import { GAME_NAMES } from '../game/sessionConfig';
import { rpc } from './api';
import { freshToken } from './teacher';
import type { StudentAccount } from './types';

// ───────────────────────── Espace administrateur (lecture seule) ─────────────────────────
// Toutes ces fonctions sont refusées par le serveur à un compte qui n'est pas dans public.site_admins.

export interface AdminTotals {
  schools: number;
  teachers: number;
  classes: number;
  students: number;
  runs: number;
  runs_7d: number;
  active_students_7d: number;
  flags_7d: number;
  signups_7d: number;
}
export interface AdminSchoolLine {
  id: string;
  name: string;
  created: number;
  teachers: string[];
  classes: number;
  students: number;
  runs: number;
  last_run: number | null;
}
export interface AdminOverview {
  totals: AdminTotals;
  daily: { day: string; runs: number }[];
  games: { game: string; runs: number }[];
  schools: AdminSchoolLine[];
}
export interface AdminStudent {
  id: string;
  name: string;
  created: number;
  runs: number;
  seconds: number;
  last_played: number | null;
}
export interface AdminClass {
  id: string;
  name: string;
  grade: string | null;
  hide_board: boolean;
  created: number;
  students: AdminStudent[];
}
export interface AdminRun {
  at: number;
  student: string;
  class?: string;
  school?: string;
  game: string;
  mode: string;
  kind: string;
  score: number;
  acc: number;
  duration: number;
}
export interface AdminSchool {
  school: { id: string; name: string; created: number };
  teachers: { email: string; role: string; since: number; last_sign_in: number | null }[];
  classes: AdminClass[];
  recent: AdminRun[];
}
export interface AdminLogs {
  runs: AdminRun[];
  signups: { email: string; at: number; last_sign_in: number | null; confirmed: boolean; schools: number }[];
  flags: { at: number; student: string | null; school: string | null; game: string | null; mode: string | null; reason: string }[];
  audit: { at: number; admin: string | null; action: string; target: string | null }[];
}

/** Réussite d'un jeu pour un niveau et une difficulté, d'après les parties libres (résumés anonymes). */
export interface BalanceLevel {
  game: string;
  level: string;
  difficulty: string;
  version: number;
  runs: number;
  ok: number;
  err: number;
  success_pct: number | null;
  finished_pct: number | null;
  avg_score: number | null;
  avg_duration: number | null;
}
export interface AdminBalance {
  levels: BalanceLevel[];
}
/** Compteurs anonymes d'une famille de calculs, d'une règle, d'un calcul ou d'une phrase. */
export interface ItemStatRow {
  game: string;
  level: string;
  difficulty: string;
  version: number;
  item: string;
  label: string;
  shown: number;
  wrong: number;
  err_pct: number | null;
  /** mauvaises réponses choisies : { réponse: nombre de fois } */
  picks: Record<string, number>;
}
export interface AdminItems {
  rules: ItemStatRow[];
  items: ItemStatRow[];
}

// ───────────────────────── Statistiques détaillées (mise à jour « stats ») ─────────────────────────

/** Parties libres d'un jeu et d'un mode, pour les classes d'un niveau (« ? » : niveau de classe non fixé). */
export interface GradeStat {
  game: string;
  mode: string;
  grade: string;
  runs: number;
  players: number;
  classes: number;
  acc: number | null;
  acc_med: number | null;
  score_p25: number | null;
  score_med: number | null;
  score_p75: number | null;
  dur_med: number | null;
  correct: number | null;
  wave: number | null;
  /** % de parties sous 60 % de réussite, à 95 % ou plus, de moins de 30 s */
  low_pct: number;
  high_pct: number;
  short_pct: number;
}
/** Une classe (au moins 3 élèves) pour un jeu. */
export interface ClassStat {
  school: string;
  class: string;
  grade: string;
  game: string;
  runs: number;
  players: number;
  session_runs: number;
  acc: number | null;
  score_med: number | null;
  dur_med: number | null;
  last_at: number;
}
export interface LoyaltyStat {
  game: string;
  players: number;
  runs_per_player: number;
  /** % d'élèves revenus un autre jour, ayant joué 10 parties ou plus, n'ayant joué qu'une fois */
  back_pct: number;
  ten_pct: number;
  once_pct: number;
}
export interface PeriodBalance {
  game: string;
  level: string;
  difficulty: string;
  runs: number;
  ok: number;
  err: number;
  success_pct: number | null;
  finished_pct: number | null;
  /** % de parties perdues en moins de 45 s */
  early_loss_pct: number;
  dur_med: number | null;
  wave_med: number | null;
}
export interface GameStats {
  days: number;
  totals: { runs: number; players: number; classes: number; schools: number; session_runs: number; drills: number; minutes: number };
  by_grade: GradeStat[];
  by_class: ClassStat[];
  weekly: { week: string; game: string; runs: number; players: number }[];
  hours: { dow: number; hour: number; runs: number }[];
  loyalty: LoyaltyStat[];
  cheats: { game: string; reason: string; n: number; players: number }[];
  balance: PeriodBalance[];
}

const authed = async <T>(f: (token: string) => Promise<T>): Promise<T> => f(await freshToken());

/** Vrai si ce compte est administrateur du site (faux aussi si la mise à jour SQL n'est pas encore faite). */
export async function isAdmin(): Promise<boolean> {
  try {
    return (await authed((t) => rpc<boolean>('admin_check', {}, t))) === true;
  } catch {
    return false;
  }
}

export const adminOverview = () => authed((t) => rpc<AdminOverview>('admin_overview', {}, t));
export const adminSchool = (id: string) => authed((t) => rpc<AdminSchool>('admin_school', { p_school: id }, t));
export const adminBalance = () => authed((t) => rpc<AdminBalance>('admin_balance', {}, t));
export const adminGameStats = (days: number) => authed((t) => rpc<GameStats>('admin_game_stats', { p_days: days }, t));
export const adminItemStats = () => authed((t) => rpc<AdminItems>('admin_item_stats', {}, t));

/** Nombre d'élèves derrière chaque exercice et dispersion de leurs résultats (mise à jour « fiche élève ») ; null si absente. */
export interface ItemSpreadRow {
  game: string;
  level: string;
  difficulty: string;
  kind: 'rule' | 'item';
  item: string;
  players: number;
  shown: number;
  wrong: number;
  ww: number;
  wn: number;
  nn: number;
}
export async function adminItemSpread(): Promise<ItemSpreadRow[] | null> {
  try {
    const rows = await authed((t) => rpc<ItemSpreadRow[]>('admin_item_spread', {}, t));
    return rows.map((r) => ({ ...r, players: Number(r.players), shown: Number(r.shown), wrong: Number(r.wrong), ww: Number(r.ww), wn: Number(r.wn), nn: Number(r.nn) }));
  } catch {
    return null;
  }
}
export const adminLogs = (limit = 200) => authed((t) => rpc<AdminLogs>('admin_logs', { p_limit: limit }, t));

// ───────────────────────── Invitations d'enseignants ─────────────────────────

export interface AdminInvitation {
  code: string;
  label: string;
  max_uses: number;
  uses: number;
  revoked: boolean;
  expires: number;
  created: number;
}
export interface AdminInvitations {
  invite_only: boolean;
  items: AdminInvitation[];
}
export const adminInvitations = () => authed((t) => rpc<AdminInvitations>('admin_invitations', {}, t));
/** Crée une invitation et renvoie son code (8 caractères). */
export const adminCreateInvitation = (label: string, maxUses: number, days: number) =>
  authed((t) => rpc<string>('admin_create_invitation', { p_label: label, p_max: maxUses, p_days: days }, t));
export const adminRevokeInvitation = (code: string) => authed((t) => rpc('admin_revoke_invitation', { p_code: code }, t));
export const adminSetInviteOnly = (on: boolean) => authed((t) => rpc('admin_set_invite_only', { p_on: on }, t));

/** Noms des jeux (la liste complète, partagée avec les séances). */
export const GAME_NAME: Record<string, string> = GAME_NAMES;

/** Note le début d'une observation dans le journal de l'administration (le serveur refuse si le compte n'est pas administrateur). */
export const adminObserve = (kind: 'school' | 'student', id: string) => authed((t) => rpc<unknown>('admin_observe', { p_kind: kind, p_target: id }, t));

/** Début d'observation d'un élève : renvoie de quoi reconstituer son compte (jeton d'observation « obs: » : lecture seule, refusé par toute fonction qui écrit). */
export async function observeStudent(id: string): Promise<StudentAccount> {
  const r = (await adminObserve('student', id)) as { student: StudentAccount['student']; class: StudentAccount['class']; school: StudentAccount['school'] };
  return { token: `obs:${r.student.id}`, student: r.student, class: r.class, school: r.school };
}
