/// <reference types="vite/client" />

/**
 * Enregistre le service worker (utilisation hors ligne + installation). Seulement dans la version publiée.
 * Mises à jour : un onglet resté ouvert (ou l'application installée) vérifie s'il existe une nouvelle version à chaque retour
 * sur l'onglet et toutes les 30 minutes ; si oui, un bandeau propose de recharger. On ne recharge jamais de force :
 * un élève peut être au milieu d'une partie.
 */
export function registerServiceWorker() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    // la page était déjà servie par un service worker : un changement de contrôleur = une nouvelle version
    const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`)
      .then((reg) => {
        const check = () => {
          reg.update().catch(() => {
            /* hors ligne : on réessaiera */
          });
        };
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') check();
        });
        window.setInterval(check, 30 * 60 * 1000);
      })
      .catch(() => {
        /* sans service worker, le jeu fonctionne simplement en ligne */
      });
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (hadController) showUpdateBanner();
    });
  });
}

/** Petit bandeau en bas de l'écran : « Nouvelle version du site · Recharger ». */
function showUpdateBanner() {
  if (document.getElementById('update-banner')) return;
  const bar = document.createElement('div');
  bar.id = 'update-banner';
  bar.className = 'update-banner';
  bar.setAttribute('role', 'status');
  const text = document.createElement('span');
  text.textContent = 'Nouvelle version du site';
  const reload = document.createElement('button');
  reload.type = 'button';
  reload.textContent = 'Recharger';
  reload.addEventListener('click', () => window.location.reload());
  const later = document.createElement('button');
  later.type = 'button';
  later.className = 'update-later';
  later.setAttribute('aria-label', 'Plus tard');
  later.textContent = '×';
  later.addEventListener('click', () => bar.remove());
  bar.append(text, reload, later);
  document.body.append(bar);
}
