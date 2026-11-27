import { ApiError, patch, remove, request, rpc, select } from './api';
import type { ClassRow, ClassSession, NewStudent, Overview, School, SessionResultRow } from './types';
import type { GameRecent, StudentDetail } from '../game/studentView';
import type { WeakRow } from '../components/WeakPoints';

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

/**
 * Les écoles dont le compte est membre. On passe par les appartenances (lisibles par leur seul propriétaire) :
 * l'administrateur du site, qui peut lire toutes les écoles pour les observer, ne voit ainsi dans son espace que les siennes.
 */
export const listSchools = () =>
  authed(async (t) => {
    const rows = await select<Array<{ schools: (School & { created_at: string }) | null }>>('school_members', 'select=schools(id,name,created_at)', t);
    return rows
      .flatMap((r) => (r.schools ? [r.schools] : []))
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map(({ id, name }) => ({ id, name }));
  });

/** Une école précise, par son identifiant (observation en lecture seule par l'administrateur). */
export const getSchool = (id: string) =>
  authed(async (t) => (await select<School[]>('schools', `select=id,name&id=eq.${id}`, t))[0] ?? null);

export const createSchool = (name: string) =>
  authed((t) => rpc<string>('create_school', { p_name: name }, t));

/**
 * Peut-on créer une école ? Depuis la 1.11 il faut un code d'invitation donné par l'administrateur (sauf si l'administrateur
 * a désactivé cette règle). Une base pas encore mise à jour (fonction absente) n'impose rien.
 */
export async function teacherAccess(): Promise<{ inviteOnly: boolean; allowed: boolean }> {
  try {
    const r = await authed((t) => rpc<{ invite_only?: boolean; allowed?: boolean }>('my_teacher_access', {}, t));
    return { inviteOnly: r.invite_only === true, allowed: r.allowed !== false };
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return { inviteOnly: false, allowed: true };
    throw e;
  }
}

/** Saisie d'un code d'invitation : vrai si le code est valable (et le droit de créer une école est alors accordé). */
export const redeemInvitation = (code: string) => authed((t) => rpc<boolean>('redeem_invitation', { p_code: code }, t));

export const deleteSchool = (id: string) => authed((t) => rpc('delete_school', { p_school: id }, t));

export const listClasses = (school: string) =>
  authed(async (t) => {
    const q = (cols: string) => select<ClassRow[]>('classes', `select=${cols}&school_id=eq.${school}&order=name`, t);
    // base pas encore mise à jour (colonne absente) : on lit sans elle ; la case « masquer » ou le niveau ne s'affichent pas
    for (const cols of ['id,school_id,name,session_config,hide_board,grade', 'id,school_id,name,session_config,hide_board']) {
      try {
        return await q(cols);
      } catch (e) {
        if (!(e instanceof ApiError && e.status === 400)) throw e;
      }
    }
    return q('id,school_id,name,session_config');
  });

export const setBoardHidden = (cls: string, hidden: boolean) =>
  authed((t) => patch('classes', `id=eq.${cls}`, { hide_board: hidden }, t));

export const setClassGrade = (cls: string, grade: string | null) =>
  authed((t) => patch('classes', `id=eq.${cls}`, { grade }, t));

export const createClass = (school: string, name: string) =>
  authed((t) => rpc<ClassRow>('create_class', { p_school: school, p_name: name }, t));

export const deleteClass = (cls: string) => authed((t) => remove('classes', `id=eq.${cls}`, t));

export const addStudents = (cls: string, names: string[]) =>
  authed((t) => rpc<NewStudent[]>('add_students', { p_class: cls, p_names: names }, t));

export const classOverview = (cls: string) => authed((t) => rpc<Overview[]>('class_overview', { p_class: cls }, t));

/** Aperçu de chaque élève (dernier jeu, réussite récente, point faible). Absent tant que la mise à jour SQL « fiche élève » n'est pas faite. */
export interface Insight {
  id: string;
  name: string;
  last_played: number | null;
  runs_30d: number;
  /** réussite récente jeu par jeu (absent tant que la mise à jour SQL « fiche élève » n'a pas été relancée) */
  games?: GameRecent[];
  weak: { game: string; label: string; err: number } | null;
}
export async function classInsights(cls: string): Promise<Insight[] | null> {
  try {
    return await authed((t) => rpc<Insight[]>('class_insights', { p_class: cls }, t));
  } catch (e) {
    if (e instanceof ApiError && (e.status === 404 || e.status === 400)) return null;
    throw e;
  }
}

/** Ce que la classe rate le plus : une famille (rule) ou un exercice précis (item), au moins 2 élèves concernés. */
export interface ClassItem {
  game: string;
  kind: 'rule' | 'item';
  item: string;
  label: string;
  players: number;
  shown: number;
  wrong: number;
  /** % d'erreurs */
  err: number;
  picks: Record<string, number>;
}
/** null tant que la mise à jour SQL « fiche élève » n'a pas été relancée. */
export async function classItems(cls: string): Promise<ClassItem[] | null> {
  try {
    const rows = await authed((t) => rpc<ClassItem[]>('class_items', { p_class: cls }, t));
    return rows.map((r) => ({ ...r, err: Number(r.err) }));
  } catch (e) {
    if (e instanceof ApiError && (e.status === 404 || e.status === 400)) return null;
    throw e;
  }
}

/** Questions les plus ratées d'une séance (null tant que la mise à jour SQL « fiche élève » n'a pas été relancée). */
export async function sessionItems(id: string): Promise<WeakRow[] | null> {
  try {
    const rows = await authed((t) => rpc<WeakRow[]>('session_items', { p_id: id }, t));
    return rows.map((r) => ({ ...r, err: Number(r.err) }));
  } catch (e) {
    if (e instanceof ApiError && (e.status === 404 || e.status === 400)) return null;
    throw e;
  }
}

/** Fiche d'un élève : ses parties et ses compteurs d'exercices. */
export const studentDetail = (id: string) => authed((t) => rpc<StudentDetail>('student_detail', { p_student: id, p_days: 365 }, t));

export const resetClassCodes = (cls: string) => authed((t) => rpc<NewStudent[]>('reset_class_codes', { p_class: cls }, t));
export const resetCode = (student: string) => authed((t) => rpc<string>('reset_student_code', { p_student: student }, t));

/** Efface les résultats de la classe (les élèves et leurs codes sont gardés) : fin d'année. */
export const clearClassRuns = (cls: string) => authed((t) => remove('runs', `class_id=eq.${cls}`, t));

export const deleteStudent = (id: string) => authed((t) => remove('students', `id=eq.${id}`, t));

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

// ───────────────────────── Séances de classe ─────────────────────────

export const listSessions = (cls: string) => authed((t) => rpc<ClassSession[]>('list_class_sessions', { p_class: cls }, t));

export interface SessionInput {
  id?: string;
  title: string;
  game: string;
  config: Record<string, unknown>;
  maxAttempts: number;
  active: boolean;
}

/** Crée (sans id) ou modifie une séance ; renvoie son identifiant. */
export const saveSession = (cls: string, s: SessionInput) =>
  authed((t) =>
    rpc<string>(
      'save_class_session',
      { p_class: cls, p_id: s.id ?? null, p_title: s.title, p_game: s.game, p_config: s.config, p_max: s.maxAttempts, p_active: s.active },
      t,
    ),
  );

export const deleteSession = (id: string) => authed((t) => rpc('delete_class_session', { p_id: id }, t));

export const sessionResults = (id: string) => authed((t) => rpc<SessionResultRow[]>('session_results', { p_id: id }, t));
