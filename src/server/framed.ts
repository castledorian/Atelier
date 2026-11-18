/**
 * Vrai si le site est affiché dans une page intégrée (iframe) d'un autre site.
 * Les espaces connectés (connexion enseignant, espace enseignant, administration) refusent de s'y ouvrir :
 * une page piégée pourrait y faire cliquer ou taper l'enseignant à son insu (« clickjacking »).
 * Les jeux restent intégrables (un ENT peut les afficher). Une protection par en-tête HTTP (frame-ancestors) est impossible
 * sur GitHub Pages : celle-ci est faite dans la page.
 */
export function isFramed(): boolean {
  try {
    return window.self !== window.top;
  } catch {
    return true; // accès refusé au parent : c'est bien une page intégrée d'un autre site
  }
}
