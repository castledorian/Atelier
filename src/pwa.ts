/// <reference types="vite/client" />

/** Enregistre le service worker (utilisation hors ligne + installation). Seulement dans la version publiée. */
export function registerServiceWorker() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {
      /* sans service worker, le jeu fonctionne simplement en ligne */
    });
  });
}
