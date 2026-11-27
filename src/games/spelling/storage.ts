import { RETRY_MAX } from '../../game/spelling/engine';
import type { Item } from '../../game/spelling/engine';

const SEEN_KEY = 'atelier.spelling.seen.v2';
export const loadSeen = (): string[] => {
  try {
    const v = JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
};
/** On retient les dernières phrases jouées : la partie suivante en propose d'autres. */
export const rememberSeen = (ids: string[]) => {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify([...loadSeen(), ...ids].slice(-30)));
  } catch {
    /* ignoré */
  }
};

export const RETRY_KEY = 'atelier.spelling.retry.v2';
export const loadRetry = (): string[] => {
  try {
    const v = JSON.parse(localStorage.getItem(RETRY_KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string').slice(0, RETRY_MAX) : [];
  } catch {
    return [];
  }
};
/** Les phrases ratées reviendront la prochaine fois ; celles qu'on vient de revoir et réussies sortent de la liste. */
export const saveRetry = (before: string[], used: ReadonlySet<string>, missed: readonly Item[]) => {
  try {
    const kept = before.filter((id) => !used.has(id));
    const again = missed.map((m) => m.id);
    localStorage.setItem(RETRY_KEY, JSON.stringify([...new Set([...again, ...kept])].slice(0, RETRY_MAX)));
  } catch {
    /* ignoré */
  }
};
export const TUTO_KEY = 'atelier.spelling.tuto.v1';
export const tutoSeen = (): boolean => {
  try {
    const seen = localStorage.getItem(TUTO_KEY) === '1';
    localStorage.setItem(TUTO_KEY, '1');
    return seen;
  } catch {
    return true;
  }
};
