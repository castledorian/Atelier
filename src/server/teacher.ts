import { ApiError, patch, remove, request, rpc, select } from './api';
import type { ClassRow, NewStudent, Overview, School } from './types';

// ───────────────────────── Compte enseignant (Supabase Auth) ─────────────────────────

const KEY = 'frappe.teacher.v1';

export interface TeacherSession {
  access_token: string;
  refresh_token: string;
  /** secondes (époque Unix) */
  expires_at: number;
  email: string;
}

export function loadTeacher(): TeacherSession | null {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as TeacherSession | null;
    return v && typeof v.access_token === 'string' && typeof v.refresh_token === 'string' ? v : null;
  } catch {
    return null;
  }
}
export function saveTeacher(s: TeacherSession | null) {
  try {
    if (s) localStorage.setItem(KEY, JSON.stringify(s));
    else localStorage.removeItem(KEY);
  } catch {
    /* ignoré */
  }
}

const redirectTo = () => encodeURIComponent(window.location.href.split('#')[0].split('?')[0]);

function toSession(d: unknown, fallbackEmail = ''): TeacherSession | null {
  const o = d as { access_token?: string; refresh_token?: string; expires_at?: number; expires_in?: number; user?: { email?: string } } | null;
  if (!o || typeof o.access_token !== 'string' || typeof o.refresh_token !== 'string') return null;
  return {
    access_token: o.access_token,
    refresh_token: o.refresh_token,
    expires_at: o.expires_at ?? Math.floor(Date.now() / 1000) + (o.expires_in ?? 3600),
    email: o.user?.email ?? fallbackEmail,
  };
}

export async function signIn(email: string, password: string): Promise<TeacherSession> {
  const d = await request('/auth/v1/token?grant_type=password', { method: 'POST', body: { email, password } });
  const s = toSession(d, email);
  if (!s) throw new ApiError('invalid_credentials');
  saveTeacher(s);
  return s;
}

/** Renvoie la session si l'inscription l'ouvre directement, sinon null (confirmation par email demandée). */
export async function signUp(email: string, password: string): Promise<TeacherSession | null> {
  const d = await request(`/auth/v1/signup?redirect_to=${redirectTo()}`, { method: 'POST', body: { email, password } });
  const s = toSession(d, email);
  if (s) saveTeacher(s);
  return s;
}

export async function recover(email: string) {
  await request(`/auth/v1/recover?redirect_to=${redirectTo()}`, { method: 'POST', body: { email } });
}

export async function updatePassword(token: string, password: string) {
  await request('/auth/v1/user', { method: 'PUT', body: { password }, token });
}

export async function signOut(s: TeacherSession) {
  saveTeacher(null);
  try {
    await request('/auth/v1/logout', { method: 'POST', token: s.access_token });
  } catch {
    /* hors ligne : la session locale est déjà effacée */
  }
}

/** Jeton valable (renouvelé s'il expire dans moins d'une minute). Lève not_authenticated si la session est perdue. */
export async function freshToken(): Promise<string> {
  const s = loadTeacher();
  if (!s) throw new ApiError('not_authenticated');
  if (s.expires_at - Math.floor(Date.now() / 1000) > 60) return s.access_token;
  try {
    const d = await request('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: s.refresh_token } });
    const n = toSession(d, s.email);
    if (!n) throw new ApiError('not_authenticated');
    saveTeacher(n);
    return n.access_token;
  } catch (e) {
    if (e instanceof ApiError && e.code !== 'network') {
      saveTeacher(null);
      throw new ApiError('not_authenticated');
    }
    throw e;
  }
}

/** Lien reçu par email (confirmation d'inscription ou réinitialisation) : #access_token=…&type=… */
export function takeAuthHash(): { session: TeacherSession; type: string } | null {
  const h = window.location.hash;
  if (!/access_token=/.test(h)) return null;
  const p = new URLSearchParams(h.replace(/^#/, ''));
  const at = p.get('access_token');
  const rt = p.get('refresh_token');
  if (!at || !rt) return null;
  const exp = Number(p.get('expires_at')) || Math.floor(Date.now() / 1000) + (Number(p.get('expires_in')) || 3600);
  history.replaceState(null, '', window.location.pathname + window.location.search);
  let email = '';
  try {
    email = (JSON.parse(atob(at.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))) as { email?: string }).email ?? '';
  } catch {
    /* l'email est facultatif ici */
  }
  const session: TeacherSession = { access_token: at, refresh_token: rt, expires_at: exp, email };
  saveTeacher(session);
  return { session, type: p.get('type') ?? '' };
}

// ───────────────────────── Données de l'école ─────────────────────────

const authed = async <T>(f: (token: string) => Promise<T>): Promise<T> => f(await freshToken());

export const listSchools = () =>
  authed((t) => select<School[]>('schools', 'select=id,name&order=created_at', t));

export const createSchool = (name: string) =>
  authed((t) => rpc<string>('create_school', { p_name: name }, t));

export const deleteSchool = (id: string) => authed((t) => rpc('delete_school', { p_school: id }, t));

export const listClasses = (school: string) =>
  authed((t) =>
    select<ClassRow[]>('classes', `select=id,school_id,name,session_config&school_id=eq.${school}&order=name`, t),
  );

export const createClass = (school: string, name: string) =>
  authed((t) => rpc<ClassRow>('create_class', { p_school: school, p_name: name }, t));

export const saveClassSession = (cls: string, config: Record<string, unknown> | null) =>
  authed((t) => patch('classes', `id=eq.${cls}`, { session_config: config }, t));

export const deleteClass = (cls: string) => authed((t) => remove('classes', `id=eq.${cls}`, t));

export const addStudents = (cls: string, names: string[]) =>
  authed((t) => rpc<NewStudent[]>('add_students', { p_class: cls, p_names: names }, t));

export const classOverview = (cls: string) => authed((t) => rpc<Overview[]>('class_overview', { p_class: cls }, t));

export const resetCode = (student: string) => authed((t) => rpc<string>('reset_student_code', { p_student: student }, t));

export const deleteStudent = (id: string) => authed((t) => remove('students', `id=eq.${id}`, t));

export const renameStudent = (id: string, name: string) => authed((t) => patch('students', `id=eq.${id}`, { name }, t));

/** Toutes les parties d'une classe, pour l'export CSV. */
export const classRuns = (cls: string) =>
  authed((t) =>
    select<
      Array<{ played_at: string; game: string; mode: string; kind: string; score: number; wave: number; wpm: number; acc: number; correct: number; duration: number; students: { name: string } | null }>
    >(
      'runs',
      `select=played_at,game,mode,kind,score,wave,wpm,acc,correct,duration,students(name)&class_id=eq.${cls}&order=played_at.desc&limit=5000`,
      t,
    ),
  );

// ───────────────────────── Suppression du compte ─────────────────────────

export interface DeletionPreview {
  name: string;
  members: number;
  classes: number;
  students: number;
}

/** Les écoles de l'enseignant et ce qui disparaîtrait avec son compte. */
export const accountDeletionPreview = () => authed((t) => rpc<DeletionPreview[]>('account_deletion_preview', {}, t));

/** Supprime le compte pour de bon. L'adresse e-mail doit être recopiée (le serveur la vérifie aussi). */
export const deleteMyAccount = (email: string) => authed((t) => rpc('delete_my_account', { p_email: email }, t));
