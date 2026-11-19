import assert from 'node:assert/strict';
import test from 'node:test';
import { AVAILABLE } from '../src/game/grade';
import type { Grade } from '../src/game/grade';
import { LEVEL_IDS, PER_PAGE, TOTAL, makeChoices, makeQuestion } from '../src/game/course/questions';
import { MEMORY_DIFF, MEMORY_TUNE, casesShow, casesSpec, suiteStep } from '../src/game/memory/rounds';
import { LEX_LEVELS, lexLevelOf } from '../src/game/lexique/rounds';
import { GRADE_RANK } from '../src/game/spelling/engine';

/**
 * Courbes de difficulté par classe. Règle : tout jeu proposé à une classe doit avoir un réglage écrit POUR cette classe
 * (contenu, plafonds, cadence) ; ce fichier le vérifie, et il est à compléter à chaque nouveau jeu ou nouvelle classe.
 */

const rngOf = (seed: number) => {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
};
const nums = (t: string) => (t.match(/\d+/g) ?? []).map(Number);

test('toute classe proposée pour un jeu a son réglage', () => {
  for (const g of AVAILABLE.math) assert.ok(LEVEL_IDS.includes(g), `Course à l’encre : pas de calculs pour ${g}`);
  for (const g of AVAILABLE.memory) assert.ok(MEMORY_TUNE[g] && MEMORY_TUNE[g].cap > 0, `Mémoire d’encre : pas de réglage pour ${g}`);
  for (const g of AVAILABLE.lexique) assert.ok(LEX_LEVELS.some((l) => l.id === lexLevelOf(g)), `Mots en orbite : pas de niveau de mots pour ${g}`);
  for (const g of AVAILABLE.spelling) assert.ok(g in GRADE_RANK, `Chasse aux fautes : pas de rang pour ${g}`);
});

test('CP — calculs : jamais au-delà de 100, jamais deux nombres à deux chiffres « compliqués », jamais de retenue cachée', () => {
  const r = rngOf(2026);
  for (let g = 0; g < 250; g++) {
    const recent: string[] = [];
    for (let n = 0; n < TOTAL; n++) {
      const q = makeQuestion('cp', n, r, recent);
      recent.push(q.text);
      if (recent.length > 6) recent.shift();
      const v = nums(q.text);
      assert.ok(Math.max(...v, q.answer) <= 100, `CP : « ${q.text} » dépasse 100`);
      const { choices } = makeChoices(q, r);
      assert.ok(Math.max(...choices) <= 130, `CP : propositions trop grandes pour « ${q.text} » : ${choices}`);
      // au plus UN nombre à deux chiffres qui n'est pas une dizaine entière
      const odd = v.filter((x) => x >= 11 && x % 10 !== 0);
      assert.ok(odd.length <= 1 || Math.max(...v) <= 20, // jusqu'à 20 : le programme de début de CP
         `CP : deux nombres à deux chiffres dans « ${q.text} »`);
      const m = /^(\d+) ([+−]) (\d+) = \?$/.exec(q.text);
      if (m) {
        const a = Number(m[1]);
        const b = Number(m[3]);
        if (a >= 21 && a % 10 !== 0 && b <= 9) { // jusqu'à 20, les tables d'addition passent la dizaine : c'est le programme
          if (m[2] === '+' && b === 9) assert.ok(a <= 40, `CP : « ${q.text} » (+ 9) trop grand`);
          else if (m[2] === '+') assert.ok((a % 10) + b <= 9 || b <= 2, `CP : retenue dans « ${q.text} »`);
          else assert.ok(a % 10 >= b || b <= 2, `CP : dizaine cassée dans « ${q.text} »`);
        }
      }
    }
  }
});

test('calculs : plus la classe monte, plus les nombres montent (CP ≤ CE1 ≤ CE2) et la première page est toujours douce', () => {
  const peak = (g: Grade, page: number) => {
    const r = rngOf(7);
    let m = 0;
    for (let i = 0; i < 600; i++) {
      const q = makeQuestion(g, page * PER_PAGE, r, []);
      m = Math.max(m, ...nums(q.text), q.answer);
    }
    return m;
  };
  assert.ok(peak('cp', 5) <= 100);
  assert.ok(peak('ce1', 5) <= 1000);
  assert.ok(peak('cp', 5) <= peak('ce1', 5) && peak('ce1', 5) <= peak('ce2', 5));
  assert.ok(peak('cp', 0) <= 20, 'CP, page 1 : jusqu’à 20 seulement');
  assert.ok(peak('ce1', 0) <= 100);
});

test('Mémoire d’encre — les Cases : le nombre de taches reste dans l’empan de la classe, et ne baisse jamais en cours de partie', () => {
  for (const g of ['cp', 'ce1', 'ce2', 'cm1', 'cm2'] as Grade[]) {
    for (const d of ['apprenti', 'standard', 'expert'] as const) {
      const cap = MEMORY_TUNE[g].cap + (d === 'expert' && MEMORY_TUNE[g].cap < 99 ? 1 : 0);
      let prev = 0;
      for (let n = 0; n < 24; n++) {
        const s = casesSpec(n, g, d);
        assert.ok(s.count <= cap, `${g}/${d} manche ${n} : ${s.count} taches (plafond ${cap})`);
        assert.ok(s.count <= s.size * s.size - 2);
        assert.ok(s.count >= prev, `${g}/${d} : la difficulté baisse à la manche ${n}`);
        prev = s.count;
      }
    }
  }
  // le CP voit au plus 4 taches (5 en Expert) sur une grille 3 × 3
  assert.ok(casesSpec(23, 'cp', 'standard').count <= 4);
  assert.equal(casesSpec(23, 'cp', 'standard').size, 3);
});

test('Mémoire d’encre : plus on est jeune, plus on a le temps (cadence et observation)', () => {
  const order: Grade[] = ['cp', 'ce1', 'ce2', 'cm1', 'cm2'];
  for (let i = 1; i < order.length; i++) {
    assert.ok(suiteStep(5, order[i - 1]) >= suiteStep(5, order[i]), `${order[i - 1]} → ${order[i]} : cadence`);
    assert.ok(casesShow(5, order[i - 1]) >= casesShow(5, order[i]), `${order[i - 1]} → ${order[i]} : observation`);
  }
  assert.ok(MEMORY_DIFF.apprenti.lives > MEMORY_DIFF.standard.lives);
});
