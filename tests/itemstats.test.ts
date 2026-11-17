import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MATH_FAMILIES, calcLabel, familyOfCalc, mathOutcome, spellingOutcome, summarize, trackableCalc } from '../src/game/itemstats';
import type { ItemOutcome } from '../src/game/itemstats';
import { makeQuestion } from '../src/game/course/questions';
import type { Level } from '../src/game/course/questions';
import { ITEMS } from '../src/game/spelling/engine';
import { ruleInfo } from '../src/game/encre/rules';

test('familles : les écritures courantes sont bien rangées', () => {
  const cases: Array<[string, string]> = [
    ['7 × 8 = ?', 'tables'],
    ['9 × 6 = ?', 'tables'],
    ['6 × ? = 36', 'tables-envers'],
    ['27 ÷ 3 = ?', 'tables-envers'],
    ['152 ÷ 8 = ?', 'div'],
    ['Quotient de 37 ÷ 4 = ?', 'div'],
    ['74 × 1 000 = ?', 'decalage'],
    ['620 ÷ 10 = ?', 'decalage'],
    ['6,7 × 10 = ?', 'decalage-dec'],
    ['8,2 ÷ 10 = ?', 'decalage-dec'],
    ['4 × 600 = ?', 'dizaines'],
    ['60 × 21 = ?', 'dizaines'],
    ['29 × 11 = ?', 'mul'],
    ['121 + 29 = ?', 'add'],
    ['964 − 28 = ?', 'sub'],
    ['110 + ? = 1 000', 'comp'],
    ['Double de 16 = ?', 'double'],
    ['Moitié de 184 = ?', 'double'],
    ['3/4 = ?/8', 'frac'],
    ['1/4 de 36 = ?', 'frac'],
    ['24,64 − 0,04 = ?', 'dec-add'],
    ['6,6 × 50 = ?', 'dec-autre'],
  ];
  for (const [text, fam] of cases) assert.equal(familyOfCalc(text), fam, text);
});

test('familles : tous les calculs générés tombent dans une famille connue, et « autres » reste rare', () => {
  for (const level of ['cm1', 'cm2'] as Level[]) {
    let other = 0;
    let total = 0;
    for (let n = 0; n < 48; n++) {
      for (let k = 0; k < 20; k++) {
        const t = makeQuestion(level, n).text;
        const fam = familyOfCalc(t);
        assert.ok(fam in MATH_FAMILIES, `${t} → ${fam}`);
        total++;
        if (fam === 'autre') other++;
      }
    }
    assert.ok(other / total < 0.05, `${level} : ${other}/${total} calculs non classés`);
  }
});

test('suivi précis : seulement les calculs qui reviennent (petits nombres, tables, ×10/100/1 000)', () => {
  assert.equal(trackableCalc('7 × 8 = ?'), true);
  assert.equal(trackableCalc('74 × 1 000 = ?'), true);
  assert.equal(trackableCalc('6,7 × 10 = ?'), true);
  assert.equal(trackableCalc('3/4 = ?/8'), true);
  assert.equal(trackableCalc('121 + 29 = ?'), false);
  assert.equal(trackableCalc('24,64 − 0,04 = ?'), false);
  assert.equal(trackableCalc('964 − 28 = ?'), false);
  assert.equal(calcLabel('7 × 8 = ?'), '7 × 8');
  assert.equal(calcLabel('74 × 1 000 = ?'), '74 × 1 000');
});

test('calcul raté : la mauvaise réponse choisie est gardée, un calcul réussi n\'en garde aucune', () => {
  const bad = mathOutcome('7 × 8 = ?', false, 54);
  assert.deepEqual(bad.picks, ['54']);
  assert.equal(bad.rule, 'tables');
  assert.equal(bad.item, '7 × 8');
  assert.deepEqual(mathOutcome('7 × 8 = ?', true, 56).picks, []);
  assert.equal(mathOutcome('121 + 29 = ?', false, 140).item, null);
});

test('regroupement : compteurs par famille et par calcul, mauvaises réponses additionnées', () => {
  const o = [
    mathOutcome('7 × 8 = ?', false, 54),
    mathOutcome('7 × 8 = ?', false, 54),
    mathOutcome('7 × 8 = ?', true, 56),
    mathOutcome('9 × 6 = ?', true, 54),
    mathOutcome('121 + 29 = ?', false, 140),
  ];
  const e = summarize(o);
  const fam = e.find((x) => x.k === 'rule' && x.i === 'tables');
  assert.deepEqual([fam?.n, fam?.e], [4, 2]);
  const calc = e.find((x) => x.k === 'item' && x.i === '7 × 8');
  assert.deepEqual([calc?.n, calc?.e, calc?.p], [3, 2, { '54': 2 }]);
  assert.ok(!e.some((x) => x.k === 'item' && x.i.startsWith('121')), 'un calcul aléatoire n\'est pas suivi à part');
  assert.ok(e.every((x) => x.e <= x.n && x.n >= 1));
});

test('regroupement : plafonds respectés (exercice précis ≤ 5, famille ≤ 100, 120 entrées, 3 mauvaises réponses)', () => {
  const many: ItemOutcome[] = Array.from({ length: 30 }, () => mathOutcome('7 × 8 = ?', false, 54));
  const e = summarize(many);
  assert.equal(e.find((x) => x.k === 'item')?.n, 5);
  assert.equal(e.find((x) => x.k === 'rule')?.n, 30);
  const picks: ItemOutcome[] = [51, 52, 53, 54, 55].map((p) => mathOutcome('7 × 8 = ?', false, p));
  assert.ok(Object.keys(summarize(picks).find((x) => x.k === 'item')?.p ?? {}).length <= 3);
  const lots: ItemOutcome[] = Array.from({ length: 400 }, (_, i) => spellingOutcome('doublon', 'Les lettres doubles', `id-${i}`, `Phrase ${i}.`, i % 2 === 0, ['x'], false));
  assert.ok(summarize(lots).length <= 120);
});

test('orthographe : on garde la phrase et la mauvaise proposition, jamais un texte tapé librement', () => {
  const item = ITEMS[0];
  const qcm = spellingOutcome(item.rule, ruleInfo(item.rule).name, item.id, item.fixed, false, [item.wrong], false);
  assert.deepEqual(qcm.picks, [item.wrong]);
  assert.equal(qcm.item, item.id);
  assert.equal(qcm.itemLabel, item.fixed.slice(0, 160));
  const typed = spellingOutcome(item.rule, ruleInfo(item.rule).name, item.id, item.fixed, false, ['Je m\'appelle Léa et j\'habite rue des Lilas'], true);
  assert.deepEqual(typed.picks, []);
  assert.ok(JSON.stringify(summarize([typed])).indexOf('Léa') === -1);
  // un identifiant de phrase de la banque tient dans la limite du serveur (80 caractères), son libellé aussi (160)
  for (const i of ITEMS) {
    assert.ok(i.id.length <= 80, i.id);
    assert.ok(i.fixed.length <= 160, `${i.id} : phrase trop longue (${i.fixed.length})`);
  }
});

test('aucune donnée personnelle dans ce qui part au serveur', () => {
  const o = [mathOutcome('7 × 8 = ?', false, 54), spellingOutcome('jumeaux', 'Les mots qui sonnent pareil', 'jumeaux-ab12', 'Il a un chat.', false, ['à'], false)];
  const keys = new Set(summarize(o).flatMap((x) => Object.keys(x)));
  assert.deepEqual([...keys].sort(), ['e', 'i', 'k', 'l', 'n', 'p']);
});
