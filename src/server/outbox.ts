import { ApiError } from './api';
import { sendRun } from './student';
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
  return sent;
}
