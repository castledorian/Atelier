import { rpc } from './api';
import { freshToken } from './teacher';

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
export const adminItemStats = () => authed((t) => rpc<AdminItems>('admin_item_stats', {}, t));
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

export const GAME_NAME: Record<string, string> = {
  typing: 'Frappe !',
  math: 'Course à l’encre',
  memory: 'Mémoire d’encre',
  spelling: 'Chasse aux fautes',
};
