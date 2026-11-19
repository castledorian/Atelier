import { beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { installFakeStorage, seeded } from './helpers';
import { ITEMS, ROUNDS, choicesFor, duelItems, isFault, isPerfect, itemsFor, nextItem, parseEntry, pointsFor, rulesFor } from '../src/game/spelling/engine';

beforeEach(() => installFakeStorage());

test('banque : chaque phrase est bien formée', () => {
  for (const i of ITEMS) {
    assert.ok(i.wrong !== i.right, i.id);
    assert.ok(i.others.length >= 1, `${i.id} : au moins une autre proposition`);
    assert.ok(!i.others.includes(i.right) && !i.others.includes(i.wrong), i.id);
    assert.ok(i.before.length + i.after.length >= 2, i.id); // au CE1, une phrase peut n'avoir que trois mots
    assert.ok(!/[[\]|]/.test(i.fixed), i.id);
    assert.ok(i.tip.length > 5, i.id);
  }
  assert.equal(new Set(ITEMS.map((i) => i.id)).size, ITEMS.length);
});

test('banque : de quoi jouer une partie et un duel, à chaque classe et pour chaque règle', () => {
  for (const level of ['ce1', 'ce2', 'cm1', 'cm2'] as const) {
    assert.ok(itemsFor(level).length >= 4 * ROUNDS, `${level} : ${itemsFor(level).length} phrases`);
    for (const rule of rulesFor(level)) assert.ok(itemsFor(level, [rule]).length >= 12, `${level} ${rule}`);
  }
  // les finales en [é] commencent au CE2 (passé composé et infinitif), les autres règles dès le CE1
  assert.deepEqual(rulesFor('ce1').sort(), ['accordeur', 'doublon', 'jumeaux']);
  for (const level of ['ce2', 'cm1', 'cm2'] as const) assert.equal(rulesFor(level).length, 4);
});

test('classes : chaque classe a ses phrases, plus celles de la classe précédente en révision', () => {
  const grades = (level: 'ce1' | 'ce2' | 'cm1' | 'cm2') => [...new Set(itemsFor(level).map((i) => i.grade))].sort();
  assert.deepEqual(grades('ce1'), ['ce1']);
  assert.deepEqual(grades('ce2'), ['ce1', 'ce2']);
  assert.deepEqual(grades('cm1'), ['ce2', 'cm1']);
  assert.deepEqual(grades('cm2'), ['cm1', 'cm2']);
});

test('programmes : les notions arrivent dans la bonne classe', () => {
  const at = (re: RegExp) => [...new Set(ITEMS.filter((i) => re.test(i.right) || re.test(i.wrong)).map((i) => i.grade))];
  // participe passé avec « avoir » accordé au COD placé avant : CM2 seulement
  assert.ok(ITEMS.some((i) => i.grade === 'cm2' && /que j’ai|les ai/.test(i.fixed)));
  assert.ok(!ITEMS.some((i) => i.grade !== 'cm2' && /que j’ai|les ai|qu’il a mangés/.test(i.fixed)));
  // leur/leurs, c’est/s’est : CM2 ; ces/ses : à partir du CM1
  assert.deepEqual(at(/^leurs?$/), ['cm2']);
  assert.ok(at(/^(ces|ses)$/).every((g) => g === 'cm1' || g === 'cm2'));
  // au CE1, des phrases très courtes
  for (const i of ITEMS.filter((x) => x.grade === 'ce1')) assert.ok(i.before.length + 1 + i.after.length <= 6, i.fixed);
  for (const i of ITEMS.filter((x) => x.grade === 'ce2')) assert.ok(i.before.length + 1 + i.after.length <= 8, i.fixed);
});

test('propositions vraisemblables : ni lettre triplée, ni double en début ou en fin de mot', () => {
  for (const i of ITEMS) {
    for (const d of ['standard', 'expert'] as const)
      for (const c of choicesFor(i, d)) {
        assert.ok(!/(.)\1\1/.test(c), `${c} (${i.fixed})`);
        assert.ok(!/^(.)\1/.test(c.replace(/^[a-z]’/i, '')), `${c} (${i.fixed})`);
      }
  }
});

test('identifiants : liés au texte de la phrase, pas à sa place dans la banque', () => {
  const a = parseEntry('jumeaux', 'cm1', 'Il [à|a|as] faim.');
  const b = parseEntry('jumeaux', 'cm2', 'Il [à|a|as] faim.');
  assert.equal(a.id, b.id);
  assert.match(a.id, /^jumeaux-[0-9a-z]+$/);
  assert.notEqual(a.id, parseEntry('jumeaux', 'cm1', 'Elle [à|a|as] faim.').id);
});

test('analyse : ponctuation collée au mot faux', () => {
  const i = parseEntry('accordeur', 'cm1', 'Les filles sont [parti|parties|partie].', 'x');
  assert.equal(i.suffix, '.');
  assert.deepEqual(i.after, []);
  assert.equal(i.fixed, 'Les filles sont parties.');
  const j = parseEntry('jumeaux', 'cm2', '[Où|Ou|Ous] habites-tu ?');
  assert.deepEqual([j.before, j.after, j.suffix], [[], ['habites-tu', '?'], '']);
  assert.throws(() => parseEntry('jumeaux', 'cm1', 'pas de faute ici'));
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

test('une partie : 10 phrases distinctes, toutes les règles de la classe travaillées', () => {
  for (const level of ['ce1', 'ce2', 'cm1', 'cm2'] as const) {
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
    assert.equal(rules.size, rulesFor(level).length, level);
  }
});

test('pondération : les lettres doubles reviennent moins souvent que les accords', () => {
  const count: Record<string, number> = {};
  for (let g = 0; g < 300; g++) {
    const used = new Set<string>();
    for (let n = 0; n < ROUNDS; n++) {
      const { item } = nextItem('cm1', n, [], [], used);
      used.add(item.id);
      count[item.rule] = (count[item.rule] ?? 0) + 1;
    }
  }
  assert.ok(count.doublon < count.accordeur && count.doublon < count.jumeaux, JSON.stringify(count));
  assert.ok(count.doublon >= 300, 'au moins une phrase de lettres doubles par partie');
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
  for (const rule of rulesFor('cm1')) {
    const d = duelItems('cm1', rule, 3, seeded(4));
    assert.equal(d.length, 3);
    assert.equal(new Set(d.map((i) => i.id)).size, 3);
    assert.ok(d.every((i) => i.rule === rule && (i.grade === 'cm1' || i.grade === 'ce2')));
  }
});
test('points : barème commun, série multipliée, erreur sans pénalité négative', () => {
  const perfect = { tapFirst: true, fixTries: 1, hint: false };
  assert.equal(isPerfect(perfect), true);
  assert.equal(pointsFor(perfect, 0), 250);
  assert.equal(pointsFor(perfect, 1), 250);
  assert.equal(pointsFor(perfect, 2), 500); // 3e phrase parfaite d'affilée : palier ×2
  assert.equal(pointsFor(perfect, 40), 1500); // palier maximal ×6
  assert.equal(pointsFor({ tapFirst: true, fixTries: 1, hint: true }, 3), 175);
  assert.equal(pointsFor({ tapFirst: false, fixTries: 2, hint: false }, 3), 75);
  assert.equal(pointsFor({ tapFirst: false, fixTries: 3, hint: false }, 3), 0);
  assert.equal(isFault({ tapFirst: false, fixTries: 1, hint: true }), false);
  assert.equal(isFault({ tapFirst: true, fixTries: 2, hint: false }), true);
});

import { hpFor, isTyped } from '../src/game/spelling/engine';


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
