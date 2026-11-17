import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_LOG, LETTERS_CAP, accuracyOf, focusRules, hardLetters, mergeLetters, summarize } from '../src/game/progress';
import type { GameLog } from '../src/game/progress';
import type { Store } from '../src/game/encre/tracker';

const g = (ok: number, err: number, score = 100): GameLog => ({ t: 1, ok, err, score, board: 'cm1' });

test('précision : part de réponses justes, 0 sans réponse', () => {
  assert.equal(accuracyOf(g(8, 2)), 80);
  assert.equal(accuracyOf(g(0, 0)), 0);
  assert.equal(accuracyOf(g(1, 2)), 33);
});

test('bilan : vide, puis tendance seulement à partir de 4 parties', () => {
  assert.deepEqual(summarize([]), { games: 0, best: 0, recent: 0, before: -1, trend: 'none' });
  assert.equal(summarize([g(5, 5), g(6, 4), g(7, 3)]).trend, 'none');
  const s = summarize([g(5, 5), g(5, 5), g(5, 5), g(5, 5), g(5, 5), g(9, 1), g(9, 1), g(9, 1), g(9, 1), g(9, 1)]);
  assert.equal(s.recent, 90);
  assert.equal(s.before, 50);
  assert.equal(s.trend, 'up');
  assert.equal(summarize([g(9, 1), g(9, 1), g(9, 1), g(9, 1), g(5, 5), g(5, 5), g(5, 5), g(5, 5), g(5, 5)]).trend, 'down');
  assert.equal(summarize([g(8, 2), g(8, 2), g(8, 2), g(8, 2), g(8, 2), g(8, 2)]).trend, 'flat', 'moins de 5 points d\'écart : stable');
});

test('bilan : la meilleure partie est celle du meilleur score', () => {
  assert.equal(summarize([g(5, 5, 120), g(5, 5, 480), g(5, 5, 300)]).best, 480);
  assert.ok(MAX_LOG >= 20);
});

test('règles à revoir : la plus urgente d\'abord, par famille', () => {
  const store: Store = {
    retenue: { hist: [0, 1, 1, 1], total: 3, met: true, wins: [] },
    'table-fantome': { hist: [0, 0, 1], total: 1, met: false, wins: [] },
    'zero-voleur': { hist: [0, 0, 0], total: 3, met: true, wins: ['2026-11-01', '2026-11-02', '2026-11-03'] },
  };
  const calc = focusRules(store, 'calcul');
  assert.deepEqual(
    calc.map((r) => [r.id, r.status]),
    [
      ['retenue', 'a-revoir'],
      ['table-fantome', 'isolee'],
      ['zero-voleur', 'acquise'],
    ],
  );
  assert.equal(calc[0].recent, 3);
  const ortho = focusRules(store, 'orthographe');
  assert.ok(ortho.length >= 3 && ortho.every((r) => r.status === 'neuve'), 'rien joué : toutes neuves, aucune fausse alerte');
});

test('lettres : cumul d\'une partie, majuscules, caractères étrangers ignorés', () => {
  const t = mergeLetters({ A: { ok: 5, err: 1 } }, { a: { ok: 3, err: 2 }, é: { ok: 9, err: 9 }, B: { ok: 1, err: 0 } });
  assert.deepEqual(t.A, { ok: 8, err: 3 });
  assert.deepEqual(t.B, { ok: 1, err: 0 });
  assert.equal(t['É'], undefined);
});

test('lettres : au-delà du plafond les compteurs sont divisés par deux', () => {
  const t = mergeLetters({ Z: { ok: LETTERS_CAP, err: 100 } }, { Z: { ok: 10, err: 0 } });
  assert.deepEqual(t.Z, { ok: Math.round((LETTERS_CAP + 10) / 2), err: 50 });
});

test('lettres difficiles : au moins 8 frappes et 2 fautes, classées par taux d\'erreur', () => {
  const rows = hardLetters({
    A: { ok: 40, err: 1 },
    B: { ok: 5, err: 5 },
    C: { ok: 2, err: 2 },
    D: { ok: 6, err: 4 },
    E: { ok: 20, err: 1 },
    F: { ok: 3, err: 9 },
  });
  assert.deepEqual(
    rows.map((r) => r.letter),
    ['F', 'B', 'D'],
  );
  assert.equal(rows[0].rate, 75);
  assert.equal(hardLetters({ A: { ok: 30, err: 5 }, B: { ok: 30, err: 6 } }, 1).length, 1);
});
