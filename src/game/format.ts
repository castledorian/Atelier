/** Mise en forme des nombres affichés (espace entre les milliers : 12 345). Une seule définition pour tout le site. */
export const fmt = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
