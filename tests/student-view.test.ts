import { test } from 'node:test';
import assert from 'node:assert/strict';
import { flagOf, gameSummaries, missedItems, progressSeries, strengthsAndWeaknesses, summarySentence, trendOf, weeklyActivity } from '../src/game/studentView';
import type { StudentItem, StudentRun } from '../src/game/studentView';

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 10, 26, 12);
const run = (o: Partial<StudentRun>): StudentRun => ({ at: NOW - DAY, game: 'math', mode: 'cm1-standard', kind: 'game', session: false, score: 300, wave: 4, wpm: 0, acc: 80, correct: 20, duration: 100, ...o });
const item = (o: Partial<StudentItem>): StudentItem => ({ game: 'math', level: 'cm1', k: 'rule', item: 'tables', label: 'Tables de multiplication', shown: 20, wrong: 8, picks: {}, ...o });

test('résumé par jeu : les entraînements ne comptent pas comme des parties', () => {
  const s = gameSummaries([run({ score: 200, acc: 70 }), run({ score: 400, acc: 90 }), run({ kind: 'drill', score: 999 }), run({ game: 'typing', score: 50, acc: 100 })]);
  assert.equal(s[0].game, 'math');
  assert.equal(s[0].runs, 2);
  assert.equal(s[0].best, 400);
  assert.equal(s[0].acc, 80);
  assert.equal(s[1].game, 'typing');
});

test('courbe : ordre chronologique, moyenne lissée sur 3 parties', () => {
  const series = progressSeries([run({ at: 3, acc: 90 }), run({ at: 1, acc: 60 }), run({ at: 2, acc: 75 }), run({ at: 9, game: 'typing', acc: 10 })], 'math');
  assert.deepEqual(series.map((p) => p.acc), [60, 75, 90]);
  assert.equal(series[2].smooth, 75);
  assert.equal(progressSeries([], 'math').length, 0);
});

test('tendance : il faut au moins 6 parties, et un écart de 5 points', () => {
  const mk = (accs: number[]) => progressSeries(accs.map((acc, i) => run({ at: i + 1, acc })), 'math');
  assert.equal(trendOf(mk([50, 60])).kind, 'few');
  const up = trendOf(mk([50, 50, 50, 50, 50, 70, 70, 70, 70, 70]));
  assert.equal(up.kind, 'up');
  assert.equal(up.kind === 'up' ? up.delta : 0, 20);
  assert.equal(trendOf(mk([70, 70, 70, 70, 70, 50, 50, 50, 50, 50])).kind, 'down');
  assert.equal(trendOf(mk([60, 61, 60, 61, 60, 61, 60, 61])).kind, 'flat');
});

test('points faibles et forts : seuils sur le nombre de manches, calculs précis à part', () => {
  const { weak, strong } = strengthsAndWeaknesses([
    item({ item: 'frac', label: 'Fractions', shown: 30, wrong: 15 }),
    item({ item: 'add', label: 'Additions', shown: 40, wrong: 2 }),
    item({ item: 'div', label: 'Divisions', shown: 5, wrong: 5 }),
    item({ item: 'sub', label: 'Soustractions', shown: 20, wrong: 5 }),
    item({ k: 'item', item: '7 × 8', label: '7 × 8', shown: 4, wrong: 4 }),
  ]);
  assert.deepEqual(weak.map((w) => w.label), ['Fractions']);
  assert.deepEqual(strong.map((w) => w.label), ['Additions']);
});

test('exercices précis les plus ratés, avec les réponses données à la place', () => {
  const m = missedItems([item({ k: 'item', item: '7 × 8', label: '7 × 8', shown: 6, wrong: 5, picks: { '54': 3 } }), item({ k: 'item', item: '6 × 6', label: '6 × 6', shown: 5, wrong: 1 })]);
  assert.equal(m.length, 1);
  assert.equal(m[0].label, '7 × 8');
  assert.equal(m[0].picks['54'], 3);
});

test('activité hebdomadaire sur 8 semaines', () => {
  const w = weeklyActivity([run({ at: NOW - DAY }), run({ at: NOW - 2 * DAY }), run({ at: NOW - 10 * DAY }), run({ at: NOW - 100 * DAY })], NOW);
  assert.equal(w.length, 8);
  assert.equal(w[7].runs, 2);
  assert.equal(w[6].runs, 1);
  assert.equal(w.reduce((s, x) => s + x.runs, 0), 3);
});

test('repère d’attention : jamais une note, toujours une aide', () => {
  const base = { last_played: NOW - DAY, runs_30d: 5, acc_recent: 80, acc_prev: 78 };
  assert.equal(flagOf({ ...base, last_played: null }, NOW).flag, 'never');
  assert.equal(flagOf({ ...base, last_played: NOW - 20 * DAY }, NOW).flag, 'inactive');
  assert.equal(flagOf({ ...base, acc_recent: 50 }, NOW).flag, 'struggling');
  assert.equal(flagOf({ ...base, acc_recent: 85, acc_prev: 70 }, NOW).flag, 'rising');
  assert.equal(flagOf(base, NOW).flag, 'steady');
});

test('phrase de synthèse', () => {
  assert.match(summarySentence('Léa', [], [], [], { kind: 'few' }), /pas encore joué/);
  const s = summarySentence('Léa', [run({})], [{ game: 'math', level: 'cm1', label: 'Fractions', shown: 30, wrong: 15, err: 50, errLo: 33, picks: {} }], [], { kind: 'up', delta: 12 });
  assert.match(s, /progresse/);
  assert.match(s, /fractions/);
});

import { todoFor } from '../src/server/versionLogic';
test('un serveur qui ne connaît pas encore la fiche élève réclame sa mise à jour', () => {
  const old = todoFor({ version: 18, features: { goutte: true }, missing: [] });
  assert.ok(old.some((t) => t.file === 'mise-a-jour-eleves.sql'));
  const ok = todoFor({ version: 19, features: { goutte: true, eleves: true }, missing: [] });
  assert.ok(!ok.some((t) => t.file === 'mise-a-jour-eleves.sql'));
});
