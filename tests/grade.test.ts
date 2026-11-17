import { beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { installFakeStorage } from './helpers';
import { AVAILABLE, GRADES, effectiveGrade, isAvailable, levelOf, loadClassGrade, loadGrade, saveClassGrade, saveGrade } from '../src/game/grade';

beforeEach(() => installFakeStorage());

test('classe : choisie une fois, gardée, valeur abîmée ignorée', () => {
  assert.equal(loadGrade(), null);
  saveGrade('ce2');
  assert.equal(loadGrade(), 'ce2');
  localStorage.setItem('atelier.grade.v1', 'terminale');
  assert.equal(loadGrade(), null);
});

test('jeux : seuls ceux qui conviennent à la classe apparaissent', () => {
  assert.equal(isAvailable('memory', null), false);
  for (const g of GRADES) assert.equal(isAvailable('memory', g.id), true);
  assert.equal(isAvailable('typing', 'cp'), false);
  assert.equal(isAvailable('math', 'cp'), true);
  assert.equal(isAvailable('math', 'cm2'), true);
  assert.equal(isAvailable('spelling', 'cp'), false);
  assert.equal(isAvailable('spelling', 'ce1'), true);
  for (const list of Object.values(AVAILABLE)) assert.ok(list.length > 0);
});

test('niveau de contenu : CM2 pour le CM2, CM1 sinon', () => {
  assert.equal(levelOf('cm2'), 'cm2');
  assert.equal(levelOf('cm1'), 'cm1');
  assert.equal(levelOf(null), 'cm1');
});

test('niveau fixé par l’enseignant : prioritaire, propre à chaque élève', () => {
  saveGrade('cm1');
  assert.equal(effectiveGrade(null), 'cm1');
  assert.equal(effectiveGrade('eleve-1'), 'cm1');
  saveClassGrade('eleve-1', 'ce2');
  assert.equal(effectiveGrade('eleve-1'), 'ce2');
  assert.equal(loadClassGrade('eleve-2'), null);
  assert.equal(effectiveGrade('eleve-2'), 'cm1');
  saveClassGrade('eleve-1', null);
  assert.equal(effectiveGrade('eleve-1'), 'cm1');
});
