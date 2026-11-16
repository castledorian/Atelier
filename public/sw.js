/* Atelier — service worker : le site fonctionne sans réseau après la première visite.
 *
 * - La page (index.html) : RÉSEAU D'ABORD. Une nouvelle version publiée s'affiche dès l'ouverture suivante ;
 *   sans réseau (ou réseau trop lent, plus de 4 s), on sert la dernière version enregistrée.
 * - Les autres fichiers (icônes, manifeste) : cache d'abord, mis à jour en arrière-plan.
 * - Les données des comptes (serveur) ne passent jamais par ce cache.
 */
const CACHE = 'atelier-v15';
const CORE = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png'];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).catch(() => {}));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

function save(req, res) {
  if (res && res.ok && res.type === 'basic') {
    const copy = res.clone();
    caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
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
        fetch(req)
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
        .then((res) => save(req, res))
        .catch(() => hit);
      return hit || network;
    }),
  );
});
