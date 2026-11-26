import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installFakeStorage } from './helpers';
import {
  ACHIEVEMENTS,
  ITEMS,
  MAX_LEVEL,
  NAME_FIRST,
  NAME_SECOND,
  STAGES,
  achievedIds,
  cleanCounters,
  cleanLook,
  emptyCounters,
  gainBetween,
  isGoutteName,
  levelOf,
  levelProgress,
  mergeCounters,
  moodOf,
  progressOf,
  stageOf,
  treatsEarned,
  unlocked,
  wearable,
  xpForLevel,
  xpOf,
} from '../src/game/goutte/rules';
import type { Counters } from '../src/game/goutte/rules';
import { currentView, feed, noteGame, setGoutteOwner, setLook, storeServer } from '../src/game/goutte/store';

const c = (o: Partial<Counters>): Counters => ({ ...emptyCounters(), ...o });

test('expérience : effort récompensé, formule identique au serveur', () => {
  // même formule que private.goutte_xp (serveur/mise-a-jour-goutte.sql) : 10 par partie, 25 par jour, 15 par record, 20 par séance
  assert.equal(xpOf(c({ runs: { math: 3, facteur: 2 }, days: 2, records: 1, sessions: 1 })), 50 + 50 + 15 + 20);
  assert.equal(levelOf(0), 1);
  assert.equal(levelOf(29), 1);
  assert.equal(levelOf(30), 2);
  assert.equal(levelOf(35), 2, 'première partie du premier jour : niveau 2 tout de suite');
  assert.equal(levelOf(xpForLevel(20)), 20);
  assert.equal(levelOf(10 ** 9), MAX_LEVEL);
  const p = levelProgress(60);
  assert.equal(p.level, 2);
  assert.equal(p.toNext, 30);
  assert.equal(p.fill, 0.5);
  // les paliers s'espacent : chaque niveau demande plus que le précédent
  for (let l = 2; l < MAX_LEVEL; l++) assert.ok(xpForLevel(l + 1) - xpForLevel(l) > xpForLevel(l) - xpForLevel(l - 1));
});

test('une année réaliste : deux jours de jeu par semaine mènent vers le Héros, la Légende demande plus', () => {
  // 36 semaines, 2 jours par semaine, 3 parties par jour, un record par semaine, une séance de classe toutes les 2 semaines
  const year = c({ runs: { math: 120, spelling: 96 }, days: 72, records: 36, sessions: 18 });
  const l = levelOf(xpOf(year));
  assert.ok(l >= 15 && l <= 19, `niveau en fin d'année : ${l}`);
  assert.ok(stageOf(l) >= 4, 'Héros d’encre');
  // un élève qui joue peu (20 parties en 8 jours) dépasse quand même la Gouttelette
  assert.ok(stageOf(levelOf(xpOf(c({ runs: { math: 20 }, days: 8 })))) >= 1);
  // pas trop facile : une semaine de jeu ne suffit pas pour atteindre le Chevalier
  assert.ok(stageOf(levelOf(xpOf(c({ runs: { math: 10 }, days: 3, records: 2 })))) <= 1);
});

test('étapes, friandises, humeur jamais triste', () => {
  assert.equal(stageOf(1), 0);
  assert.equal(stageOf(10), 3);
  assert.equal(stageOf(30), STAGES.length - 1);
  assert.equal(treatsEarned(c({ runs: { memory: 4 }, records: 1, days: 2 })), 8);
  const now = 10 * 86_400_000;
  assert.equal(moodOf(c({ last: now - 3 * 86_400_000 }), 5, now), 'sleep');
  assert.equal(moodOf(c({ last: now }), 2, now), 'hungry');
  assert.equal(moodOf(c({ last: now }), 0, now), 'happy');
});

test('compteurs : on garde toujours le plus haut, et une donnée abîmée ne casse rien', () => {
  const m = mergeCounters(c({ runs: { math: 5 }, days: 3 }), c({ runs: { math: 2, typing: 4 }, days: 7, last: 9 }));
  assert.deepEqual(m.runs, { math: 5, typing: 4 });
  assert.equal(m.days, 7);
  assert.equal(m.last, 9);
  assert.deepEqual(cleanCounters({ runs: { math: -3, pirate: 9, typing: 2.7 }, days: 'x' }), { runs: { typing: 2 }, days: 0, records: 0, sessions: 0, minutes: 0, last: 0 });
  assert.deepEqual(cleanCounters(null), emptyCounters());
});

test('succès et objets : identifiants uniques, conditions existantes, débloqués à leur heure', () => {
  assert.equal(new Set(ACHIEVEMENTS.map((a) => a.id)).size, ACHIEVEMENTS.length);
  assert.equal(new Set(ITEMS.map((i) => i.id)).size, ITEMS.length);
  for (const i of ITEMS) if ('ach' in i.unlock) assert.ok(ACHIEVEMENTS.some((a) => 'ach' in i.unlock && a.id === i.unlock.ach), `succès inconnu pour ${i.id}`);
  for (const i of ITEMS) assert.match(i.id, /^[a-z0-9-]{1,20}$/);
  const start = progressOf(emptyCounters(), 0);
  assert.deepEqual(achievedIds(start), []);
  // dès le départ, l'élève a une couleur et une arme : sa goutte n'est jamais « vide »
  assert.ok(ITEMS.some((i) => i.slot === 'color' && unlocked(i, start)));
  assert.ok(ITEMS.some((i) => i.slot === 'weapon' && unlocked(i, start)));
  const one = progressOf(c({ runs: { facteur: 1 }, days: 1 }), 0);
  assert.ok(achievedIds(one).includes('premier-pas'));
  assert.ok(!unlocked(ITEMS.find((i) => i.id === 'bonnet')!, progressOf(emptyCounters(), 5)), 'pas de bonnet après 5 friandises');
  assert.ok(unlocked(ITEMS.find((i) => i.id === 'bonnet')!, progressOf(emptyCounters(), 15)));
  // après une semaine de jeu, il reste beaucoup à débloquer
  const week = progressOf(c({ runs: { math: 12 }, days: 3, records: 2 }), 8);
  assert.ok(ITEMS.filter((i) => unlocked(i, week)).length <= 8, `objets ouverts après une semaine : ${ITEMS.filter((i) => unlocked(i, week)).length}`);
});

test('nom choisi dans des listes, apparence nettoyée et limitée aux objets débloqués', () => {
  assert.ok(isGoutteName(`${NAME_FIRST[0]} ${NAME_SECOND[0]}`));
  assert.ok(!isGoutteName('Kevin'));
  const l = cleanLook({ name: 'Insulte', color: 'or', hat: 'plume', weapon: null, acc: 'ailes' });
  assert.ok(isGoutteName(l.name));
  assert.equal(l.hat, null, 'une plume n’est pas un chapeau');
  assert.equal(l.weapon, null);
  const w = wearable(l, progressOf(emptyCounters(), 0));
  assert.equal(w.color, 'encre', 'or pas encore débloqué');
  assert.equal(w.acc, null);
});

test('gains annoncés après une partie : niveau, étape, succès, objets', () => {
  const before = progressOf(c({ runs: { math: 1 }, days: 1 }), 0);
  const after = progressOf(c({ runs: { math: 2 }, days: 1, records: 1 }), 0);
  const g = gainBetween(before, after);
  assert.equal(g.xp, 25);
  assert.equal(g.treats, 3);
  assert.equal(g.level, null, '35 → 60 points : toujours niveau 2');
  assert.equal(gainBetween(before, progressOf(c({ runs: { math: 4 }, days: 2 }), 0)).level, 3, '90 points : niveau 3');
  assert.ok(g.achievements.includes('Plus fort qu’hier'));
  assert.ok(g.items.includes('Médaille'));
});

test('appareil : records personnels, jours, friandises, une goutte par élève', () => {
  installFakeStorage();
  setGoutteOwner('eleve-a');
  const day = Date.UTC(2026, 10, 23, 10);
  noteGame('math', 'cm1', 100, 60, day);
  noteGame('math', 'cm1', 90, 60, day + 1000);
  const g = noteGame('math', 'cm1', 150, 60, day + 2000);
  assert.ok(g && g.xp === 10 + 15, 'record battu : 10 + 15 points');
  assert.equal(noteGame('math', 'cm1', 999, 5, day), null, 'partie de moins de 20 s : ignorée');
  noteGame('typing', 'standard', 10, 30, day + 86_400_000);
  let v = currentView();
  assert.equal(v.counters.runs.math, 3);
  assert.equal(v.counters.days, 2);
  assert.equal(v.counters.records, 1);
  const left = v.treatsLeft;
  assert.ok(left > 0);
  v = feed()!;
  assert.equal(v.fed, 1);
  assert.equal(v.treatsLeft, left - 1);
  setLook({ ...v.look, hat: 'casquette' });
  assert.equal(currentView().look.hat, 'casquette');

  setGoutteOwner('eleve-b');
  assert.equal(currentView().counters.runs.math, undefined, 'l’élève suivant de la tablette repart de sa propre goutte');

  // le serveur compte aussi les parties des autres appareils : on garde le plus haut
  storeServer({ counters: { runs: { math: 40 }, days: 12, records: 3, sessions: 2 }, look: {}, fed: 4 }, true);
  v = currentView();
  assert.equal(v.counters.runs.math, 40);
  assert.equal(v.fed, 4);
});

test('le serveur connaît les mêmes listes de noms et la même formule que le jeu', async () => {
  const { readFileSync } = await import('node:fs');
  const sql = readFileSync(new URL('../serveur/mise-a-jour-goutte.sql', import.meta.url), 'utf8');
  for (const n of [...NAME_FIRST, ...NAME_SECOND]) assert.ok(sql.includes(`'${n.replace(/'/g, "''")}'`), `nom absent du SQL : ${n}`);
  assert.match(sql, /10 \* private\.goutte_runs\(c\) \+ 25 \* .*'days'.* \+ 15 \* .*'records'.* \+ 20 \* .*'sessions'/);
  const schema = readFileSync(new URL('../serveur/schema.sql', import.meta.url), 'utf8');
  assert.ok(schema.includes('create or replace function public.goutte_get'), 'schema.sql à jour');
});
