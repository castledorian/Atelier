import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BASE_HP, BOSS_NAMES, BOSS_SPEECH, bossSpeech, INK_STEPS, bossHp, POWER_STEPS, fillOf, monthsToFinal, parseNames, phaseOf, saveNames, schoolYear, stepOf, feedBoss, calmBoss, loadBoss } from '../src/game/boss/state';
import type { BossState } from '../src/game/boss/state';
import { LOW, buildFight, stateAt } from '../src/game/boss/fight';
import { cumulate, lastWeek, shortDate, xOf } from '../src/game/boss/history';
import { installFakeStorage } from './helpers';

const S = (o: Partial<BossState> = {}): BossState => ({ year: '2026-2027', ink: 0, power: 0, games: 0, wonAt: null, seen: true, log: [], ...o });

test('année scolaire : elle bascule en août', () => {
  assert.equal(schoolYear(new Date('2026-11-17T12:00:00')), '2026-2027');
  assert.equal(schoolYear(new Date('2027-07-04T12:00:00')), '2026-2027', 'juillet est encore l’année d’avant');
  assert.equal(schoolYear(new Date('2027-08-01T12:00:00')), '2027-2028', 'août : nouvelle année, tout repart à zéro');
});

test('taille de la créature : un palier par seuil franchi', () => {
  assert.equal(stepOf(0, INK_STEPS), 0);
  assert.equal(stepOf(24, INK_STEPS), 0);
  assert.equal(stepOf(25, INK_STEPS), 1);
  assert.equal(stepOf(10000, INK_STEPS), INK_STEPS.length - 1);
  assert.equal(BOSS_NAMES.length, INK_STEPS.length, 'un nom par taille');
  assert.equal(POWER_STEPS.length, INK_STEPS.length);
});

test('jauge : part du palier en cours, pleine au dernier', () => {
  assert.equal(fillOf(0, INK_STEPS), 0);
  assert.equal(fillOf(25, INK_STEPS), 0, 'début du palier suivant');
  assert.ok(Math.abs(fillOf(47.5, INK_STEPS) - 0.5) < 0.01);
  assert.equal(fillOf(5000, INK_STEPS), 1);
});

test('moments de l’année : la créature dort, grossit, puis le combat s’ouvre en juin', () => {
  const d = (iso: string) => new Date(iso + 'T10:00:00');
  assert.equal(phaseOf(S(), d('2026-11-17')), 'early');
  assert.equal(phaseOf(S(), d('2027-01-20')), 'early');
  assert.equal(phaseOf(S(), d('2027-03-05')), 'growing');
  assert.equal(phaseOf(S(), d('2027-05-31')), 'growing');
  assert.equal(phaseOf(S(), d('2027-06-01')), 'final');
  assert.equal(phaseOf(S(), d('2027-07-02')), 'final');
  assert.equal(phaseOf(S({ wonAt: 1 }), d('2027-03-05')), 'won', 'une fois vaincue, la créature le reste');
  assert.equal(monthsToFinal(d('2026-11-17')), 7, 'de novembre à juin : 7 mois');
  assert.equal(monthsToFinal(d('2027-06-10')), 0);
  assert.equal(monthsToFinal(d('2026-09-02')), 9, 'de septembre à juin : 9 mois');
});

test('prénoms : nettoyés, sans doublon, limités', () => {
  assert.deepEqual(parseNames('Léa\nTom , Sam;\n\nLéa'), ['Léa', 'Tom', 'Sam', 'Léa']);
  const saved = saveNames(['  Léa ', 'léa', 'Tom', '', 'Jean   Pierre']);
  assert.deepEqual(saved, ['Léa', 'Tom', 'Jean Pierre'], 'doublons (même à la casse près) et vides retirés');
  assert.ok(saveNames(Array.from({ length: 80 }, (_, i) => 'Elève' + i)).length <= 36);
});

test('combat : la classe gagne toujours, après être passée tout près de la défaite', () => {
  const f = buildFight(['Léa', 'Tom', 'Sam'], 5, 3);
  const fin = stateAt(f, f.total);
  assert.equal(fin.hp, 0, 'la créature finit à zéro');
  assert.ok(fin.classHp > 0, 'la classe ne tombe jamais à zéro');
  const bas = Math.min(...f.beats.filter((b) => b.classHp !== undefined).map((b) => b.classHp as number));
  assert.equal(bas, LOW, 'il y a bien un moment où tout semble perdu');
  const after = f.beats.filter((b) => b.classHp === LOW)[0];
  assert.ok(f.beats.some((b) => b.at > after.at && (b.classHp ?? 0) > LOW), 'puis la classe se relève');
});

test('combat : chaque élève frappe, et la durée reste raisonnable même pour une grande classe', () => {
  const noms = Array.from({ length: 30 }, (_, i) => 'E' + i);
  const f = buildFight(noms, 6, 6);
  const frappes = f.beats.filter((b) => b.strike !== undefined).map((b) => b.strike);
  assert.deepEqual(frappes, noms.map((_, i) => i), 'tous les prénoms frappent, dans l’ordre');
  assert.ok(f.total < 22000, `le combat dure ${Math.round(f.total / 1000)} s`);
  assert.ok(buildFight([], 0, 0).beats.length > 0, 'sans prénom, le combat existe quand même');
});

test('combat : la vie ne remonte jamais pour la créature', () => {
  const f = buildFight(['A', 'B', 'C', 'D'], 4, 2);
  let hp = 100;
  for (const b of f.beats) {
    if (b.hp === undefined) continue;
    assert.ok(b.hp <= hp, `la créature ne se soigne pas (${b.hp} après ${hp})`);
    hp = b.hp;
  }
});

test('points de vie : ils montent avec les fautes et redescendent quand on revoit une règle', () => {
  assert.equal(bossHp(S({ ink: 0 })), BASE_HP);
  assert.equal(bossHp(S({ ink: 37 })), BASE_HP + 37);
  assert.ok(bossHp(S({ ink: 38 })) > bossHp(S({ ink: 37 })), 'une faute de plus = un point de vie de plus');
  assert.equal(bossHp(S({ ink: -5 })), BASE_HP, 'jamais en dessous du départ');
});

test('la créature parle : une phrase par phase, jamais vide, indice borné', () => {
  for (const pick of [0, 0.5, 0.999, 1, 7, -3]) {
    for (const [phase, ink] of [['early', 0], ['growing', 200], ['final', 900]] as const) {
      const t = bossSpeech(phase, ink, pick);
      assert.ok(t.length > 5 && t.length < 60, `phrase courte : ${t}`);
    }
  }
  assert.ok(BOSS_SPEECH.final.includes(bossSpeech('final', 0, 0)));
  assert.ok(BOSS_SPEECH.small.includes(bossSpeech('early', 0, 0)));
  assert.ok(BOSS_SPEECH.big.includes(bossSpeech('growing', 150, 0)));
});

test('journal de la grotte : un point par jour, fautes retirées comptées en négatif', () => {
  installFakeStorage();
  const d1 = new Date('2026-11-10T10:00:00Z');
  const d2 = new Date('2026-11-11T10:00:00Z');
  feedBoss(5, 2, d1);
  feedBoss(3, 1, d1);
  feedBoss(4, 0, d2);
  calmBoss(2, d2);
  assert.deepEqual(loadBoss(d2).log, [['2026-11-10', 3, 8], ['2026-11-11', -2, 4]]);
});

test('courbe de la grotte : cumul jour par jour, dates placées, bilan de la semaine', () => {
  const pts = cumulate(
    [
      { d: '2026-11-12', ink: 4, power: 10 },
      { d: '2026-11-10', ink: 3, power: 8 },
      { d: '2026-11-12', ink: -2, power: 1 },
      { d: 'pas une date', ink: 99, power: 99 },
    ],
    10,
  );
  assert.deepEqual(pts, [
    { d: '2026-11-10', hp: 13, power: 8 },
    { d: '2026-11-12', hp: 15, power: 19 },
  ]);
  assert.deepEqual(xOf(pts, '2026-11-14'), [0, 0.5]);
  assert.deepEqual(lastWeek(pts, '2026-11-14', 10), { hp: 5, power: 19 });
  assert.deepEqual(lastWeek(pts, '2026-11-18', 10), { hp: 2, power: 11 });
  assert.equal(shortDate('2026-03-05'), '5 mars');
});
