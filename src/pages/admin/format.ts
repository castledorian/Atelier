/** Petits formats d'affichage communs aux vues de l'administration. */
import { GAME_NAME } from '../../server/admin';

export const fmtN = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
export const when = (ms: number | null | undefined) =>
  ms ? new Date(ms).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
export const dur = (sec: number) => (sec >= 3600 ? `${Math.floor(sec / 3600)} h ${Math.round((sec % 3600) / 60)} min` : sec >= 60 ? `${Math.round(sec / 60)} min` : `${sec} s`);
export const game = (g: string | null) => (g ? (GAME_NAME[g] ?? g) : '—');
