/** Présentation des jeux : utilisée par l'accueil (avant le choix de la classe) et par la page « À propos ». */

export const GAMES: Array<{ name: string; tag: string; grades: string; text: string; short: string }> = [
  { name: 'Frappe !', short: 'Tape les mots avant qu’ils n’atteignent la marge.', tag: 'Clavier', grades: 'CE1 à CM2', text: 'Taper les mots avant qu’ils n’atteignent la marge : la précision d’abord, puis la vitesse. Des tampons récompensent les progrès.' },
  { name: 'Course à l’encre', short: 'Calcule vite et fuis la tache d’encre.', tag: 'Maths', grades: 'CP à CM2', text: 'Calcul mental selon le programme de la classe, page après page. Il faut viser la bonne réponse avant que l’encre ne rattrape la plume.' },
  { name: 'Chasse aux fautes', short: 'Trouve la faute dans la phrase, puis corrige-la.', tag: 'Orthographe', grades: 'CE1 à CM2', text: 'Une phrase contient une faute fréquente à cet âge (accords, homophones, lettres doubles…) : on la repère, puis on la corrige. Un rappel de la règle suit la partie.' },
  { name: 'Mémoire d’encre', short: 'Retiens les taches qui s’allument.', tag: 'Mémoire', grades: 'CP à CM2', text: 'Retenir une suite de taches qui s’allument (La Suite) ou retrouver leurs places (Les Cases). La suite s’allonge page après page.' },
  { name: 'Mots en orbite', short: 'Relie le mot du centre à son synonyme, son contraire ou sa famille.', tag: 'Vocabulaire', grades: 'CE1 à CM2', text: 'Un mot au centre, des taches-mots autour : on touche celle qui répond à la consigne (même sens, contraire, même famille). Le rythme monte doucement.' },
  { name: 'Le facteur', short: 'Range chaque colis dans la boîte qui porte son mot.', tag: 'Lecture', grades: 'CP', text: 'Un colis avec une image avance sur le tapis : on le range dans la boîte aux lettres qui porte le bon mot. Quatre niveaux, qui suivent les sons vus en classe.' },
];
