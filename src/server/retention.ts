/**
 * Conservation des données d'élèves : la règle est écrite dans la page Confidentialité.
 *  - le serveur efface lui-même les parties de plus de 13 mois (et les élèves sans partie créés il y a plus de 13 mois) ;
 *  - en fin d'année, l'enseignant est invité à exporter puis effacer les résultats de sa classe.
 */

/** Durée de conservation côté serveur, en mois (doit rester égale à la fonction SQL private.purge_old_data : 400 jours). */
export const RETENTION_MONTHS = 13;

/** Rappel de fin d'année : du 15 juin au 30 septembre. */
export function endOfYearReminder(now: Date): boolean {
  const m = now.getMonth() + 1; // 1..12
  const d = now.getDate();
  return (m === 6 && d >= 15) || m === 7 || m === 8 || (m === 9);
}
