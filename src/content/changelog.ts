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
    version: '1.9',
    date: '17 novembre 2026',
    iso: '2026-11-17',
    title: 'La grotte de fin d’année, et des écrans plus lisibles',
    changes: [
      { kind: 'new', text: 'La grotte : une créature d’encre grossit à chaque faute de l’année et faiblit à chaque règle retravaillée. En juin, toute la classe descend l’affronter — les prénoms frappent les uns après les autres, l’encre riposte… et la classe l’emporte. Le diplôme de victoire s’imprime.' },
      { kind: 'new', text: 'Tableaux de l’espace enseignant et de l’administration : un clic sur un titre de colonne classe du meilleur au moins bon (puis l’inverse), au clavier comme à la souris.' },
      { kind: 'better', text: 'Espace enseignant : tableau plus lisible (lignes alternées, colonnes raccourcies, réglages de classe repliés) — environ quatre fois plus d’élèves visibles d’un coup, et plus besoin de glisser le tableau sur le côté.' },
      { kind: 'fix', text: 'Menus, « Comment jouer », « Scores » et « Mes progrès » : plus aucun défilement, sur ordinateur, tablette, téléphone et TBI, y compris en texte très grand — une carte trop pleine se réduit d’un cran au lieu de défiler.' },
      { kind: 'fix', text: 'Bulles d’information (bouton « i ») : tout le contenu tient à l’écran, même sur petit téléphone ; en écran large et bas, l’extrait passe à gauche et le texte à droite.' },
    ],
  },
  {
    version: '1.8',
    date: '17 novembre 2026',
    iso: '2026-11-17',
    title: 'Menus harmonisés, « Mes progrès » partout et aide plus lisible',
    changes: [
      { kind: 'fix', text: 'Mémoire d’encre : le menu s’affiche en entier, sans défilement, sur ordinateur comme sur téléphone.' },
      { kind: 'better', text: 'Chasse aux fautes : même menu que les autres jeux, avec le fond animé, le titre tamponné lettre par lettre et les rubriques « Comment jouer », « Scores », « Mes progrès » et « Réglages ».' },
      { kind: 'new', text: '« Mes progrès » dans tous les jeux : ta réussite sur les dernières parties, les règles à revoir avec leur astuce et un entraînement de 3 questions (calcul, orthographe), la longueur de tes suites et tes tampons (Mémoire), tes lettres les plus difficiles avec un entraînement ciblé (Frappe !). Tout reste sur ton appareil, et tu peux l’effacer.' },
      { kind: 'better', text: 'Bulles d’aide (bouton « i ») : plus de défilement automatique, tu passes à l’étape suivante quand tu as fini de lire (boutons Précédent / Suivant ou flèches du clavier).' },
      { kind: 'better', text: 'Bulles d’aide : la fenêtre garde toujours la même taille, quelle que soit la longueur du texte ; chaque étape a un exemple concret et un petit son.' },
    ],
  },
  {
    version: '1.7',
    date: '17 novembre 2026',
    iso: '2026-11-17',
    title: 'Suivi des exercices pour mieux régler les niveaux',
    changes: [
      { kind: 'new', text: 'Course à l’encre et Chasse aux fautes comptent, de façon anonyme, quels calculs et quelles phrases sont les plus ratés (aucun nom d’élève, de classe ou d’école, et rien de ce qui est tapé au clavier).' },
      { kind: 'new', text: 'Espace administrateur : nouvel onglet « Équilibrage » avec la réussite de chaque niveau comparée à l’objectif (Apprenti ≈ 95 %, Standard ≈ 85 %, Expert ≈ 65 %), les familles de calculs et les phrases les plus ratées, et un export CSV.' },
      { kind: 'better', text: 'Chasse aux fautes envoie maintenant, comme les autres jeux, son résumé anonyme de partie pour régler la difficulté.' },
    ],
  },
  {
    version: '1.6',
    date: '17 novembre 2026',
    iso: '2026-11-17',
    title: 'Chasse aux fautes, nouvelle version',
    changes: [
      { kind: 'new', text: 'Chasse aux fautes : chaque créature d’encre apparaît et écrit sa phrase sous tes yeux, lettre après lettre, sur une feuille de cahier.' },
      { kind: 'better', text: 'Chasse aux fautes : bonne réponse, le canon tire et la phrase est corrigée au stylo rouge (l’ancien mot reste barré au-dessus) ; erreur, la créature se jette en avant et crache son encre sur le canon.' },
      { kind: 'better', text: 'Chasse aux fautes : nouveaux sons (plume, apparition, attaque, impact, correction) et mise en page aux proportions fixes, identique sur ordinateur, tablette et téléphone, sans rien qui bouge pendant la partie.' },
      { kind: 'better', text: 'Chasse aux fautes : les bonus, la seconde chance et la collection de créatures sont retirés pour un jeu plus simple et plus sobre ; seule la dernière phrase est écrite par le Grand Pâté.' },
      { kind: 'better', text: 'Pied de page : les six liens tiennent sur une seule ligne, régulièrement espacés (grille de deux lignes sur téléphone).' },
    ],
  },
  {
    version: '1.5',
    date: '17 novembre 2026',
    iso: '2026-11-17',
    title: 'Des exercices calés sur les programmes de chaque classe',
    changes: [
      { kind: 'better', text: 'Course à l’encre : les calculs de chaque classe suivent les nouveaux programmes (2024 pour le CP au CE2, 2025 pour le CM1 et le CM2). Au CE1, toutes les tables et les nombres jusqu’à 1 000 ; au CM1, les décimaux seulement × 10 et ÷ 10 ; au CM2, moitiés des impairs, décimaux × 5 et × 50, divisions par 4 et 8.' },
      { kind: 'better', text: 'Course à l’encre : les pourcentages et les multiples de 25, qui relèvent désormais de la 6e, sont retirés du cours moyen.' },
      { kind: 'better', text: 'Course à l’encre : environ un calcul sur quatre reprend une page précédente (révision espacée), et les fausses réponses proposées sont les erreurs que font vraiment les élèves.' },
      { kind: 'new', text: 'Chasse aux fautes : près de 300 phrases rangées par classe, du CE1 au CM2, chaque classe reprenant aussi en révision quelques phrases de l’année précédente.' },
      { kind: 'new', text: 'Chasse aux fautes : nouvelle règle « Le Caméléon » à partir du CE2, pour les fins de verbe qui se prononcent pareil (-é, -er, -ez, -ait).' },
      { kind: 'better', text: 'Chasse aux fautes : au CM1 et au CM2, accords avec un sujet éloigné ou inversé et participe passé, les fautes les plus fréquentes en fin d’école ; les lettres doubles reviennent un peu moins souvent et les propositions invraisemblables ont disparu.' },
    ],
  },
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
