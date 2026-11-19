/**
 * Barème commun d'Atelier : la même « monnaie » dans les jeux de réponses (Course à l'encre, Mémoire d'encre, Chasse aux fautes,
 * Mots en orbite), alignée sur celle de Frappe ! (qui ne change pas : 25 points par lettre à ×1, jusqu'à ×6).
 *
 * Principes (voir le document « barème » du projet pour les études) :
 *  1. L'exactitude d'abord : jamais de points en moins, une erreur coûte une vie et (selon la difficulté) un palier de série.
 *  2. La vitesse récompense, mais peu : au plus 40 % de la valeur de base, et jamais en orthographe (lire et écrire sans courir).
 *  3. Une série lisible : +1 palier toutes les 3 bonnes réponses d'affilée, de ×1 à ×6 (comme Frappe !).
 *  4. Même règle de perte que Frappe ! quand on perd une vie : Apprenti et Standard perdent un palier, Expert repart de ×1.
 *  5. Une bonne réponse « vaut » à peu près un mot de Frappe ! (≈ 100 points à ×1), pour que les scores se ressemblent d'un jeu à l'autre.
 */

export type Diff = 'apprenti' | 'standard' | 'expert';

/** Nombre de bonnes réponses d'affilée pour gagner un palier de série. */
export const SERIES_STEP = 3;
/** Palier maximal (le même que dans Frappe !). */
export const MULT_MAX = 6;

/** Valeur de base d'une bonne réponse à ×1 (un calcul, une manche de vocabulaire). */
export const ANSWER_POINTS = 100;
/** Valeur de base d'un élément retenu à Mémoire d'encre (une suite de 4 vaut donc 100). */
export const MEMORY_ITEM_POINTS = 25;
/** Part maximale de la valeur de base que peut ajouter le bonus de vitesse. */
export const SPEED_SHARE = 0.4;

/** Chasse aux fautes : repérer le mot fautif, puis le corriger (avec indice ou au 2e essai : moitié moins). */
export const SPELLING_TAP = 100;
export const SPELLING_FIX = 150;

/** Bonus de fin de page sans erreur, et de fin de cahier. */
export const PAGE_BONUS = 400;
export const FINISH_BONUS = 1000;
/** Bonus de réussite « sans encaisser » (encre repoussée, vies restantes, bouclier) : au plus ce montant par élément. */
export const SURVIVE_BONUS = 250;

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Palier de série (×1 à ×6) pour une série de `streak` bonnes réponses d'affilée. */
export const multFor = (streak: number): number => Math.min(MULT_MAX, 1 + Math.floor(Math.max(0, streak) / SERIES_STEP));

/** Série restante après avoir perdu une vie : Expert repart de zéro ; Apprenti et Standard reculent d'un palier. */
export function streakAfterLoss(streak: number, diff: Diff): number {
  if (diff === 'expert') return 0;
  const m = multFor(streak);
  return m <= 1 ? 0 : SERIES_STEP * (m - 2);
}

/** Bonus de vitesse : `fast` va de 0 (lent) à 1 (très rapide) ; au plus SPEED_SHARE de la valeur de base. */
export const speedBonus = (base: number, fast: number): number => Math.round(base * SPEED_SHARE * clamp01(fast));

/** Points d'une bonne réponse : (base + bonus de vitesse) × palier. */
export const answerPoints = (base: number, fast: number, mult: number): number => (base + speedBonus(base, fast)) * Math.max(1, mult);

/** Le plus grand nombre de points possible pour une réponse (base, vitesse maximale, palier maximal) : sert aux contrôles du serveur. */
export const maxAnswerPoints = (base: number): number => (base + Math.round(base * SPEED_SHARE)) * MULT_MAX;
