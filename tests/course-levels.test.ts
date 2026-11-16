import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seeded } from './helpers';
import { LEVEL_IDS, PAGES, PAGE_TITLES, PER_PAGE, makeChoices, makeQuestion, travelTime } from '../src/game/course/questions';
import { ruleOfCalc } from '../src/game/encre/rules';

test('Course : chaque classe a ses 6 pages de calculs valides', () => {
  for (const level of LEVEL_IDS) {
    assert.equal(PAGE_TITLES[level].length, PAGES, level);
    const rng = seeded(21);
    for (let page = 0; page < PAGES; page++) {
      for (let i = 0; i < 150; i++) {
        const q = makeQuestion(level, page * PER_PAGE, rng);
        assert.ok(Number.isFinite(q.answer) && q.answer > 0, `${level} p${page + 1} : ${q.text} → ${q.answer}`);
        const { choices, correct } = makeChoices(q, rng);
        assert.equal(choices.length, 3, q.text);
        assert.equal(new Set(choices).size, 3, `${level} : ${q.text} ${choices}`);
        assert.equal(choices[correct], q.answer);
        assert.ok(choices.every((c) => c > 0), q.text);
      }
    }
  }
});

test('CP et CE1 : aucun mot à lire, seulement des chiffres et des signes', () => {
  for (const level of ['cp', 'ce1'] as const) {
    const rng = seeded(8);
    for (let page = 0; page < PAGES; page++) {
      for (let i = 0; i < 100; i++) {
        const q = makeQuestion(level, page * PER_PAGE, rng);
        assert.match(q.text, /^[\d\s+−×÷=?]+$/, `${level} : ${q.text}`);
      }
    }
  }
});

test('CP : nombres de plus en plus grands, jamais au-delà de 100', () => {
  const rng = seeded(3);
  const max = (page: number) => Math.max(...Array.from({ length: 200 }, () => makeQuestion('cp', page * PER_PAGE, rng).answer));
  assert.ok(max(0) <= 20, 'page 1');
  assert.ok(max(1) <= 40, 'page 2');
  assert.ok(max(5) <= 100, 'page 6');
});

test('CE1 : toujours une table de 2, 3, 4, 5 ou 10 ; CE2 : toutes les tables', () => {
  const rng = seeded(5);
  const products = (level: 'ce1' | 'ce2') => {
    const out: Array<[number, number]> = [];
    for (let page = 0; page < PAGES; page++)
      for (let i = 0; i < 300; i++) {
        const m = /^(\d+) × (\d+) = \?$/.exec(makeQuestion(level, page * PER_PAGE, rng).text);
        if (m) out.push([Number(m[1]), Number(m[2])]);
      }
    return out;
  };
  const ce1 = products('ce1');
  assert.ok(ce1.length > 50);
  assert.ok(ce1.every(([a, b]) => [a, b].some((v) => [2, 3, 4, 5, 10].includes(v))));
  const ce2 = products('ce2');
  for (const t of [6, 7, 8, 9]) assert.ok(ce2.some(([a, b]) => a === t || b === t), `CE2 sans la table de ${t}`);
});

test('temps de chute : plus généreux pour les plus jeunes, toujours décroissant', () => {
  const t0 = LEVEL_IDS.map((l) => travelTime(l, 0));
  for (let i = 1; i < t0.length; i++) assert.ok(t0[i] <= t0[i - 1]);
  for (const l of LEVEL_IDS) assert.ok(travelTime(l, 47) <= travelTime(l, 0));
  assert.ok(travelTime('cp', 47) > travelTime('cm2', 47));
});

test('règles à revoir : les additions et tables du cycle 2 sont reconnues', () => {
  assert.equal(ruleOfCalc('38 + 27 = ?'), 'retenue');
  assert.equal(ruleOfCalc('7 × 8 = ?'), 'table-fantome');
  assert.equal(ruleOfCalc('3 + 4 = ?'), null);
});
