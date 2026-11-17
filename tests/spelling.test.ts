import { beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { installFakeStorage, seeded } from './helpers';
import { rulesOf } from '../src/game/encre/rules';
import { ITEMS, ROUNDS, choicesFor, duelItems, isFault, isPerfect, itemsFor, nextItem, parseEntry, pointsFor } from '../src/game/spelling/engine';

beforeEach(() => installFakeStorage());

test('banque : chaque phrase est bien formée', () => {
  for (const i of ITEMS) {
    assert.ok(i.wrong !== i.right, i.id);
    assert.ok(i.others.length >= 1, `${i.id} : au moins une autre proposition`);
    assert.ok(!i.others.includes(i.right) && !i.others.includes(i.wrong), i.id);
    assert.ok(i.before.length + i.after.length >= 3, i.id);
    assert.ok(!/[[\]|]/.test(i.fixed), i.id);
    assert.ok(i.tip.length > 5, i.id);
  }
  assert.equal(new Set(ITEMS.map((i) => i.id)).size, ITEMS.length);
});

test('banque : de quoi jouer un duel et une partie, au CM1 comme au CM2', () => {
  for (const level of ['cm1', 'cm2'] as const) {
    assert.ok(itemsFor(level).length >= ROUNDS);
    for (const rule of rulesOf('orthographe')) assert.ok(itemsFor(level, [rule]).length >= 3, `${level} ${rule}`);
  }
  assert.ok(itemsFor('cm2').length > itemsFor('cm1').length);
});

test('analyse : ponctuation collée au mot faux', () => {
  const i = parseEntry('accordeur', 1, 'Les filles sont [parti|parties|partie].', 'x');
  assert.equal(i.suffix, '.');
  assert.deepEqual(i.after, []);
  assert.equal(i.fixed, 'Les filles sont parties.');
  const j = parseEntry('jumeaux', 2, '[Où|Ou|Ous] habites-tu ?');
  assert.deepEqual([j.before, j.after, j.suffix], [[], ['habites-tu', '?'], '']);
  assert.throws(() => parseEntry('jumeaux', 1, 'pas de faute ici'));
});

test('propositions : la bonne, jamais le mot faux, bon nombre selon la difficulté', () => {
  const r = seeded(5);
  for (const i of ITEMS) {
    for (const [d, n] of [['apprenti', 2], ['standard', 3], ['expert', 4]] as const) {
      const c = choicesFor(i, d, r);
      assert.ok(c.includes(i.right));
      assert.ok(!c.includes(i.wrong));
      assert.ok(c.length >= Math.min(n, 1 + i.others.length) && c.length <= n);
      assert.equal(new Set(c).size, c.length);
    }
  }
});

test('une partie : 10 phrases distinctes, toutes les règles travaillées', () => {
  for (const level of ['cm1', 'cm2'] as const) {
    const r = seeded(11);
    const used = new Set<string>();
    const ok: boolean[] = [];
    for (let n = 0; n < ROUNDS; n++) {
      const { item } = nextItem(level, n, ok, [], used, r);
      assert.ok(!used.has(item.id));
      used.add(item.id);
      ok.push(true);
    }
    const rules = new Set([...used].map((id) => id.split('-')[0]));
    assert.equal(rules.size, 3, level);
  }
});

test('une Rature revient aux rangs 3 et 9 seulement, et jamais si l’élève peine', () => {
  const r = seeded(2);
  const used = new Set<string>();
  const ok: boolean[] = [];
  const summoned: number[] = [];
  for (let n = 0; n < ROUNDS; n++) {
    const s = nextItem('cm2', n, ok, ['doublon'], used, r);
    used.add(s.item.id);
    ok.push(true);
    if (s.summoned) {
      summoned.push(n);
      assert.equal(s.item.rule, 'doublon');
    }
  }
  assert.deepEqual(summoned, [3, 9]);
  const struggle = [false, false, true, false, false, true, false, false, true, false];
  assert.equal(nextItem('cm2', 9, struggle, ['doublon'], new Set(), r).summoned, null);
});

test('duel : trois phrases distinctes de la règle', () => {
  for (const rule of rulesOf('orthographe')) {
    const d = duelItems('cm1', rule, 3, seeded(4));
    assert.equal(d.length, 3);
    assert.equal(new Set(d.map((i) => i.id)).size, 3);
    assert.ok(d.every((i) => i.rule === rule && i.level === 1));
  }
});

test('points : parfait 15 + bonus de série ; erreur sans pénalité négative', () => {
  const perfect = { tapFirst: true, fixTries: 1, hint: false };
  assert.equal(isPerfect(perfect), true);
  assert.equal(pointsFor(perfect, 0), 17);
  assert.equal(pointsFor(perfect, 4), 25);
  assert.equal(pointsFor(perfect, 40), 25);
  assert.equal(pointsFor({ tapFirst: true, fixTries: 1, hint: true }, 3), 10);
  assert.equal(pointsFor({ tapFirst: false, fixTries: 2, hint: false }, 3), 5);
  assert.equal(pointsFor({ tapFirst: false, fixTries: 3, hint: false }, 3), 0);
  assert.equal(isFault({ tapFirst: false, fixTries: 1, hint: true }), false);
  assert.equal(isFault({ tapFirst: true, fixTries: 2, hint: false }), true);
});

import { MAX_WORDS, hpFor, isTyped, wordCount } from '../src/game/spelling/engine';

test('CE1 et CE2 : phrases courtes et simples, de toutes les règles, en nombre suffisant', () => {
  for (const [lv, min] of [['ce1', 60], ['ce2', 100]] as const) {
    const items = itemsFor(lv);
    assert.ok(items.length >= min, `${lv} : ${items.length} phrases`);
    assert.ok(items.every((i) => i.level === 1 && wordCount(i) <= (MAX_WORDS[lv] as number)), `${lv} : phrase trop longue ou de niveau 2`);
    for (const rule of ['doublon', 'jumeaux', 'accordeur'] as const) assert.ok(items.some((i) => i.rule === rule), `${lv} : pas de règle ${rule}`);
  }
  assert.ok(itemsFor('ce1').length < itemsFor('ce2').length && itemsFor('ce2').length < itemsFor('cm1').length);
});

test('CE1 à CM2 : une partie de dix phrases se compose sans répétition', () => {
  for (const lv of ['ce1', 'ce2', 'cm1', 'cm2'] as const) {
    const used = new Set<string>();
    const last: boolean[] = [];
    for (let a = 0; a < 10; a++) {
      const { item } = nextItem(lv, a, last, [], used, Math.random);
      assert.ok(!used.has(item.id), `${lv} : phrase répétée`);
      used.add(item.id);
      last.push(true);
    }
  }
});

test('Expert : tapé en CM1/CM2 seulement ; ailleurs quatre propositions et une vie de moins', () => {
  assert.ok(isTyped('expert', 'cm1') && isTyped('expert', 'cm2'));
  assert.ok(!isTyped('expert', 'ce1') && !isTyped('expert', 'ce2') && !isTyped('standard', 'cm2'));
  assert.ok(hpFor('expert', 'ce2') < hpFor('standard', 'ce2'));
  for (const lv of ['ce1', 'ce2', 'cm1', 'cm2'] as const) assert.ok(hpFor('apprenti', lv) > hpFor('standard', lv) && hpFor('standard', lv) > hpFor('expert', lv), lv);
});
