/**
 * « Le facteur » (CP) — les mots, rangés par niveau de lecture.
 *
 * Les listes viennent de l'enseignante de la classe (images libres de droit de lps13.free.fr) et suivent sa progression : chaque niveau
 * n'utilise que les sons simples déjà vus. Les sons « on an in eu oi oin… » arrivent en janvier (niveau 5, à écrire avec elle).
 *
 * Écriture des lettres muettes : entre parenthèses, elles sont grisées à l'écran (vach(e), cha(t), canar(d)). Elles ne comptent jamais
 * dans la comparaison des mots : on compare toujours `plain(mot)`.
 */

export type FLevel = 1 | 2 | 3 | 4;
export const F_LEVELS: Array<{ id: FLevel; label: string; hint: string }> = [
  { id: 1, label: 'Niveau 1', hint: 'Les premiers mots : chat, lune, vélo…' },
  { id: 2, label: 'Niveau 2', hint: 'radio, robot, koala, judo…' },
  { id: 3, label: 'Niveau 3', hint: 'banane, canard, casserole…' },
  { id: 4, label: 'Niveau 4', hint: 'tigre, parapluie, cartable…' },
];
export const isFLevel = (v: unknown): v is FLevel => v === 1 || v === 2 || v === 3 || v === 4;

export interface FWord {
  /** le mot, lettres muettes entre parenthèses */
  mark: string;
  level: FLevel;
  /** mot-outil : pas d'image, il sert seulement de « mauvaise boîte aux lettres » */
  tool?: boolean;
  /** dessin de secours tant que l'image du mot n'est pas dans public/facteur/ (emojis anciens seulement : ils s'affichent sur les vieux postes) */
  emoji?: string;
}

const w = (level: FLevel, mark: string, emoji?: string): FWord => ({ mark, level, emoji });
const t = (level: FLevel, mark: string): FWord => ({ mark, level, tool: true });

export const WORDS: FWord[] = [
  // ───────────── Niveau 1 ─────────────
  w(1, 'an(e)'), w(1, 'anana(s)', '🍍'), w(1, 'as'), w(1, 'cha(t)', '🐱'), w(1, 'cheval', '🐴'), w(1, 'chio(t)', '🐶'),
  w(1, 'chocola(t)', '🍫'), w(1, 'fenêtr(e)'), w(1, 'fil', '🧵'), w(1, 'fumé(e)'), w(1, 'li(t)', '🛏️'), w(1, 'lun(e)', '🌙'),
  w(1, 'ni(d)'), w(1, 'nich(e)'), w(1, 'nui(t)', '🌃'), w(1, 'numéro'), w(1, 'ra(t)', '🐀'), w(1, 'vach(e)', '🐄'),
  w(1, 'vélo', '🚲'), w(1, 'vis', '🔩'),
  t(1, 'un'), t(1, 'un(e)'), t(1, 'le'), t(1, 'la'), t(1, 'le(s)'), t(1, 'de(s)'),
  // ───────────── Niveau 2 ─────────────
  w(2, '(h)ach(e)', '🪓'), w(2, '(h)uit', '8️⃣'), w(2, 'lézar(d)', '🦎'), w(2, 'judo', '🥋'), w(2, 'légo', '🧱'), w(2, 'moto', '🏍️'),
  w(2, 'épé(e)'), w(2, 'koala', '🐨'), w(2, 'flût(e)'), w(2, 'radio', '📻'), w(2, 'radi(s)'), w(2, 'robo(t)', '🤖'),
  w(2, 'zoo'), w(2, 'ressor(t)'), w(2, 'lavabo', '🚰'), w(2, 'vipèr(e)', '🐍'), w(2, 'dé', '🎲'), w(2, 'dam(e)'),
  w(2, 'pi(e)', '🐦'), w(2, 'po(t)'), w(2, 'pull', '🧥'),
  t(2, 'il'), t(2, 'ell(e)'), t(2, 'e(t)'),
  // ───────────── Niveau 3 ─────────────
  w(3, 'bull(e)(s)'), w(3, 'domino'), w(3, 'gomm(e)'), w(3, 'libellul(e)'), w(3, 'pelot(e)'), w(3, 'pil(e)', '🔋'),
  w(3, 'pioch(e)'), w(3, 'tass(e)'), w(3, 'télé', '📺'), w(3, 'têt(e)'), w(3, 'banan(e)', '🍌'), w(3, 'bébé', '👶'),
  w(3, 'café', '☕'), w(3, 'cann(e)'), w(3, 'cub(e)'), w(3, 'culott(e)', '🩲'), w(3, 'caravan(e)', '🚐'), w(3, 'canar(d)', '🦆'),
  w(3, 'pédalo'), w(3, 'carré', '🟥'), w(3, 'casserol(e)', '🍲'),
  t(3, 'ave(c)'), t(3, 'dan(s)'), t(3, 'en'),
  // ───────────── Niveau 4 ─────────────
  w(4, 'micro', '🎤'), w(4, 'frigo'), w(4, 'frit(e)(s)', '🍟'), w(4, 'lèvr(e)(s)', '👄'), w(4, 'règl(e)'), w(4, 'grapp(e)', '🍇'),
  w(4, 'grenadin(e)'), w(4, 'gri(s)'), w(4, 'parapluie', '☂️'), w(4, 'parachut(e)', '🪂'), w(4, 'pluie', '🌧️'), w(4, 'port(e)', '🚪'),
  w(4, 'siffle(t)'), w(4, 'statu(e)', '🗽'), w(4, 'stylo', '🖊️'), w(4, 'pri(x)'), w(4, 'tartin(e)'), w(4, 'tabl(e)'),
  w(4, 'tortu(e)', '🐢'), w(4, 'trist(e)', '😢'), w(4, 'tigr(e)', '🐯'), w(4, 'zèbr(e)', '🦓'), w(4, 'arbr(e)', '🌳'),
  w(4, 'bra(s)', '💪'), w(4, 'cadr(e)', '🖼️'), w(4, 'cartabl(e)', '🎒'), w(4, 'cart(e)', '🗺️'), w(4, 'clé', '🔑'), w(4, 'chèvr(e)', '🐐'),
  t(4, 'c’es(t)'),
];

// ───────────── Lecture d'un mot ─────────────

export interface Part {
  text: string;
  /** lettre muette (grisée) */
  mute: boolean;
}

/** Découpe « vach(e) » en [vach][(e) muet]. */
export function parts(mark: string): Part[] {
  const out: Part[] = [];
  let cur = '';
  let mute = false;
  for (const ch of mark) {
    if (ch === '(' || ch === ')') {
      if (cur) out.push({ text: cur, mute });
      cur = '';
      mute = ch === '(';
    } else cur += ch;
  }
  if (cur) out.push({ text: cur, mute });
  return out;
}

/** Le mot sans marque : c'est lui qu'on compare, qu'on lit à voix haute et qui nomme l'image. */
export const plain = (mark: string): string => mark.replace(/[()]/g, '');

/** Nom du fichier image d'un mot : « vache » → vache, « lézard » → lezard, « c’est » → c-est. */
export const slug = (mark: string): string =>
  plain(mark)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/** Les mots proposés pour un niveau (celui-ci et les précédents, pour réviser). */
export const wordsUpTo = (level: FLevel): FWord[] => WORDS.filter((x) => x.level <= level);
