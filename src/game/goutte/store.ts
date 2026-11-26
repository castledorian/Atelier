import { ITEMS, cleanCounters, cleanLook, defaultLook, emptyCounters, gainBetween, mergeCounters, progressOf, treatsEarned, unlocked, wearable } from './rules';
import type { Counters, Gain, GameId, Look, Progress } from './rules';
import { FOODS, foodAt, seedOf, tastedIds } from './foods';
import type { Food } from './foods';
import { FULL, JOY_HOURS, PETS_PER_DAY, SAT_HOURS, bump, cleanNeed, liveMood, needNow } from './needs';
import type { LiveMood, Need } from './needs';

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
/**
 * Interrupteur : false masque « Ma goutte » pour tout le monde (barre de l'accueil, page, annonce après partie, onglet d'observation).
 * Les parties continuent d'être comptées (sur l'appareil et sur le serveur) : rien n'est perdu quand on la rallume.
 */
export const GOUTTE_ON = true;

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
  /** ventre et bonheur (appareil seulement) */
  sat: Need;
  joy: Need;
  /** câlins du jour : [jour, nombre] */
  pets: [string, number];
  /** objets déjà montrés à l'élève (les autres seront « déballés ») ; null = jamais ouvert */
  seen: string[] | null;
}

interface ServerCopy {
  counters: Counters;
  look: Look | null;
  fed: number;
}

const start = (): Need => ({ v: 60, at: Date.now() });
const blank = (): Local => ({ counters: emptyCounters(), best: {}, lastDay: '', look: null, fed: 0, dirty: false, sat: start(), joy: start(), pets: ['', 0], seen: null });

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
    sat: cleanNeed(v.sat, start()),
    joy: cleanNeed(v.joy, start()),
    pets: Array.isArray(v.pets) && typeof v.pets[0] === 'string' && typeof v.pets[1] === 'number' ? [v.pets[0].slice(0, 10), Math.max(0, Math.floor(v.pets[1]))] : ['', 0],
    seen: Array.isArray(v.seen) ? v.seen.filter((x): x is string => typeof x === 'string').slice(0, 200) : null,
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
  /** ventre et bonheur (0 à 100) ; null en lecture seule (observation : on ne les connaît pas) */
  sat: number | null;
  joy: number | null;
  mood: LiveMood;
  /** graine des friandises de cet élève */
  seed: number;
}

/** Une vue construite seulement à partir d'une réponse du serveur (observation en lecture seule). */
export function viewOf(counters: Counters, look: Look | null, fed: number, ownerId = 'invite'): GoutteView {
  const seed = seedOf(ownerId);
  const progress = progressOf(counters, fed, tastedIds(seed, fed).size);
  const mood = liveMood(60, 60, counters.last);
  return { counters, look: wearable(look ?? defaultLook(), progress), fed, progress, treatsLeft: Math.max(0, treatsEarned(counters) - fed), sat: null, joy: null, mood, seed };
}

export function currentView(seed = 0): GoutteView {
  const l = loadLocal();
  const s = loadServer();
  const counters = s ? mergeCounters(l.counters, s.counters) : l.counters;
  const fed = Math.max(l.fed, s?.fed ?? 0);
  const fs = seedOf(owner);
  const progress = progressOf(counters, fed, tastedIds(fs, fed).size);
  const look = wearable(l.dirty ? (l.look ?? s?.look ?? defaultLook(seed)) : (s?.look ?? l.look ?? defaultLook(seed)), progress);
  const now = Date.now();
  const sat = needNow(l.sat, SAT_HOURS, now);
  const joy = needNow(l.joy, JOY_HOURS, now);
  return { counters, look, fed, progress, treatsLeft: Math.max(0, treatsEarned(counters) - fed), sat, joy, mood: liveMood(sat, joy, counters.last, now), seed: fs };
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
  // une partie rend la goutte heureuse (même perdue : c'est l'effort qui compte)
  l.joy = bump(l.joy, 15, JOY_HOURS, now);
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

/** La goutte peut-elle manger maintenant ? */
export type FeedBlock = 'none-left' | 'full' | null;
export const feedBlock = (v: GoutteView): FeedBlock => (v.treatsLeft <= 0 ? 'none-left' : v.sat !== null && v.sat >= FULL ? 'full' : null);

/** Ce qui vient d'être mangé (pour l'animation). */
export interface Meal {
  food: Food;
  /** première fois qu'elle goûte cette saveur */
  first: boolean;
  view: GoutteView;
}

/** Donne la prochaine friandise de la boîte à goûter (s'il en reste et si elle a faim). */
export function feedMeal(now: number = Date.now()): Meal | null {
  const v = currentView();
  if (feedBlock(v)) return null;
  const food = foodAt(v.seed, v.fed + 1);
  const first = !tastedIds(v.seed, v.fed).has(food.id);
  const l = loadLocal();
  l.fed = v.fed + 1;
  l.dirty = true;
  l.sat = bump(l.sat, food.fill, SAT_HOURS, now);
  l.joy = bump(l.joy, food.joy, JOY_HOURS, now);
  write(key(), l);
  return { food, first, view: currentView() };
}

/** Donne une friandise (s'il en reste) : raccourci sans animation. */
export const feed = (): GoutteView | null => feedMeal()?.view ?? null;

/** Une caresse : la goutte rit ; les 3 premières du jour la rendent un peu plus heureuse. */
export function pet(now: number = Date.now()): { view: GoutteView; counted: boolean } {
  const l = loadLocal();
  const day = parisDay(now);
  const n = l.pets[0] === day ? l.pets[1] : 0;
  const counted = n < PETS_PER_DAY;
  l.pets = [day, n + 1];
  if (counted) l.joy = bump(l.joy, 6, JOY_HOURS, now);
  write(key(), l);
  return { view: currentView(), counted };
}

/** Objets débloqués que l'élève n'a pas encore « déballés » (la première fois, les objets de départ comptent comme vus). */
export function unseenItems(v: GoutteView): string[] {
  const open = ITEMS.filter((i) => unlocked(i, v.progress)).map((i) => i.id);
  const l = loadLocal();
  if (l.seen === null) {
    const starters = ITEMS.filter((i) => 'level' in i.unlock && i.unlock.level <= 1).map((i) => i.id);
    l.seen = starters;
    write(key(), l);
  }
  const seen = new Set(l.seen);
  return open.filter((id) => !seen.has(id));
}

export function markSeen(ids: string[]) {
  const l = loadLocal();
  l.seen = [...new Set([...(l.seen ?? []), ...ids])];
  write(key(), l);
}

/** Pour les tests et l'affichage : toutes les saveurs. */
export { FOODS };

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

