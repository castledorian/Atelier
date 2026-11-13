/** Fréquentation d'une lettre pendant une partie : touches justes / fautes (sur la lettre attendue). */
export type LetterStats = Record<string, { ok: number; err: number }>;

/**
 * Lettres à retravailler : au moins 3 essais et 2 fautes, classées par nombre de fautes
 * puis par taux d'erreur. Trois lettres au maximum, pour rester concret.
 */
export function weakLetters(stats: LetterStats, max = 3): string[] {
  return Object.entries(stats)
    .filter(([, v]) => v.ok + v.err >= 3 && v.err >= 2)
    .sort((a, b) => b[1].err - a[1].err || b[1].err / (b[1].ok + b[1].err) - a[1].err / (a[1].ok + a[1].err))
    .slice(0, max)
    .map(([ch]) => ch);
}
