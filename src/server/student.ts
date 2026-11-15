import { ApiError, rpc } from './api';
import type { BoardRow, GameId, RunPayload, Scope, ServerRun, StudentAccount } from './types';

const KEY = 'frappe.student.v1';

export function loadStudent(): StudentAccount | null {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as StudentAccount | null;
    return v && typeof v.token === 'string' && v.student?.id && v.class?.id && v.school?.id ? v : null;
  } catch {
    return null;
  }
}
export function saveStudent(a: StudentAccount | null) {
  try {
    if (a) localStorage.setItem(KEY, JSON.stringify(a));
    else localStorage.removeItem(KEY);
  } catch {
    /* stockage refusé : la session durera jusqu'à la fermeture de la page */
  }
}

export async function studentLogin(code: string): Promise<StudentAccount> {
  const r = await rpc<StudentAccount & { error?: string }>('student_login', { p_code: code });
  if (r.error || !r.token) throw new ApiError(r.error ?? 'invalid_code');
  return { token: r.token, student: r.student, class: r.class, school: r.school };
}

export async function studentLogout(token: string) {
  try {
    await rpc('student_logout', { p_token: token });
  } catch {
    /* hors ligne : la session expirera d'elle-même */
  }
}

/** Renvoie true si le serveur a enregistré la partie ; false si la session n'est plus valable ; lève en cas de réseau. */
export async function sendRun(token: string, r: RunPayload): Promise<'ok' | 'invalid_session' | 'invalid_data'> {
  const res = await rpc<{ ok?: boolean; error?: string }>('submit_run', {
    p_token: token,
    p_client_id: r.clientId,
    p_game: r.game,
    p_mode: r.mode,
    p_kind: r.kind,
    p_score: Math.round(r.score),
    p_wave: Math.round(r.wave),
    p_wpm: Math.round(r.wpm * 10) / 10,
    p_acc: Math.round(r.acc * 10) / 10,
    p_correct: Math.round(r.correct),
    p_duration: Math.round(r.duration),
    p_played_ms: Math.round(r.playedMs),
  });
  if (res.ok) return 'ok';
  if (res.error === 'rate_limited') throw new ApiError('network'); // on réessaiera plus tard
  return res.error === 'invalid_session' ? 'invalid_session' : 'invalid_data';
}

export async function fetchBoard(token: string, game: GameId, mode: string, scope: Scope, limit = 10): Promise<BoardRow[]> {
  const r = await rpc<{ ok?: boolean; rows?: BoardRow[]; error?: string }>('class_leaderboard', {
    p_token: token,
    p_game: game,
    p_mode: mode,
    p_scope: scope,
    p_limit: limit,
  });
  if (!r.ok || !Array.isArray(r.rows)) throw new ApiError(r.error ?? 'invalid_session');
  return r.rows;
}

export async function fetchMyRuns(token: string, game: GameId | null): Promise<ServerRun[]> {
  const r = await rpc<{ ok?: boolean; rows?: ServerRun[]; error?: string }>('my_runs', { p_token: token, p_game: game, p_limit: 200 });
  if (!r.ok || !Array.isArray(r.rows)) throw new ApiError(r.error ?? 'invalid_session');
  return r.rows;
}
