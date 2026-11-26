import { ApiError } from './api';
import { flushDrops, sendRun, sendStudentItems } from './student';
import type { ItemEntry } from '../game/itemstats';
import type { RunPayload } from './types';

/** Parties jouées sans réseau : gardées sur l'appareil puis envoyées dès que possible (sans doublon : même clientId). */
const KEY = 'frappe.outbox.v2';
type Pending = { studentId: string; run: RunPayload };

const read = (): Pending[] => {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
};
const write = (b: Pending[]) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(b.slice(-100)));
  } catch {
    /* ignoré */
  }
};

export const pendingCount = () => read().length;

export function enqueue(studentId: string, run: RunPayload) {
  const box = read().filter((p) => p.run.clientId !== run.clientId);
  write([...box, { studentId, run }]);
}

/** Envoie ce qui est en attente pour cet élève. Renvoie le nombre envoyé. */
export async function flush(studentId: string, token: string): Promise<number> {
  await flushDrops(studentId, token); // compteurs de la grotte restés en attente
  const box = read();
  if (box.length === 0) return 0;
  const left: Pending[] = [];
  let sent = 0;
  let offline = false;
  for (const p of box) {
    if (p.studentId !== studentId) {
      left.push(p); // appartient à un autre élève de cet appareil
      continue;
    }
    if (offline) {
      left.push(p);
      continue;
    }
    try {
      const r = await sendRun(token, p.run);
      if (r === 'ok') sent++;
      else if (r === 'invalid_session') left.push(p);
      // invalid_data : partie refusée par le serveur, inutile de la garder
    } catch (e) {
      if (e instanceof ApiError) offline = true;
      left.push(p);
    }
  }
  write(left);
  await flushItems(studentId, token); // après les parties : le serveur exige que la partie soit arrivée
  return sent;
}

// ───────────── Erreurs des parties (fiche élève) ─────────────

/** Erreurs d'une partie pas encore reçues par le serveur : gardées sur l'appareil, renvoyées après la partie elle-même. */
const ITEMS_KEY = 'atelier.items.v1';
/** Au-delà, l'envoi est abandonné (partie refusée par le serveur, ou serveur jamais mis à jour). */
const ITEMS_MAX_AGE = 7 * 86_400_000;

export interface PendingItems {
  studentId: string;
  clientId: string;
  game: 'math' | 'spelling' | 'facteur';
  level: string;
  difficulty: string;
  items: ItemEntry[];
  at: number;
}

const readItems = (): PendingItems[] => {
  try {
    const v = JSON.parse(localStorage.getItem(ITEMS_KEY) ?? '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
};
const writeItems = (b: PendingItems[]) => {
  try {
    localStorage.setItem(ITEMS_KEY, JSON.stringify(b.slice(-60)));
  } catch {
    /* appareil plein : tant pis, la partie elle-même est gardée */
  }
};

export const pendingItemsCount = () => readItems().length;

/**
 * Met de côté les erreurs d'une partie, puis tente l'envoi si `sendNow` (la partie vient d'être reçue).
 * À appeler pour toute partie enregistrée ou mise en attente ; jamais pour une partie refusée.
 */
export function queueStudentItems(token: string, p: Omit<PendingItems, 'at'>, sendNow: boolean): void {
  if (p.items.length === 0) return;
  const box = readItems().filter((x) => !(x.studentId === p.studentId && x.clientId === p.clientId));
  writeItems([...box, { ...p, at: Date.now() }]);
  if (sendNow) void flushItems(p.studentId, token);
}

/** Envoie les erreurs en attente de cet élève. Renvoie le nombre envoyé. */
export async function flushItems(studentId: string, token: string, now = Date.now()): Promise<number> {
  const box = readItems();
  if (box.length === 0) return 0;
  const done = new Set<string>();
  let sent = 0;
  for (const p of box) {
    if (p.studentId !== studentId) continue;
    if (now - p.at > ITEMS_MAX_AGE) {
      done.add(p.clientId);
      continue;
    }
    const r = await sendStudentItems(token, p.clientId, p.game, p.level, p.difficulty, p.items);
    if (r === 'later') continue;
    done.add(p.clientId);
    if (r === 'ok') sent++;
  }
  // relu après les envois : une partie jouée pendant ce temps n'est pas effacée
  writeItems(readItems().filter((p) => !(p.studentId === studentId && done.has(p.clientId))));
  return sent;
}
