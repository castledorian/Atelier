import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DROP_MAX_MS, DROP_MIN_MS, dropPitch, nextDropDelay } from '../src/game/caveSound';

test('gouttes : toujours lentes (au moins 3,5 s entre deux) et irrégulières', () => {
  assert.equal(nextDropDelay(0), DROP_MIN_MS);
  assert.equal(nextDropDelay(1), DROP_MAX_MS);
  assert.ok(DROP_MIN_MS >= 3500, 'très lent, comme demandé');
  assert.ok(nextDropDelay(0.4) > nextDropDelay(0.1));
  assert.equal(nextDropDelay(-3), DROP_MIN_MS, 'valeur absurde ramenée dans les bornes');
  assert.equal(nextDropDelay(9), DROP_MAX_MS);
});

test('gouttes : hauteur dans une plage grave et douce', () => {
  for (const r of [0, 0.3, 0.7, 1]) {
    const f = dropPitch(r);
    assert.ok(f >= 600 && f <= 1200, `${f} Hz`);
  }
});
