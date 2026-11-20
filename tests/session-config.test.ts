import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as S from '../src/game/sessionConfig';
import * as Q from '../src/game/course/questions';

test('réglages inconnus ou abîmés : on retombe sur une partie normale', () => {
  for (const bad of [null, undefined, 'x', 42, [], {}, { diff: 'facile', level: 'cm9', mode: 'zzz', startPage: 'a' }]) {
    assert.equal(S.parseTyping(bad).diff, 'standard');
    assert.deepEqual(S.parseMath(bad), { level: 'cm1', diff: 'standard' });
    assert.deepEqual(S.parseMemory(bad), { mode: 'suite', diff: 'standard', startPage: 0 });
  }
});

test('réglages valides conservés, bornés', () => {
  assert.deepEqual(S.parseMath({ level: 'cm2', diff: 'expert' }), { level: 'cm2', diff: 'expert' });
  assert.deepEqual(S.parseMemory({ mode: 'cases', startPage: 3.9 }), { mode: 'cases', diff: 'standard', startPage: 3 });
  assert.equal(S.parseMemory({ diff: 'expert' }).diff, 'expert');
  assert.equal(S.parseMemory({ diff: 'perso' }).diff, 'standard');
  assert.equal(S.parseMemory({ startPage: 99 }).startPage, 5);
  assert.equal(S.parseMemory({ startPage: -4 }).startPage, 0);
  assert.equal(S.parseTyping({ diff: 'perso', custom: { speed: 9999 } }).custom.speed, 160);
});

test('descriptions lisibles', () => {
  assert.deepEqual(S.describeConfig('math', { level: 'cm2', diff: 'apprenti' }), ['CM2', 'Apprenti']);
  assert.deepEqual(S.describeConfig('memory', { mode: 'cases', startPage: 2 }), ['Les Cases', 'Standard', 'départ à la page 3']);
  assert.deepEqual(S.describeConfig('typing', { diff: 'expert' }), ['Expert']);
  assert.ok(S.describeConfig('typing', { diff: 'perso', custom: { lives: 1 } }).includes('1 vie'));
});

test('Course : Apprenti plus indulgent que Standard, lui-même plus indulgent qu’Expert', () => {
  const t = Q.COURSE_TUNING;
  assert.ok(t.apprenti.time > t.standard.time && t.standard.time > t.expert.time);
  assert.ok(t.apprenti.drain < t.standard.drain && t.standard.drain < t.expert.drain);
  assert.ok(t.apprenti.wrong < t.standard.wrong && t.standard.wrong < t.expert.wrong);
  assert.ok(t.apprenti.heal > t.standard.heal && t.standard.heal > t.expert.heal);
  for (const level of ['cm1', 'cm2'] as Q.Level[]) {
    for (let n = 0; n < Q.TOTAL; n += 5) {
      assert.ok(Q.travelTime(level, n, 'apprenti') > Q.travelTime(level, n, 'standard'));
      assert.ok(Q.travelTime(level, n, 'standard') > Q.travelTime(level, n, 'expert'));
    }
  }
  assert.equal(Q.travelTime('cm1', 7), Q.travelTime('cm1', 7, 'standard'), 'Standard = comportement d’avant');
});

test('clés de classement : Standard garde l’ancienne clé', () => {
  assert.equal(Q.boardKey('cm1', 'standard'), 'cm1');
  assert.equal(Q.boardKey('cm2', 'expert'), 'cm2-expert');
  assert.equal(Q.boardKey('cm1', 'apprenti'), 'cm1-apprenti');
  for (const l of ['cm1', 'cm2'] as Q.Level[]) for (const d of ['apprenti', 'standard', 'expert'] as Q.CourseDiff[]) {
    assert.match(Q.boardKey(l, d), /^[a-z0-9_-]{1,20}$/, 'accepté par le serveur');
  }
});

test('Le facteur : niveau de séance lu avec repli sur le niveau 1', async () => {
  const { parseFacteur, describeConfig, GAME_NAMES } = await import('../src/game/sessionConfig');
  assert.deepEqual(parseFacteur({ level: 3 }), { level: 3 });
  assert.deepEqual(parseFacteur({ level: 9 }), { level: 1 });
  assert.deepEqual(parseFacteur(null), { level: 1 });
  assert.equal(GAME_NAMES.facteur, 'Le facteur');
  assert.deepEqual(describeConfig('facteur', { level: 2 }), ['Niveau 2']);
});
