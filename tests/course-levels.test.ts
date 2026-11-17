import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seeded } from './helpers';
import { LEVEL_IDS, PAGES, PAGE_TITLES, PER_PAGE, SPIRAL, makeChoices, makeQuestion, travelTime } from '../src/game/course/questions';
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

test('CE1 : tables de 2 à 5 et 10 d’abord, tables de 6 à 9 à partir de la page 5 ; CE2 : toutes les tables', () => {
  const rng = seeded(5);
  const tables = (level: 'ce1' | 'ce2', pages: number[]) => {
    const out: Array<[number, number]> = [];
    for (const page of pages)
      for (let i = 0; i < 300; i++) {
        const t = makeQuestion(level, page * PER_PAGE, rng).text;
        const m = /^(\d+) × (\d+|\?) = (?:\?|\d+)$/.exec(t);
        if (m && Number(m[1]) <= 10 && (m[2] === '?' || Number(m[2]) <= 10)) out.push([Number(m[1]), m[2] === '?' ? 0 : Number(m[2])]);
      }
    return out;
  };
  const early = tables('ce1', [0, 1, 2, 3]);
  assert.ok(early.length > 50);
  assert.ok(early.every(([a, b]) => [a, b].some((v) => [2, 3, 4, 5, 10].includes(v)) && ![a, b].some((v) => v >= 6 && v <= 9 && ![a, b].some((w) => [2, 3, 4, 5, 10].includes(w)))));
  const late = tables('ce1', [4]);
  for (const t of [6, 7, 8, 9]) assert.ok(late.some(([a, b]) => a === t || b === t), `CE1 page 5 sans la table de ${t}`);
  const ce2 = tables('ce2', [1, 2, 3, 4, 5]);
  for (const t of [6, 7, 8, 9]) assert.ok(ce2.some(([a, b]) => a === t || b === t), `CE2 sans la table de ${t}`);
});

test('CE1 : nombres jusqu’à 1 000, jamais au-delà', () => {
  const rng = seeded(9);
  for (let page = 0; page < PAGES; page++)
    for (let i = 0; i < 200; i++) assert.ok(makeQuestion('ce1', page * PER_PAGE, rng).answer < 1000);
});

test('Programme 2025 : ni pourcentage ni multiple de 25 au cours moyen ; au CM1, les décimaux ne sont multipliés ou divisés que par 10', () => {
  const rng = seeded(13);
  for (const level of ['cm1', 'cm2'] as const)
    for (let page = 0; page < PAGES; page++)
      for (let i = 0; i < 200; i++) {
        const t = makeQuestion(level, page * PER_PAGE, rng).text;
        assert.ok(!t.includes('%'), t);
        assert.ok(!/× (25|0,1) /.test(t), t);
        if (level === 'cm1' && /,\d/.test(t.split('=')[0])) assert.ok(!/[×÷] (100|1 000)/.test(t), `CM1 : ${t}`);
      }
});

test('Révision espacée : de la page 2 à la page 5, environ un calcul sur quatre reprend une page précédente', () => {
  const rng = seeded(17);
  // CM2, page 3 : ses propres calculs ne sont jamais des moitiés, des doubles ni des facteurs manquants ;
  // ceux-là viennent de la page 1 (4 calculs sur 6), reprise une fois sur deux quand on revient en arrière.
  const n = 6000;
  let back = 0;
  for (let i = 0; i < n; i++) if (/^Moitié de|^Double de|× \? =/.test(makeQuestion('cm2', 2 * PER_PAGE, rng).text)) back++;
  const expected = SPIRAL * 0.5 * (4 / 6);
  assert.ok(Math.abs(back / n - expected) < 0.025, `part de reprises : ${back / n} (attendu ≈ ${expected})`);
  // la première page ne reprend rien
  for (let i = 0; i < 300; i++) assert.ok(!/× \? =|^Double de/.test(makeQuestion('cp', 0, rng).text));
});

test('Erreurs plausibles : chaque calcul propose de vraies erreurs d’élèves', () => {
  const rng = seeded(23);
  // + 19 : oublier de retrancher 1, ou ajouter 1 au lieu de le retrancher
  for (let i = 0; i < 200; i++) {
    const q = makeQuestion('cm1', PER_PAGE, rng);
    const m = /^(\d+) \+ 19 = \?$/.exec(q.text.replace(/\s(?=\d{3})/g, ''));
    if (m) {
      const x = Number(m[1]);
      assert.ok(q.near.includes(x + 20) && q.near.includes(x + 21), q.text);
    }
  }
  // 3,6 + 2,7 → « 5,13 » (entiers et dixièmes additionnés séparément)
  let seen = false;
  for (let i = 0; i < 400; i++) {
    const q = makeQuestion('cm2', 3 * PER_PAGE, rng);
    const m = /^(\d),(\d) \+ (\d),(\d) = \?$/.exec(q.text);
    if (m && Number(m[2]) + Number(m[4]) >= 10) {
      seen = true;
      assert.ok(q.near.includes(Number(m[1]) + Number(m[3]) + (Number(m[2]) + Number(m[4])) / 100), q.text);
    }
  }
  assert.ok(seen);
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
