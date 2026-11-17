/** Petit « i » : ouvre l'extrait animé d'un jeu (fenêtre d'aperçu, voir PreviewWindow). */
export function InfoButton({ onClick, label = 'Voir un extrait du jeu' }: { onClick: () => void; label?: string }) {
  return (
    <button type="button" className="info-btn" onClick={onClick} aria-label={label} title={label}>
      <span aria-hidden="true">i</span>
    </button>
  );
}

export type PreviewGame = 'typing' | 'math' | 'memory' | 'spelling';

export interface PreviewStep {
  /** titre court, en gras */
  title: string;
  /** une ou deux phrases */
  text: string;
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
      { title: 'Les taches tombent', text: 'Chaque tache d’encre porte un mot. Elle descend vers le bas de la page.' },
      { title: 'Tape le mot', text: 'Écris-le lettre après lettre au clavier : la tache éclate quand le mot est fini.' },
      { title: 'Protège la marge', text: 'Si une tache touche la marge en bas, tu perds une vie. Garde-les le plus longtemps possible !' },
      { title: 'Sans faute, plus de points', text: 'Enchaîne les lettres sans te tromper : ton combo monte et chaque mot rapporte davantage.' },
    ],
  },
  math: {
    title: 'Course à l’encre',
    goal: 'Choisis la bonne réponse avant qu’elle ne tombe, et fais reculer l’encre.',
    steps: [
      { title: 'Un calcul', text: 'Le calcul s’affiche en haut de la page.' },
      { title: 'Trois réponses', text: 'Trois étiquettes descendent. La plume se place sous celle que tu choisis.' },
      { title: 'Valide', text: 'Bonne réponse : l’encre recule. Mauvaise réponse, ou trop lent : elle monte.' },
      { title: 'Au clavier', text: 'Flèches ← → pour choisir une colonne, Entrée pour valider. Les touches 1, 2 et 3 marchent aussi.' },
    ],
  },
  memory: {
    title: 'Mémoire d’encre',
    goal: 'Retiens l’ordre dans lequel les taches s’allument, puis refais-le.',
    steps: [
      { title: 'Regarde', text: 'Les taches s’allument une à une. Retiens bien leur ordre.' },
      { title: 'Refais la suite', text: 'Quand c’est fini, touche les cases dans le même ordre.' },
      { title: 'La suite s’allonge', text: 'À chaque réussite, il y a une tache de plus à retenir. Jusqu’où iras-tu ?' },
      { title: 'Deux jeux', text: 'Dans « Les Cases », les taches apparaissent un instant : il faut retrouver leurs places.' },
    ],
  },
  spelling: {
    title: 'Chasse aux fautes',
    goal: 'Les créatures d’encre ont semé des fautes : trouve-les et corrige-les, sans perdre toutes tes vies.',
    steps: [
      { title: 'Une créature écrit', text: 'Une créature d’encre apparaît et écrit sa phrase. Une faute s’y cache.' },
      { title: 'Touche le mot fautif', text: 'Touche le mot mal écrit. Attention : un mot juste touché par erreur, et la créature attaque.' },
      { title: 'Choisis la correction', text: 'Plusieurs écritures sont proposées. Une mauvaise réponse te coûte une vie.' },
      { title: 'La phrase est corrigée', text: 'Ton canon tire, la créature est vaincue et la phrase est corrigée. Une astuce t’aide à retenir la règle.' },
    ],
  },
};
