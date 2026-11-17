/** Présentation des jeux : utilisée par l'accueil (avant le choix de la classe) et par la page « À propos ». */

export const GAMES: Array<{ name: string; tag: string; grades: string; text: string; short: string }> = [
  { name: 'Frappe !', short: 'Tape les mots avant qu’ils n’atteignent la marge.', tag: 'Clavier', grades: 'CE1 à CM2', text: 'Taper des mots avant qu’ils n’atteignent la marge : précision d’abord, puis vitesse. Des tampons récompensent les progrès.' },
  { name: 'Course à l’encre', short: 'Calcule vite et fuis la tache d’encre.', tag: 'Maths', grades: 'CP à CM2', text: 'Calcul mental : le calcul posé correspond à la classe choisie. Il faut viser la bonne réponse avant que l’encre ne rattrape la plume.' },
  { name: 'Chasse aux fautes', short: 'Trouve la faute dans la phrase, puis corrige-la.', tag: 'Orthographe', grades: 'CE1 à CM2', text: 'Une phrase contient une faute : l’élève la repère, puis la corrige. Un récapitulatif « À retenir » rappelle la règle en fin de partie.' },
  { name: 'Mémoire d’encre', short: 'Retiens les taches qui s’allument.', tag: 'Mémoire', grades: 'CP à CM2', text: 'Retenir une suite de taches qui s’allument (La Suite) ou retrouver leurs places (Les Cases), avec une suite qui s’allonge page après page.' },
];
