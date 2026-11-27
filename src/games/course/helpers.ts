import { LEVELS } from '../../game/course/questions';
import type { Level } from '../../game/course/questions';

export const fmt = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
export const levelLabel = (l: Level) => LEVELS.find((x) => x.id === l)?.label ?? l.toUpperCase();
