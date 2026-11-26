import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FOODS, FOOD_COUNT, PITY, foodAt, foodsUpTo, lunchbox, seedOf, tastedIds } from '../src/game/goutte/foods';
import { FULL, HUNGRY, JOY_HOURS, SAT_HOURS, bump, liveMood, needNow } from '../src/game/goutte/needs';
import { ACHIEVEMENTS, GOUTTE_SCALE, ITEMS, TASTE_TOTAL, emptyCounters, nextUnlock, progressOf, unlockFill, unlocked } from '../src/game/goutte/rules';
import { currentView, feedBlock, feedMeal, markSeen, noteGame, pet, setGoutteOwner, unseenItems } from '../src/game/goutte/store';
import { FORM_SCALE, sizeOf } from '../src/game/boss/forms';
import { installFakeStorage } from './helpers';

const H = 3_600_000;

test('saveurs : 12, identifiants uniques, toutes les raretés, compteur de la collection juste', () => {
  assert.equal(FOOD_COUNT, TASTE_TOTAL);
  assert.equal(new Set(FOODS.map((f) => f.id)).size, FOOD_COUNT);
  for (const r of [1, 2, 3, 4]) assert.ok(FOODS.some((f) => f.rarity === r), `rareté ${r}`);
});

test('friandises : la même suite sur tous les appareils, propre à chaque élève', () => {
  const a = seedOf('eleve-a');
  const b = seedOf('eleve-b');
  assert.deepEqual(foodsUpTo(a, 40).map((f) => f.id), foodsUpTo(a, 40).map((f) => f.id));
  assert.notDeepEqual(foodsUpTo(a, 40).map((f) => f.id), foodsUpTo(b, 40).map((f) => f.id));
  assert.equal(foodAt(a, 1).id, 'pomme', 'premier goût : une pomme');
  assert.equal(foodAt(a, 7).id, foodsUpTo(a, 7)[6].id);
});

test('friandises : jamais plus de 8 sans une saveur rare, et les raretés gardent leurs proportions', () => {
  for (const owner of ['x', 'y', 'eleve-42', 'invite']) {
    const list = foodsUpTo(seedOf(owner), 2000);
    let dry = 0;
    for (const f of list) {
      dry = f.rarity >= 3 ? 0 : dry + 1;
      assert.ok(dry < PITY, `${owner} : ${dry} friandises sans rareté`);
    }
    const common = list.filter((f) => f.rarity === 1).length / list.length;
    const legend = list.filter((f) => f.rarity === 4).length / list.length;
    assert.ok(common > 0.4 && common < 0.65, `courantes : ${common}`);
    assert.ok(legend > 0.01 && legend < 0.07, `légendaires : ${legend}`);
  }
});

test('boîte à goûter et collection', () => {
  const s = seedOf('eleve-a');
  assert.deepEqual(lunchbox(s, 3, 10, 6).map((f) => f.id), foodsUpTo(s, 9).slice(3).map((f) => f.id));
  assert.equal(lunchbox(s, 3, 2).length, 2);
  assert.equal(tastedIds(s, 0).size, 0);
  assert.ok(tastedIds(s, 300).size >= 10, 'en un an, presque toute la collection');
});

test('besoins : se vident avec le temps, bornés, humeur jamais triste', () => {
  const now = 100 * H;
  assert.equal(needNow({ v: 100, at: now }, SAT_HOURS, now + SAT_HOURS * H), 0);
  assert.equal(Math.round(needNow({ v: 100, at: now }, SAT_HOURS, now + (SAT_HOURS / 2) * H)), 50);
  assert.equal(needNow({ v: 50, at: now }, JOY_HOURS, now - H), 50, 'une horloge qui recule ne remplit rien');
  assert.equal(bump({ v: 90, at: now }, 40, SAT_HOURS, now).v, 100);
  assert.equal(liveMood(80, 80, now - 72 * H, now), 'sleep');
  assert.equal(liveMood(HUNGRY - 1, 80, now, now), 'hungry');
  assert.equal(liveMood(70, 90, now, now), 'radiant');
  assert.equal(liveMood(50, 40, now, now), 'happy');
});

test('nourrir : la friandise prévue, ventre et bonheur montent, ventre plein = on attend', () => {
  installFakeStorage();
  setGoutteOwner('eleve-faim');
  const day = Date.now();
  for (let i = 0; i < 6; i++) noteGame('math', 'cm1', i, 60, day + i);
  const v0 = currentView();
  assert.ok(v0.treatsLeft >= 6);
  const expected = foodAt(v0.seed, 1);
  const meal = feedMeal()!;
  assert.equal(meal.food.id, expected.id);
  assert.equal(meal.first, true, 'premier goût');
  assert.ok((meal.view.sat ?? 0) > (v0.sat ?? 0));
  let guard = 0;
  while (feedBlock(currentView()) === null && guard++ < 30) feedMeal();
  assert.equal(feedBlock(currentView()) === 'full' || feedBlock(currentView()) === 'none-left', true);
  if (feedBlock(currentView()) === 'full') assert.ok((currentView().sat ?? 0) >= FULL);
});

test('caresses : 3 par jour rendent heureux, ensuite elle rit seulement', () => {
  installFakeStorage();
  setGoutteOwner('eleve-calin');
  const t = Date.UTC(2026, 10, 27, 10);
  assert.equal(pet(t).counted, true);
  pet(t);
  pet(t);
  assert.equal(pet(t).counted, false);
  assert.equal(pet(t + 86_400_000).counted, true, 'le lendemain, ça recompte');
});

test('cadeaux à déballer : les objets de départ ne sont pas des cadeaux, les nouveaux oui, une seule fois', () => {
  installFakeStorage();
  setGoutteOwner('eleve-cadeau');
  assert.deepEqual(unseenItems(currentView()), [], 'au départ, rien à déballer');
  for (let i = 0; i < 4; i++) noteGame('math', 'cm1', i * 10, 60, Date.UTC(2026, 10, 2 + i, 10));
  const fresh = unseenItems(currentView());
  assert.ok(fresh.length > 0, 'quelques parties : un cadeau');
  markSeen(fresh);
  assert.deepEqual(unseenItems(currentView()), []);
});

test('prochain cadeau : le plus proche, jamais un objet déjà débloqué', () => {
  const p = progressOf(emptyCounters(), 0);
  const n = nextUnlock(p)!;
  assert.ok(!unlocked(n.item, p));
  for (const i of ITEMS) if (!unlocked(i, p)) assert.ok(unlockFill(i, p) <= n.fill);
  assert.ok(ACHIEVEMENTS.some((a) => a.id === 'gourmet') && ACHIEVEMENTS.some((a) => a.id === 'grand-chef'));
});

test('tailles : la goutte et le monstre ne font que grandir, la dernière étape est la plus grande', () => {
  for (const scale of [GOUTTE_SCALE, FORM_SCALE]) {
    for (let i = 1; i < scale.length; i++) assert.ok(scale[i] > scale[i - 1]);
    assert.equal(scale[scale.length - 1], 1);
  }
  let prev = 0;
  for (let f = 0; f < FORM_SCALE.length; f++)
    for (const g of [0, 0.5, 1]) {
      const v = sizeOf(f, g);
      assert.ok(v >= prev, `forme ${f + 1}, ${g}`);
      prev = v;
    }
});
