import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../src/game/difficulty';

test('configuration personnalisée : valeurs bornées', () => {
  const c = D.sanitizeCustom({ speed: 9999, lives: -3, letters: 'ZZaé1', content: 'bizarre', maxLen: 50, autoTarget: 'oui', miss: 'x' });
  assert.equal(c.speed, 160);
  assert.equal(c.lives, 1);
  assert.equal(c.letters, 'az');
  assert.equal(c.content, 'mixed');
  assert.equal(c.maxLen, 9);
  assert.equal(c.autoTarget, false);
  assert.equal(c.miss, 'tier');
  assert.deepEqual(D.sanitizeCustom(null), D.DEFAULT_CUSTOM);
  assert.deepEqual(D.sanitizeCustom({ letters: '123' }).letters, D.ALPHABET);
});

test('lien de séance : encodage puis décodage', () => {
  const c = D.sanitizeCustom({ speed: 70, lives: 4, letters: 'qsdfjklm', content: 'letters', maxLen: 5, autoTarget: true, miss: 'none' });
  assert.deepEqual(D.decodeCustom(D.encodeCustom(c)), c);
  assert.equal(D.decodeCustom('%%%pas-du-base64'), null);
  assert.ok(!/[+/=]/.test(D.encodeCustom(c)), 'le code doit tenir dans une adresse web');
});

test('chaque difficulté a une chute et un espacement qui ne durent jamais moins que leur plancher', () => {
  for (const d of D.DIFFICULTIES_ORDER) {
    const cfg = D.DIFFICULTIES[d];
    for (let n = 0; n < 500; n += 7) {
      assert.ok(D.crossTime(cfg, n) >= cfg.cross.min);
      assert.ok(D.gapBase(cfg, n) >= cfg.gap.min);
    }
    assert.ok(D.crossTime(cfg, 100) <= D.crossTime(cfg, 0), `${d} : la chute ne ralentit pas`);
  }
});

test('l’ordre apprenti < standard < expert est respecté au départ', () => {
  const t = (d: D.Difficulty) => D.crossTime(D.DIFFICULTIES[d], 0);
  assert.ok(t('apprenti') > t('standard') && t('standard') > t('expert'));
});

test('isDifficulty', () => {
  assert.ok(D.isDifficulty('expert'));
  assert.ok(!D.isDifficulty('facile'));
  assert.ok(!D.isDifficulty(undefined));
});
