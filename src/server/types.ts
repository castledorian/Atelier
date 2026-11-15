export type GameId = 'typing' | 'math';

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
}
export interface Overview {
  id: string;
  name: string;
  access_code: string;
  games: number;
  drills: number;
  best_typing: number | null;
  best_math: number | null;
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
