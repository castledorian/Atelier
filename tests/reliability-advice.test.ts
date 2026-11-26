import { test } from 'node:test';
import assert from 'node:assert/strict';
import { confidenceOf, readAgainstTarget, roundsNeeded, wilson } from '../src/game/reliability';
import { ACTION_LABEL, adviceText, countByAction, exerciseAdvice } from '../src/game/exerciseAdvice';
import type { ItemStatRow } from '../src/server/admin';

const row = (o: Partial<ItemStatRow>): ItemStatRow => ({ game: 'math', level: 'cm1', difficulty: 'standard', version: 1, item: 'tables', label: 'Tables de multiplication', shown: 400, wrong: 60, err_pct: 15, picks: {}, ...o });

test('intervalle de Wilson : plus de manches = intervalle plus étroit, jamais hors de 0–100', () => {
  const small = wilson(8, 10);
  const big = wilson(800, 1000);
  assert.ok(small && big);
  assert.equal(small.p, 80);
  assert.ok(big.hi - big.lo < small.hi - small.lo);
  assert.ok(small.lo >= 0 && small.hi <= 100);
  assert.equal(wilson(0, 0), null);
  assert.equal(wilson(11, 10), null);
  const all = wilson(10, 10);
  assert.ok(all && all.hi <= 100 && all.lo > 60);
});

test('confiance selon le nombre de manches', () => {
  assert.equal(confidenceOf(10), 'low');
  assert.equal(confidenceOf(60), 'medium');
  assert.equal(confidenceOf(600), 'high');
});

test('lecture contre l’objectif : on ne conclut que si tout l’intervalle est du même côté', () => {
  assert.equal(readAgainstTarget(20, 25, 85, 5).reading, 'few');
  assert.equal(readAgainstTarget(500, 1000, 85, 5).reading, 'hard');
  assert.equal(readAgainstTarget(980, 1000, 85, 5).reading, 'easy');
  assert.equal(readAgainstTarget(850, 1000, 85, 5).reading, 'ok');
  // 78 % sur 60 manches : l'intervalle est large et chevauche la limite basse (80 %) → on ne tranche pas
  assert.equal(readAgainstTarget(47, 60, 85, 5).reading, 'unsure');
});

test('manches nécessaires : plus la précision demandée est fine, plus il en faut', () => {
  assert.ok(roundsNeeded(80, 5) < roundsNeeded(80, 2));
  assert.ok(roundsNeeded(80, 5) > 100);
});

test('une famille trop ratée est « à diminuer », trop réussie « à équilibrer », bien réglée « bien réglé »', () => {
  const list = exerciseAdvice(
    [
      row({ item: 'frac', label: 'Fractions', shown: 500, wrong: 250 }),
      row({ item: 'add', label: 'Additions', shown: 500, wrong: 5 }),
      row({ item: 'tables', label: 'Tables', shown: 500, wrong: 75 }),
      row({ item: 'div', label: 'Divisions', shown: 10, wrong: 5 }),
    ],
    [],
  );
  const by = (id: string) => list.find((a) => a.id === id);
  assert.equal(by('frac')?.action, 'diminuer');
  assert.equal(by('frac')?.priority, 1);
  assert.equal(by('add')?.action, 'equilibrer');
  assert.equal(by('tables')?.action, 'garder');
  assert.equal(by('div')?.action, 'attendre');
  assert.match(by('frac')?.reason ?? '', /sûr à 95 %/);
  const n = countByAction(list);
  assert.equal(n.diminuer, 1);
  assert.equal(n.garder, 1);
});

test('un exercice dont l’erreur est toujours la même réponse est « à améliorer »', () => {
  const list = exerciseAdvice([], [row({ item: '7 × 8', label: '7 × 8', shown: 30, wrong: 18, picks: { '54': 5, '63': 1 } })]);
  assert.equal(list.length, 1);
  assert.equal(list[0].action, 'ameliorer');
  assert.match(list[0].reason, /54/);
});

test('un exercice très au-dessus de sa famille est signalé, un exercice trop peu posé ne l’est pas', () => {
  const rules = [row({ item: 'tables', shown: 600, wrong: 60 })];
  const bad = exerciseAdvice(rules, [row({ item: '6 × 7', label: '6 × 7', shown: 40, wrong: 28, picks: {} })]);
  assert.ok(bad.some((a) => a.kind === 'exercice' && a.action === 'ameliorer'));
  const few = exerciseAdvice(rules, [row({ item: '6 × 7', label: '6 × 7', shown: 8, wrong: 8 })]);
  assert.ok(!few.some((a) => a.kind === 'exercice'));
});

test('texte de synthèse : seules les actions utiles sont listées', () => {
  const t = adviceText(exerciseAdvice([row({ item: 'frac', label: 'Fractions', shown: 500, wrong: 250 }), row({ item: 'tables', shown: 500, wrong: 75 })], []));
  assert.match(t, /À diminuer/);
  assert.doesNotMatch(t, /Bien réglé/);
  assert.equal(ACTION_LABEL.garder, 'Bien réglé');
  assert.match(adviceText([]), /rien à régler/);
});

import { clusteredWilson, designEffect } from '../src/game/reliability';
import { MIN_PLAYERS } from '../src/game/exerciseAdvice';
import type { ItemSpreadRow } from '../src/server/admin';

/** Sommes envoyées par le serveur, calculées à partir des résultats (ratés, posés) de chaque élève. */
const spreadOf = (per: Array<[number, number]>, o: Partial<ItemSpreadRow> = {}): ItemSpreadRow => ({
  game: 'math',
  level: 'cm1',
  difficulty: 'standard',
  kind: 'rule',
  item: 'tables',
  players: per.length,
  shown: per.reduce((s, [, n]) => s + n, 0),
  wrong: per.reduce((s, [w]) => s + w, 0),
  ww: per.reduce((s, [w]) => s + w * w, 0),
  wn: per.reduce((s, [w, n]) => s + w * n, 0),
  nn: per.reduce((s, [, n]) => s + n * n, 0),
  ...o,
});

test('effet de grappe : proche de 1 si les élèves se ressemblent, grand si quelques élèves ratent tout', () => {
  const same = designEffect(spreadOf(Array.from({ length: 20 }, () => [3, 20] as [number, number])));
  assert.ok(same !== null && same < 1.3, `classe homogène : ${same}`);
  const split = designEffect(spreadOf([...Array.from({ length: 3 }, () => [20, 20] as [number, number]), ...Array.from({ length: 17 }, () => [0, 20] as [number, number])]));
  assert.ok(split !== null && split > 8, `trois élèves ratent tout : ${split}`);
  assert.equal(designEffect(spreadOf([[3, 20]])), null);
  assert.equal(designEffect(spreadOf([[0, 20], [0, 20]])), null);
});

test('marge élargie par l’effet de grappe, valeur observée inchangée', () => {
  const plain = clusteredWilson(800, 1000, 1);
  const wide = clusteredWilson(800, 1000, 6);
  assert.ok(plain && wide);
  assert.equal(plain.p, wide.p);
  assert.ok(wide.hi - wide.lo > 2 * (plain.hi - plain.lo));
  assert.equal(wide.n, 1000);
});

test('quelques élèves qui ratent tout ne suffisent pas à déclarer une famille trop difficile', () => {
  // 3 élèves ratent tout, 17 réussissent tout : 85 % de réussite globale mais très dispersée ; même chose à 60 %
  const per: Array<[number, number]> = [...Array.from({ length: 8 }, () => [20, 20] as [number, number]), ...Array.from({ length: 12 }, () => [0, 20] as [number, number])];
  const sp = spreadOf(per);
  const fam = row({ item: 'tables', label: 'Tables', shown: sp.shown, wrong: sp.wrong });
  const naive = exerciseAdvice([fam], [], []).find((a) => a.id === 'tables');
  const fair = exerciseAdvice([fam], [], [sp]).find((a) => a.id === 'tables');
  assert.ok(naive && fair);
  assert.ok((fair.interval?.hi ?? 0) - (fair.interval?.lo ?? 0) > (naive.interval?.hi ?? 0) - (naive.interval?.lo ?? 0));
  assert.equal(fair.players, 20);
});

test(`moins de ${MIN_PLAYERS} élèves : « trop tôt pour juger », même avec beaucoup de manches`, () => {
  const per: Array<[number, number]> = Array.from({ length: 6 }, () => [50, 100] as [number, number]);
  const sp = spreadOf(per, { item: 'frac' });
  const list = exerciseAdvice([row({ item: 'frac', label: 'Fractions', shown: sp.shown, wrong: sp.wrong })], [], [sp]);
  assert.equal(list[0].action, 'attendre');
  assert.match(list[0].reason, /seulement 6 élèves/);
});

test('suivi par élève trop récent pour couvrir l’historique : le nombre d’élèves n’est pas retenu', () => {
  const sp = spreadOf([[2, 10], [3, 10]], { item: 'frac' });
  const list = exerciseAdvice([row({ item: 'frac', label: 'Fractions', shown: 500, wrong: 250 })], [], [sp]);
  assert.equal(list[0].players, null);
  assert.equal(list[0].action, 'diminuer');
});

test('une réponse répétée par un ou deux élèves seulement ne rend pas un exercice « à améliorer »', () => {
  const it = row({ item: '7 × 8', label: '7 × 8', shown: 30, wrong: 18, picks: { '54': 5, '63': 1 } });
  const sp = spreadOf([[9, 15], [9, 15]], { kind: 'item', item: '7 × 8' });
  assert.equal(exerciseAdvice([], [it], [sp]).length, 0);
});
