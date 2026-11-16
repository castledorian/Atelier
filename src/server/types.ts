export type GameId = 'typing' | 'math' | 'memory' | 'spelling';

export interface StudentAccount {
  token: string;
  student: { id: string; name: string };
  class: { id: string; name: string; session_config: Record<string, unknown> | null };
  school: { id: string; name: string };
}

export interface BoardRow {
  rank: number;
  name: string;
  score: number;
  wave: number;
  wpm: number;
  acc: number;
  is_me: boolean;
}

export type Scope = 'class' | 'school';

export interface RunPayload {
  clientId: string;
  game: GameId;
  mode: string;
  kind: 'game' | 'drill';
  score: number;
  wave: number;
  wpm: number;
  acc: number;
  correct: number;
  duration: number;
  playedMs: number;
  /** partie jouée dans une séance de classe (essais limités) */
  sessionId?: string;
  /** résumé anonyme pour régler la difficulté (jamais lié à l'élève) */
  balance?: Record<string, unknown>;
}

/** Séance de classe vue par l'élève. */
export interface SessionInfo {
  id: string;
  title: string;
  game: GameId;
  config: Record<string, unknown>;
  max_attempts: number;
  attempts_used: number;
  best_score: number | null;
  active: boolean;
}

/** Séance de classe vue par l'enseignant. */
export interface ClassSession {
  id: string;
  title: string;
  game: GameId;
  config: Record<string, unknown>;
  max_attempts: number;
  active: boolean;
  created: number;
  done: number;
  total: number;
}

export interface SessionResultRow {
  id: string;
  name: string;
  attempts: number;
  best_score: number | null;
  runs: Array<{ score: number; wave: number; wpm: number; acc: number; duration: number; at: number }>;
}

export interface ServerRun {
  id: string;
  date: number;
  game: string;
  mode: string;
  kind: 'game' | 'drill';
  score: number;
  wave: number;
  wpm: number;
  acc: number;
  correct: number;
  duration: number;
}

export interface School {
  id: string;
  name: string;
}
export interface ClassRow {
  id: string;
  school_id: string;
  name: string;
  session_config: Record<string, unknown> | null;
  /** absent tant que la mise à jour SQL « classement » n'est pas faite */
  hide_board?: boolean;
}
export interface ClassWeek {
  games: number;
  players: number;
}
export interface Overview {
  id: string;
  name: string;
  access_code: string;
  games: number;
  drills: number;
  best_typing: number | null;
  best_math: number | null;
  /** absent tant que la mise à jour SQL « mémoire » n'a pas été appliquée */
  best_memory?: number | null;
  avg_wpm: number | null;
  avg_acc: number | null;
  seconds: number;
  last_played: number | null;
}
export interface NewStudent {
  id: string;
  name: string;
  access_code: string;
}
