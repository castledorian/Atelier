import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MIN_ROUNDS, TARGET, TOLERANCE, itemsCsv, levelsCsv, mergeRows, picksText, rank, summaryText, verdictOf } from '../src/game/balanceView';
import type { BalanceLevel, ItemStatRow } from '../src/server/admin';

const lvl = (o: Partial<BalanceLevel>): BalanceLevel => ({ game: 'math', level: 'cm1', difficulty: 'standard', version: 1, runs: 20, ok: 850, err: 150, success_pct: 85, finished_pct: 60, avg_score: 300, avg_duration: 120, ...o });
const row = (o: Partial<ItemStatRow>): ItemStatRow => ({ game: 'math', level: 'cm1', difficulty: 'standard', version: 1, item: '7 × 8', label: '7 × 8', shown: 10, wrong: 4, err_pct: 40, picks: {}, ...o });

test('objectifs : apprenti 95 %, standard 85 %, expert 65 %, tolérance 5 points', () => {
  assert.deepEqual(TARGET, { apprenti: 95, standard: 85, expert: 65 });
  assert.equal(TOLERANCE, 5);
});

test('verdict : trop facile, bien réglé, trop difficile, selon l\'écart à l\'objectif', () => {
  assert.equal(verdictOf(lvl({ success_pct: 85 })).verdict, 'ok');
  assert.equal(verdictOf(lvl({ success_pct: 90 })).verdict, 'ok', 'exactement +5 : toléré');
  assert.equal(verdictOf(lvl({ success_pct: 91 })).verdict, 'easy');
  assert.equal(verdictOf(lvl({ success_pct: 80 })).verdict, 'ok', 'exactement −5 : toléré');
  assert.equal(verdictOf(lvl({ success_pct: 79 })).verdict, 'hard');
  assert.equal(verdictOf(lvl({ difficulty: 'expert', success_pct: 40, ok: 600, err: 400 })).verdict, 'hard');
  assert.equal(verdictOf(lvl({ difficulty: 'apprenti', success_pct: 99 })).verdict, 'ok', 'Apprenti : 99 % reste dans la tolérance');
  assert.equal(verdictOf(lvl({ difficulty: 'apprenti', success_pct: 100 })).verdict, 'ok', 'Apprenti ne peut jamais être « trop facile » (95 + 5 = 100)');
  assert.equal(verdictOf(lvl({ difficulty: 'apprenti', success_pct: 88, ok: 880, err: 120 })).verdict, 'hard');
  assert.equal(verdictOf(lvl({ success_pct: 91 })).gap, 6);
  assert.equal(verdictOf(lvl({ success_pct: 91 })).detail, '+6 points');
  assert.equal(verdictOf(lvl({ success_pct: 62.8, ok: 628, err: 372 })).detail, '−22,2 points');
  assert.equal(verdictOf(lvl({ success_pct: 85 })).detail, 'pile sur l’objectif');
});

test('verdict : pas de conclusion avec trop peu de manches, ni pour les jeux sans objectif', () => {
  const few = verdictOf(lvl({ ok: 30, err: 20, success_pct: 60 }));
  assert.equal(few.verdict, 'few');
  assert.equal(few.gap, null);
  assert.match(few.detail, new RegExp(`50 manches sur ${MIN_ROUNDS}`));
  assert.equal(verdictOf(lvl({ game: 'typing', difficulty: 'standard' })).verdict, 'none');
  assert.equal(verdictOf(lvl({ game: 'memory', difficulty: 'suite' })).verdict, 'none');
  assert.equal(verdictOf(lvl({ success_pct: null })).verdict, 'none');
});

test('verdict : signale les parties presque toutes gagnées ou presque toutes perdues', () => {
  assert.match(verdictOf(lvl({ finished_pct: 98 })).note, /gagnées/);
  assert.match(verdictOf(lvl({ finished_pct: 5 })).note, /perdues/);
  assert.equal(verdictOf(lvl({ finished_pct: 60 })).note, '');
  assert.equal(verdictOf(lvl({ finished_pct: 100, runs: 4 })).note, '', 'trop peu de parties');
});

test('fusion : même exercice sur plusieurs difficultés ou versions additionné, filtres respectés', () => {
  const rows = [
    row({ difficulty: 'standard', shown: 10, wrong: 4, picks: { '54': 3 } }),
    row({ difficulty: 'expert', shown: 5, wrong: 3, picks: { '54': 1, '56': 2 } }),
    row({ level: 'cm2', shown: 99, wrong: 99 }),
    row({ game: 'spelling', shown: 99, wrong: 99 }),
  ];
  const all = mergeRows(rows, { game: 'math', level: 'cm1', difficulty: 'all' });
  assert.equal(all.length, 1);
  assert.deepEqual([all[0].shown, all[0].wrong, all[0].err_pct, all[0].picks], [15, 7, 46.7, { '54': 4, '56': 2 }]);
  assert.equal(mergeRows(rows, { game: 'math', level: 'cm1', difficulty: 'expert' })[0].shown, 5);
  assert.equal(mergeRows(rows, { game: 'math', level: 'all', difficulty: 'all' }).length, 2);
  assert.equal(rows[0].picks['54'], 3, 'les données d\'origine ne sont pas modifiées');
});

test('classement : du plus raté au moins raté, les exercices trop peu posés sont écartés', () => {
  const rows = [row({ item: 'a', label: 'a', shown: 20, wrong: 4, err_pct: 20 }), row({ item: 'b', label: 'b', shown: 20, wrong: 12, err_pct: 60 }), row({ item: 'c', label: 'c', shown: 2, wrong: 2, err_pct: 100 }), row({ item: 'd', label: 'd', shown: 40, wrong: 24, err_pct: 60 })];
  assert.deepEqual(rank(rows, 5).map((r) => r.item), ['d', 'b', 'a']);
  assert.deepEqual(rank(rows, 1).map((r) => r.item)[0], 'c');
});

test('mauvaises réponses : les plus choisies d\'abord', () => {
  assert.equal(picksText({ '54': 3, '56': 5, '63': 1 }), '56 (×5), 54 (×3), 63 (×1)');
  assert.equal(picksText({ '54': 3, '56': 5, '63': 1 }, 2), '56 (×5), 54 (×3)');
  assert.equal(picksText({}), '');
});

test('export CSV : en-têtes, valeurs, et jamais de formule exécutable', () => {
  const csv = levelsCsv([lvl({})]);
  assert.match(csv, /^﻿Jeu;Niveau;Difficulté/);
  assert.match(csv, /Course à l’encre;CM1;Standard;1;20;850;150;85;85;Bien réglé;0;60;300;120/);
  const bad = itemsCsv([], [row({ label: '=1+1', item: '=1+1' })]);
  assert.match(bad, /'=1\+1/);
  assert.match(itemsCsv([row({ item: 'tables', label: 'Tables' })], []), /famille;tables;Tables;10;4;40/);
});

test('résumé à coller : niveaux, verdicts et exercices les plus ratés', () => {
  const levels = [lvl({ level: 'cm1', difficulty: 'standard', success_pct: 70, ok: 700, err: 300 }), lvl({ game: 'typing' })];
  const items = [row({ label: '7 × 8', shown: 30, wrong: 18, err_pct: 60, picks: { '54': 7 } })];
  const rules = [row({ item: 'tables', label: 'Tables de multiplication', shown: 200, wrong: 80, err_pct: 40 })];
  const t = summaryText(levels, rules, items, '17 novembre 2026');
  assert.match(t, /Course à l’encre · CM1 · Standard \(v1\) : 70 % sur 1000 manches.*Trop difficile \(−15 points par rapport à l’objectif\)/);
  assert.match(t, /LES PLUS RATÉS — Course à l’encre · CM1/);
  assert.match(t, /7 × 8 : 60 % raté sur 30 ; réponses choisies à tort : 54 \(×7\)/);
  assert.match(t, /Tables de multiplication 40 %/);
  assert.ok(!/Frappe/.test(t), 'les jeux sans objectif de réussite ne sont pas listés');
  assert.ok(!/élève|Léa/i.test(t));
});
