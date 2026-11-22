import { ApiError, rpc } from './api';
import { freshToken } from './teacher';
import type { CaveSource } from './cave';
import { cleanCounters, cleanLook } from '../game/goutte/rules';
import type { Counters, Look } from '../game/goutte/rules';

/**
 * La goutte et l'équipe vues du serveur (mise à jour SQL « goutte »). Tout est facultatif : une base pas encore à jour
 * ou un réseau coupé donne `null`, et l'écran garde ce qui est sur l'appareil.
 */

export interface GoutteServer {
  /** apparence choisie (null si l'élève n'a encore rien choisi) */
  look: Look | null;
  fed: number;
  counters: Counters;
}

const cleanAnswer = (v: unknown): GoutteServer | null => {
  const o = v as { error?: string; look?: unknown; fed?: unknown; counters?: unknown } | null;
  if (!o || typeof o !== 'object' || o.error || !o.counters) return null;
  const hasLook = o.look && typeof o.look === 'object' && Object.keys(o.look).length > 0;
  return { look: hasLook ? cleanLook(o.look) : null, fed: typeof o.fed === 'number' ? Math.max(0, o.fed) : 0, counters: cleanCounters(o.counters) };
};

export async function fetchGoutte(token: string): Promise<GoutteServer | null> {
  try {
    const t = token.startsWith('obs:') ? await freshToken() : undefined;
    return cleanAnswer(await rpc('goutte_get', { p_token: token }, t));
  } catch {
    return null;
  }
}

export async function saveGoutte(token: string, look: Look, fed: number): Promise<GoutteServer | null> {
  try {
    return cleanAnswer(await rpc('goutte_save', { p_token: token, p_look: look, p_fed: fed }));
  } catch {
    return null;
  }
}

/** Un membre de l'équipe de la classe : son prénom, sa goutte, son expérience. */
export interface Teammate {
  id: string;
  name: string;
  look: Look | null;
  xp: number;
}

export interface Team {
  /** l'élève connecté (pour marquer « toi »), null côté enseignant */
  me: string | null;
  team: Teammate[];
}

const cleanTeam = (v: unknown): Team | null => {
  const o = v as { error?: string; me?: unknown; team?: unknown } | null;
  if (!o || typeof o !== 'object' || o.error || !Array.isArray(o.team)) return null;
  return {
    me: typeof o.me === 'string' ? o.me : null,
    team: o.team
      .filter((m): m is { id: string; name: string; look?: unknown; xp?: unknown } => !!m && typeof m === 'object' && typeof (m as { name?: unknown }).name === 'string')
      .slice(0, 120)
      .map((m, i) => ({
        id: typeof m.id === 'string' ? m.id : String(i),
        name: m.name.slice(0, 24),
        look: m.look && typeof m.look === 'object' && Object.keys(m.look).length ? cleanLook(m.look, i) : null,
        xp: typeof m.xp === 'number' ? Math.max(0, m.xp) : 0,
      })),
  };
};

export async function fetchTeam(src: CaveSource): Promise<Team | null> {
  try {
    switch (src.kind) {
      case 'student':
        return cleanTeam(await rpc('goutte_team', { p_token: src.token }));
      case 'observe-student':
        return cleanTeam(await rpc('goutte_team', { p_token: `obs:${src.studentId}` }, await freshToken()));
      case 'teacher':
      case 'class':
        return cleanTeam(await rpc('teacher_goutte_team', { p_classes: src.kind === 'class' ? [src.classId] : src.classes }, await freshToken()));
    }
  } catch (e) {
    if (e instanceof ApiError && e.code === 'not_authenticated') throw e;
    return null;
  }
}

/** Un jour de la grotte : fautes avalées et réussites de la classe ce jour-là. */
export interface CaveDay {
  d: string;
  ink: number;
  power: number;
}

const cleanDays = (v: unknown): CaveDay[] | null => {
  const o = v as { error?: string; days?: unknown } | null;
  if (!o || typeof o !== 'object' || o.error || !Array.isArray(o.days)) return null;
  return o.days
    .filter((x): x is { d: string; ink: unknown; power: unknown } => !!x && typeof x === 'object' && typeof (x as { d?: unknown }).d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test((x as { d: string }).d))
    .map((x) => ({ d: x.d, ink: Number(x.ink) || 0, power: Math.max(0, Number(x.power) || 0) }));
};

export async function fetchCaveHistory(src: CaveSource): Promise<CaveDay[] | null> {
  try {
    switch (src.kind) {
      case 'student':
        return cleanDays(await rpc('cave_history', { p_token: src.token }));
      case 'observe-student':
        return cleanDays(await rpc('cave_history', { p_token: `obs:${src.studentId}` }, await freshToken()));
      case 'teacher':
      case 'class':
        return cleanDays(await rpc('teacher_cave_history', { p_classes: src.kind === 'class' ? [src.classId] : src.classes }, await freshToken()));
    }
  } catch {
    return null;
  }
}
