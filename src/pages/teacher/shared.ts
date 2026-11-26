/** Pièces communes à l'espace enseignant (src/pages/Dashboard.tsx et src/pages/teacher/*). */

/** Lance un appel au serveur en affichant l'erreur éventuelle ; renvoie undefined en cas d'échec. */
export type Act = <R>(f: () => Promise<R>) => Promise<R | undefined>;

/** Code élève lisible : « ABCD EFGH ». */
export const nice = (code: string) => `${code.slice(0, 4)} ${code.slice(4)}`;
