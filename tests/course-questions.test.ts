import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as Q from '../src/game/course/questions';
import { seeded } from './helpers';

const LEVELS: Q.Level[] = ['cm1', 'cm2'];

test('chaque calcul de chaque page est valide (réponse, texte, erreurs plausibles)', () => {
  const rng = seeded(3);
  for (const level of LEVELS) {
    for (let n = 0; n < Q.TOTAL; n++) {
      for (let rep = 0; rep < 150; rep++) {
        const q = Q.makeQuestion(level, n, rng);
        const where = `${level} #${n} « ${q.text} »`;
        assert.ok(q.text.trim().length > 0, where);
        assert.ok(Number.isFinite(q.answer) && q.answer > 0, `réponse invalide : ${where}`);
        assert.ok(q.near.every((v) => Number.isFinite(v) && v > 0 && v !== q.answer), `erreur plausible invalide : ${where}`);
        assert.ok(!/NaN|undefined|Infinity/.test(q.text), where);
      }
    }
  }
});

test('trois choix distincts, la bonne réponse est repérée', () => {
  const rng = seeded(4);
  for (const level of LEVELS) {
    for (let n = 0; n < Q.TOTAL; n++) {
      for (let rep = 0; rep < 100; rep++) {
        const q = Q.makeQuestion(level, n, rng);
        const { choices, correct } = Q.makeChoices(q, rng);
        assert.equal(choices.length, 3);
        assert.equal(new Set(choices).size, 3, `choix en double : ${q.text}`);
        assert.equal(choices[correct], q.answer);
        assert.ok(choices.every((c) => c > 0));
      }
    }
  }
});

test('un calcul à retravailler garde la même réponse', () => {
  const q = Q.fromMissed({ text: '7 × 8 = ?', answer: 56, near: [54, 63], count: 2 });
  assert.deepEqual(q, { text: '7 × 8 = ?', answer: 56, near: [54, 63] });
});

test('évite de reposer un calcul récent', () => {
  const rng = seeded(5);
  let repeats = 0;
  for (let rep = 0; rep < 300; rep++) {
    const first = Q.makeQuestion('cm1', 9, rng);
    const second = Q.makeQuestion('cm1', 9, rng, [first.text]);
    if (second.text === first.text) repeats++;
  }
  assert.ok(repeats < 15, `trop de répétitions : ${repeats}/300`);
});

test('temps de chute : décroît doucement et ne descend pas sous le plancher', () => {
  for (const level of LEVELS) {
    for (let n = 1; n < Q.TOTAL; n++) assert.ok(Q.travelTime(level, n) <= Q.travelTime(level, n - 1));
  }
  assert.equal(Q.travelTime('cm1', 10_000), 6.5 * Q.COURSE_TUNING.standard.time);
  assert.equal(Q.travelTime('cm2', 10_000), 5.5 * Q.COURSE_TUNING.standard.time);
  assert.equal(Q.travelTime('cm1', 0), 10 * Q.COURSE_TUNING.standard.time);
});

test('pages', () => {
  assert.equal(Q.TOTAL, 48);
  assert.equal(Q.stageOf(0), 0);
  assert.equal(Q.stageOf(7), 0);
  assert.equal(Q.stageOf(8), 1);
  assert.equal(Q.stageOf(500), 5);
  for (const l of LEVELS) assert.equal(Q.PAGE_TITLES[l].length, Q.PAGES);
});

test('écriture française des nombres', () => {
  assert.equal(Q.fmtNum(1234567).replace(/\s/g, '_'), '1_234_567');
  assert.equal(Q.fmtNum(1000).replace(/\s/g, '_'), '1_000');
  assert.match(Q.fmtNum(12.5), /^12,5$/);
  assert.match(Q.fmtNum(0.1 + 0.2), /^0,3$/);
});
