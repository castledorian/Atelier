import { beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { installFakeStorage, seeded } from './helpers';
import { RULES, ruleInfo, ruleOfCalc, rulesOf } from '../src/game/encre/rules';
import * as T from '../src/game/encre/tracker';
import { makeQuestion, questionsMatching, TOTAL } from '../src/game/course/questions';

beforeEach(() => {
  installFakeStorage();
});

test('bestiaire : chaque créature a un nom, une faute et une parade', () => {
  for (const c of RULES) {
    assert.ok(c.name && c.fault && c.parade, c.id);
    assert.equal(ruleInfo(c.id), c);
  }
  assert.deepEqual(rulesOf('calcul'), ['retenue', 'table-fantome', 'zero-voleur']);
});

test('classement des calculs : exemples', () => {
  assert.equal(ruleOfCalc('7 × 8 = ?'), 'table-fantome');
  assert.equal(ruleOfCalc('3 × 4 = ?'), null);
  assert.equal(ruleOfCalc('47 × 6 = ?'), 'retenue');
  assert.equal(ruleOfCalc('38 + 27 = ?'), 'retenue');
  assert.equal(ruleOfCalc('5 + 27 = ?'), null);
  assert.equal(ruleOfCalc('3,4 × 100 = ?'), 'zero-voleur');
  assert.equal(ruleOfCalc('1\u00a0200 ÷ 10 = ?'), 'zero-voleur');
  assert.equal(ruleOfCalc('Double de 24 = ?'), null);
});

test('classement des calculs : toutes les règles existent dans les deux niveaux', () => {
  for (const level of ['cm1', 'cm2'] as const) {
    const rng = seeded(7);
    const seen = new Set<string>();
    for (let n = 0; n < TOTAL * 40; n++) {
      const r = ruleOfCalc(makeQuestion(level, n % TOTAL, rng).text);
      if (r) seen.add(r);
    }
    for (const id of rulesOf('calcul')) assert.ok(seen.has(id), `${level} : ${id} jamais posée`);
  }
});

test('duel : 3 calculs distincts de la même règle, dans les deux niveaux', () => {
  for (const level of ['cm1', 'cm2'] as const) {
    for (const id of rulesOf('calcul')) {
      const qs = questionsMatching(level, (t) => ruleOfCalc(t) === id, 3, seeded(3));
      assert.equal(qs.length, 3, `${level} ${id}`);
      assert.equal(new Set(qs.map((q) => q.text)).size, 3);
      for (const q of qs) assert.equal(ruleOfCalc(q.text), id);
    }
  }
});

test('Bavure → Rature : 3 fautes sur les 10 dernières parties', () => {
  const rules = rulesOf('calcul');
  let s: T.Store = {};
  let r = T.recordGame(s, rules, { retenue: 1 });
  s = r.store;
  assert.equal(T.stateOf(s.retenue), 'isolee');
  assert.equal(T.stateOf(s['table-fantome']), 'neuve');
  assert.deepEqual(r.promoted, []);
  r = T.recordGame(s, rules, { retenue: 2 });
  s = r.store;
  assert.deepEqual(r.promoted, ['retenue']);
  assert.equal(T.stateOf(s.retenue), 'a-revoir');
  // elle n'apparaît pas deux fois
  assert.deepEqual(T.recordGame(s, rules, { retenue: 5 }).promoted, []);
});

test('fautes anciennes : sorties de la fenêtre de 10 parties', () => {
  const rules = rulesOf('calcul');
  let s: T.Store = T.recordGame({}, rules, { retenue: 2 }).store;
  for (let i = 0; i < T.WINDOW; i++) s = T.recordGame(s, rules, {}).store;
  assert.equal(T.recentFaults(s.retenue), 0);
  // une nouvelle faute isolée ne promeut pas
  assert.deepEqual(T.recordGame(s, rules, { retenue: 1 }).promoted, []);
});

test('duel : pâlie après une victoire, crayon après 3 jours différents', () => {
  let s: T.Store = T.recordGame({}, rulesOf('calcul'), { retenue: 3 }).store;
  let d = T.recordDuel(s, 'retenue', false, '2026-11-16');
  assert.equal(d.after, 'a-revoir');
  s = d.store;
  d = T.recordDuel(s, 'retenue', true, '2026-11-16');
  assert.deepEqual([d.before, d.after], ['a-revoir', 'progres']);
  s = T.recordDuel(d.store, 'retenue', true, '2026-11-16').store; // même jour : compté une fois
  assert.equal(T.stateOf(s.retenue), 'progres');
  s = T.recordDuel(s, 'retenue', true, '2026-11-17').store;
  d = T.recordDuel(s, 'retenue', true, '2026-11-20');
  assert.equal(d.after, 'acquise');
  assert.deepEqual(T.activeRules(d.store, 'calcul'), []);
});

test('stockage : relu à l’identique, réparé s’il est abîmé', () => {
  const s = T.recordGame({}, rulesOf('calcul'), { 'zero-voleur': 4 }).store;
  T.saveStore(s);
  assert.equal(T.stateOf(T.loadStore()['zero-voleur']), 'a-revoir');
  localStorage.setItem('atelier.encre.v1', '{"retenue":{"hist":"x","total":-3,"met":1},"inconnue":{}}');
  const bad = T.loadStore();
  assert.equal(T.stateOf(bad.retenue), 'neuve');
  assert.equal(Object.keys(bad).length, 1);
});

test('pression : au plus une Rature toutes les 6 questions, soupape sous 70 %', () => {
  const active = ['retenue'] as const;
  const ok = Array(10).fill(true);
  const picks = Array.from({ length: 48 }, (_, n) => n).filter((n) => T.shouldSummon(n, ok, active));
  assert.deepEqual(picks, [3, 9, 15, 21, 27, 33, 39, 45]);
  for (let page = 0; page < 6; page++) assert.ok(picks.filter((n) => Math.floor(n / 8) === page).length <= 2);
  // jamais sans Rature active
  assert.equal(T.shouldSummon(3, ok, []), false);
  // soupape : 6 réussites sur 10 = 60 % → plus de retour
  const struggling = [true, true, false, true, false, true, false, true, false, true];
  assert.equal(T.shouldSummon(9, struggling, active), false);
  // moins de 5 questions : pas de soupape (trop tôt pour juger)
  assert.equal(T.shouldSummon(3, [false, false], active), true);
});
