import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classGrades, gradeSide } from '../src/game/grade';

test('classe mixte : niveaux triés, sans doublon ni valeur inconnue', () => {
  assert.deepEqual(classGrades('cm1', ['cm2', 'cm1', 'cm2', 'terminale']), ['cm1', 'cm2']);
  assert.deepEqual(classGrades(null, ['ce2', 'ce1']), ['ce1', 'ce2']);
});

test('classe d’un seul niveau ou base non mise à jour : le niveau seul sert', () => {
  assert.deepEqual(classGrades('cm2', undefined), ['cm2']);
  assert.deepEqual(classGrades('cm2', null), ['cm2']);
  assert.deepEqual(classGrades('cm2', []), ['cm2']);
});

test('classe sans niveau fixé : aucune liste', () => {
  assert.deepEqual(classGrades(null, null), []);
  assert.deepEqual(classGrades('x', 'y'), []);
});

test('niveau joué : dans la classe, en révision ou en avance', () => {
  assert.equal(gradeSide('cm1', ['cm1', 'cm2']), 0);
  assert.equal(gradeSide('cm2', ['cm1', 'cm2']), 0);
  assert.equal(gradeSide('ce2', ['cm1', 'cm2']), -1);
  assert.equal(gradeSide('cm2', ['ce2']), 1);
  assert.equal(gradeSide('ce1', ['ce2']), -1);
  assert.equal(gradeSide('cm1', []), 0);
});

test('niveau entre deux niveaux non contigus : traité comme de la classe', () => {
  assert.equal(gradeSide('ce2', ['ce1', 'cm1']), 0);
});
