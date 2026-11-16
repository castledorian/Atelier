import { beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { installFakeStorage } from './helpers';
import * as M from '../src/game/memory/scores';
import * as C from '../src/game/course/scores';
import * as S from '../src/game/storage';
import { weakLetters } from '../src/game/analysis';

let store: Map<string, string>;
beforeEach(() => {
  store = installFakeStorage();
});

const mem = (id: string, score: number, date = 1) => ({ id, name: id, score, date }) as M.MemoryScore;

test('Mémoire : top 10 trié par score, un classement par mode', () => {
  for (let i = 1; i <= 12; i++) M.addMemoryScore('suite', mem('s' + i, i * 10));
  const top = M.loadMemoryScores('suite');
  assert.equal(top.length, M.MAX_MEMORY_SCORES);
  assert.equal(top[0].score, 120);
  assert.deepEqual(M.loadMemoryScores('cases'), []);
  const r = M.addMemoryScore('suite', mem('petit', 1));
  assert.equal(r.rank, -1);
  assert.equal(M.addMemoryScore('suite', mem('record', 999)).rank, 1);
  assert.deepEqual(M.clearMemoryScores('suite'), []);
  assert.deepEqual(M.loadMemoryScores('suite'), []);
});

test('Mémoire : stockage illisible ou vide → valeurs par défaut', () => {
  store.set('atelier.memory.scores.v1', '{pas du json');
  assert.deepEqual(M.loadMemoryScores('suite'), []);
  store.set('atelier.memory.progress.v1', '"n’importe quoi"');
  assert.deepEqual(M.loadProgress('suite'), { stamps: 0, lastSpan: 0 });
  assert.equal(M.loadMemoryMode(), 'suite');
});

test('Mémoire : les tampons ne reculent jamais et restent entre 0 et 6', () => {
  const a = M.recordProgress('suite', 3, 17);
  assert.deepEqual(a.before, { stamps: 0, lastSpan: 0 });
  assert.deepEqual(a.after, { stamps: 3, lastSpan: 17 });
  const b = M.recordProgress('suite', 1, 5);
  assert.equal(b.after.stamps, 3, 'un tampon gagné est gardé');
  assert.equal(b.after.lastSpan, 5, 'la dernière partie est mémorisée');
  assert.equal(M.recordProgress('suite', 99, 1).after.stamps, 6);
  assert.equal(M.recordProgress('cases', -4, 1).after.stamps, 0);
  assert.equal(M.loadProgress('cases').stamps, 0, 'les modes sont indépendants');
});

test('Course : top 10 par niveau, renommer, effacer', () => {
  for (let i = 1; i <= 11; i++) C.addCourseScore('cm1', { id: 'c' + i, name: 'x', score: i * 100, streak: 1, date: i });
  assert.equal(C.loadCourseScores('cm1').length, C.MAX_COURSE_SCORES);
  assert.equal(C.loadCourseScores('cm2').length, 0);
  assert.equal(C.renameCourseScore('cm1', 'c11', 'Léa')[0].name, 'Léa');
  assert.equal(C.addCourseScore('cm1', { id: 'z', name: 'z', score: 5, streak: 0, date: 99 }).rank, -1);
  C.clearCourseScores('cm1');
  assert.equal(C.loadCourseScores('cm1').length, 0);
});

test('Course : niveau mémorisé, CM1 par défaut', () => {
  assert.equal(C.loadCourseLevel(), 'cm1');
  C.saveCourseLevel('cm2');
  assert.equal(C.loadCourseLevel(), 'cm2');
  store.set('atelier.course.level.v1', 'nimporte');
  assert.equal(C.loadCourseLevel(), 'cm1');
});

test('Frappe : top 10 par difficulté, score nul ignoré', () => {
  const base = { name: 'A', score: 0, diff: 'standard' } as never as Parameters<typeof S.addScore>[0];
  assert.equal(S.addScore({ ...base, score: 0 }).rank, -1);
  for (let i = 1; i <= 12; i++) S.addScore({ ...base, score: i });
  S.addScore({ ...base, diff: 'expert', score: 7 });
  const all = S.loadScores();
  assert.equal(S.scoresFor(all, 'standard').length, S.MAX_SCORES);
  assert.equal(S.scoresFor(all, 'expert').length, 1);
  S.clearScores('standard');
  assert.equal(S.scoresFor(S.loadScores(), 'standard').length, 0);
  assert.equal(S.scoresFor(S.loadScores(), 'expert').length, 1);
});

test('Frappe : lettres à retravailler', () => {
  const w = weakLetters({ a: { ok: 10, err: 0 }, b: { ok: 1, err: 3 }, c: { ok: 5, err: 2 }, d: { ok: 0, err: 1 }, e: { ok: 2, err: 2 }, f: { ok: 1, err: 5 } });
  assert.deepEqual(w, ['f', 'b', 'e']);
  assert.deepEqual(weakLetters({ x: { ok: 50, err: 1 } }), []);
});
