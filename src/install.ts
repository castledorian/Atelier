import { useEffect, useState } from 'react';
import type { InstallInfo } from './components/Screens';

/** Événement non standard des navigateurs Chromium : propose d'installer l'application. */
interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
}

/**
 * Installation de l'application (Chrome, Edge, Android) ou consigne pour iPhone / iPad.
 * Appelé à la racine : le navigateur n'envoie son invitation qu'une fois, au chargement de la page.
 */
export function useInstall(): InstallInfo {
  const [evt, setEvt] = useState<InstallPromptEvent | null>(null);
  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvt(e as InstallPromptEvent);
    };
    const onInstalled = () => setEvt(null);
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);
  const standalone =
    (typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  return evt
    ? {
        mode: 'prompt',
        onInstall: () => {
          void evt.prompt().then(() => evt.userChoice).finally(() => setEvt(null));
        },
      }
    : { mode: isIos && !standalone ? 'ios' : null, onInstall: () => {} };
}
