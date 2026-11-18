import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PLACEHOLDER, buildId, stampServiceWorker } from '../scripts/sw-version';

test('Service worker : le cache prend l\'empreinte de la page, plus rien à numéroter à la main', () => {
  const sw = readFileSync('public/sw.js', 'utf8');
  assert.ok(sw.includes(`'atelier-${PLACEHOLDER}'`), 'repère attendu dans public/sw.js');
  const a = stampServiceWorker(sw, '<html>1</html>');
  assert.ok(!a.includes(PLACEHOLDER));
  assert.match(a, /const CACHE = 'atelier-[0-9a-f]{10}';/);
});

test('Service worker : une page différente donne un cache différent, la même page le même', () => {
  assert.notEqual(buildId('a'), buildId('b'));
  assert.equal(buildId('a'), buildId(new TextEncoder().encode('a')));
  const sw = `const CACHE = 'atelier-${PLACEHOLDER}';`;
  assert.notEqual(stampServiceWorker(sw, 'a'), stampServiceWorker(sw, 'b'));
});

test('Service worker : sans repère, la construction échoue plutôt que de figer le cache', () => {
  assert.throws(() => stampServiceWorker("const CACHE = 'atelier-v52';", 'x'), /repère/);
});
