import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installFakeStorage } from './helpers';
import { flushItems, pendingItemsCount, queueStudentItems } from '../src/server/outbox';
import type { PendingItems } from '../src/server/outbox';

/**
 * Erreurs d'une partie gardées hors connexion : elles attendent sur l'appareil, partent après la partie elle-même,
 * et ne sont abandonnées que si le serveur les refuse ou au bout de 7 jours.
 */

(globalThis as unknown as { window: typeof globalThis }).window = globalThis;
const store = installFakeStorage();

/** Faux serveur : répond à chaque appel selon `answer`, et note les identifiants de partie reçus. */
let answer: (clientId: string) => { status: number; body: unknown } | 'offline' = () => ({ status: 200, body: { ok: true } });
const calls: string[] = [];
globalThis.fetch = (async (_url: string, init: { body: string }) => {
  const args = JSON.parse(init.body) as { p_client_id: string };
  calls.push(args.p_client_id);
  const a = answer(args.p_client_id);
  if (a === 'offline') throw new TypeError('Failed to fetch');
  return { ok: a.status < 400, status: a.status, text: async () => JSON.stringify(a.body) };
}) as unknown as typeof fetch;

const item = (o: Partial<Omit<PendingItems, 'at'>>): Omit<PendingItems, 'at'> => ({
  studentId: 'eleve-1',
  clientId: 'partie-001',
  game: 'math',
  level: 'cm1',
  difficulty: 'standard',
  items: [{ k: 'rule', i: 'tables', l: 'Tables', n: 10, e: 3 }],
  ...o,
});
const reset = () => {
  store.clear();
  calls.length = 0;
};

test('sans réseau, les erreurs restent sur l’appareil ; elles partent au retour du réseau', async () => {
  reset();
  answer = () => 'offline';
  queueStudentItems('jeton', item({}), false);
  assert.equal(pendingItemsCount(), 1);
  assert.equal(await flushItems('eleve-1', 'jeton'), 0);
  assert.equal(pendingItemsCount(), 1);
  answer = () => ({ status: 200, body: { ok: true, stored: 1 } });
  assert.equal(await flushItems('eleve-1', 'jeton'), 1);
  assert.equal(pendingItemsCount(), 0);
});

test('partie pas encore arrivée au serveur : on garde et on réessaie', async () => {
  reset();
  answer = () => ({ status: 200, body: { error: 'no_run' } });
  queueStudentItems('jeton', item({}), false);
  await flushItems('eleve-1', 'jeton');
  assert.equal(pendingItemsCount(), 1);
});

test('déjà reçu, ou refusé par le serveur : on n’insiste pas', async () => {
  reset();
  answer = (id) => (id === 'partie-001' ? { status: 200, body: { ok: true, duplicate: true } } : { status: 200, body: { error: 'invalid_data' } });
  queueStudentItems('jeton', item({ clientId: 'partie-001' }), false);
  queueStudentItems('jeton', item({ clientId: 'partie-002' }), false);
  await flushItems('eleve-1', 'jeton');
  assert.equal(pendingItemsCount(), 0);
});

test('une même partie n’est gardée qu’une fois ; les erreurs d’un autre élève de l’appareil ne sont pas envoyées', async () => {
  reset();
  answer = () => ({ status: 200, body: { ok: true } });
  queueStudentItems('jeton', item({}), false);
  queueStudentItems('jeton', item({}), false);
  queueStudentItems('jeton', item({ studentId: 'eleve-2', clientId: 'partie-900' }), false);
  assert.equal(pendingItemsCount(), 2);
  await flushItems('eleve-1', 'jeton');
  assert.deepEqual(calls, ['partie-001']);
  assert.equal(pendingItemsCount(), 1);
});

test('au bout de 7 jours sans succès, l’envoi est abandonné', async () => {
  reset();
  answer = () => 'offline';
  queueStudentItems('jeton', item({}), false);
  await flushItems('eleve-1', 'jeton', Date.now() + 8 * 86_400_000);
  assert.equal(pendingItemsCount(), 0);
  assert.equal(calls.length, 0);
});

test('une partie sans exercice à détailler n’est pas mise de côté', () => {
  reset();
  queueStudentItems('jeton', item({ items: [] }), false);
  assert.equal(pendingItemsCount(), 0);
});
