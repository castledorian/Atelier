import type { Difficulty } from './difficulty';
import { isDifficulty } from './difficulty';
import { fmtDate, diffLabel, toCsv } from './history';

/** Classement partagé : un petit script Google Apps Script appartenant à l'enseignant (voir enseignant/GUIDE-ENSEIGNANT.md). */
export interface CloudConfig {
  url: string;
  code: string;
}

export const NO_CLOUD: CloudConfig = { url: '', code: '' };

const URL_RE = /^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/;
const CODE_RE = /^[A-Z0-9_-]{2,24}$/;

export const isScriptUrl = (u: string) => URL_RE.test(u.trim());
export const normCode = (c: string) => c.trim().toUpperCase().replace(/\s+/g, '-');
export const isCloudReady = (c: CloudConfig) => isScriptUrl(c.url) && CODE_RE.test(normCode(c.code));

/** Remet une configuration inconnue (stockage, lien) dans une forme valide, ou vide. */
export function sanitizeCloud(v: unknown): CloudConfig {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const url = typeof o.url === 'string' ? o.url.trim() : '';
  const code = typeof o.code === 'string' ? normCode(o.code) : '';
  return isScriptUrl(url) && CODE_RE.test(code) ? { url, code } : NO_CLOUD;
}

export interface CloudScore {
  id: string;
  name: string;
  diff: Difficulty;
  score: number;
  wave: number;
  wpm: number;
  acc: number;
  date: number;
}

const clean = (r: unknown): CloudScore | null => {
  const o = r as Record<string, unknown> | null;
  if (!o || typeof o.id !== 'string' || typeof o.score !== 'number') return null;
  return {
    id: o.id,
    name: String(o.name ?? '').slice(0, 12) || 'ANONYME',
    diff: isDifficulty(o.diff) ? o.diff : 'standard',
    score: o.score,
    wave: Number(o.wave) || 0,
    wpm: Number(o.wpm) || 0,
    acc: Number(o.acc) || 0,
    date: Number(o.date) || 0,
  };
};

async function getJson(url: string, ms = 9000): Promise<unknown> {
  const ctl = new AbortController();
  const t = window.setTimeout(() => ctl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    window.clearTimeout(t);
  }
}

const q = (cfg: CloudConfig, params: Record<string, string>) =>
  `${cfg.url}?${new URLSearchParams({ code: cfg.code, ...params }).toString()}`;

/** Meilleurs scores de la classe pour un mode. */
export async function fetchTop(cfg: CloudConfig, diff: Difficulty, limit = 10): Promise<CloudScore[]> {
  const data = (await getJson(q(cfg, { action: 'top', diff, limit: String(limit) }))) as { ok?: boolean; rows?: unknown[] };
  if (!data?.ok || !Array.isArray(data.rows)) throw new Error('réponse invalide');
  return data.rows.map(clean).filter((r): r is CloudScore => !!r);
}

/** Toutes les parties de la classe (pour l'export). */
export async function fetchAll(cfg: CloudConfig): Promise<CloudScore[]> {
  const data = (await getJson(q(cfg, { action: 'all' }), 20000)) as { ok?: boolean; rows?: unknown[] };
  if (!data?.ok || !Array.isArray(data.rows)) throw new Error('réponse invalide');
  return data.rows.map(clean).filter((r): r is CloudScore => !!r);
}

export function cloudCsv(rows: CloudScore[]): string {
  return toCsv(
    ['Date', 'Prénom', 'Mode', 'Score', 'Vague', 'Mots/min', 'Précision %'],
    rows.map((r) => [fmtDate(r.date), r.name, diffLabel(r.diff), r.score, r.wave, r.wpm, r.acc]),
  );
}

/**
 * Envoi d'un score. « text/plain » évite la requête de pré-vérification (CORS) que les scripts Google n'acceptent pas.
 * Renvoie false si l'envoi a échoué (hors ligne…) : le score est alors mis en attente.
 */
async function send(cfg: CloudConfig, entry: CloudScore): Promise<boolean> {
  const ctl = new AbortController();
  const t = window.setTimeout(() => ctl.abort(), 10000);
  try {
    const res = await fetch(cfg.url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ code: cfg.code, ...entry }),
      signal: ctl.signal,
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { ok?: boolean };
    return data?.ok === true;
  } catch {
    return false;
  } finally {
    window.clearTimeout(t);
  }
}

// ───────────────────────── Scores en attente (hors ligne) ─────────────────────────

const OUTBOX = 'frappe.outbox.v1';
type Pending = { cfg: CloudConfig; entry: CloudScore };

const readBox = (): Pending[] => {
  try {
    const v = JSON.parse(localStorage.getItem(OUTBOX) ?? '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
};
const writeBox = (b: Pending[]) => {
  try {
    localStorage.setItem(OUTBOX, JSON.stringify(b.slice(-60)));
  } catch {
    /* ignoré */
  }
};

export const pendingCount = () => readBox().length;

/** Envoie le score ; en cas d'échec il est gardé et réessayé plus tard. Renvoie true si l'envoi a abouti. */
export async function submitScore(cfg: CloudConfig, entry: CloudScore): Promise<boolean> {
  if (await send(cfg, entry)) return true;
  writeBox([...readBox(), { cfg, entry }]);
  return false;
}

/** Réessaie les scores en attente. Renvoie le nombre de scores envoyés. */
export async function flushOutbox(): Promise<number> {
  const box = readBox();
  if (box.length === 0) return 0;
  const left: Pending[] = [];
  let sent = 0;
  for (const p of box) {
    if (isCloudReady(p.cfg) && (await send(p.cfg, p.entry))) sent++;
    else left.push(p);
  }
  writeBox(left);
  return sent;
}
