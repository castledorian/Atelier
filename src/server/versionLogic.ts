/**
 * Version de la base de données du serveur : partie « logique » (sans réseau, testable).
 * Le serveur (public.server_version) dit lui-même quelles mises à jour SQL sont appliquées ; le site en tire un avertissement
 * pour l'administrateur : une base pas à jour peut laisser une protection désactivée alors que le code publié est à jour.
 */

export interface ServerVersion {
  version: number;
  features: Record<string, boolean>;
  missing: string[];
}

interface Step {
  /** fichier à exécuter dans Supabase (SQL Editor) */
  file: string;
  /** ce qui ne marche pas tant qu'il n'est pas exécuté */
  why: string;
  /** une base sans cette mise à jour est dangereuse ou cassée (et pas seulement incomplète) */
  critical: boolean;
}

/** Ordre d'exécution conseillé : du plus ancien au plus récent (« fiabilité » toujours en dernier). */
export const STEPS: Array<[string, Step]> = [
  ['seances', { file: 'mise-a-jour-seances.sql', why: 'séances de classe et envoi des parties', critical: true }],
  ['classement', { file: 'mise-a-jour-classement.sql', why: 'classement masquable', critical: false }],
  ['orthographe', { file: 'mise-a-jour-orthographe.sql', why: 'séances de « Chasse aux fautes »', critical: false }],
  ['niveau', { file: 'mise-a-jour-niveau.sql', why: 'niveau de la classe', critical: false }],
  ['securite', { file: 'mise-a-jour-securite.sql', why: 'contrôle des parties (anti-triche)', critical: true }],
  ['admin', { file: 'mise-a-jour-admin.sql', why: 'espace administrateur', critical: false }],
  ['exercices', { file: 'mise-a-jour-exercices.sql', why: 'suivi des exercices (onglet Équilibrage)', critical: false }],
  ['memoire', { file: 'mise-a-jour-memoire.sql', why: 'record « Mémoire d’encre » du tableau de bord', critical: false }],
  ['compte', { file: 'mise-a-jour-compte.sql', why: 'suppression de son compte', critical: false }],
  ['fiabilite', { file: 'mise-a-jour-fiabilite.sql', why: 'limites d’envoi fiables, invitations, nettoyage', critical: true }],
  ['invitations', { file: 'mise-a-jour-fiabilite.sql', why: 'inscription sur invitation', critical: true }],
  ['nettoyage', { file: 'mise-a-jour-fiabilite.sql', why: 'effacement des anciennes données', critical: true }],
  ['sessions', { file: 'mise-a-jour-fiabilite.sql', why: 'sessions élèves plus courtes', critical: false }],
  ['codes', { file: 'mise-a-jour-codes.sql', why: 'codes élèves non stockés en clair', critical: false }],
  ['grotte', { file: 'mise-a-jour-grotte.sql', why: 'grotte partagée par classe et observation en lecture seule', critical: false }],
];

export interface Todo {
  file: string;
  why: string[];
  critical: boolean;
}

/** Ce qu'il reste à exécuter, un fichier une seule fois, dans l'ordre conseillé. */
export function todoFor(v: ServerVersion): Todo[] {
  const out: Todo[] = [];
  for (const [key, step] of STEPS) {
    if (!v.missing.includes(key)) continue;
    const have = out.find((t) => t.file === step.file);
    if (have) {
      have.why.push(step.why);
      have.critical = have.critical || step.critical;
    } else out.push({ file: step.file, why: [step.why], critical: step.critical });
  }
  return out;
}

/** Vrai si une mise à jour importante manque (c'est alors qu'on prévient aussi les enseignants). */
export const hasCritical = (v: ServerVersion) => todoFor(v).some((t) => t.critical);

/** Le nettoyage de nuit n'est pas programmé : l'extension pg_cron n'est pas activée. */
export const cronMissing = (v: ServerVersion) => v.missing.includes('nettoyage_auto');

const isRecord = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null;

/** Lit la réponse du serveur ; une réponse inattendue est ignorée (aucun avertissement plutôt qu'un faux avertissement). */
export function parseVersion(x: unknown): ServerVersion | null {
  if (!isRecord(x) || !Array.isArray(x.missing) || !isRecord(x.features)) return null;
  const features: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(x.features)) features[k] = v === true;
  return { version: Number(x.version) || 0, features, missing: x.missing.filter((m): m is string => typeof m === 'string') };
}
