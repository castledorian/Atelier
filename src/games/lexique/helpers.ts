import { LEX_DIFFS, LEX_RELS } from '../../game/lexique/rounds';
import type { LexBoard, LexDiff, LexLevel, Rel } from '../../game/lexique/rounds';

export { fmt } from '../../game/format';
export const relLabel = (r: Rel) => LEX_RELS.find((x) => x.id === r)?.label ?? r;
export const diffLabel = (d: LexDiff) => LEX_DIFFS.find((x) => x.id === d)?.label ?? d;
/** Rel d'un classement : « famille-expert » → famille. */
export const boardRel = (b: LexBoard): Rel => b.split('-')[0] as Rel;
export const levelWord = (l: LexLevel) => l.toUpperCase();
