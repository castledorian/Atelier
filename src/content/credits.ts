/** Éléments cités dans la page « Crédits et licences ». Versions lues dans package.json au moment de la rédaction. */

export interface Credit {
  name: string;
  role: string;
  license: string;
  url: string;
  holder?: string;
}

/** Fichiers qui sont réellement envoyés au navigateur de l'élève. */
export const RUNTIME: Credit[] = [
  { name: 'React et React DOM', role: 'Construction de l’interface', license: 'MIT', url: 'https://react.dev', holder: 'Meta Platforms, Inc. et ses affiliés' },
  { name: 'clsx', role: 'Assemblage des noms de style', license: 'MIT', url: 'https://github.com/lukeed/clsx', holder: 'Luke Edwards' },
  { name: 'tailwind-merge', role: 'Fusion des styles', license: 'MIT', url: 'https://github.com/dcastil/tailwind-merge', holder: 'Dany Castillo' },
  { name: 'Special Elite', role: 'Police des titres, façon machine à écrire (fichier distribué avec le site)', license: 'Apache 2.0', url: 'https://fonts.google.com/specimen/Special+Elite' },
  { name: 'Courier Prime', role: 'Police du texte (fichier distribué avec le site)', license: 'SIL Open Font License 1.1', url: 'https://quoteunquoteapps.com/courierprime/', holder: 'The Courier Prime Project Authors' },
];

/** Outils servant à fabriquer le site : ils ne sont pas dans les pages envoyées aux élèves. */
export const BUILD: Credit[] = [
  { name: 'Vite et vite-plugin-singlefile', role: 'Assemblage du site en un seul fichier', license: 'MIT', url: 'https://vite.dev' },
  { name: 'Tailwind CSS', role: 'Feuilles de style', license: 'MIT', url: 'https://tailwindcss.com', holder: 'Tailwind Labs, Inc.' },
  { name: 'TypeScript', role: 'Vérification du code', license: 'Apache 2.0', url: 'https://www.typescriptlang.org', holder: 'Microsoft Corporation' },
];

export const SERVICES: Credit[] = [
  { name: 'Supabase', role: 'Base de données et comptes (hébergée en France)', license: 'Apache 2.0 (logiciel libre)', url: 'https://supabase.com' },
  { name: 'GitHub Pages', role: 'Diffusion des fichiers du site', license: 'Service', url: 'https://pages.github.com' },
  { name: 'Brevo', role: 'Envoi des e-mails aux enseignants (confirmation, mot de passe oublié)', license: 'Service', url: 'https://www.brevo.com' },
];
