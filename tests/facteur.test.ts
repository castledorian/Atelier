import assert from 'node:assert/strict';
import test from 'node:test';
import { F_LEVELS, WORDS, parts, plain, slug, wordsUpTo } from '../src/game/facteur/words';
import type { FLevel } from '../src/game/facteur/words';
import { CHOICES, PARCELS, TRAVEL_SECONDS, WORDS_PER_SESSION, distractors, newSession, pickWords, starsFor } from '../src/game/facteur/rounds';

const rngOf = (seed: number) => {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
};

test('les listes de l’enseignante sont complètes et sans doublon', () => {
  const count = (l: FLevel) => WORDS.filter((x) => x.level === l && !x.tool).length;
  assert.deepEqual([1, 2, 3, 4].map((l) => count(l as FLevel)), [20, 21, 21, 29]); // niveaux 1 à 4 : 20, 21, 21 et 29 mots avec image
  const plains = WORDS.map((x) => plain(x.mark));
  assert.equal(new Set(plains).size, plains.length, 'deux mots identiques');
  const slugs = WORDS.filter((x) => !x.tool).map((x) => slug(x.mark));
  assert.equal(new Set(slugs).size, slugs.length, 'deux images au même nom de fichier');
  assert.equal(slug('lézar(d)'), 'lezard');
  assert.equal(slug('(h)ach(e)'), 'hache');
});

test('lettres muettes : le mot se relit à l’identique, et le e final muet est grisé', () => {
  for (const x of WORDS) {
    assert.equal(parts(x.mark).map((p) => p.text).join(''), plain(x.mark));
    assert.ok(parts(x.mark).some((p) => !p.mute), `${x.mark} : tout est muet`);
  }
  assert.deepEqual(parts('vach(e)'), [{ text: 'vach', mute: false }, { text: 'e', mute: true }]);
  assert.deepEqual(parts('canar(d)').at(-1), { text: 'd', mute: true });
  // les mots en -e sont marqués (sauf ceux de l'enseignante où le e se prononce : le, légo…)
  for (const m of ['lun(e)', 'banan(e)', 'tigr(e)', 'tabl(e)']) assert.ok(parts(m).at(-1)!.mute);
});

test('niveaux : chaque niveau contient ceux d’avant, et les mots-outils ne portent pas d’image', () => {
  assert.equal(F_LEVELS.length, 4);
  for (const l of [1, 2, 3, 4] as FLevel[]) assert.ok(wordsUpTo(l).every((x) => x.level <= l));
  assert.ok(WORDS.filter((x) => x.tool).every((x) => !x.emoji));
});

test('séance : 8 mots, au moins 60 % du niveau, jamais de mot-outil', () => {
  for (let seed = 1; seed <= 60; seed++) {
    for (const l of [1, 2, 3, 4] as FLevel[]) {
      const ws = pickWords(l, WORDS_PER_SESSION, rngOf(seed));
      assert.equal(ws.length, WORDS_PER_SESSION);
      assert.equal(new Set(ws.map((x) => plain(x.mark))).size, ws.length);
      assert.ok(ws.every((x) => !x.tool && x.level <= l));
      assert.ok(ws.filter((x) => x.level === l).length >= Math.ceil(WORDS_PER_SESSION * 0.6));
    }
  }
  // seuls les mots dont on a l'image sont proposés
  const only = pickWords(2, 8, rngOf(3), (x) => x.emoji !== undefined);
  assert.ok(only.every((x) => x.emoji));
});

test('mauvais mots : deux autres mots, jamais le bon, qui ressemblent au bon', () => {
  const r = rngOf(9);
  let sameInitial = 0;
  let n = 0;
  for (const l of [1, 2, 3, 4] as FLevel[]) {
    const pool = wordsUpTo(l);
    for (const target of pool.filter((x) => !x.tool)) {
      const d = distractors(target, pool, r);
      assert.equal(d.length, CHOICES - 1);
      assert.ok(d.every((x) => plain(x.mark) !== plain(target.mark)));
      assert.notEqual(plain(d[0].mark), plain(d[1].mark));
      n++;
      if (d.some((x) => plain(x.mark)[0] === plain(target.mark)[0])) sameInitial++;
    }
  }
  assert.ok(sameInitial / n > 0.7, `trop peu de mots qui ressemblent (${sameInitial}/${n})`);
});

test('partie parfaite : 16 colis, 3 étoiles, série qui monte', () => {
  for (const l of [1, 2, 3, 4] as FLevel[]) {
    const g = newSession(l, rngOf(l));
    assert.equal(g.total, PARCELS);
    let steps = 0;
    while (!g.over) {
      const p = g.parcel!;
      assert.equal(p.choices.length, CHOICES);
      assert.equal(p.choices.filter((c) => plain(c.mark) === plain(p.word.mark)).length, 1);
      const i = p.choices.findIndex((c) => plain(c.mark) === plain(p.word.mark));
      assert.equal(g.tap(i).kind, 'ok');
      steps++;
    }
    assert.equal(steps, PARCELS);
    const r = g.result;
    assert.equal(r.stars, 3);
    assert.equal(r.firstTry, PARCELS);
    assert.ok(r.score > PARCELS * 100, 'la série doit rapporter plus que 100 par colis');
    assert.deepEqual(r.missed, []);
  }
});

test('erreur : la boîte se grise, le colis revient plus tard, le jeu ne s’arrête jamais', () => {
  const g = newSession(1, rngOf(4));
  const first = g.parcel!;
  const wrong = first.choices.findIndex((c) => plain(c.mark) !== plain(first.word.mark));
  assert.deepEqual(g.tap(wrong), { kind: 'wrong', hint: false });
  assert.deepEqual(g.tap(wrong), { kind: 'ignored' }, 'une boîte grisée ne se rejoue pas');
  const wrong2 = first.choices.findIndex((c, i) => i !== wrong && plain(c.mark) !== plain(first.word.mark));
  assert.deepEqual(g.tap(wrong2), { kind: 'wrong', hint: true }, 'après 2 erreurs la bonne boîte s’allume');
  const good = first.choices.findIndex((c) => plain(c.mark) === plain(first.word.mark));
  const ok = g.tap(good);
  assert.equal(ok.kind, 'ok');
  assert.equal((ok as { first: boolean }).first, false);
  assert.equal(g.left, PARCELS, 'un colis de plus : le mal rangé est revenu dans la file');
  // le colis ressort dans les premiers suivants
  const seen: string[] = [];
  for (let i = 0; i < 5 && !g.over; i++) {
    const p = g.parcel!;
    seen.push(plain(p.word.mark));
    g.tap(p.choices.findIndex((c) => plain(c.mark) === plain(p.word.mark)));
  }
  assert.ok(seen.includes(plain(first.word.mark)), 'le colis mal rangé revient dans les 5 suivants');
  // on finit la partie
  while (!g.over) g.tap(g.parcel!.choices.findIndex((c) => plain(c.mark) === plain(g.parcel!.word.mark)));
  const r = g.result;
  assert.ok(r.missed.includes(plain(first.word.mark)));
  assert.equal(r.slips, 2);
});

test('étoiles : bienveillantes, jamais zéro', () => {
  assert.equal(starsFor(16, 16), 3);
  assert.equal(starsFor(12, 16), 2);
  assert.equal(starsFor(3, 16), 1);
  assert.equal(starsFor(0, 0), 1);
});

test('tapis : le colis avance doucement (au moins 25 s pour traverser), un peu plus vite quand les mots s’allongent', () => {
  const t = [1, 2, 3, 4].map((l) => TRAVEL_SECONDS[l as FLevel]);
  assert.ok(t.every((x) => x >= 25 && x <= 45), `durées : ${t}`);
  assert.ok(t.every((x, i) => i === 0 || x <= t[i - 1]), 'jamais plus lent d’un niveau à l’autre');
});

test('chaque colis a son numéro, qui ne change pas après une erreur (le colis ne repart pas du début du tapis)', () => {
  const g = newSession(1, rngOf(5));
  const p = g.parcel!;
  const id = p.id;
  const wrong = p.choices.findIndex((c) => plain(c.mark) !== plain(p.word.mark));
  g.tap(wrong);
  assert.equal(g.parcel!.id, id);
  g.tap(g.parcel!.choices.findIndex((c) => plain(c.mark) === plain(p.word.mark)));
  assert.equal(g.parcel!.id, id + 1);
});
