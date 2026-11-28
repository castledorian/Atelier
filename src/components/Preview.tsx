import type { SfxName } from '../game/audio';

/** Petit « i » : ouvre l'extrait animé d'un jeu (fenêtre d'aperçu, voir PreviewWindow). */
/** `small` : version discrète (accueil) — 28 px visibles, zone tactile de 44 px. */
export function InfoButton({ onClick, label = 'Voir un extrait du jeu', small = false }: { onClick: () => void; label?: string; small?: boolean }) {
  return (
    <button type="button" className={small ? 'info-btn info-btn-sm' : 'info-btn'} onClick={onClick} aria-label={label} title={label}>
      <span aria-hidden="true">i</span>
    </button>
  );
}

export type PreviewGame = 'typing' | 'math' | 'memory' | 'spelling' | 'lexique' | 'facteur';

export interface PreviewStep {
  /** titre court, en gras */
  title: string;
  /** une ou deux phrases */
  text: string;
  /** un exemple concret, court */
  example: string;
  /** petit son joué quand l'élève arrive sur cette étape */
  sound: SfxName;
}

export interface PreviewInfo {
  title: string;
  /** à quoi sert le jeu, en une phrase */
  goal: string;
  steps: PreviewStep[];
}

/** Textes des extraits, jeu par jeu : une idée par étape, en phrases courtes. */
export const PREVIEWS: Record<PreviewGame, PreviewInfo> = {
  typing: {
    title: 'Frappe !',
    goal: 'Tape les mots pour faire éclater les taches avant qu’elles n’atteignent la marge.',
    steps: [
      { title: 'Les taches tombent', text: 'Chaque tache d’encre porte un mot. Elle descend vers le bas de la page.', example: 'Une tache avec le mot « lune » descend vers la marge.', sound: 'spawn' },
      { title: 'Tape le mot', text: 'Écris-le lettre après lettre au clavier : la tache éclate quand le mot est fini.', example: 'Pour « lune », tape l, puis u, puis n, puis e.', sound: 'key' },
      { title: 'Protège la marge', text: 'Si une tache touche la marge en bas, tu perds une vie. Garde-les le plus longtemps possible !', example: 'Une tache atteint la marge : ♥ en moins.', sound: 'breach' },
      { title: 'Sans faute, plus de points', text: 'Enchaîne les lettres sans te tromper : ton combo monte et chaque mot rapporte davantage.', example: 'lune ✓ pomme ✓ arbre ✓ : ton combo monte à 3.', sound: 'mult' },
    ],
  },
  math: {
    title: 'Course à l’encre',
    goal: 'Choisis la bonne réponse avant qu’elle ne tombe, et fais reculer l’encre.',
    steps: [
      { title: 'Un calcul', text: 'Le calcul s’affiche en haut de la page.', example: '7 × 8 = ?', sound: 'ready' },
      { title: 'Trois réponses', text: 'Trois étiquettes descendent. La plume se place sous celle que tu choisis.', example: '54 · 56 · 63 : tu places la plume sous 56.', sound: 'select' },
      { title: 'Valide', text: 'Bonne réponse : l’encre recule. Mauvaise réponse, ou trop lent : elle monte.', example: '56 ✓ l’encre recule. 63 ✗ l’encre monte.', sound: 'correct' },
      { title: 'Au clavier', text: 'Flèches ← → pour choisir une colonne, Entrée pour valider. Les touches 1, 2 et 3 marchent aussi.', example: 'Touche 2 : la plume va sous la réponse du milieu.', sound: 'key' },
    ],
  },
  memory: {
    title: 'Mémoire d’encre',
    goal: 'Retiens l’ordre dans lequel les taches s’allument, puis refais-le.',
    steps: [
      { title: 'Regarde', text: 'Les taches s’allument une à une. Retiens bien leur ordre.', example: 'Les taches 2, puis 5, puis 1 s’allument.', sound: 'n2' },
      { title: 'Refais la suite', text: 'Quand c’est fini, touche les cases dans le même ordre.', example: 'Tu touches 2, puis 5, puis 1.', sound: 'select' },
      { title: 'La suite s’allonge', text: 'À chaque réussite, il y a une tache de plus à retenir. Jusqu’où iras-tu ?', example: 'Suite de 3 réussie : la suivante en compte 4.', sound: 'mult' },
      { title: 'Deux jeux', text: 'Dans « Les Cases », les taches apparaissent un instant : il faut retrouver leurs places.', example: 'La Suite : l’ordre compte. Les Cases : seule la place compte.', sound: 'ding' },
    ],
  },
  lexique: {
    title: 'Mots en orbite',
    goal: 'Trouve le mot qui répond à la consigne avant que l’encre n’atteigne le centre.',
    steps: [
      { title: 'Un mot et une consigne', text: 'Au centre, un mot et une consigne : même sens, contraire ou même famille de mots.', example: 'MAISON · « même sens que ».', sound: 'ready' },
      { title: 'Les mots arrivent', text: 'Des taches d’encre portant chacune un mot avancent vers le centre, de toutes les directions.', example: 'logis · jardin · toit · maison : lequel a le même sens ?', sound: 'spawn' },
      { title: 'Touche le bon mot', text: 'Touche la tache dont le mot répond à la consigne.', example: '« logis » a le même sens que « maison » : tu le touches.', sound: 'select' },
      { title: 'Onde de choc', text: 'Une bonne réponse fait éclater les taches et montre comment le mot est construit. Trois de suite : la série monte.', example: 'en- + terr + -er : préfixe, racine, suffixe.', sound: 'mult' },
    ],
  },
  facteur: {
    title: 'Le facteur',
    goal: 'Lis les mots et range chaque colis dans la bonne boîte aux lettres.',
    steps: [
      { title: 'Un colis arrive', text: 'Un colis avance doucement sur le tapis. Regarde son image.', example: 'Le colis montre une vache.', sound: 'spawn' },
      { title: 'Lis les trois mots', text: 'Chaque boîte porte un mot. Les lettres grises ne se prononcent pas.', example: 'vélo · vache · vis : le « e » de vache est gris.', sound: 'select' },
      { title: 'Pas grave si tu te trompes', text: 'La boîte se grise. Le colis reviendra un peu plus tard.', example: 'Tu touches « vélo » : la boîte se grise.', sound: 'error' },
      { title: 'La bonne boîte', text: 'Le colis part dans la boîte et le mot est lu à voix haute.', example: '« vache » ✓ le colis est rangé.', sound: 'correct' },
    ],
  },
  spelling: {
    title: 'Chasse aux fautes',
    goal: 'Les créatures d’encre ont semé des fautes : trouve-les et corrige-les, sans perdre toutes tes vies.',
    steps: [
      { title: 'Une créature écrit', text: 'Une créature d’encre apparaît et écrit sa phrase. Une faute s’y cache.', example: '« Les enfants joue dehors. »', sound: 'scribble' },
      { title: 'Touche le mot fautif', text: 'Touche le mot mal écrit. Attention : un mot juste touché par erreur, et la créature attaque.', example: 'Tu touches « joue » : c’est lui qui est fautif.', sound: 'select' },
      { title: 'Choisis la correction', text: 'Plusieurs écritures sont proposées. Une mauvaise réponse te coûte une vie.', example: 'joue · jouent · joues : « ils jouent », le verbe s’accorde avec « enfants ».', sound: 'select' },
      { title: 'La phrase est corrigée', text: 'La phrase est corrigée, et une astuce aide à retenir la règle.', example: '« Les enfants jouent dehors. »', sound: 'impact' },
    ],
  },
};
