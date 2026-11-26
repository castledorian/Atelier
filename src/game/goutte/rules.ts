/**
 * « Ma goutte » : la goutte guerrière de l'élève, qui grandit quand il joue.
 *
 * Principe pédagogique : on récompense l'EFFORT et le PROGRÈS, jamais le niveau scolaire.
 * Un élève en difficulté qui joue régulièrement monte aussi vite qu'un très bon élève :
 *   - chaque partie terminée (au moins 20 secondes), chaque jour où l'on vient jouer, chaque séance de classe faite ;
 *   - chaque RECORD PERSONNEL battu (on se compare à soi-même, jamais aux autres).
 * Rien ne se perd : pas de vie, pas de punition. Une goutte qu'on n'a pas vue depuis longtemps dort, et se réveille contente.
 *
 * Ces règles sont les mêmes sur l'appareil et sur le serveur : le serveur calcule les compteurs depuis les parties reçues
 * (impossible de tricher en modifiant le navigateur), et la formule d'expérience est recopiée dans private.goutte_xp (voir SQL).
 */

/** Nombre de saveurs à découvrir (recopié de foods.ts pour éviter une dépendance circulaire ; vérifié par les tests). */
export const TASTE_TOTAL = 12;

export type GameId = 'typing' | 'math' | 'spelling' | 'memory' | 'lexique' | 'facteur';
export const GAME_IDS: readonly GameId[] = ['typing', 'math', 'spelling', 'memory', 'lexique', 'facteur'];

/** Ce que l'élève a fait (compteurs d'effort). */
export interface Counters {
  /** parties terminées, par jeu */
  runs: Partial<Record<GameId, number>>;
  /** jours différents où il a joué */
  days: number;
  /** records personnels battus */
  records: number;
  /** séances de classe jouées */
  sessions: number;
  /** minutes de jeu */
  minutes: number;
  /** dernière partie (ms, 0 si jamais) */
  last: number;
}

export const emptyCounters = (): Counters => ({ runs: {}, days: 0, records: 0, sessions: 0, minutes: 0, last: 0 });

export const totalRuns = (c: Counters): number => GAME_IDS.reduce((n, g) => n + (c.runs[g] ?? 0), 0);
export const gamesTried = (c: Counters): number => GAME_IDS.filter((g) => (c.runs[g] ?? 0) > 0).length;

/** Les compteurs ne font que monter : on garde le plus haut de chaque (appareil et serveur, ou ancien et nouveau). */
export function mergeCounters(a: Counters, b: Counters): Counters {
  const runs: Partial<Record<GameId, number>> = {};
  for (const g of GAME_IDS) {
    const n = Math.max(a.runs[g] ?? 0, b.runs[g] ?? 0);
    if (n > 0) runs[g] = n;
  }
  return {
    runs,
    days: Math.max(a.days, b.days),
    records: Math.max(a.records, b.records),
    sessions: Math.max(a.sessions, b.sessions),
    minutes: Math.max(a.minutes, b.minutes),
    last: Math.max(a.last, b.last),
  };
}

/** Lit des compteurs venus du réseau ou du stockage, sans jamais planter. */
export function cleanCounters(v: unknown): Counters {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const num = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? Math.max(0, Math.floor(x)) : 0);
  const runsIn = (o.runs && typeof o.runs === 'object' ? o.runs : {}) as Record<string, unknown>;
  const runs: Partial<Record<GameId, number>> = {};
  for (const g of GAME_IDS) if (num(runsIn[g]) > 0) runs[g] = num(runsIn[g]);
  return { runs, days: num(o.days), records: num(o.records), sessions: num(o.sessions), minutes: num(o.minutes), last: num(o.last) };
}

// ───────────────────────── Expérience, niveaux, étapes ─────────────────────────

/** Points d'expérience gagnés (la même formule que private.goutte_xp sur le serveur). */
export const XP = { run: 10, day: 25, record: 15, session: 20 } as const;
export const xpOf = (c: Counters): number => XP.run * totalRuns(c) + XP.day * c.days + XP.record * c.records + XP.session * c.sessions;

export const MAX_LEVEL = 30;
/**
 * Expérience totale pour atteindre un niveau : 0, 30, 90, 180, 300…
 * Courbe pensée comme celles des jeux à progression longue : une première victoire tout de suite (niveau 2 dès la première partie),
 * puis des paliers de plus en plus espacés. En jouant deux fois par semaine on finit l'année vers le niveau 18 (Héros d'encre) ;
 * la Légende (niveau 20) récompense les élèves les plus réguliers. Seul l'appareil calcule les niveaux : le serveur ne compte que l'expérience.
 */
export const xpForLevel = (level: number): number => 15 * level * (level - 1);

export function levelOf(xp: number): number {
  let l = 1;
  while (l < MAX_LEVEL && xp >= xpForLevel(l + 1)) l++;
  return l;
}

/** Où en est la barre d'expérience du niveau en cours (0 à 1), et ce qu'il reste à gagner. */
export function levelProgress(xp: number): { level: number; fill: number; toNext: number } {
  const level = levelOf(xp);
  if (level >= MAX_LEVEL) return { level, fill: 1, toNext: 0 };
  const from = xpForLevel(level);
  const to = xpForLevel(level + 1);
  return { level, fill: (xp - from) / (to - from), toNext: to - xp };
}

/** Les grandes étapes de la goutte : son dessin change et elle grandit à chacune. */
export const STAGES = [
  { from: 1, name: 'Gouttelette' },
  { from: 3, name: 'Goutte' },
  { from: 6, name: 'Goutte vaillante' },
  { from: 10, name: 'Chevalier d’encre' },
  { from: 15, name: 'Héros d’encre' },
  { from: 20, name: 'Légende d’encre' },
] as const;

/** Taille dessinée à chaque étape : elle ne fait que grandir, de la Gouttelette à la Légende (vérifié par les tests). */
export const GOUTTE_SCALE: readonly number[] = [0.5, 0.62, 0.73, 0.83, 0.92, 1];

export function stageOf(level: number): number {
  let s = 0;
  for (let i = 0; i < STAGES.length; i++) if (level >= STAGES[i].from) s = i;
  return s;
}

// ───────────────────────── Friandises ─────────────────────────

/** Friandises gagnées : une par partie, deux par record battu, une par jour de jeu. On les donne à sa goutte (voir foods.ts). */
export const treatsEarned = (c: Counters): number => totalRuns(c) + 2 * c.records + c.days;

// ───────────────────────── Humeur (jamais triste) ─────────────────────────

export type Mood = 'sleep' | 'hungry' | 'happy';
/** Au bout de 2 jours sans jouer, elle dort (et se réveille à la prochaine partie). Une friandise à donner : elle la réclame. */
export function moodOf(c: Counters, treatsLeft: number, now: number = Date.now()): Mood {
  if (c.last > 0 && now - c.last > 2 * 86_400_000) return 'sleep';
  return treatsLeft > 0 ? 'hungry' : 'happy';
}

// ───────────────────────── Apparence et objets ─────────────────────────

export type Slot = 'color' | 'hat' | 'weapon' | 'shield' | 'acc';
export const SLOT_NAME: Record<Slot, string> = { color: 'Couleur', hat: 'Chapeau', weapon: 'Arme', shield: 'Bouclier', acc: 'Accessoire' };

export type Unlock = { level: number } | { ach: string } | { fed: number };
export interface Item {
  id: string;
  slot: Slot;
  name: string;
  unlock: Unlock;
  /** couleur du corps (pour les couleurs) */
  hex?: string;
}

export const ITEMS: readonly Item[] = [
  { id: 'encre', slot: 'color', name: 'Encre bleue', unlock: { level: 1 }, hex: '#2f3a8f' },
  { id: 'sapin', slot: 'color', name: 'Vert sapin', unlock: { level: 3 }, hex: '#1f6b4a' },
  { id: 'prune', slot: 'color', name: 'Prune', unlock: { level: 5 }, hex: '#6a2c7a' },
  { id: 'brique', slot: 'color', name: 'Brique', unlock: { level: 8 }, hex: '#a2412c' },
  { id: 'ocean', slot: 'color', name: 'Océan', unlock: { ach: 'jours-10' }, hex: '#1c6f8f' },
  { id: 'rose', slot: 'color', name: 'Framboise', unlock: { fed: 80 }, hex: '#b8336a' },
  { id: 'nuit', slot: 'color', name: 'Nuit étoilée', unlock: { level: 13 }, hex: '#1d2246' },
  { id: 'or', slot: 'color', name: 'Or', unlock: { level: 20 }, hex: '#b8860b' },
  { id: 'menthe', slot: 'color', name: 'Menthe', unlock: { ach: 'calin-25' }, hex: '#2a8a78' },

  { id: 'casquette', slot: 'hat', name: 'Casquette', unlock: { level: 2 } },
  { id: 'bonnet', slot: 'hat', name: 'Bonnet', unlock: { fed: 15 } },
  { id: 'casque', slot: 'hat', name: 'Casque', unlock: { level: 7 } },
  { id: 'magicien', slot: 'hat', name: 'Chapeau de magicien', unlock: { ach: 'explorateur' } },
  { id: 'pirate', slot: 'hat', name: 'Chapeau de pirate', unlock: { ach: 'gourmet' } },
  { id: 'couronne', slot: 'hat', name: 'Couronne de papier', unlock: { ach: 'records-10' } },
  { id: 'heaume', slot: 'hat', name: 'Heaume de chevalier', unlock: { level: 15 } },

  { id: 'plume', slot: 'weapon', name: 'Plume', unlock: { level: 1 } },
  { id: 'crayon', slot: 'weapon', name: 'Crayon-lance', unlock: { level: 4 } },
  { id: 'fourchette', slot: 'weapon', name: 'Fourchette géante', unlock: { ach: 'grand-chef' } },
  { id: 'regle', slot: 'weapon', name: 'Règle-épée', unlock: { level: 11 } },
  { id: 'pinceau', slot: 'weapon', name: 'Pinceau magique', unlock: { ach: 'parties-100' } },
  { id: 'stylo', slot: 'weapon', name: 'Stylo d’or', unlock: { level: 19 } },

  { id: 'gomme', slot: 'shield', name: 'Bouclier-gomme', unlock: { level: 6 } },
  { id: 'cahier', slot: 'shield', name: 'Bouclier-cahier', unlock: { level: 10 } },
  { id: 'etoile', slot: 'shield', name: 'Bouclier étoilé', unlock: { ach: 'seances-10' } },
  { id: 'dore', slot: 'shield', name: 'Bouclier doré', unlock: { level: 17 } },

  { id: 'echarpe', slot: 'acc', name: 'Écharpe', unlock: { fed: 40 } },
  { id: 'lunettes', slot: 'acc', name: 'Lunettes', unlock: { ach: 'minutes-60' } },
  { id: 'cape', slot: 'acc', name: 'Cape', unlock: { level: 12 } },
  { id: 'medaille', slot: 'acc', name: 'Médaille', unlock: { ach: 'records-1' } },
  { id: 'ailes', slot: 'acc', name: 'Ailes de papier', unlock: { level: 22 } },
];

export const itemById = (id: string | null | undefined): Item | undefined => ITEMS.find((i) => i.id === id);

// ───────────────────────── Succès ─────────────────────────

export interface Progress {
  counters: Counters;
  level: number;
  fed: number;
  /** saveurs différentes déjà goûtées (voir foods.ts) */
  tasted?: number;
}

export interface Achievement {
  id: string;
  name: string;
  /** comment l'obtenir, écrit pour un enfant */
  how: string;
  /** où on en est : [valeur, objectif] */
  goal: (p: Progress) => [number, number];
}

const GAME_TITLE: Record<GameId, [string, string]> = {
  typing: ['Doigts de fée', 'Frappe !'],
  math: ['As du calcul', 'Course à l’encre'],
  spelling: ['Détective des fautes', 'Chasse aux fautes'],
  memory: ['Mémoire d’éléphant', 'Mémoire d’encre'],
  lexique: ['Chercheur de mots', 'Mots en orbite'],
  facteur: ['Facteur du village', 'Le facteur'],
};

export const ACHIEVEMENTS: readonly Achievement[] = [
  { id: 'premier-pas', name: 'Premier pas', how: 'Termine une partie.', goal: (p) => [totalRuns(p.counters), 1] },
  { id: 'explorateur', name: 'Explorateur', how: 'Joue à 3 jeux différents.', goal: (p) => [gamesTried(p.counters), 3] },
  ...GAME_IDS.map((g) => ({ id: `jeu-${g}`, name: GAME_TITLE[g][0], how: `Termine 10 parties de ${GAME_TITLE[g][1]}.`, goal: (p: Progress): [number, number] => [p.counters.runs[g] ?? 0, 10] })),
  { id: 'parties-25', name: 'Habitué', how: 'Termine 25 parties.', goal: (p) => [totalRuns(p.counters), 25] },
  { id: 'parties-100', name: 'Infatigable', how: 'Termine 100 parties.', goal: (p) => [totalRuns(p.counters), 100] },
  { id: 'parties-250', name: 'Champion de l’effort', how: 'Termine 250 parties.', goal: (p) => [totalRuns(p.counters), 250] },
  { id: 'jours-3', name: 'Fidèle', how: 'Viens jouer 3 jours différents.', goal: (p) => [p.counters.days, 3] },
  { id: 'jours-10', name: 'Toujours là', how: 'Viens jouer 10 jours différents.', goal: (p) => [p.counters.days, 10] },
  { id: 'jours-30', name: 'Pilier de la classe', how: 'Viens jouer 30 jours différents.', goal: (p) => [p.counters.days, 30] },
  { id: 'records-1', name: 'Plus fort qu’hier', how: 'Bats ton propre record.', goal: (p) => [p.counters.records, 1] },
  { id: 'records-10', name: 'Toujours mieux', how: 'Bats tes records 10 fois.', goal: (p) => [p.counters.records, 10] },
  { id: 'records-30', name: 'Inarrêtable', how: 'Bats tes records 30 fois.', goal: (p) => [p.counters.records, 30] },
  { id: 'seances-1', name: 'Bon élève', how: 'Joue une séance de ta classe.', goal: (p) => [p.counters.sessions, 1] },
  { id: 'seances-10', name: 'Toujours prêt', how: 'Joue 10 séances de ta classe.', goal: (p) => [p.counters.sessions, 10] },
  { id: 'minutes-60', name: 'Une heure d’entraînement', how: 'Joue 60 minutes en tout.', goal: (p) => [p.counters.minutes, 60] },
  { id: 'minutes-300', name: 'Grand entraînement', how: 'Joue 300 minutes en tout.', goal: (p) => [p.counters.minutes, 300] },
  { id: 'niveau-5', name: 'Goutte qui pousse', how: 'Atteins le niveau 5.', goal: (p) => [p.level, 5] },
  { id: 'niveau-10', name: 'Chevalier', how: 'Atteins le niveau 10.', goal: (p) => [p.level, 10] },
  { id: 'niveau-20', name: 'Légende', how: 'Atteins le niveau 20.', goal: (p) => [p.level, 20] },
  { id: 'calin-1', name: 'Premier câlin', how: 'Donne une friandise à ta goutte.', goal: (p) => [p.fed, 1] },
  { id: 'calin-25', name: 'Meilleurs amis', how: 'Donne 25 friandises à ta goutte.', goal: (p) => [p.fed, 25] },
  { id: 'calin-100', name: 'Inséparables', how: 'Donne 100 friandises à ta goutte.', goal: (p) => [p.fed, 100] },
  { id: 'gourmet', name: 'Gourmet', how: 'Fais goûter 6 saveurs différentes à ta goutte.', goal: (p) => [p.tasted ?? 0, 6] },
  { id: 'grand-chef', name: 'Grand chef', how: 'Fais goûter toutes les saveurs à ta goutte.', goal: (p) => [p.tasted ?? 0, TASTE_TOTAL] },
];

export const achieved = (a: Achievement, p: Progress): boolean => {
  const [v, goal] = a.goal(p);
  return v >= goal;
};
export const achievedIds = (p: Progress): string[] => ACHIEVEMENTS.filter((a) => achieved(a, p)).map((a) => a.id);

/** Un objet est-il débloqué ? */
export function unlocked(item: Item, p: Progress): boolean {
  const u = item.unlock;
  if ('level' in u) return p.level >= u.level;
  if ('fed' in u) return p.fed >= u.fed;
  const a = ACHIEVEMENTS.find((x) => x.id === u.ach);
  return a ? achieved(a, p) : false;
}

/** Comment débloquer un objet, en une phrase courte. */
export function unlockText(item: Item): string {
  const u = item.unlock;
  if ('level' in u) return `Niveau ${u.level}`;
  if ('fed' in u) return `${u.fed} friandise${u.fed > 1 ? 's' : ''} données`;
  const a = ACHIEVEMENTS.find((x) => x.id === u.ach);
  return a ? `Succès « ${a.name} »` : 'Bientôt';
}

// ───────────────────────── Nom de la goutte (choisi dans des listes : jamais de texte libre) ─────────────────────────

export const NAME_FIRST = ['Plume', 'Pixel', 'Bulle', 'Perle', 'Virgule', 'Tampon', 'Zigzag', 'Gribouille', 'Encrine', 'Pâtou', 'Mouchette', 'Grain'] as const;
export const NAME_SECOND = ['la Brave', 'le Brave', 'la Rapide', 'le Rapide', 'l’Intrépide', 'la Malicieuse', 'le Malicieux', 'la Sage', 'le Sage', 'la Rieuse', 'le Rieur', 'la Vaillante', 'le Vaillant', 'la Curieuse', 'le Curieux'] as const;

export const isGoutteName = (n: unknown): n is string => {
  if (typeof n !== 'string') return false;
  return NAME_FIRST.some((a) => NAME_SECOND.some((b) => `${a} ${b}` === n));
};

/** Ce que l'élève a choisi pour sa goutte. */
export interface Look {
  name: string;
  color: string;
  hat: string | null;
  weapon: string | null;
  shield: string | null;
  acc: string | null;
}

export const defaultLook = (seed = 0): Look => ({
  name: `${NAME_FIRST[seed % NAME_FIRST.length]} ${NAME_SECOND[(seed * 7) % NAME_SECOND.length]}`,
  color: 'encre',
  hat: null,
  weapon: 'plume',
  shield: null,
  acc: null,
});

/** Lit une apparence (réseau, stockage) ; un objet inconnu ou du mauvais emplacement est retiré. */
export function cleanLook(v: unknown, seed = 0): Look {
  const d = defaultLook(seed);
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const pick = (slot: Slot, x: unknown, fallback: string | null) => {
    const it = typeof x === 'string' ? itemById(x) : undefined;
    return it && it.slot === slot ? it.id : x === null ? null : fallback;
  };
  return {
    name: isGoutteName(o.name) ? o.name : d.name,
    color: pick('color', o.color, d.color) ?? d.color,
    hat: pick('hat', o.hat, d.hat),
    weapon: pick('weapon', o.weapon, d.weapon),
    shield: pick('shield', o.shield, d.shield),
    acc: pick('acc', o.acc, d.acc),
  };
}

/** Une apparence ne porte que des objets débloqués (sinon on les retire, sans rien casser). */
export function wearable(look: Look, p: Progress): Look {
  const ok = (id: string | null) => (id && itemById(id) && unlocked(itemById(id)!, p) ? id : null);
  return { ...look, color: ok(look.color) ?? 'encre', hat: ok(look.hat), weapon: ok(look.weapon), shield: ok(look.shield), acc: ok(look.acc) };
}

/** Ce qui vient d'être gagné entre deux états (pour la petite annonce après une partie). */
export interface Gain {
  xp: number;
  treats: number;
  level: number | null;
  stage: string | null;
  achievements: string[];
  items: string[];
}

export function gainBetween(before: Progress, after: Progress): Gain {
  const had = new Set(achievedIds(before));
  const ach = ACHIEVEMENTS.filter((a) => achieved(a, after) && !had.has(a.id)).map((a) => a.name);
  const items = ITEMS.filter((i) => unlocked(i, after) && !unlocked(i, before)).map((i) => i.name);
  const stage = stageOf(after.level) > stageOf(before.level) ? STAGES[stageOf(after.level)].name : null;
  return {
    xp: xpOf(after.counters) - xpOf(before.counters),
    treats: treatsEarned(after.counters) - treatsEarned(before.counters),
    level: after.level > before.level ? after.level : null,
    stage,
    achievements: ach,
    items,
  };
}

export const progressOf = (c: Counters, fed: number, tasted?: number): Progress => ({ counters: c, level: levelOf(xpOf(c)), fed, tasted });

// ───────────────────────── Prochain cadeau (on voit la ligne d'arrivée) ─────────────────────────

/** Où en est-on de chaque objet pas encore débloqué, de 0 à 1. */
export function unlockFill(item: Item, p: Progress): number {
  const u = item.unlock;
  if ('level' in u) return Math.min(1, xpOf(p.counters) / Math.max(1, xpForLevel(u.level)));
  if ('fed' in u) return Math.min(1, p.fed / u.fed);
  const a = ACHIEVEMENTS.find((x) => x.id === u.ach);
  if (!a) return 0;
  const [v, goal] = a.goal(p);
  return Math.min(1, v / Math.max(1, goal));
}

/**
 * Le prochain cadeau à viser : l'objet verrouillé le plus proche d'être débloqué.
 * Montrer une ligne d'arrivée proche donne envie d'y aller (« effet de gradient de but ») ; on ne montre qu'un seul objectif.
 */
export function nextUnlock(p: Progress): { item: Item; fill: number } | null {
  let best: { item: Item; fill: number } | null = null;
  for (const item of ITEMS) {
    if (unlocked(item, p)) continue;
    const fill = unlockFill(item, p);
    if (!best || fill > best.fill) best = { item, fill };
  }
  return best;
}
