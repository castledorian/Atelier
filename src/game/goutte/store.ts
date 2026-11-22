import { cleanCounters, cleanLook, defaultLook, emptyCounters, gainBetween, mergeCounters, progressOf, treatsEarned, wearable } from './rules';
import type { Counters, Gain, GameId, Look, Progress } from './rules';

/**
 * La goutte sur cet appareil : compteurs d'effort, records personnels, apparence, friandises données.
 * Pour un élève connecté, le serveur fait foi (il recompte depuis les parties reçues) ; on garde ici sa dernière réponse
 * pour que tout s'affiche tout de suite, même hors ligne, et on prend toujours le plus haut des deux (rien ne recule).
 */

/** Chaque élève a sa goutte, même sur une tablette partagée : les clés portent l'identifiant de l'élève (« invite » sans compte). */
let owner = 'invite';
export function setGoutteOwner(id: string | null) {
  owner = id && /^[A-Za-z0-9-]{1,60}$/.test(id) ? id : 'invite';
}
const key = () => `atelier.goutte.v1:${owner}`;
const serverKey = () => `atelier.goutte.server.v1:${owner}`;
/** Annonce envoyée à la page après une partie (le bandeau « +10 XP » l'écoute). */
export const GAIN_EVENT = 'atelier:goutte';

interface Local {
  counters: Counters;
  /** meilleur score par jeu et classement (« math|cm1-expert ») : pour repérer un record personnel */
  best: Record<string, number>;
  /** dernier jour joué (AAAA-MM-JJ, heure de Paris) : un nouveau jour compte une fois */
  lastDay: string;
  look: Look | null;
  fed: number;
  /** l'apparence ou les friandises ont changé et n'ont pas encore été envoyées */
  dirty: boolean;
}

interface ServerCopy {
  counters: Counters;
  look: Look | null;
  fed: number;
}

const blank = (): Local => ({ counters: emptyCounters(), best: {}, lastDay: '', look: null, fed: 0, dirty: false });

function read<T>(key: string): T | null {
  try {
    return JSON.parse(localStorage.getItem(key) ?? 'null') as T | null;
  } catch {
    return null;
  }
}
function write(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* stockage refusé : la goutte est un bonus */
  }
}

export function loadLocal(): Local {
  const v = read<Partial<Local>>(key());
  if (!v || typeof v !== 'object') return blank();
  const best: Record<string, number> = {};
  if (v.best && typeof v.best === 'object') for (const [k, n] of Object.entries(v.best)) if (typeof n === 'number' && Number.isFinite(n) && k.length <= 60) best[k] = n;
  return {
    counters: cleanCounters(v.counters),
    best,
    lastDay: typeof v.lastDay === 'string' ? v.lastDay.slice(0, 10) : '',
    look: v.look ? cleanLook(v.look) : null,
    fed: typeof v.fed === 'number' && v.fed > 0 ? Math.floor(v.fed) : 0,
    dirty: v.dirty === true,
  };
}

const loadServer = (): ServerCopy | null => {
  const v = read<Partial<ServerCopy>>(serverKey());
  if (!v || typeof v !== 'object') return null;
  return { counters: cleanCounters(v.counters), look: v.look ? cleanLook(v.look) : null, fed: typeof v.fed === 'number' ? Math.max(0, Math.floor(v.fed)) : 0 };
};

/** Ce que montre l'écran : le plus haut de l'appareil et du serveur. */
export interface GoutteView {
  counters: Counters;
  look: Look;
  fed: number;
  progress: Progress;
  treatsLeft: number;
}

/** Une vue construite seulement à partir d'une réponse du serveur (observation en lecture seule). */
export function viewOf(counters: Counters, look: Look | null, fed: number): GoutteView {
  const progress = progressOf(counters, fed);
  return { counters, look: wearable(look ?? defaultLook(), progress), fed, progress, treatsLeft: Math.max(0, treatsEarned(counters) - fed) };
}

export function currentView(seed = 0): GoutteView {
  const l = loadLocal();
  const s = loadServer();
  const counters = s ? mergeCounters(l.counters, s.counters) : l.counters;
  const fed = Math.max(l.fed, s?.fed ?? 0);
  const progress = progressOf(counters, fed);
  const look = wearable(l.dirty ? (l.look ?? s?.look ?? defaultLook(seed)) : (s?.look ?? l.look ?? defaultLook(seed)), progress);
  return { counters, look, fed, progress, treatsLeft: Math.max(0, treatsEarned(counters) - fed) };
}

const parisDay = (t: number) => new Date(t).toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });

/**
 * Une partie vient de se terminer (appelé par chaque jeu, avec ou sans compte) : compteurs, record personnel, annonce des gains.
 * `seconds` : durée si on la connaît. Une partie de moins de 20 secondes ne compte pas (comme sur le serveur).
 */
export function noteGame(game: GameId, board: string, score: number, seconds?: number, now: number = Date.now()): Gain | null {
  if (seconds !== undefined && seconds < 20) return null;
  const before = currentView();
  const l = loadLocal();
  const bk = `${game}|${board}`.slice(0, 60);
  const prev = l.best[bk];
  const record = prev !== undefined && score > prev;
  if (prev === undefined || score > prev) l.best[bk] = score;
  const day = parisDay(now);
  const c = l.counters;
  l.counters = {
    ...c,
    runs: { ...c.runs, [game]: (c.runs[game] ?? 0) + 1 },
    days: c.days + (day !== l.lastDay ? 1 : 0),
    records: c.records + (record ? 1 : 0),
    minutes: c.minutes + (seconds ? Math.round(seconds / 60) : 0),
    last: now,
  };
  l.lastDay = day;
  write(key(), l);
  const after = currentView();
  const gain = gainBetween(before.progress, after.progress);
  try {
    window.dispatchEvent(new CustomEvent<Gain>(GAIN_EVENT, { detail: gain }));
  } catch {
    /* hors navigateur (tests) */
  }
  return gain;
}

/** Donne une friandise (s'il en reste). */
export function feed(): GoutteView | null {
  const v = currentView();
  if (v.treatsLeft <= 0) return null;
  const l = loadLocal();
  l.fed = v.fed + 1;
  l.dirty = true;
  write(key(), l);
  return currentView();
}

export function setLook(look: Look): GoutteView {
  const l = loadLocal();
  l.look = cleanLook(look);
  l.dirty = true;
  write(key(), l);
  return currentView();
}

/** Réponse du serveur reçue : on la garde (et l'appareil n'a plus rien à envoyer si l'envoi vient de réussir). */
export function storeServer(copy: { counters: unknown; look: unknown; fed: unknown }, sent = false) {
  write(serverKey(), {
    counters: cleanCounters(copy.counters),
    look: copy.look && typeof copy.look === 'object' && Object.keys(copy.look).length ? cleanLook(copy.look) : null,
    fed: typeof copy.fed === 'number' ? copy.fed : 0,
  });
  if (sent) {
    const l = loadLocal();
    l.dirty = false;
    write(key(), l);
  }
}

export const needsSend = (): boolean => loadLocal().dirty;

