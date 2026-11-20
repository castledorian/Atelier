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
    version: '1.24',
    date: '20 novembre 2026',
    iso: '2026-11-20',
    title: 'Le facteur relié à la classe, textes plus courts',
    changes: [
      { kind: 'new', text: 'Le facteur : scores par niveau (avec bouton pour les effacer), séances de classe et record dans le tableau de bord enseignant.' },
      { kind: 'better', text: 'Textes raccourcis partout : consignes, cartes de l’accueil, pages d’information.' },
      { kind: 'better', text: 'Confirmation d’effacement dans la page (« Effacer » puis « Sûr ? »), à la place de la fenêtre du navigateur.' },
      { kind: 'better', text: 'Boutons, listes et champs d’au moins 44 px, pour les doigts sur tablette.' },
      { kind: 'better', text: 'La musique d’accueil respecte le réglage « Son ».' },
      { kind: 'better', text: 'Tapis du facteur plus léger pour les vieux ordinateurs.' },
      { kind: 'fix', text: 'Crédits : mention des images générées par IA du facteur ; « À propos » présente bien tous les jeux.' },
      { kind: 'fix', text: 'Administrateurs : lancer serveur/mise-a-jour-facteur.sql en dernier.' },
    ],
  },
  {
    version: '1.23',
    date: '19 novembre 2026',
    iso: '2026-11-19',
    title: 'Le facteur : un jeu de lecture pour le CP',
    changes: [
      { kind: 'new', text: 'Le facteur (CP) : un colis-image avance sur le tapis, on le range dans la boîte qui porte son mot. Quatre niveaux, qui suivent les sons vus en classe.' },
      { kind: 'new', text: 'Le colis défile doucement (une trentaine de secondes) et refait un tour s’il arrive au bout, sans pénalité. Pas de vie : une boîte fausse se grise, le colis raté revient plus tard.' },
      { kind: 'new', text: 'Lettres muettes grisées (vach-e). Le mot est lu à voix haute une fois le colis rangé ; étoiles et record restent sur l’appareil.' },
    ],
  },
  {
    version: '1.22',
    date: '19 novembre 2026',
    iso: '2026-11-19',
    title: 'Un barème commun et une ambiance sonore',
    changes: [
      { kind: 'better', text: 'Barème commun : Course, Mémoire, Chasse aux fautes et Mots en orbite comptent comme Frappe ! (série ×1 à ×6, environ 100 points la bonne réponse). Les anciens records restent mais sont vite battus.' },
      { kind: 'better', text: 'Perdre une vie : Apprenti et Standard redescendent d’un palier, Expert repart de ×1. Aucun point retiré. Bonus de vitesse limité à 40 %, absent en orthographe.' },
      { kind: 'new', text: 'Accueil : musique douce, sans bouton, uniquement sur cette page.' },
      { kind: 'new', text: 'Mots en orbite a son « i » sur l’accueil : un extrait animé en 4 étapes.' },
      { kind: 'better', text: 'Son d’erreur plus doux.' },
      { kind: 'better', text: 'Difficulté du CP revue : Course sans gros calcul (tout sous 100, pas de retenue cachée), Mémoire limitée à 4 taches (5 en Expert) ; jusqu’à 6 au CE1 et 8 au CE2.' },
      { kind: 'fix', text: 'Administrateurs : lancer serveur/mise-a-jour-bareme.sql en dernier, sinon les parties à haut score sont refusées.' },
    ],
  },
  {
    version: '1.21',
    date: '19 novembre 2026',
    iso: '2026-11-19',
    title: 'Mots en orbite : taches d’encre et mots par classe',
    changes: [
      { kind: 'better', text: 'Les ennemis sont des taches d’encre avec leur mot dessous. Un toucher sur le bon mot suffit.' },
      { kind: 'better', text: 'Mots adaptés à chaque classe (nouveau niveau CE1, nouvelles familles au CM2) ; la difficulté règle la part de mots durs et de pièges.' },
    ],
  },
  {
    version: '1.20',
    date: '18 novembre 2026',
    iso: '2026-11-18',
    title: 'Nouveau jeu : Mots en orbite',
    changes: [
      { kind: 'new', text: 'Mots en orbite : un mot au centre, des mots qui arrivent de partout. On touche celui qui est un synonyme, un contraire ou de la même famille.' },
      { kind: 'new', text: 'Une bonne réponse lance une onde de choc ; le mot est découpé en préfixe, racine et suffixe, et le jeu accélère doucement.' },
      { kind: 'new', text: 'Mots du CE2 au CM2, trois difficultés, « Mots à revoir » sur l’appareil, classements, séances et grotte comme les autres jeux.' },
      { kind: 'better', text: '60 images par seconde, qualité réduite sur un ordinateur lent ; jouable au doigt, à la souris et au clavier.' },
    ],
  },
  {
    version: '1.19',
    date: '18 novembre 2026',
    iso: '2026-11-18',
    title: 'La grotte compte toutes les fautes',
    changes: [
      { kind: 'better', text: 'Toutes les fautes nourrissent le monstre de la classe, même sans bonne réponse ; hors connexion, elles sont envoyées au retour du réseau (rejouer mise-a-jour-grotte.sql).' },
      { kind: 'new', text: 'Observation d’un élève en lecture seule : son accueil, ses séances, sa grotte et toutes ses parties.' },
    ],
  },
  {
    version: '1.18',
    date: '18 novembre 2026',
    iso: '2026-11-18',
    title: 'Une grotte par classe, observation administrateur',
    changes: [
      { kind: 'new', text: 'Une grotte par classe : le même monstre sur tous les appareils, qui grandit avec les fautes de tous (mise à jour « grotte » du serveur nécessaire).' },
      { kind: 'new', text: 'L’administrateur observe en lecture seule une école, une grotte ou un élève ; chaque observation est notée.' },
      { kind: 'better', text: 'Les codes d’élèves ne sont plus lisibles depuis le navigateur, même par les enseignants.' },
    ],
  },
  {
    version: '1.17',
    date: '18 novembre 2026',
    iso: '2026-11-18',
    title: 'La grotte change d’ambiance',
    changes: [
      { kind: 'better', text: 'Une grotte sombre, lanterne en main, jusqu’au monstre d’encre ; il grossit avec chaque faute de l’année.' },
      { kind: 'new', text: 'Ambiance de caverne (coupée si le son est désactivé).' },
      { kind: 'better', text: 'Enseignant : on coche les classes qui descendent dans la grotte.' },
    ],
  },
  {
    version: '1.16',
    date: '18 novembre 2026',
    iso: '2026-11-18',
    title: 'Un compte plus facile à repérer',
    changes: [
      { kind: 'better', text: 'Une fois connecté, le nom, la classe et « Changer d’élève » (ou « Se déconnecter ») sont en haut à droite.' },
      { kind: 'better', text: '« Mes séances » et « Mon espace école » ont leur bouton sous le titre.' },
    ],
  },
  {
    version: '1.15',
    date: '18 novembre 2026',
    iso: '2026-11-18',
    title: 'Un accueil plus simple',
    changes: [
      { kind: 'better', text: 'Accueil allégé : « Élève » et « Enseignant » passent en haut à droite, le texte de présentation disparaît.' },
    ],
  },
  {
    version: '1.14',
    date: '18 novembre 2026',
    iso: '2026-11-18',
    title: 'La grotte de fin d’année',
    changes: [
      { kind: 'new', text: 'La grotte (élèves et enseignants connectés) : une créature d’encre grossit à chaque faute et faiblit à chaque règle retravaillée. En juin, la classe l’affronte.' },
    ],
  },
  {
    version: '1.13',
    date: '18 novembre 2026',
    iso: '2026-11-18',
    title: 'Codes d’élèves protégés',
    changes: [
      { kind: 'better', text: 'Le serveur ne garde plus les codes, seulement une empreinte : imprimez la fiche à la création ou au renouvellement.' },
      { kind: 'new', text: 'Bouton « Nouveaux codes pour la classe » pour réimprimer toutes les fiches.' },
    ],
  },
  {
    version: '1.12',
    date: '18 novembre 2026',
    iso: '2026-11-18',
    title: 'Fenêtres accessibles, connexion protégée',
    changes: [
      { kind: 'better', text: 'Fenêtres pilotables au clavier (focus gardé, Échap ferme) ; onglets et réglages aux flèches.' },
      { kind: 'better', text: 'Session élève de 30 jours, prolongée tant qu’il joue ; connexion et espace enseignant refusés dans une page d’un autre site.' },
      { kind: 'fix', text: 'Le site hors ligne se met à jour tout seul à chaque version.' },
    ],
  },
  {
    version: '1.11',
    date: '18 novembre 2026',
    iso: '2026-11-18',
    title: 'Serveur plus sûr, données mieux gardées',
    changes: [
      { kind: 'better', text: 'Limites d’envoi comptées sur l’heure de réception du serveur.' },
      { kind: 'new', text: 'Code d’invitation pour créer une école ; rappel dès le 15 juin pour exporter puis effacer les résultats.' },
      { kind: 'better', text: 'Parties et élèves inactifs depuis plus de 13 mois effacés automatiquement.' },
    ],
  },
  {
    version: '1.10',
    date: '17 novembre 2026',
    iso: '2026-11-17',
    title: 'Mémoire d’encre plus lisible',
    changes: [
      { kind: 'fix', text: 'Mémoire d’encre : menu à la bonne taille en Full HD ; titre toujours visible.' },
    ],
  },
  {
    version: '1.9',
    date: '17 novembre 2026',
    iso: '2026-11-17',
    title: 'Tableaux triables, écrans plus lisibles',
    changes: [
      { kind: 'new', text: 'Tableaux enseignant et administration : un clic sur une colonne trie, au clavier comme à la souris.' },
      { kind: 'better', text: 'Tableau enseignant plus lisible : quatre fois plus d’élèves visibles, sans glisser sur le côté.' },
      { kind: 'fix', text: 'Menus, aides, scores et progrès sans défilement, même en texte très grand ; bulles « i » entières à l’écran.' },
    ],
  },
  {
    version: '1.8',
    date: '17 novembre 2026',
    iso: '2026-11-17',
    title: 'Menus harmonisés, « Mes progrès » partout',
    changes: [
      { kind: 'better', text: 'Chasse aux fautes : même menu que les autres jeux. Mémoire d’encre : menu entier sans défilement.' },
      { kind: 'new', text: '« Mes progrès » dans tous les jeux : dernières parties, règles et lettres à revoir, entraînement ciblé. Tout reste sur l’appareil, effaçable.' },
      { kind: 'better', text: 'Bulles « i » : étapes à ton rythme (Précédent / Suivant), taille fixe, exemple et son à chaque étape.' },
    ],
  },
  {
    version: '1.7',
    date: '17 novembre 2026',
    iso: '2026-11-17',
    title: 'Suivi des exercices',
    changes: [
      { kind: 'new', text: 'Course et Chasse aux fautes comptent, de façon anonyme, les calculs et phrases les plus ratés.' },
      { kind: 'new', text: 'Administration : onglet « Équilibrage » (réussite par niveau face à l’objectif, exercices les plus ratés, export CSV).' },
    ],
  },
  {
    version: '1.6',
    date: '17 novembre 2026',
    iso: '2026-11-17',
    title: 'Chasse aux fautes, nouvelle version',
    changes: [
      { kind: 'new', text: 'Chaque créature écrit sa phrase sous tes yeux ; bonne réponse, la phrase est corrigée au stylo rouge ; erreur, la créature crache son encre.' },
      { kind: 'better', text: 'Nouveaux sons, mise en page identique sur tous les écrans, jeu plus sobre (bonus et collection retirés).' },
      { kind: 'better', text: 'Pied de page sur une seule ligne.' },
    ],
  },
  {
    version: '1.5',
    date: '17 novembre 2026',
    iso: '2026-11-17',
    title: 'Exercices calés sur les programmes',
    changes: [
      { kind: 'better', text: 'Course à l’encre : calculs conformes aux programmes 2024 (CP–CE2) et 2025 (CM1–CM2) ; pourcentages retirés du cours moyen.' },
      { kind: 'better', text: 'Un calcul sur quatre reprend une page précédente ; les fausses réponses sont les vraies erreurs d’élèves.' },
      { kind: 'new', text: 'Chasse aux fautes : près de 300 phrases du CE1 au CM2, avec révision de l’année précédente ; règle « Le Caméléon » dès le CE2.' },
      { kind: 'better', text: 'Au CM1 et CM2 : accords à sujet éloigné ou inversé, participe passé.' },
    ],
  },
  {
    version: '1.4',
    date: '17 novembre 2026',
    iso: '2026-11-17',
    title: 'Un accueil qui explique le site',
    changes: [
      { kind: 'better', text: 'L’accueil présente le site en une phrase et montre les jeux avant de choisir sa classe.' },
    ],
  },
  {
    version: '1.3',
    date: '17 novembre 2026',
    iso: '2026-11-17',
    title: 'Les pages d’information',
    changes: [
      { kind: 'new', text: 'Pages Nouveautés, À propos, Accessibilité, Crédits et Contact ; numéro de version en bas de page.' },
    ],
  },
  {
    version: '1.2',
    date: '17 novembre 2026',
    iso: '2026-11-17',
    title: 'Trois difficultés par classe',
    changes: [
      { kind: 'better', text: 'Apprenti, Standard et Expert recalibrés dans les quatre jeux, du CP au CM2.' },
      { kind: 'new', text: 'Mémoire d’encre : trois difficultés, classement séparé. Chasse aux fautes ouverte au CE1 et au CE2.' },
      { kind: 'new', text: 'Espace administrateur en lecture seule, avec journal.' },
      { kind: 'fix', text: 'Téléphone en paysage : la Course se met en pause au lieu de laisser la plume toucher une réponse.' },
    ],
  },
  {
    version: '1.1',
    date: '16 novembre 2026',
    iso: '2026-11-16',
    title: 'Chasse aux fautes, séances, protection des données',
    changes: [
      { kind: 'new', text: 'Chasse aux fautes (orthographe) et séances de classe (un jeu, un nombre d’essais limité).' },
      { kind: 'new', text: 'Classe choisie à l’accueil : seuls les jeux de son âge apparaissent. Bouton « i » : un extrait animé par jeu.' },
      { kind: 'new', text: 'Page Confidentialité, note pour les familles, mentions légales.' },
      { kind: 'better', text: 'Parties vérifiées par le serveur ; le site ne contacte que son serveur. Textes d’au moins 14 px, boutons d’au moins 44 px.' },
      { kind: 'better', text: 'Tests automatiques avant chaque mise en ligne ; suppression sécurisée du compte enseignant.' },
    ],
  },
  {
    version: '1.0',
    date: '15 novembre 2026',
    iso: '2026-11-15',
    title: 'Ouverture d’Atelier',
    changes: [
      { kind: 'new', text: 'Frappe !, Course à l’encre et Mémoire d’encre.' },
      { kind: 'new', text: 'Comptes enseignants, classes, codes d’élève et classements, sur un serveur hébergé en France.' },
      { kind: 'new', text: 'Installable comme une application, utilisable sans connexion, fluide sur les ordinateurs anciens.' },
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
