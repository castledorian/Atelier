import type { LexResult } from '../../game/lexique/engine';

export type Phase = 'menu' | 'play' | 'pause' | 'over';
export type MenuView = 'main' | 'howto' | 'scores' | 'progress' | 'settings';
export type Cloud = 'off' | 'sending' | 'sent' | 'queued';

export interface Run {
  result: LexResult;
  rank: number;
  id: string;
  record: boolean;
}
