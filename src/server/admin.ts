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
export const adminLogs = (limit = 200) => authed((t) => rpc<AdminLogs>('admin_logs', { p_limit: limit }, t));

export const GAME_NAME: Record<string, string> = {
  typing: 'Frappe !',
  math: 'Course à l’encre',
  memory: 'Mémoire d’encre',
  spelling: 'Chasse aux fautes',
};
