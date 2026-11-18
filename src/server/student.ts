import { isGrade } from '../game/grade';
import type { Grade } from '../game/grade';
import { ITEM_STATS_VERSION } from '../game/itemstats';
import type { ItemEntry } from '../game/itemstats';
import { ApiError, rpc } from './api';
import type { BoardRow, ClassWeek, GameId, RunPayload, Scope, ServerRun, SessionInfo, StudentAccount } from './types';

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

export type SendStatus = 'ok' | 'invalid_session' | 'invalid_data' | 'no_attempts_left' | 'session_closed' | 'cheat';

/** Évènement émis quand le serveur refuse une partie impossible : l'écran affiche alors le message « félicitations ». */
export const CHEAT_EVENT = 'atelier:cheat';

/**
 * Envoie les compteurs anonymes de la partie (quels calculs ou phrases ont été ratés), pour régler la difficulté.
 * À appeler seulement après l'envoi réussi d'une partie libre. Facultatif : toute erreur est ignorée
 * (réseau coupé, mise à jour SQL « exercices » pas encore faite…).
 */
export async function sendItemStats(token: string, game: 'math' | 'spelling', level: string, difficulty: string, items: ItemEntry[]): Promise<void> {
  if (items.length === 0) return;
  try {
    await rpc('submit_item_stats', { p_token: token, p_game: game, p_level: level, p_difficulty: difficulty, p_version: ITEM_STATS_VERSION, p_items: items });
  } catch {
    /* le suivi est un bonus : il ne doit jamais gêner la partie */
  }
}

/** Envoie une partie (libre ou de séance). Lève en cas de réseau ; renvoie l'état d'essais pour une séance. */
export async function submitRun(token: string, r: RunPayload): Promise<{ status: SendStatus; attemptsUsed?: number }> {
  const base = {
    p_token: token,
    p_client_id: r.clientId,
    p_score: Math.round(r.score),
    p_wave: Math.round(r.wave),
    p_wpm: Math.round(r.wpm * 10) / 10,
    p_acc: Math.round(r.acc * 10) / 10,
    p_correct: Math.round(r.correct),
    p_duration: Math.round(r.duration),
    p_played_ms: Math.round(r.playedMs),
  };
  const res = r.sessionId
    ? await rpc<{ ok?: boolean; error?: string; attempts_used?: number }>('submit_session_run', { ...base, p_session: r.sessionId })
    : await rpc<{ ok?: boolean; error?: string; attempts_used?: number }>('submit_run', {
        ...base,
        p_game: r.game,
        p_mode: r.mode,
        p_kind: r.kind,
        ...(r.balance ? { p_balance: r.balance } : {}),
      });
  if (res.ok) return { status: 'ok', attemptsUsed: res.attempts_used };
  if (res.error === 'rate_limited') throw new ApiError('network'); // on réessaiera plus tard
  if (res.error === 'invalid_session') return { status: 'invalid_session' };
  if (res.error === 'cheat') {
    window.dispatchEvent(new Event(CHEAT_EVENT));
    return { status: 'cheat' };
  }
  if (res.error === 'no_attempts_left' || res.error === 'session_closed') return { status: res.error };
  return { status: 'invalid_data' };
}

/** Renvoie l'état de la partie envoyée ; lève en cas de réseau. */
export async function sendRun(token: string, r: RunPayload): Promise<'ok' | 'invalid_session' | 'invalid_data'> {   // « cheat » est traité comme « invalid_data » : la partie refusée n'est jamais renvoyée
  const { status } = await submitRun(token, r);
  return status === 'ok' || status === 'invalid_session' ? status : 'invalid_data';
}

/** Les séances de la classe, avec les essais déjà utilisés par l'élève. */
/** Séances de l'élève et niveau de sa classe (null tant que l'enseignant ne l'a pas fixé). */
export async function fetchSessionsInfo(token: string): Promise<{ sessions: SessionInfo[]; grade: Grade | null }> {
  const r = await rpc<{ ok?: boolean; sessions?: SessionInfo[]; grade?: unknown; error?: string }>('my_sessions', { p_token: token });
  if (!r.ok || !Array.isArray(r.sessions)) throw new ApiError(r.error ?? 'invalid_session');
  return { sessions: r.sessions, grade: isGrade(r.grade) ? r.grade : null };
}

export async function fetchSessions(token: string): Promise<SessionInfo[]> {
  return (await fetchSessionsInfo(token)).sessions;
}

export async function fetchBoard(token: string, game: GameId, mode: string, scope: Scope, limit = 10): Promise<BoardRow[]> {
  const r = await rpc<{ ok?: boolean; hidden?: boolean; rows?: BoardRow[]; error?: string }>('class_leaderboard', {
    p_token: token,
    p_game: game,
    p_mode: mode,
    p_scope: scope,
    p_limit: limit,
  });
  if (!r.ok || !Array.isArray(r.rows)) throw new ApiError(r.error ?? 'invalid_session');
  if (r.hidden) throw new ApiError('board_hidden');
  return r.rows;
}

/** Objectif collectif : parties jouées par la classe depuis 7 jours (indisponible tant que la base n'est pas à jour). */
export async function fetchClassWeek(token: string): Promise<ClassWeek | null> {
  try {
    const r = await rpc<{ ok?: boolean; games?: number; players?: number; error?: string }>('class_week', { p_token: token });
    if (r.error === 'invalid_session') throw new ApiError('invalid_session');
    if (!r.ok) return null;
    return { games: Number(r.games) || 0, players: Number(r.players) || 0 };
  } catch (e) {
    if (e instanceof ApiError && e.code === 'invalid_session') throw e;
    return null;
  }
}

export async function fetchMyRuns(token: string, game: GameId | null): Promise<ServerRun[]> {
  const r = await rpc<{ ok?: boolean; rows?: ServerRun[]; error?: string }>('my_runs', { p_token: token, p_game: game, p_limit: 200 });
  if (!r.ok || !Array.isArray(r.rows)) throw new ApiError(r.error ?? 'invalid_session');
  return r.rows;
}
