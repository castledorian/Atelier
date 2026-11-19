import assert from 'node:assert/strict';
import test from 'node:test';
import { BARS, BEAT, BPM, MASTER, PROGRESSIONS, VOLUMES, chordAt, MELODY_HIGH, MELODY_LOW, isPentatonic, midiToHz, planBar } from '../src/game/ambiance';

const rngOf = (seed: number) => {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
};

test('ambiance : lente, douce et sans note fausse (recherche : rapide et fort gêne la lecture)', () => {
  assert.ok(BPM >= 60 && BPM <= 80, `tempo ${BPM}`);
  assert.ok(Math.abs(BEAT - 60 / BPM) < 1e-9);
  assert.ok(MASTER <= 0.15, 'volume général très doux');
  assert.ok(Math.abs(midiToHz(69) - 440) < 1e-9);
  assert.ok(PROGRESSIONS.every((p) => p.length === BARS));
  assert.ok(Math.max(...VOLUMES) <= 0.2 && VOLUMES.every((v, i) => i === 0 || v > VOLUMES[i - 1]), 'trois volumes croissants, tous doux');
});

test('ambiance : la mélodie reste pentatonique, dans une tessiture confortable, sans grands sauts', () => {
  const rng = rngOf(7);
  let prev = 74;
  for (let bar = 0; bar < 400; bar++) {
    const { notes, last } = planBar(bar, prev, rng);
    const drops = notes.filter((n) => n.kind === 'drop');
    let p = prev;
    for (const n of drops) {
      assert.ok(isPentatonic(n.midi), `note ${n.midi} hors gamme`);
      assert.ok(n.midi >= MELODY_LOW && n.midi <= MELODY_HIGH, `note ${n.midi} hors tessiture`);
      assert.ok(midiToHz(n.midi) < 1000, 'jamais aiguë');
      assert.ok(Math.abs(n.midi - p) <= 9, 'pas de saut brutal');
      assert.ok(n.beat >= 0 && n.beat < 4);
      p = n.midi;
    }
    assert.ok(drops.length <= 8);
    prev = last;
  }
});

test('ambiance : les deux progressions alternent, et la harpe reste discrète', () => {
  assert.notDeepEqual(chordAt(1), chordAt(BARS + 1));
  const { notes } = planBar(0, 74, rngOf(5));
  const harp = notes.filter((n) => n.kind === 'harp');
  assert.equal(harp.length, 4);
  assert.ok(harp.every((n) => n.vol <= 0.2 && midiToHz(n.midi) < 1100));
});

test('ambiance : chaque mesure a sa fondamentale et son accord (Do, La mineur, Fa, Sol)', () => {
  const rng = rngOf(3);
  for (let bar = 0; bar < 8; bar++) {
    const { notes } = planBar(bar, 74, rng);
    const chord = chordAt(bar);
    assert.equal(notes.filter((n) => n.kind === 'bass').length, 1);
    assert.equal(notes.find((n) => n.kind === 'bass')!.midi, chord[0]);
    const pad = notes.filter((n) => n.kind === 'pad').map((n) => n.midi - 12).sort();
    assert.deepEqual(pad, [...chord].sort());
    for (const n of notes) assert.ok(n.vol > 0 && n.vol <= 1);
  }
});

test('ambiance : la mélodie varie d’un tour à l’autre', () => {
  const rng = rngOf(11);
  const seen = new Set<string>();
  let prev = 74;
  for (let bar = 0; bar < 24; bar += BARS) {
    let sig = '';
    for (let k = 0; k < BARS; k++) {
      const { notes, last } = planBar(bar + k, prev, rng);
      prev = last;
      sig += notes.filter((n) => n.kind === 'drop').map((n) => `${n.beat}:${n.midi}`).join(',') + '|';
    }
    seen.add(sig);
  }
  assert.ok(seen.size >= 5, `${seen.size} tours différents sur 6`);
});
