import { createHash } from 'node:crypto';

/**
 * Version du cache du service worker, calculée à la construction du site.
 * Le site tient dans un seul fichier (index.html) : son empreinte change dès que le moindre texte ou code change,
 * donc le service worker change aussi et les appareils récupèrent la nouvelle version. Plus rien à numéroter à la main.
 */
export const PLACEHOLDER = '__BUILD__';

export function buildId(page: Uint8Array | string): string {
  return createHash('sha256').update(page).digest('hex').slice(0, 10);
}

/** Remplace le repère par l'empreinte de la page. Lève une erreur si le repère est absent (on ne publie pas un cache figé). */
export function stampServiceWorker(sw: string, page: Uint8Array | string): string {
  if (!sw.includes(PLACEHOLDER)) throw new Error(`public/sw.js ne contient plus le repère ${PLACEHOLDER} : le cache ne serait jamais renouvelé.`);
  return sw.split(PLACEHOLDER).join(buildId(page));
}
