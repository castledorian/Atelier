import { SERVER_KEY, SERVER_URL } from './config';

/** Vrai si l'adresse du serveur est renseignée : sinon le jeu reste en mode local. */
export const serverEnabled = () => /^https:\/\/[\w.-]+$/.test(SERVER_URL.trim()) && SERVER_KEY.trim().length > 20;

const base = () => SERVER_URL.trim().replace(/\/+$/, '');

export class ApiError extends Error {
  constructor(
    public code: string,
    public status = 0,
  ) {
    super(code);
  }
}

function headers(token?: string): Record<string, string> {
  const key = SERVER_KEY.trim();
  const h: Record<string, string> = { apikey: key, 'Content-Type': 'application/json' };
  // Les nouvelles clés « sb_publishable_… » ne sont pas des JWT : elles vont uniquement dans apikey.
  if (token) h.Authorization = `Bearer ${token}`;
  else if (key.startsWith('eyJ')) h.Authorization = `Bearer ${key}`;
  return h;
}

export async function request(path: string, init: { method?: string; body?: unknown; token?: string; prefer?: string } = {}, ms = 12000): Promise<unknown> {
  if (!serverEnabled()) throw new ApiError('no_server');
  const ctl = new AbortController();
  const timer = window.setTimeout(() => ctl.abort(), ms);
  try {
    const h = headers(init.token);
    if (init.prefer) h.Prefer = init.prefer;
    const res = await fetch(base() + path, {
      method: init.method ?? 'GET',
      headers: h,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: ctl.signal,
    });
    const text = await res.text();
    let data: unknown = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }
    if (!res.ok) {
      const o = (data ?? {}) as Record<string, unknown>;
      // PostgREST : { message } (nos « raise exception » y mettent un code court) ; GoTrue : { msg | error_code | message }
      const code = String(o.error_code ?? o.message ?? o.msg ?? o.error_description ?? o.error ?? `http_${res.status}`);
      throw new ApiError(code, res.status);
    }
    return data;
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError('network');
  } finally {
    window.clearTimeout(timer);
  }
}

export const rpc = <T>(fn: string, args: Record<string, unknown>, token?: string): Promise<T> =>
  request(`/rest/v1/rpc/${fn}`, { method: 'POST', body: args, token }) as Promise<T>;

export const select = <T>(table: string, query: string, token: string): Promise<T> =>
  request(`/rest/v1/${table}?${query}`, { token }) as Promise<T>;

export const patch = (table: string, query: string, body: unknown, token: string) =>
  request(`/rest/v1/${table}?${query}`, { method: 'PATCH', body, token, prefer: 'return=minimal' });

export const remove = (table: string, query: string, token: string) =>
  request(`/rest/v1/${table}?${query}`, { method: 'DELETE', token, prefer: 'return=minimal' });

/** Message lisible (français) pour une erreur du serveur. */
export function explain(e: unknown): string {
  const code = e instanceof ApiError ? e.code : '';
  const map: Record<string, string> = {
    network: 'Pas de connexion au serveur. Vérifie ta connexion internet puis réessaie.',
    no_server: 'Le serveur n’est pas configuré dans ce site.',
    invalid_code: 'Ce code n’existe pas. Vérifie-le (8 caractères) ou demande-le à ton enseignant.',
    rate_limited: 'Trop d’essais. Attends quelques minutes puis réessaie.',
    invalid_credentials: 'Email ou mot de passe incorrect.',
    email_not_confirmed: 'Email pas encore confirmé : clique sur le lien reçu par email.',
    user_already_exists: 'Un compte existe déjà avec cet email : connecte-toi.',
    weak_password: 'Mot de passe trop faible (8 caractères minimum).',
    over_email_send_rate_limit: 'Trop d’emails envoyés pour l’instant. Réessaie dans une heure.',
    over_request_rate_limit: 'Trop de demandes. Réessaie dans quelques minutes.',
    email_address_invalid: 'Adresse email invalide.',
    signup_disabled: 'Les inscriptions sont fermées sur ce serveur.',
    not_authenticated: 'Session expirée : reconnecte-toi.',
    forbidden: 'Action non autorisée.',
    invalid_name: 'Nom invalide (2 à 80 caractères pour une école, 1 à 24 pour un élève).',
    too_many_schools: 'Limite atteinte : 3 écoles par compte.',
    no_attempts_left: 'Tu as utilisé tous tes essais pour cette séance.',
    board_hidden: 'Ton enseignant a masqué le classement de la classe.',
    session_closed: 'Cette séance est fermée.',
    unknown_session: 'Cette séance n’existe plus.',
    too_many_sessions: 'Limite atteinte : 30 séances par classe.',
    confirmation_mismatch: 'L’adresse e-mail recopiée n’est pas la bonne. Rien n’a été supprimé.',
    limit_reached: 'Limite atteinte pour cette école.',
    too_many: 'Trop de noms d’un coup (60 maximum).',
    invitation_required: 'La création d’une école demande un code d’invitation. Demande-le à l’administrateur du site.',
  };
  if (map[code]) return map[code];
  if (/password/i.test(code)) return 'Mot de passe refusé (8 caractères minimum).';
  return 'Une erreur est survenue. Réessaie dans un instant.';
}
