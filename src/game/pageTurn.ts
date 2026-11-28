import { Sfx } from './audio';
import { loadSettings } from './storage';

/** Bruit de page qu'on tourne quand on change d'écran (accueil, jeux, espaces). Son seul, sans animation ; il suit le réglage « son » des jeux. */

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

/** Joue le bruit de page. À appeler à chaque changement d'écran. */
export function turnPage() {
  if (typeof window === 'undefined') return;
  armPageSound();
  if (!sfx) return;
  sfx.enabled = loadSettings().sound;
  sfx.unlock();
  sfx.play('page');
}
