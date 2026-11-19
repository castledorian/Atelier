import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { WORDS, slug } from '../src/game/facteur/words.ts';
import { missingVoices, voiceFileOf } from '../src/game/facteur/voice.ts';

test('sans enregistrement, aucun fichier de voix n’est annoncé (la voix du poste sert de secours)', () => {
  assert.equal(voiceFileOf('vach(e)'), null);
  assert.deepEqual(missingVoices(['vach(e)', 'chat']), ['vache', 'chat']);
});

test('mots.txt (liste à enregistrer) contient exactement les mots du jeu, une fois chacun', () => {
  const lignes = readFileSync(new URL('../public/facteur/voix/mots.txt', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => l.trim() && !l.startsWith('#'));
  const slugs = lignes.map((l) => l.split(';')[0]);
  assert.equal(new Set(slugs).size, slugs.length, 'pas de doublon');
  const attendus = [...new Set(WORDS.map((w) => slug(w.mark)))].sort();
  assert.deepEqual([...slugs].sort(), attendus);
});
