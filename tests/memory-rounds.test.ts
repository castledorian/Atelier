import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as R from '../src/game/memory/rounds';
import { seeded } from './helpers';

test('totaux : 30 manches (Suite) et 24 manches (Cases)', () => {
  assert.equal(R.totalOf('suite'), 30);
  assert.equal(R.totalOf('cases'), 24);
});

test('Cases : la difficulté ne diminue jamais', () => {
  for (let n = 1; n < 24; n++) {
    assert.ok(R.CASES_COUNT[n] >= R.CASES_COUNT[n - 1], `taches ${n}`);
    assert.ok(R.CASES_SIZE[n] >= R.CASES_SIZE[n - 1], `grille ${n}`);
  }
});

test('Suite : la même suite s’allonge d’une tache et garde son début', () => {
  const rng = seeded(1);
  for (let rep = 0; rep < 300; rep++) {
    let seq: number[] = [];
    for (let n = 0; n < R.totalOf('suite'); n++) {
      const prev = seq;
      seq = R.extendSuite(prev, R.suiteLen(n), rng);
      assert.equal(seq.length, n + 1);
      assert.deepEqual(seq.slice(0, prev.length), prev, 'le début a changé');
      assert.ok(seq.every((c, i) => c >= 0 && c <= 8 && (i === 0 || c !== seq[i - 1])), 'case invalide ou répétée');
      assert.deepEqual(R.extendSuite(seq, R.suiteLen(n), rng), seq, 'rejouer la manche modifie la suite');
    }
    assert.equal(R.extendSuite(seq, 3, rng).length, 3);
  }
});

test('Cases : tailles, doublons et densité', () => {
  const rng = seeded(2);
  for (let rep = 0; rep < 300; rep++) {
    for (let n = 0; n < 24; n++) {
      const c = R.makeCases(n, rng);
      assert.equal(c.size, R.CASES_SIZE[n]);
      assert.equal(c.cells.length, R.CASES_COUNT[n]);
      assert.equal(new Set(c.cells).size, c.cells.length, 'doublon');
      assert.ok(c.cells.every((x) => x >= 0 && x < c.size ** 2), 'hors grille');
      assert.ok(c.cells.length <= c.size ** 2 / 2, 'grille trop remplie');
    }
  }
});

test('pages et durées', () => {
  assert.equal(R.stageOf('suite', 4), 0);
  assert.equal(R.stageOf('suite', 5), 1);
  assert.equal(R.stageOf('suite', 29), 5);
  assert.equal(R.stageOf('cases', 23), 5);
  assert.equal(R.stageOf('suite', 999), 5);
  for (let n = 0; n < 30; n++) {
    assert.equal(R.spanOf('suite', n), n + 1);
    assert.ok(R.suiteStep(n) >= 0.55 && R.suiteStep(n) <= 0.9);
  }
  for (let n = 1; n < 30; n++) assert.ok(R.suiteStep(n) <= R.suiteStep(n - 1), 'le rythme ne ralentit pas');
  for (let n = 0; n < 24; n++) assert.ok(R.casesShow(n) >= 1.3, 'temps d’observation trop court');
});

test('pavé numérique : disposition 7 8 9 / 4 5 6 / 1 2 3', () => {
  assert.equal(R.digitToCell(7), 0);
  assert.equal(R.digitToCell(9), 2);
  assert.equal(R.digitToCell(5), 4);
  assert.equal(R.digitToCell(1), 6);
  for (let d = 1; d <= 9; d++) assert.ok(R.digitToCell(d) >= 0 && R.digitToCell(d) <= 8);
});
