import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cronMissing, hasCritical, parseVersion, todoFor } from '../src/server/versionLogic';
import type { ServerVersion } from '../src/server/versionLogic';
import { endOfYearReminder } from '../src/server/retention';

const v = (missing: string[]): ServerVersion => ({ version: 11, features: {}, missing });

test('Version du serveur : base à jour → rien à faire', () => {
  assert.deepEqual(todoFor(v([])), []);
  assert.equal(hasCritical(v([])), false);
});

test('Version du serveur : un fichier n\'est listé qu\'une fois, avec toutes ses raisons', () => {
  const t = todoFor(v(['fiabilite', 'invitations', 'nettoyage']));
  assert.equal(t.length, 1);
  assert.equal(t[0].file, 'mise-a-jour-fiabilite.sql');
  assert.equal(t[0].why.length, 3);
  assert.equal(t[0].critical, true);
});

test('Version du serveur : les fichiers sont proposés du plus ancien au plus récent, « fiabilité » en dernier', () => {
  const t = todoFor(v(['fiabilite', 'exercices', 'seances', 'securite']));
  assert.deepEqual(
    t.map((x) => x.file),
    ['mise-a-jour-seances.sql', 'mise-a-jour-securite.sql', 'mise-a-jour-exercices.sql', 'mise-a-jour-fiabilite.sql'],
  );
});

test('Version du serveur : une mise à jour facultative ne déclenche pas l\'alerte des enseignants', () => {
  assert.equal(hasCritical(v(['memoire', 'orthographe', 'exercices'])), false);
  assert.equal(hasCritical(v(['securite'])), true);
  assert.equal(hasCritical(v(['fiabilite'])), true);
});

test('Version du serveur : pg_cron absent est signalé à part', () => {
  assert.equal(cronMissing(v(['nettoyage_auto'])), true);
  assert.equal(todoFor(v(['nettoyage_auto'])).length, 0);
  assert.equal(cronMissing(v([])), false);
});

test('Version du serveur : une réponse inattendue est ignorée', () => {
  assert.equal(parseVersion(null), null);
  assert.equal(parseVersion({ version: 11 }), null);
  assert.equal(parseVersion('x'), null);
  const ok = parseVersion({ version: 11, features: { seances: true, securite: 'oui' }, missing: ['securite', 3] });
  assert.deepEqual(ok, { version: 11, features: { seances: true, securite: false }, missing: ['securite'] });
});

test('Fin d\'année : rappel du 15 juin au 30 septembre seulement', () => {
  const at = (m: number, d: number) => endOfYearReminder(new Date(2027, m - 1, d));
  assert.equal(at(6, 14), false);
  assert.equal(at(6, 15), true);
  assert.equal(at(7, 10), true);
  assert.equal(at(8, 31), true);
  assert.equal(at(9, 30), true);
  assert.equal(at(10, 1), false);
  assert.equal(at(11, 18), false);
  assert.equal(at(1, 5), false);
});
