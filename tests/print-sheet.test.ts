import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_OPTS, runsInPeriod, sanitizeOpts } from '../src/game/printSheet';
import type { StudentRun } from '../src/game/studentView';

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 10, 28);
const run = (daysAgo: number): StudentRun => ({ at: NOW - daysAgo * DAY, game: 'math', mode: 'standard', kind: 'game', session: false, score: 1, wave: 1, wpm: 0, acc: 80, correct: 1, duration: 60 });

test('fiche : la période garde les parties récentes seulement', () => {
  const runs = [run(5), run(45), run(120)];
  assert.equal(runsInPeriod(runs, 'all', NOW).length, 3);
  assert.equal(runsInPeriod(runs, '90', NOW).length, 2);
  assert.equal(runsInPeriod(runs, '30', NOW).length, 1);
});

test('fiche : un choix abîmé retombe sur les valeurs par défaut', () => {
  assert.deepEqual(sanitizeOpts(null), DEFAULT_OPTS);
  assert.deepEqual(sanitizeOpts('x'), DEFAULT_OPTS);
  const o = sanitizeOpts({ period: '7', charts: 'oui', recent: true, hidden: ['math', 3, null] });
  assert.equal(o.period, 'all');
  assert.equal(o.charts, true);
  assert.equal(o.recent, true);
  assert.deepEqual(o.hidden, ['math']);
});

test('fiche : les choix valides sont gardés', () => {
  const o = sanitizeOpts({ period: '30', weak: false, note: false });
  assert.equal(o.period, '30');
  assert.equal(o.weak, false);
  assert.equal(o.note, false);
  assert.equal(o.figures, true);
});

test('fiche : réglage conseillé — synthèse, repères, graphiques, acquis et à travailler ; le reste se coche', () => {
  assert.equal(DEFAULT_OPTS.summary, true);
  assert.equal(DEFAULT_OPTS.figures, true);
  assert.equal(DEFAULT_OPTS.charts, true);
  assert.equal(DEFAULT_OPTS.weak, true);
  assert.equal(DEFAULT_OPTS.strong, true);
  assert.equal(DEFAULT_OPTS.missed, false);
  assert.equal(DEFAULT_OPTS.weeks, false);
  assert.equal(DEFAULT_OPTS.recent, false);
  assert.equal(DEFAULT_OPTS.note, false);
});
