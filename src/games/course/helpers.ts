import { LEVELS } from '../../game/course/questions';
import type { Level } from '../../game/course/questions';
import type { TextSize } from '../../game/storage';

export const TEXT_LABEL: Record<TextSize, string> = { normal: 'normal', large: 'grand', xlarge: 'très grand' };
export const NEXT_SIZE: Record<TextSize, TextSize> = { normal: 'large', large: 'xlarge', xlarge: 'normal' };
export const fmt = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
export const levelLabel = (l: Level) => LEVELS.find((x) => x.id === l)?.label ?? l.toUpperCase();
