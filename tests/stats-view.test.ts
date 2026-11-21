import { test } from 'node:test';
import assert from 'node:assert/strict';
import { adviceOf, gradeOfMode, gradeRows, hourly, statsText, weeklyTotals } from '../src/game/statsView';
import { diffName, diffOf, targetOf, verdictOf } from '../src/game/balanceView';
import type { GameStats, GradeStat, ItemStatRow, PeriodBalance } from '../src/server/admin';

const grade = (o: Partial<GradeStat>): GradeStat => ({ game: 'math', mode: 'cm1', grade: 'cm1', runs: 40, players: 12, classes: 2, acc: 82, acc_med: 84, score_p25: 200, score_med: 300, score_p75: 420, dur_med: 110, correct: 20, wave: 5, low_pct: 10, high_pct: 20, short_pct: 5, ...o });
const bal = (o: Partial<PeriodBalance>): PeriodBalance => ({ game: 'math', level: 'cm1', difficulty: 'standard', runs: 40, ok: 850, err: 150, success_pct: 85, finished_pct: 50, early_loss_pct: 0, dur_med: 100, wave_med: 6, ...o });
const stats = (o: Partial<GameStats>): GameStats => ({ days: 90, totals: { runs: 100, players: 30, classes: 3, schools: 1, session_runs: 10, drills: 2, minutes: 300 }, by_grade: [], by_class: [], weekly: [], hours: [], loyalty: [], cheats: [], balance: [], ...o });
const item = (o: Partial<ItemStatRow>): ItemStatRow => ({ game: 'facteur', level: 'cp', difficulty: 'n1', version: 1, item: 'fumée', label: 'fumée', shown: 20, wrong: 14, err_pct: 70, picks: { fil: 6 }, ...o });

test('difficulté et objectif : tous les jeux par manche, Le facteur à 85 %', () => {
  assert.equal(diffOf('cm1-expert'), 'expert');
  assert.equal(diffOf('synonyme'), 'standard');
  assert.equal(diffOf('apprenti'), 'apprenti');
  assert.equal(targetOf('lexique', 'famille-apprenti'), 95);
  assert.equal(targetOf('facteur', 'n3'), 85);
  assert.equal(targetOf('typing', 'standard'), undefined);
  assert.equal(diffName('cm1-expert'), 'CM1 · Expert');
  assert.equal(diffName('n2'), 'Niveau 2');
  assert.equal(diffName('synonyme'), 'Synonymes');
  assert.equal(verdictOf(bal({ game: 'facteur', level: 'cp', difficulty: 'n1', ok: 600, err: 400, success_pct: 60 })).verdict, 'hard');
});

test('conseils : trop dur en premier, puis signaux, jamais sur trop peu de parties', () => {
  const g = stats({
    balance: [bal({ success_pct: 60, ok: 600, err: 400 }), bal({ difficulty: 'expert', success_pct: 66, ok: 660, err: 340 }), bal({ game: 'lexique', level: 'ce2', difficulty: 'synonyme', early_loss_pct: 45 })],
    by_grade: [grade({ short_pct: 55 }), grade({ runs: 5, low_pct: 90 })],
    cheats: [{ game: 'facteur', reason: 'colis rangés trop vite', n: 7, players: 4 }],
    loyalty: [{ game: 'memory', players: 20, runs_per_player: 1.4, back_pct: 10, ten_pct: 0, once_pct: 70 }],
  });
  const a = adviceOf(g, { rules: [], items: [item({})] });
  assert.equal(a[0].priority, 1);
  assert.match(a[0].fact, /60 % de réussite pour 85 %/);
  assert.ok(a.some((x) => /moins de 45 s/.test(x.fact)));
  assert.ok(a.some((x) => /moins de 30 s/.test(x.fact)));
  assert.ok(!a.some((x) => /90 %/.test(x.fact)), 'groupe de 5 parties : ignoré');
  assert.ok(a.some((x) => /Anti-triche/.test(x.topic)));
  assert.ok(a.some((x) => /qu’une fois/.test(x.fact)));
  assert.ok(a.some((x) => /« fumée » raté 70 %/.test(x.fact) && /image/.test(x.hint)));
  assert.ok(!a.some((x) => /Expert/.test(x.topic)), 'Expert à 66 % pour 65 % : bien réglé');
  for (let i = 1; i < a.length; i++) assert.ok(a[i - 1].priority <= a[i].priority);
});

test('conseils : niveau joué plus bas que celui de la classe', () => {
  const g = stats({ by_grade: [grade({ mode: 'ce2', grade: 'cm1', runs: 30 }), grade({ mode: 'cm1', grade: 'cm1', runs: 20 })] });
  assert.ok(adviceOf(g, null).some((x) => /niveau inférieur/.test(x.fact)));
  assert.equal(gradeOfMode('ce2-expert'), 'ce2');
  assert.equal(gradeOfMode('suite'), null);
});

test('activité : semaines additionnées, temps scolaire', () => {
  const g = stats({
    weekly: [{ week: '2026-11-16', game: 'math', runs: 3, players: 2 }, { week: '2026-11-09', game: 'math', runs: 1, players: 1 }, { week: '2026-11-16', game: 'typing', runs: 2, players: 2 }],
    hours: [{ dow: 1, hour: 10, runs: 6 }, { dow: 3, hour: 15, runs: 2 }, { dow: 6, hour: 10, runs: 2 }],
  });
  assert.deepEqual(weeklyTotals(g), [{ week: '2026-11-09', runs: 1 }, { week: '2026-11-16', runs: 5 }]);
  const h = hourly(g);
  assert.equal(h.schoolPct, 60);
  assert.equal(h.hours[10], 8);
});

test('niveaux de classe triés (classes sans niveau en dernier), bilan texte complet', () => {
  const g = stats({ by_grade: [grade({ grade: '?' }), grade({ grade: 'ce1', mode: 'ce1' }), grade({ game: 'typing', grade: 'cm2', mode: 'standard' })], balance: [bal({ success_pct: 60, ok: 600, err: 400 })] });
  assert.deepEqual(gradeRows(g, 'math').map((r) => r.grade), ['ce1', '?']);
  const t = statsText(g, { rules: [], items: [] }, '21 novembre 2026');
  assert.match(t, /90 derniers jours/);
  assert.match(t, /À RÉGLER EN PRIORITÉ/);
  assert.match(t, /Classes de CE1 · CE1/);
  assert.match(t, /RÉUSSITE PAR NIVEAU/);
  assert.ok(!/Léa|Tom/.test(t));
});
