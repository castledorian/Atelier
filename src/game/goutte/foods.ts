/**
 * Les friandises de la goutte : chaque friandise gagnée en jouant est une saveur, plus ou moins rare.
 *
 * Mécaniques reprises de jeux qui ont fait leurs preuves, adaptées à l'école :
 *  - récompense variable (on ne sait pas quelle saveur viendra) : c'est ce qui rend l'ouverture plaisante ;
 *  - mais JAMAIS de hasard payant ni de tirage à acheter : les friandises ne s'obtiennent qu'en jouant ;
 *  - un « compteur de chance » garantit une saveur rare au plus tard toutes les 8 friandises (pas de frustration) ;
 *  - une collection à compléter (12 saveurs), comme un album d'autocollants.
 *
 * La suite est fixée d'avance pour chaque élève (tirage déterministe à partir de son identifiant) : la n-ième friandise est
 * toujours la même, sur tous les appareils. Le serveur ne connaît que le nombre de friandises données, et c'est suffisant.
 */

export type Rarity = 1 | 2 | 3 | 4;
export const RARITY_NAME: Record<Rarity, string> = { 1: 'Courante', 2: 'Peu courante', 3: 'Rare', 4: 'Légendaire' };

export interface Food {
  id: string;
  name: string;
  rarity: Rarity;
  /** ce qu'elle remplit du ventre (sur 100) */
  fill: number;
  /** ce qu'elle apporte de bonheur (sur 100) */
  joy: number;
  /** ce que dit la goutte en la mangeant */
  say: string;
}

export const FOODS: readonly Food[] = [
  { id: 'pain', name: 'Tartine', rarity: 1, fill: 18, joy: 4, say: 'Croustillant !' },
  { id: 'pomme', name: 'Pomme', rarity: 1, fill: 16, joy: 5, say: 'Croc, croc !' },
  { id: 'carotte', name: 'Carotte', rarity: 1, fill: 15, joy: 4, say: 'Pleine de vitamines !' },
  { id: 'biscuit', name: 'Biscuit', rarity: 1, fill: 14, joy: 7, say: 'Miam, un biscuit !' },
  { id: 'fraise', name: 'Fraise', rarity: 2, fill: 14, joy: 10, say: 'Toute sucrée !' },
  { id: 'crepe', name: 'Crêpe', rarity: 2, fill: 24, joy: 10, say: 'Une crêpe ! Mon dessert préféré !' },
  { id: 'croissant', name: 'Croissant', rarity: 2, fill: 22, joy: 9, say: 'Tout chaud du four !' },
  { id: 'tarte', name: 'Part de tarte', rarity: 3, fill: 28, joy: 15, say: 'Une part de tarte, rien que pour moi ?' },
  { id: 'glace', name: 'Glace', rarity: 3, fill: 18, joy: 18, say: 'Brrr… c’est froid et délicieux !' },
  { id: 'macaron', name: 'Macaron', rarity: 3, fill: 16, joy: 17, say: 'Si chic, si bon !' },
  { id: 'gateau', name: 'Gâteau d’anniversaire', rarity: 4, fill: 40, joy: 30, say: 'Un gâteau ! C’est la fête !' },
  { id: 'etoile', name: 'Étoile en sucre', rarity: 4, fill: 20, joy: 35, say: 'Elle brille… et elle pétille !' },
];

export const FOOD_COUNT = FOODS.length;

/** Chances de chaque rareté (sur 100) : beaucoup de courantes, quelques trésors. */
const WEIGHT: Record<Rarity, number> = { 1: 56, 2: 28, 3: 13, 4: 3 };
/** Au plus tard à la 8e friandise sans saveur rare, la suivante est rare ou mieux. */
export const PITY = 8;

/** Graine propre à un élève (identifiant ou « invite ») : chacun a sa propre suite de surprises. */
export function seedOf(owner: string): number {
  let h = 2166136261;
  for (let i = 0; i < owner.length; i++) {
    h ^= owner.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Petit générateur pseudo-aléatoire reproductible (mulberry32). */
function rand(seed: number, n: number): number {
  let t = (seed + Math.imul(n, 0x6d2b79f5)) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

const byRarity = (r: Rarity) => FOODS.filter((f) => f.rarity === r);

const cache = new Map<number, Food[]>();

/** Les `count` premières friandises de l'élève, dans l'ordre (la 1re est toujours une pomme : un premier goût simple). */
export function foodsUpTo(seed: number, count: number): Food[] {
  const n = Math.max(0, Math.min(5000, Math.floor(count)));
  let list = cache.get(seed);
  if (!list) {
    list = [];
    cache.set(seed, list);
  }
  let dry = 0;
  for (let i = 0; i < list.length; i++) dry = list[i].rarity >= 3 ? 0 : dry + 1;
  while (list.length < n) {
    const i = list.length;
    let food: Food;
    if (i === 0) food = FOODS.find((f) => f.id === 'pomme')!;
    else {
      let r = rand(seed, i * 2) * 100;
      let rarity: Rarity = 1;
      for (const k of [4, 3, 2, 1] as Rarity[]) {
        if (r < WEIGHT[k]) {
          rarity = k;
          break;
        }
        r -= WEIGHT[k];
      }
      if (dry >= PITY - 1 && rarity < 3) rarity = 3;
      const pool = byRarity(rarity);
      food = pool[Math.floor(rand(seed, i * 2 + 1) * pool.length)];
    }
    dry = food.rarity >= 3 ? 0 : dry + 1;
    list.push(food);
  }
  return list.slice(0, n);
}

/** La n-ième friandise (à partir de 1). */
export const foodAt = (seed: number, n: number): Food => foodsUpTo(seed, Math.max(1, n))[Math.max(1, n) - 1];

/** Saveurs déjà goûtées après `fed` friandises données. */
export function tastedIds(seed: number, fed: number): Set<string> {
  return new Set(foodsUpTo(seed, fed).map((f) => f.id));
}

/** Ce qui attend dans la boîte à goûter : les prochaines friandises à donner (au plus `max`). */
export function lunchbox(seed: number, fed: number, left: number, max = 6): Food[] {
  return foodsUpTo(seed, fed + Math.min(left, max)).slice(fed);
}
