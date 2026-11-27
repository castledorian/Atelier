/* Atelier — service worker : le site fonctionne sans réseau après la première visite.
 *
 * - La page (index.html) : RÉSEAU D'ABORD, sans le cache du navigateur (GitHub le garde jusqu'à 10 min) : une nouvelle
 *   version publiée s'affiche dès l'ouverture suivante ;
 *   sans réseau (ou réseau trop lent, plus de 4 s), on sert la dernière version enregistrée.
 * - Les autres fichiers (icônes, manifeste) : cache d'abord, mis à jour en arrière-plan.
 * - Les images du monstre (cave/) et les voix du facteur (facteur/) : même principe, mais dans un cache À PART qui survit
 *   aux nouvelles versions du site : on ne les retélécharge pas à chaque publication (précieux sur un réseau d'école lent).
 * - Les données des comptes (serveur) ne passent jamais par ce cache.
 */
// « __BUILD__ » est remplacé à la construction par l'empreinte de la page (voir scripts/sw-version.ts) : ne pas numéroter à la main.
const CACHE = 'atelier-__BUILD__';
const MEDIA = 'atelier-media';
const isMedia = (url) => /\/(cave|facteur)\//.test(url.pathname);
const CORE = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png'];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).catch(() => {}));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== MEDIA).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

function save(req, res, name) {
  if (res && res.ok && res.type === 'basic') {
    const copy = res.clone();
    caches.open(name || CACHE).then((c) => c.put(req, copy)).catch(() => {});
  }
  return res;
}

function pageFromCache() {
  return caches.match('./index.html').then((hit) => hit || caches.match('./'));
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // La page : réseau d'abord (avec un délai maximum), puis copie enregistrée
  if (req.mode === 'navigate') {
    event.respondWith(
      new Promise((resolve) => {
        let done = false;
        const fallback = () => {
          if (done) return;
          pageFromCache().then((hit) => {
            if (hit && !done) {
              done = true;
              resolve(hit);
            }
          });
        };
        const timer = setTimeout(fallback, 4000);
        // « no-cache » : le navigateur redemande la page au serveur (une simple vérification si elle n'a pas changé)
        let fresh = req;
        try {
          fresh = new Request(req, { cache: 'no-cache' });
        } catch {
          /* très vieux navigateur : requête d'origine */
        }
        fetch(fresh)
          .then((res) => {
            clearTimeout(timer);
            if (res.ok) {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put('./index.html', copy)).catch(() => {});
            }
            if (!done) {
              done = true;
              resolve(res);
            }
          })
          .catch(() => {
            clearTimeout(timer);
            pageFromCache().then((hit) => {
              if (!done) {
                done = true;
                resolve(hit || Response.error());
              }
            });
          });
      }),
    );
    return;
  }

  // Autres fichiers du site : cache d'abord, mise à jour en arrière-plan
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => {
      const network = fetch(req)
        .then((res) => save(req, res, isMedia(url) ? MEDIA : CACHE))
        .catch(() => hit);
      return hit || network;
    }),
  );
});
