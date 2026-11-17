import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../src/game/difficulty';
import * as R from '../src/game/memory/rounds';
import { LEVEL_IDS, LEVEL_TUNING, travelTime } from '../src/game/course/questions';
import { GRADES } from '../src/game/grade';

const ORDER = GRADES.map((g) => g.id); // cp, ce1, ce2, cm1, cm2

/** Vérifie qu'une grandeur évolue dans le bon sens du CP au CM2 (sens large : jamais à contre-sens). */
function monotone(name: string, values: number[], dir: 'up' | 'down', mustDiffer = true) {
  for (let i = 1; i < values.length; i++) {
    const ok = dir === 'up' ? values[i] >= values[i - 1] : values[i] <= values[i - 1];
    assert.ok(ok, `${name} : ${ORDER[i - 1]} → ${ORDER[i]} va à contre-sens (${values.join(', ')})`);
  }
  if (mustDiffer) assert.notEqual(values[0], values[values.length - 1], `${name} : aucune différence entre le CP et le CM2`);
}

test('Frappe : du CP au CM2, la chute accélère, les mots s’allongent et les vies se réduisent', () => {
  for (const d of ['apprenti', 'standard', 'expert'] as const) {
    const cfg = D.DIFFICULTIES[d];
    const per = ORDER.map((g) => D.forGrade(cfg, g));
    monotone(`${d} : temps de chute`, per.map((c) => D.crossTime(c, 0)), 'down');
    monotone(`${d} : écart entre apparitions`, per.map((c) => D.gapBase(c, 0)), 'down');
    monotone(`${d} : longueur des mots`, per.map((c) => c.wordMax), 'up');
    monotone(`${d} : vies`, per.map((c) => c.lives), 'down', d !== 'apprenti'); // Apprenti part déjà au plafond de vies
    for (const c of per) assert.ok(c.lives <= D.MAX_LIVES);
  }
});

test('Frappe : la classe ne dérègle pas l’ordre apprenti < standard < expert', () => {
  for (const g of ORDER) {
    const t = (d: 'apprenti' | 'standard' | 'expert') => D.crossTime(D.forGrade(D.DIFFICULTIES[d], g), 0);
    assert.ok(t('apprenti') > t('standard') && t('standard') > t('expert'), g);
  }
});

test('Frappe : sans classe, rien ne change ; au CM1 le rythme est celui de référence', () => {
  const std = D.DIFFICULTIES.standard;
  assert.equal(D.forGrade(std, null), std);
  const cm1 = D.forGrade(std, 'cm1');
  assert.equal(D.crossTime(cm1, 0), D.crossTime(std, 0));
  assert.equal(D.gapBase(cm1, 0), D.gapBase(std, 0));
  assert.equal(cm1.lives, std.lives);
});

test('Frappe : le plancher de vitesse reste jouable pour les plus jeunes et exigeant pour les plus grands', () => {
  const expert = D.DIFFICULTIES.expert;
  assert.ok(D.crossTime(D.forGrade(expert, 'ce1'), 500) >= 5, 'CE1 expert : une tache ne tombe jamais en moins de 5 s');
  assert.ok(D.crossTime(D.forGrade(expert, 'cm2'), 500) <= 4, 'CM2 expert : reste exigeant');
});

test('Mémoire : la cadence ralentit et les grilles rétrécissent pour les plus jeunes', () => {
  for (const n of [0, 6, 12, 23]) {
    monotone(`suiteStep(${n})`, ORDER.map((g) => R.suiteStep(n, g)), 'down');
  }
  monotone('taches à retrouver (manche 23)', ORDER.map((g) => R.casesSpec(23, g).count), 'up');
  monotone('côté de la grille (manche 23)', ORDER.map((g) => R.casesSpec(23, g).size), 'up');
  monotone('temps d’observation (manche 12)', ORDER.map((g) => R.casesShow(12, g)), 'down');
});

test('Mémoire : une grille adaptée reste cohérente (cases libres, nombre croissant, jamais plus de taches que de cases)', () => {
  let seed = 7;
  const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (const g of ORDER) {
    let prev = 0;
    for (let n = 0; n < R.totalOf('cases'); n++) {
      const { size, count } = R.casesSpec(n, g);
      assert.ok(count >= 2 && count <= size * size - 2, `${g} manche ${n}`);
      assert.ok(count >= prev, `${g} : le nombre de taches ne baisse jamais`);
      prev = count;
      const c = R.makeCases(n, rng, g);
      assert.equal(c.size, size);
      assert.equal(c.cells.length, count);
      assert.equal(new Set(c.cells).size, count);
      assert.ok(c.cells.every((x) => x >= 0 && x < size * size));
    }
  }
});

test('Mémoire : le CM1 garde exactement les valeurs d’origine', () => {
  for (let n = 0; n < 24; n++) {
    assert.equal(R.casesSpec(n, 'cm1').count, R.CASES_COUNT[n]);
    assert.equal(R.casesSpec(n, 'cm1').size, R.CASES_SIZE[n]);
    assert.equal(R.casesShow(n), R.casesShow(n, 'cm1'));
  }
});

test('Course : l’encre monte moins vite et pardonne plus l’erreur pour les plus jeunes', () => {
  monotone('érosion', LEVEL_IDS.map((l) => LEVEL_TUNING[l].drain), 'up');
  monotone('pénalité d’erreur', LEVEL_IDS.map((l) => LEVEL_TUNING[l].wrong), 'up');
  monotone('temps de chute', LEVEL_IDS.map((l) => travelTime(l, 40)), 'down');
  assert.equal(LEVEL_TUNING.cm2.wrong, 1, 'le CM2 est la référence pour la pénalité d’erreur');
  assert.ok(LEVEL_TUNING.cp.wrong < LEVEL_TUNING.cm2.wrong && LEVEL_TUNING.cp.drain < LEVEL_TUNING.cm2.drain);
});

import { BOONS, BOON_AFTER, HP, ROUNDS, offerBoons } from '../src/game/spelling/engine';

test('Chasse aux fautes : vies selon la difficulté, bonus distincts, boss en dernier', () => {
  assert.ok(HP.apprenti > HP.standard && HP.standard > HP.expert && HP.expert >= 3);
  for (const n of BOON_AFTER) assert.ok(n > 0 && n < ROUNDS - 1);
  for (let i = 0; i < 40; i++) {
    const [a, b] = offerBoons();
    assert.notEqual(a.id, b.id);
  }
  assert.equal(new Set(BOONS.map((b) => b.id)).size, BOONS.length);
});

import { ITEMS, roleOf } from '../src/game/spelling/engine';

test('Chasse aux fautes : les rôles d’ennemis sont tous représentés et le boss est le dernier', () => {
  const roles = new Set(ITEMS.map((i) => roleOf(i, false)));
  for (const r of ['splash', 'tache', 'pate']) assert.ok(roles.has(r as never), r);
  assert.equal(roleOf(ITEMS[0], true), 'boss');
});

import { itemsFor } from '../src/game/spelling/engine';

test('Chasse aux fautes : la banque est assez grande et chaque phrase est valide', () => {
  const rules = ['doublon', 'jumeaux', 'accordeur', 'terminaisons'] as const;
  for (const r of rules) assert.ok(ITEMS.filter((i) => i.rule === r).length >= (r === 'terminaisons' ? 40 : 60), r);
  assert.ok(ITEMS.length >= 280);
  const fixed = new Set<string>();
  for (const i of ITEMS) {
    assert.notEqual(i.wrong, i.right, i.fixed);
    const extra = i.others.filter((o) => o !== i.right && o !== i.wrong);
    assert.ok(extra.length >= 1, `Apprenti : au moins 2 propositions : ${i.fixed}`);
    assert.ok(i.tip.length > 8, i.fixed);
    assert.ok(!fixed.has(i.fixed), `phrase en double : ${i.fixed}`);
    fixed.add(i.fixed);
  }
  // chaque classe a de quoi jouer longtemps sans revoir les mêmes phrases
  for (const l of ['ce1', 'ce2', 'cm1', 'cm2'] as const) assert.ok(itemsFor(l).length >= 55, l);
});

import { RETRY_SLOTS, pickRetry } from '../src/game/spelling/engine';

test('Chasse aux fautes : les phrases ratées reviennent aux manches prévues, une seule fois', () => {
  const id = ITEMS.find((i) => i.grade === 'cm1')!.id;
  const used = new Set<string>();
  assert.equal(pickRetry('cm1', 0, used, [id]), null);
  assert.equal(pickRetry('cm1', RETRY_SLOTS[0], used, [id])?.id, id);
  used.add(id);
  assert.equal(pickRetry('cm1', RETRY_SLOTS[1], used, [id]), null);
  assert.equal(pickRetry('cm1', RETRY_SLOTS[0], new Set(), ['inconnu']), null);
});

import { CHOICES, choicesFor, extraDistractors, pickFeedback } from '../src/game/spelling/engine';

test('Chasse aux fautes : assez de propositions pour chaque difficulté, sans doublon ni bonne réponse en trop', () => {
  for (const i of ITEMS) {
    const extra = extraDistractors(i);
    for (const e of extra) {
      assert.notEqual(e.toLowerCase(), i.right.toLowerCase(), i.fixed);
      assert.notEqual(e.toLowerCase(), i.wrong.toLowerCase(), i.fixed);
    }
    for (const d of ['apprenti', 'standard', 'expert'] as const) {
      const c = choicesFor(i, d);
      assert.ok(c.includes(i.right) && !c.includes(i.wrong), i.fixed);
      assert.equal(new Set(c.map((x) => x.toLowerCase())).size, c.length, i.fixed);
    }
  }
  // pas de proposition fabriquée invraisemblable : quand il n'existe que deux erreurs plausibles, il n'y en a que deux
  const three = ITEMS.filter((i) => choicesFor(i, 'standard').length === CHOICES.standard).length;
  assert.ok(three / ITEMS.length >= 0.9, `Standard : 3 propositions pour ${three}/${ITEMS.length} phrases`);
  for (const i of ITEMS) assert.ok(choicesFor(i, 'standard').length >= 2 && choicesFor(i, 'expert').length >= choicesFor(i, 'standard').length, i.fixed);
  const four = ITEMS.filter((i) => choicesFor(i, 'expert').length === CHOICES.expert).length;
  assert.ok(four / ITEMS.length >= 0.15, `Expert : 4 propositions pour ${four}/${ITEMS.length} phrases`);
});

test('Chasse aux fautes : le retour d\'erreur ne donne pas la réponse et reste court', () => {
  for (const i of ITEMS) for (const p of [i.wrong, ...i.others]) {
    const m = pickFeedback(i, p);
    assert.ok(m.length <= 36, `${m} (${m.length})`);
    if (i.rule !== 'jumeaux') assert.ok(!new RegExp(`(^|[^\\p{L}])${i.right.toLowerCase()}($|[^\\p{L}])`, 'u').test(m.toLowerCase()), m);
  }
});

import { BOSS_PHASES, difficultyOf, isTypedRight, nextItem } from '../src/game/spelling/engine';

test('Chasse aux fautes : la difficulté monte au fil de la partie', () => {
  let early = 0;
  let late = 0;
  for (let g = 0; g < 200; g++) {
    const used = new Set<string>();
    for (let a = 0; a < ROUNDS; a++) {
      const { item } = nextItem('cm2', a, [], [], used);
      used.add(item.id);
      if (a < 3) early += difficultyOf(item);
      if (a >= ROUNDS - 3) late += difficultyOf(item);
    }
  }
  assert.ok(late > early * 1.3, `début ${early / 600} / fin ${late / 600}`);
  assert.equal(BOSS_PHASES, 3);
});

test('Expert : réponse tapée, sans tenir compte des majuscules, espaces ni apostrophes', () => {
  const i = ITEMS.find((x) => x.right === 'appelle')!;
  assert.ok(isTypedRight(i, '  Appelle '));
  assert.ok(!isTypedRight(i, 'apelle'));
  assert.ok(isTypedRight(ITEMS.find((x) => x.right === 'à' || x.right === 'à')!, 'à'));
});

test('Chasse aux fautes : la Gomme n\'est proposée qu\'en Standard', () => {
  for (let k = 0; k < 50; k++) {
    for (const d of ['apprenti', 'expert'] as const) assert.ok(!offerBoons(Math.random, d).some((b) => b.id === 'gomme'));
    assert.equal(new Set(offerBoons(Math.random, 'standard').map((b) => b.id)).size, 3);
  }
});

test('Mémoire : Apprenti plus lent et plus généreux, Expert plus serré — à chaque classe', () => {
  const d = R.MEMORY_DIFF;
  assert.ok(d.apprenti.lives > d.standard.lives && d.standard.lives >= d.expert.lives);
  assert.ok(d.apprenti.lives <= 5 && d.standard.lives === R.MAX_LIVES);
  for (const g of ORDER) {
    for (const n of [0, 6, 12, 23]) {
      assert.ok(R.suiteStep(n, g, 'apprenti') > R.suiteStep(n, g, 'standard') && R.suiteStep(n, g, 'standard') > R.suiteStep(n, g, 'expert'), `cadence ${g} ${n}`);
      assert.ok(R.casesShow(n, g, 'apprenti') > R.casesShow(n, g, 'standard') && R.casesShow(n, g, 'standard') > R.casesShow(n, g, 'expert'), `observation ${g} ${n}`);
      assert.ok(R.casesSpec(n, g, 'apprenti').count <= R.casesSpec(n, g, 'standard').count && R.casesSpec(n, g, 'standard').count <= R.casesSpec(n, g, 'expert').count, `taches ${g} ${n}`);
    }
  }
  // Standard = comportement d'avant les difficultés
  assert.equal(R.suiteStep(5, 'cm1'), R.suiteStep(5, 'cm1', 'standard'));
  assert.deepEqual(R.casesSpec(10, 'cm1'), R.casesSpec(10, 'cm1', 'standard'));
});

test('Mémoire : le CP reste jouable même en Expert (grille et rythme restent doux)', () => {
  assert.ok(R.suiteStep(0, 'cp', 'expert') >= 0.9 * 0.85 * 1.45 - 1e-9);
  assert.ok(R.casesSpec(23, 'cp', 'expert').size <= 3);
  assert.ok(R.casesSpec(23, 'cp', 'expert').count <= 7);
});

test('Mémoire : clés de classement et manche de départ', () => {
  assert.equal(R.memBoard('suite', 'standard'), 'suite');
  assert.equal(R.memBoard('cases', 'apprenti'), 'cases-apprenti');
  assert.equal(R.memBoard('suite', 'expert'), 'suite-expert');
  assert.equal(R.firstRound('suite', 0, 'standard'), 0);
  assert.equal(R.firstRound('suite', 0, 'expert'), 2);
  assert.equal(R.firstRound('cases', 0, 'expert'), 0);
  assert.equal(R.firstRound('suite', 3, 'expert'), 15);
});
