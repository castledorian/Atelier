import { ApiError, rpc } from './api';
import { freshToken } from './teacher';
import { parseVersion } from './versionLogic';
import type { ServerVersion } from './versionLogic';

/**
 * Interroge le serveur. Renvoie null si on ne peut pas savoir (pas de réseau…).
 * Si la fonction n'existe pas encore (404), la base n'a pas reçu la mise à jour « fiabilité » : on le dit.
 */
export async function fetchServerVersion(): Promise<ServerVersion | null> {
  try {
    const t = await freshToken();
    return parseVersion(await rpc<unknown>('server_version', {}, t));
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) {
      return { version: 0, features: {}, missing: ['fiabilite', 'invitations', 'nettoyage'] };
    }
    return null;
  }
}
