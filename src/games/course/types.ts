import type { CourseResult } from '../../game/course/engine';
import type { RuleId } from '../../game/encre/rules';
import type { RuleStatus } from '../../game/encre/tracker';

export type Phase = 'menu' | 'play' | 'pause' | 'over';
export type MenuView = 'main' | 'howto' | 'scores' | 'progress' | 'settings';
export type Cloud = 'off' | 'sending' | 'sent' | 'queued';

export interface Run {
  result: CourseResult;
  rank: number;
  id: string;
  record: boolean;
  encre?: {
    /** la Rature la plus présente dans cette partie */
    top: RuleId | null;
    /** Ratures apparues à la fin de cette partie */
    promoted: RuleId[];
    /** résultat du duel qui vient d'être joué */
    duel?: { rule: RuleId; before: RuleStatus; after: RuleStatus; won: boolean };
  };
}
