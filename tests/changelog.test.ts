import assert from 'node:assert/strict';
import { test } from 'node:test';
import { APP_VERSION, RELEASES } from '../src/content/changelog';
import { BUILD, RUNTIME, SERVICES } from '../src/content/credits';

const num = (v: string) => v.split('.').map(Number);

test('Nouveautés : versions uniques, de la plus récente à la plus ancienne', () => {
  const versions = RELEASES.map((r) => r.version);
  assert.equal(new Set(versions).size, versions.length);
  for (let i = 1; i < RELEASES.length; i++) {
    const [a, b] = [num(RELEASES[i - 1].version), num(RELEASES[i].version)];
    assert.ok(a[0] > b[0] || (a[0] === b[0] && a[1] > b[1]), `${RELEASES[i - 1].version} doit être plus récente que ${RELEASES[i].version}`);
  }
  assert.equal(APP_VERSION, RELEASES[0].version);
});

test('Nouveautés : dates valides, jamais dans le désordre, et au moins une nouveauté par version', () => {
  for (let i = 0; i < RELEASES.length; i++) {
    const r = RELEASES[i];
    assert.match(r.iso, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(!Number.isNaN(Date.parse(r.iso)));
    assert.ok(r.changes.length > 0, `version ${r.version} vide`);
    if (i > 0) assert.ok(RELEASES[i - 1].iso >= r.iso, 'les dates ne doivent pas remonter');
  }
});

test('Crédits : chaque élément a un nom, un rôle, une licence et un lien https', () => {
  for (const c of [...RUNTIME, ...BUILD, ...SERVICES]) {
    assert.ok(c.name && c.role && c.license, c.name);
    assert.match(c.url, /^https:\/\//);
  }
});
