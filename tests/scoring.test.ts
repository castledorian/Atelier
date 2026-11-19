import assert from 'node:assert/strict';
import test from 'node:test';
import { ANSWER_POINTS, MULT_MAX, SERIES_STEP, answerPoints, maxAnswerPoints, multFor, speedBonus, streakAfterLoss } from '../src/game/scoring';

test('série : +1 palier toutes les 3 bonnes réponses, plafonné à ×6 comme Frappe !', () => {
  assert.equal(SERIES_STEP, 3);
  assert.equal(multFor(0), 1);
  assert.equal(multFor(2), 1);
  assert.equal(multFor(3), 2);
  assert.equal(multFor(14), 5);
  assert.equal(multFor(15), 6);
  assert.equal(multFor(12), 5);
  assert.equal(multFor(500), MULT_MAX);
  assert.equal(MULT_MAX, 6);
});

test('perte d’une vie : Apprenti et Standard reculent d’un palier, Expert repart de ×1 (règle de Frappe !)', () => {
  for (const diff of ['apprenti', 'standard'] as const) {
    assert.equal(streakAfterLoss(0, diff), 0);
    assert.equal(streakAfterLoss(2, diff), 0);
    assert.equal(multFor(streakAfterLoss(3, diff)), 1); // ×2 → ×1
    assert.equal(multFor(streakAfterLoss(9, diff)), 3); // ×4 → ×3
    assert.equal(multFor(streakAfterLoss(40, diff)), 5); // ×6 → ×5
  }
  assert.equal(streakAfterLoss(40, 'expert'), 0);
  // jamais de série négative, jamais de gain en perdant
  for (let s = 0; s < 60; s++) for (const d of ['apprenti', 'standard', 'expert'] as const) assert.ok(streakAfterLoss(s, d) >= 0 && streakAfterLoss(s, d) <= s);
});

test('vitesse : au plus 40 % de la base, jamais négatif', () => {
  assert.equal(speedBonus(100, 0), 0);
  assert.equal(speedBonus(100, 1), 40);
  assert.equal(speedBonus(100, 7), 40);
  assert.equal(speedBonus(100, -3), 0);
  assert.equal(answerPoints(ANSWER_POINTS, 1, 6), 840);
  assert.equal(maxAnswerPoints(ANSWER_POINTS), 840);
  // la précision pèse plus que la vitesse : une réponse lente à un palier de plus vaut plus qu'une rapide au palier d'avant seulement si la série tient
  assert.ok(answerPoints(100, 0, 2) > answerPoints(100, 1, 1));
});
