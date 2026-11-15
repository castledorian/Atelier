import type { Difficulty } from './difficulty';

/** Une partie terminée, gardée sur cet appareil pour la courbe de progression et l'export. */
export interface RunRecord {
  id: string;
  date: number;
  name: string;
  diff: Difficulty;
  /** partie normale ou entraînement ciblé */
  kind: 'game' | 'drill';
  score: number;
  wave: number;
  /** mots par minute */
  wpm: number;
  /** précision en % (0–100) */
  acc: number;
  /** touches justes */
  correct: number;
  /** durée de jeu en secondes */
  time: number;
}

const KEY = 'frappe.history.v1';
const MAX_RUNS = 400;

function read(): RunRecord[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((r) => r && typeof r.id === 'string' && typeof r.wpm === 'number') : [];
  } catch {
    return [];
  }
}

function write(list: RunRecord[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(-MAX_RUNS)));
  } catch {
    /* stockage plein ou refusé : l'historique est un bonus */
  }
}

export const loadHistory = (): RunRecord[] => read();

export function addRun(r: RunRecord): RunRecord[] {
  const list = [...read(), r];
  write(list);
  return list.slice(-MAX_RUNS);
}

export function renameRun(id: string, name: string): RunRecord[] {
  const list = read().map((r) => (r.id === id ? { ...r, name } : r));
  write(list);
  return list;
}

export function clearHistory(): RunRecord[] {
  write([]);
  return [];
}

export const newRunId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

// ───────────────────────── Export CSV (ouvre directement dans Excel / LibreOffice) ─────────────────────────

const pad = (n: number) => String(n).padStart(2, '0');
export const fmtDate = (t: number) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/** Une cellule CSV : guillemets échappés, et neutralisation des formules (un prénom ne doit pas pouvoir « calculer »). */
function cell(v: string | number): string {
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(header: string[], rows: (string | number)[][]): string {
  return '\ufeff' + [header, ...rows].map((r) => r.map(cell).join(';')).join('\r\n') + '\r\n';
}

const DIFF_LABEL: Record<Difficulty, string> = { apprenti: 'Apprenti', standard: 'Standard', expert: 'Expert', perso: 'Perso' };
export const diffLabel = (d: Difficulty) => DIFF_LABEL[d] ?? d;

export function historyCsv(runs: RunRecord[]): string {
  return toCsv(
    ['Date', 'Prénom', 'Mode', 'Type', 'Score', 'Vague', 'Mots/min', 'Précision %', 'Touches justes', 'Durée (s)'],
    runs.map((r) => [
      fmtDate(r.date),
      r.name || 'ANONYME',
      diffLabel(r.diff),
      r.kind === 'drill' ? 'Entraînement' : 'Partie',
      r.score,
      r.wave,
      r.wpm,
      r.acc,
      r.correct,
      Math.round(r.time),
    ]),
  );
}

export function downloadText(filename: string, text: string, mime = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
