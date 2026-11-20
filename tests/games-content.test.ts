import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GAMES } from '../src/content/games';
import { AVAILABLE, GRADES, gradeLabel } from '../src/game/grade';
import type { GameKey } from '../src/game/grade';

// La présentation des jeux (accueil, À propos) doit rester d'accord avec les classes réellement ouvertes.
const BY_NAME: Record<string, GameKey> = {
  'Frappe !': 'typing',
  'Course à l’encre': 'math',
  'Chasse aux fautes': 'spelling',
  'Mémoire d’encre': 'memory',
  'Mots en orbite': 'lexique',
  'Le facteur': 'facteur',
};

test('Présentation des jeux : les classes annoncées sont celles de AVAILABLE', () => {
  assert.equal(GAMES.length, Object.keys(BY_NAME).length);
  for (const g of GAMES) {
    const key = BY_NAME[g.name];
    assert.ok(key, `jeu inconnu : ${g.name}`);
    const order = GRADES.map((x) => x.id);
    const open = AVAILABLE[key].slice().sort((a, b) => order.indexOf(a) - order.indexOf(b));
    assert.equal(g.grades, open.length === 1 ? gradeLabel(open[0]) : `${gradeLabel(open[0])} à ${gradeLabel(open[open.length - 1])}`, g.name);
    assert.ok(g.short.length > 0 && g.text.length > 0);
  }
});
