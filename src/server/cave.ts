import { ApiError, rpc } from './api';
import { freshToken } from './teacher';

/**
 * La grotte vue du serveur : une créature PAR CLASSE, nourrie par les fautes et les réussites des parties libres.
 * Tout est facultatif : une base pas encore mise à jour (fonction absente) ou un réseau coupé donne `null`,
 * et la page retombe sur les compteurs gardés sur l'appareil.
 */

export interface CaveServer {
  ink: number;
  power: number;
  games: number;
  /** date de la victoire de la classe (ms), sinon null */
  won_at: number | null;
  /** nombre de classes additionnées */
  classes: number;
}

/** Ce qu'on veut voir : l'élève connecté, ses classes (enseignant), ou — pour l'administrateur — une classe ou un élève précis. */
export type CaveSource =
  | { kind: 'student'; token: string }
  | { kind: 'teacher'; classes: string[] }
  | { kind: 'class'; classId: string }
  | { kind: 'observe-student'; studentId: string };

const clean = (v: unknown): CaveServer | null => {
  const o = v as Partial<CaveServer> & { error?: string };
  if (!o || typeof o !== 'object' || o.error || typeof o.ink !== 'number') return null;
  return {
    ink: Math.max(0, o.ink),
    power: Math.max(0, Number(o.power) || 0),
    games: Math.max(0, Number(o.games) || 0),
    won_at: typeof o.won_at === 'number' ? o.won_at : null,
    classes: Number(o.classes) || 1,
  };
};

export async function fetchCave(src: CaveSource): Promise<CaveServer | null> {
  try {
    switch (src.kind) {
      case 'student':
        return clean(await rpc('cave_get', { p_token: src.token }));
      case 'observe-student': {
        const t = await freshToken();
        return clean(await rpc('cave_get', { p_token: `obs:${src.studentId}` }, t));
      }
      case 'teacher':
      case 'class': {
        const t = await freshToken();
        return clean(await rpc('teacher_cave', { p_classes: src.kind === 'class' ? [src.classId] : src.classes }, t));
      }
    }
  } catch (e) {
    if (e instanceof ApiError && e.code === 'not_authenticated') throw e;
    return null;
  }
}

/** Victoire de la classe (élève : sa classe ; enseignant : les classes données, ou toutes les siennes). Facultatif. */
export async function sendCaveWin(src: Extract<CaveSource, { kind: 'student' | 'teacher' }>): Promise<void> {
  try {
    if (src.kind === 'student') await rpc('cave_win', { p_token: src.token });
    else await rpc('teacher_cave_win', { p_classes: src.classes }, await freshToken());
  } catch {
    /* le combat reste gagné sur cet appareil */
  }
}

/** Remise à zéro par l'enseignant. Renvoie vrai si le serveur l'a faite. */
export async function sendCaveReset(classes: string[]): Promise<boolean> {
  try {
    await rpc('teacher_cave_reset', { p_classes: classes }, await freshToken());
    return true;
  } catch {
    return false;
  }
}
