import type { MemoryResult } from '../../game/memory/engine';

export type Phase = 'menu' | 'play' | 'pause' | 'over';
export type MenuView = 'main' | 'howto' | 'scores' | 'progress' | 'settings';
export type Cloud = 'off' | 'sending' | 'sent' | 'queued';

export interface Run {
  result: MemoryResult;
  rank: number;
  id: string;
  record: boolean;
  /** plus longue suite de la partie précédente (0 si c'est la première) */
  prevSpan: number;
  stampsBefore: number;
  stampsAfter: number;
}
