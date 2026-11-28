import { Sfx } from './audio';
import { loadSettings } from './storage';

/**
 * Page qui se tourne quand on change d'écran (accueil, jeux, espaces) : un bruit de papier et une feuille qui se soulève.
 * Le son suit le réglage « son » des jeux ; l'animation s'efface pour qui a demandé moins de mouvement.
 */

export const PAGE_TURN_EVENT = 'atelier:page-turn';
export interface PageTurnDetail {
  /** retour vers l'accueil : la feuille se tourne dans l'autre sens */
  back: boolean;
}

let sfx: Sfx | null = null;
let armed = false;

/** Les navigateurs n'autorisent le son qu'après un geste : on débloque l'audio dès le premier appui. */
export function armPageSound() {
  if (armed || typeof window === 'undefined') return;
  armed = true;
  sfx = new Sfx();
  const unlock = () => sfx?.unlock();
  window.addEventListener('pointerdown', unlock, { capture: true, passive: true });
  window.addEventListener('keydown', unlock, { capture: true, passive: true });
}

export const wantsLessMotion = () => typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Joue le bruit de page et prévient la feuille animée. À appeler à chaque changement d'écran. */
export function turnPage(back: boolean) {
  if (typeof window === 'undefined') return;
  armPageSound();
  if (sfx) {
    sfx.enabled = loadSettings().sound;
    sfx.unlock();
    sfx.play('page');
  }
  if (!wantsLessMotion()) window.dispatchEvent(new CustomEvent<PageTurnDetail>(PAGE_TURN_EVENT, { detail: { back } }));
}
