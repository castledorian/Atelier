import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONTRAIRES, FAMILLES, HARD, SYNONYMES, morphOf, norm, plain } from '../src/game/lexique/data';
import { LEX_TUNE, SHORT_MAX, buildRound, candidates, enemyCount, lexBoard, lexLevelOf, lossNote, mixOf, travelTime } from '../src/game/lexique/rounds';
import type { LexDiff, LexLevel, Rel } from '../src/game/lexique/rounds';

const rngOf = (seed: number) => () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
};

test('données : morceaux bout à bout = mot, préfixes « x- » et suffixes « -x » bien placés', () => {
  const all = [...SYNONYMES.flatMap((e) => [e.w, ...e.r]), ...CONTRAIRES.flatMap((e) => [e.w, ...e.r]), ...FAMILLES.flatMap((e) => [e.w, ...e.r])];
  for (const w of all) {
    assert.ok(norm(w).length >= 2, w);
    const m = morphOf(w);
    if (m) {
      assert.ok(m.root.length >= 1, `racine manquante : ${w}`);
      assert.equal(plain(w), plain(w).trim());
    }
  }
});

test('données : une réponse n\'est jamais le mot du centre, ni en double', () => {
  for (const list of [SYNONYMES, CONTRAIRES, FAMILLES]) {
    for (const e of list) {
      const keys = e.r.map(norm);
      assert.equal(new Set(keys).size, keys.length, `doublon dans ${e.w}`);
      assert.ok(!keys.includes(norm(e.w)), `${e.w} est sa propre réponse`);
    }
  }
});

test('données : un faux ami de famille n\'est pas aussi une bonne réponse', () => {
  for (const f of FAMILLES) for (const x of f.faux ?? []) assert.ok(!f.r.map(norm).includes(norm(x)), `${f.w}/${x}`);
});

test('manches : une seule bonne réponse, premières lettres distinctes, centre absent, 3000 tirages', () => {
  const rels: Rel[] = ['synonyme', 'contraire', 'famille', 'melange'];
  const levels: LexLevel[] = ['ce1', 'ce2', 'cm1', 'cm2'];
  for (const rel of rels) {
    for (const level of levels) {
      const used = new Set<string>();
      const rng = rngOf(rel.length * 7 + level.length);
      for (let i = 0; i < 250; i++) {
        const count = 3 + (i % 4);
        const diff = (['apprenti', 'standard', 'expert'] as LexDiff[])[i % 3];
        const r = buildRound(rel, level, count, rng, used, diff);
        assert.equal(r.words.filter((w) => w.role === 'answer').length, 1);
        assert.ok(r.words.length >= 2 && r.words.length <= count, `${r.center}: ${r.words.length}`);
        const firsts = r.words.map((w) => w.key[0]);
        assert.equal(new Set(firsts).size, firsts.length, `première lettre en double : ${r.center}`);
        assert.ok(r.words.every((w) => w.key !== norm(r.center)));
        // aucun piège n'est une réponse acceptée
        const entry = candidates(r.rel, level, diff).find((e) => e.w === r.center)!;
        assert.ok(entry, `${level}/${diff}: ${r.center} hors du palier`);
        const ok = new Set(entry.r.map(norm));
        for (const w of r.words) if (w.role !== 'answer') assert.ok(!ok.has(w.key), `${r.center} : « ${w.text} » est aussi valable`);
      }
    }
  }
});

test('manches : le piège « contraire » apparaît pour les synonymes, et jamais comme bonne réponse', () => {
  const rng = rngOf(5);
  let traps = 0;
  const used = new Set<string>();
  for (let i = 0; i < 300; i++) {
    const r = buildRound('synonyme', 'cm2', 5, rng, used);
    traps += r.words.filter((w) => w.role === 'trap').length;
  }
  assert.ok(traps > 20, `pièges : ${traps}`);
});

test('manches : pas de répétition avant d\'avoir tout vu', () => {
  const used = new Set<string>();
  const rng = rngOf(9);
  const n = candidates('famille', 'ce2').length;
  const seen = new Set<string>();
  for (let i = 0; i < n; i++) seen.add(buildRound('famille', 'ce2', 4, rng, used).center);
  assert.equal(seen.size, n);
});

test('vitesse : de plus en plus rapide, avec un plancher ; les mots augmentent lentement', () => {
  for (const d of ['apprenti', 'standard', 'expert'] as const) {
    assert.equal(travelTime(d, 0), LEX_TUNE[d].travel);
    assert.ok(travelTime(d, 5) < travelTime(d, 0));
    assert.ok(travelTime(d, 500) >= LEX_TUNE[d].travel * LEX_TUNE[d].floor - 1e-9);
    assert.equal(enemyCount(d, 0), LEX_TUNE[d].count);
    assert.ok(enemyCount(d, 999) <= LEX_TUNE[d].max);
  }
});

test('classement et bilans', () => {
  assert.equal(lexBoard('synonyme', 'standard'), 'synonyme');
  assert.equal(lexBoard('famille', 'expert'), 'famille-expert');
  const r = buildRound('contraire', 'ce2', 4, rngOf(3), new Set());
  assert.match(r.win, /contraire/);
  assert.match(lossNote(r, null), /Trop lent/);
  assert.match(lossNote(r, r.words.find((w) => w.role !== 'answer') ?? null), /bonne réponse/);
});

import { edgeDistance, multFor, reachDistance, spreadAngles, winPoints } from '../src/game/lexique/geometry';

test('géométrie : bord du rectangle, angles répartis, contact', () => {
  assert.equal(Math.round(edgeDistance(800, 600, 400, 300, 0)), 400);
  assert.equal(Math.round(edgeDistance(800, 600, 400, 300, Math.PI / 2)), 300);
  assert.equal(Math.round(edgeDistance(800, 600, 400, 300, Math.PI)), 400);
  const a = spreadAngles(5, rngOf(1));
  assert.equal(a.length, 5);
  const norm2 = a.map((x) => ((x % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)).sort((p, q) => p - q);
  for (let i = 0; i < norm2.length; i++) {
    const next = norm2[(i + 1) % norm2.length] + (i === norm2.length - 1 ? 2 * Math.PI : 0);
    assert.ok(next - norm2[i] > 0.3, 'deux mots trop proches');
  }
  assert.equal(Math.round(reachDistance(100, 30, 50, 15, 0)), 150);
  assert.equal(Math.round(reachDistance(100, 30, 50, 15, Math.PI / 2)), 45);
});

test('score : série, rapidité et frappe sans faute', () => {
  assert.equal(multFor(0), 1);
  assert.equal(multFor(3), 2);
  assert.equal(multFor(99), 6);
  assert.ok(winPoints(1, 1) > winPoints(0, 1));
  assert.equal(winPoints(0, 1), 100);
  assert.equal(winPoints(1, 1), 140);
  assert.equal(winPoints(0, 2), 200);
});

test('manches : les « faux amis » de la même initiale que la réponse sont bien proposés', () => {
  // « cheval » : chevaucher / cavalier / cheval-ier… contre cheveu / chevet : le piège doit pouvoir apparaître
  const rng = rngOf(11);
  let faux = 0;
  let total = 0;
  for (let i = 0; i < 400; i++) {
    const r = buildRound('famille', 'cm1', 4, rng, new Set(), 'expert');
    total++;
    if (r.words.some((w) => w.role === 'faux')) faux++;
    const firsts = r.words.map((w) => w.key[0]);
    assert.equal(new Set(firsts).size, firsts.length, r.center);
  }
  assert.ok(faux / total > 0.6, `faux amis proposés : ${faux}/${total}`);
});

test('données : aucun mot trop long pour une étiquette', () => {
  const all = [...SYNONYMES.flatMap((e) => [e.w, ...e.r]), ...CONTRAIRES.flatMap((e) => [e.w, ...e.r]), ...FAMILLES.flatMap((e) => [e.w, ...e.r, ...(e.faux ?? [])])];
  for (const w of all) assert.ok(norm(w).length <= 13, `${w} : ${norm(w).length} lettres`);
});


const LEVELS: LexLevel[] = ['ce1', 'ce2', 'cm1', 'cm2'];
const DIFFS: LexDiff[] = ['apprenti', 'standard', 'expert'];
const tierOfEntry = (rel: string, center: string) => ({ synonyme: SYNONYMES, contraire: CONTRAIRES, famille: FAMILLES } as Record<string, Array<{ w: string; t: number }>>)[rel].find((e) => e.w === center)!.t;

test('équilibrage : chaque classe et chaque difficulté a assez de manches de chaque consigne', () => {
  for (const level of LEVELS)
    for (const diff of DIFFS)
      for (const rel of ['synonyme', 'contraire', 'famille'] as const) {
        const n = candidates(rel, level, diff).length;
        assert.ok(n >= 8, `${level}/${diff}/${rel} : seulement ${n} manches`);
      }
});

test('équilibrage : les paliers respectent la classe et la difficulté', () => {
  for (const level of LEVELS) {
    for (const diff of DIFFS) {
      const mix = mixOf(level, diff);
      const rng = rngOf(level.length * 31 + diff.length);
      const used = new Set<string>();
      const seen = [0, 0, 0];
      for (let i = 0; i < 300; i++) {
        const r = buildRound('melange', level, 5, rng, used, diff);
        const t = tierOfEntry(r.rel, r.center);
        assert.ok(mix[t - 1] > 0, `${level}/${diff} : « ${r.center} » (palier ${t}) ne devrait pas tomber`);
        seen[t - 1]++;
        // une bonne réponse n'est jamais un mot réservé à une classe supérieure
        const top = mix[2] > 0 ? 3 : mix[1] > 0 ? 2 : 1;
        const hard = HARD[r.answer.key];
        if (hard) assert.ok(hard <= top, `${level}/${diff} : réponse « ${r.answer.text} » trop difficile`);
        if (level === 'ce1') {
          for (const w of r.words) assert.ok(w.key.length <= SHORT_MAX, `CE1 : « ${w.text} » trop long`);
          assert.ok(norm(r.center).length <= SHORT_MAX, `CE1 : centre « ${r.center} » trop long`);
        }
      }
      if (level === 'cm2' && diff === 'standard') assert.ok(seen[1] > 40 && seen[2] > 40, `CM2 standard : paliers ${seen}`);
      if (level === 'cm1' && diff === 'apprenti') assert.ok(seen[0] > seen[1] * 2, `CM1 apprenti doit rester surtout facile : ${seen}`);
    }
  }
});

test('équilibrage : classe → niveau des mots', () => {
  assert.equal(lexLevelOf('cp'), 'ce1');
  assert.equal(lexLevelOf('ce1'), 'ce1');
  assert.equal(lexLevelOf('ce2'), 'ce2');
  assert.equal(lexLevelOf('cm1'), 'cm1');
  assert.equal(lexLevelOf('cm2'), 'cm2');
});
