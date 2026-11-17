/**
 * Historique des versions affiché dans la page « Nouveautés ».
 * Pour publier une nouveauté : ajouter une entrée EN TÊTE de RELEASES (la plus récente d'abord).
 * Le numéro de la première entrée devient le numéro de version affiché en bas de chaque page.
 */

export type ChangeKind = 'new' | 'better' | 'fix';

export interface Release {
  version: string;
  /** date lisible, ex. « 17 novembre 2026 » */
  date: string;
  /** date ISO (AAAA-MM-JJ), pour le classement et la balise <time> */
  iso: string;
  title: string;
  changes: Array<{ kind: ChangeKind; text: string }>;
}

export const KIND_LABEL: Record<ChangeKind, string> = {
  new: 'Nouveau',
  better: 'Amélioré',
  fix: 'Corrigé',
};

export const RELEASES: Release[] = [
  {
    version: '1.4',
    date: '17 novembre 2026',
    iso: '2026-11-17',
    title: 'Un accueil qui explique le site',
    changes: [
      { kind: 'better', text: 'L’accueil présente le site en une phrase et montre les quatre jeux, avec leur domaine et leurs classes, avant même de choisir sa classe.' },
      { kind: 'better', text: 'Description et aperçu de partage du site plus précis (messageries, moteurs de recherche).' },
    ],
  },
  {
    version: '1.3',
    date: '17 novembre 2026',
    iso: '2026-11-17',
    title: 'Les pages d’information du site',
    changes: [
      { kind: 'new', text: 'Page « Nouveautés » (celle que vous lisez) et numéro de version en bas de chaque page.' },
      { kind: 'new', text: 'Page « À propos » : à qui s’adresse le site, ce que travaille chaque jeu, comment l’utiliser en classe.' },
      { kind: 'new', text: 'Déclaration d’accessibilité : ce qui est en place, les limites connues, comment signaler un problème.' },
      { kind: 'new', text: 'Page « Crédits et licences » : polices, bibliothèques libres et services utilisés.' },
      { kind: 'new', text: 'Page « Contact » : écrire à l’éditeur, signaler une erreur dans un jeu ou un problème de sécurité.' },
    ],
  },
  {
    version: '1.2',
    date: '17 novembre 2026',
    iso: '2026-11-17',
    title: 'Trois difficultés réglées pour chaque classe',
    changes: [
      { kind: 'better', text: 'Apprenti, Standard et Expert ont été recalibrés dans les quatre jeux, du CP au CM2 : Apprenti sert à découvrir, Expert est un vrai défi, et chaque classe a son propre rythme.' },
      { kind: 'new', text: 'Mémoire d’encre propose maintenant les trois difficultés, avec un classement séparé pour chacune.' },
      { kind: 'new', text: 'Chasse aux fautes s’ouvre au CE1 et au CE2, avec des phrases plus courtes.' },
      { kind: 'new', text: 'Espace administrateur du site (lecture seule, chaque consultation est enregistrée dans un journal).' },
      { kind: 'better', text: 'Le formulaire de création de séance ne bouge plus quand on change de jeu.' },
      { kind: 'fix', text: 'Sur téléphone en mode paysage, la Course à l’encre se met en pause et invite à tourner l’appareil, au lieu de laisser la plume toucher une réponse sans le vouloir.' },
    ],
  },
  {
    version: '1.1',
    date: '16 novembre 2026',
    iso: '2026-11-16',
    title: 'Chasse aux fautes, séances de classe et protection des données',
    changes: [
      { kind: 'new', text: 'Quatrième jeu : Chasse aux fautes (orthographe), avec des ennemis d’encre, des boss et plus de cent nouvelles phrases.' },
      { kind: 'new', text: 'Séances de classe : l’enseignant propose un jeu avec un nombre d’essais limité, l’élève retrouve ses séances dans son espace.' },
      { kind: 'new', text: 'Classe choisie à l’accueil (du CP au CM2) : seuls les jeux adaptés à l’âge apparaissent. La Course à l’encre s’ouvre au cycle 2.' },
      { kind: 'new', text: 'Bouton « i » sur chaque jeu : un extrait animé pour comprendre avant de jouer.' },
      { kind: 'new', text: 'Page Confidentialité, note pour les familles et mentions légales.' },
      { kind: 'better', text: 'Sécurité : chaque partie envoyée est vérifiée par le serveur, les tentatives suspectes sont repérées, et le site ne peut contacter que son propre serveur.' },
      { kind: 'better', text: 'Accessibilité : textes d’au moins 14 px, boutons d’au moins 44 px, rouge plus contrasté, lecture plus confortable.' },
      { kind: 'better', text: 'Des tests automatiques sont lancés avant chaque mise en ligne.' },
      { kind: 'better', text: 'Suppression sécurisée du compte enseignant.' },
    ],
  },
  {
    version: '1.0',
    date: '15 novembre 2026',
    iso: '2026-11-15',
    title: 'Ouverture d’Atelier',
    changes: [
      { kind: 'new', text: 'Trois jeux : Frappe ! (clavier), Course à l’encre (calcul) et Mémoire d’encre (La Suite et Les Cases).' },
      { kind: 'new', text: 'Comptes enseignants, classes, codes d’élève et classements, sur un serveur hébergé en France.' },
      { kind: 'new', text: 'Le site s’installe comme une application et fonctionne ensuite sans connexion ; il reste fluide sur les ordinateurs anciens.' },
    ],
  },
];

/** Numéro de version affiché dans le pied de page. */
export const APP_VERSION = RELEASES[0].version;

const SEEN_KEY = 'atelier.news.seen.v1';

/** Vrai tant que la dernière version n'a pas été lue sur cet appareil (sert au petit repère « nouveau »). */
export function hasUnreadNews(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) !== APP_VERSION;
  } catch {
    return false;
  }
}

export function markNewsRead() {
  try {
    localStorage.setItem(SEEN_KEY, APP_VERSION);
  } catch {
    /* stockage refusé : le repère reste affiché, sans gravité */
  }
}
