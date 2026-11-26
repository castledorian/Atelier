import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FORM_COUNT, FORM_NAMES, LAST_FORM, daysToNextForm, formAt, formName, formProgress, sceneStageOf, unlockDate } from '../src/game/boss/forms';
import { bossHp } from '../src/game/boss/state';
import { buildFight } from '../src/game/boss/fight';
import { FALLBACK_STAGE, FORM_ART } from '../src/game/boss/art';

const d = (iso: string) => new Date(iso + 'T10:00:00');

test('dix formes, un nom chacune, un dessin de secours chacune', () => {
  assert.equal(FORM_COUNT, 10);
  assert.equal(new Set(FORM_NAMES).size, 10, 'des noms tous différents');
  assert.equal(FORM_ART.length, FORM_COUNT);
  assert.equal(FALLBACK_STAGE.length, FORM_COUNT);
  for (let i = 1; i < FORM_COUNT; i++) assert.ok(FALLBACK_STAGE[i] >= FALLBACK_STAGE[i - 1], 'le secours ne rapetisse jamais');
});

test('la forme suit le calendrier : forme 1 à la rentrée, forme 10 au 1er juin', () => {
  assert.equal(formAt(d('2026-08-20')).form, 0, 'en août, avant la rentrée : forme 1');
  assert.equal(formAt(d('2026-09-01')).form, 0);
  assert.equal(formAt(d('2026-11-26')).form, 2, 'fin novembre : forme 3');
  assert.equal(formAt(d('2027-02-15')).form, 5);
  assert.equal(formAt(d('2027-05-31')).form, 8, 'veille du combat : forme 9');
  assert.equal(formAt(d('2027-06-01')).form, LAST_FORM, 'forme 10 le 1er juin');
  assert.equal(formAt(d('2027-07-05')).form, LAST_FORM);
  assert.equal(formAt(d('2027-07-05')).grow, 1);
});

test('la forme ne recule jamais d’un jour à l’autre, et avance une fois par mois environ', () => {
  let prev = -1;
  const seen = new Set<number>();
  for (let t = Date.parse('2026-09-01T10:00:00'); t <= Date.parse('2027-06-30T10:00:00'); t += 86400000) {
    const { form, grow } = formAt(new Date(t));
    assert.ok(form >= prev, 'jamais en arrière');
    assert.ok(grow >= 0 && grow <= 1);
    prev = form;
    seen.add(form);
  }
  assert.equal(seen.size, FORM_COUNT, 'les dix formes apparaissent toutes dans l’année');
});

test('pas d’effet de la faute sur la forme : seul le calendrier compte', () => {
  const day = d('2026-11-26');
  assert.deepEqual(formAt(day), formAt(day));
  const calme = { ink: 0 };
  const agite = { ink: 5000 };
  assert.equal(formAt(day).form, 2);
  assert.ok(bossHp(agite) > bossHp(calme), 'les fautes ne changent que les points de vie');
});

test('chaque forme a un jour d’apparition, dans l’ordre, et formAt le confirme', () => {
  const ref = d('2026-11-26');
  let prev = 0;
  for (let f = 0; f < FORM_COUNT; f++) {
    const when = unlockDate(f, ref);
    assert.ok(when.getTime() > prev, 'dates croissantes');
    prev = when.getTime();
    assert.equal(formAt(when).form, f, `la forme ${f + 1} est bien là le jour où elle apparaît`);
    if (f > 0) assert.equal(formAt(new Date(when.getTime() - 86400000)).form, f - 1, 'et pas la veille');
  }
  assert.equal(unlockDate(0, ref).getMonth(), 8, 'la forme 1 : septembre');
  assert.equal(unlockDate(LAST_FORM, ref).getMonth(), 5, 'la forme 10 : juin');
});

test('prochaine forme : nombre de jours, rien à la dernière', () => {
  assert.ok((daysToNextForm(d('2026-11-26')) ?? 0) >= 1);
  assert.equal(daysToNextForm(d('2027-06-10')), null);
  const when = unlockDate(3, d('2026-11-26'));
  assert.equal(daysToNextForm(new Date(when.getTime() - 86400000 * 2 + 3600000)), 2);
});

test('avancée : bornée, noms et étapes de décor sûrs', () => {
  assert.equal(formProgress(d('2026-09-01')), 0);
  assert.equal(formProgress(d('2027-06-01')), LAST_FORM);
  assert.equal(formName(-3), FORM_NAMES[0]);
  assert.equal(formName(99), FORM_NAMES[LAST_FORM]);
  assert.equal(sceneStageOf(0), 0);
  assert.equal(sceneStageOf(LAST_FORM), 6);
  for (let f = 1; f < FORM_COUNT; f++) assert.ok(sceneStageOf(f) >= sceneStageOf(f - 1));
});

test('le combat porte le nom de la forme du jour', () => {
  assert.ok(buildFight(['Léa'], 9, 3).name === FORM_NAMES[9]);
  assert.ok(buildFight(['Léa'], 0, 0).name === FORM_NAMES[0]);
  assert.ok(buildFight(['Léa'], 42, 0).name === FORM_NAMES[LAST_FORM], 'indice borné');
});
