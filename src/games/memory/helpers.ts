import { MEM_DIFFS, MODES } from '../../game/memory/rounds';
import type { MemBoard, MemDiff, Mode } from '../../game/memory/rounds';
import { loadMemoryScores } from '../../game/memory/scores';

export const fmt = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
/** Plus longue suite (ou plus grand nombre de taches) déjà réussie sur cet appareil. */
export const boardMode = (b: MemBoard): Mode => (b.startsWith('cases') ? 'cases' : 'suite');
export const diffLabel = (d: MemDiff) => MEM_DIFFS.find((x) => x.id === d)?.label ?? d;
export const bestSpan = (b: MemBoard) => loadMemoryScores(b).reduce((a, x) => Math.max(a, x.span), 0);
export const modeLabel = (m: Mode) => MODES.find((x) => x.id === m)?.label ?? m;
export const spanLabel = (m: Mode) => (m === 'suite' ? 'Suite max' : 'Cases max');
