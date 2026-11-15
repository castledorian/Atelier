// Dictionnaire : mots français sans accents, pour que chaque clavier puisse jouer.
const RAW = `
mot feu eau air roi mer sol vie nez riz sel rue ami art bal bec bol bus cap cri dos duc fil gaz jeu jus lac lit loi mur nid nom
oie pas pic pin pot rat roc sac ski ton val ver vin vol zoo axe arc but cou dur fer fou lin nul ode pur sud uni vif
page nuit lune loup chat pain vent bois ciel main pied joue rose bleu noir gris vert lait miel noix sang rire voix yeux gant
jour mois robe tour toit vase zinc onde orge papa parc peau plan pont port quai rail rang rive duel kilo kiwi lion lame luge
mine moto nage nord oeuf aile arme bain banc bord cage cave clef code coin cube dame dent dune choc coup rime vers face film
gare hier iris jupe lave mode note ours rhum sort tube urne veau watt yoga zone
encre tache plume ligne marge texte titre signe point carte livre table lampe porte pomme sable ville monde terre pluie neige
fleur arbre herbe champ route train avion poche poing coeur corps jambe doigt ongle fauve tigre singe lapin poule vache chien
balle danse chant piano corde verre tasse sucre fruit olive radis magie force garde lance ruban vague stylo bille gomme craie
image roman conte fable prose bruit drame usine wagon zeste hibou jouet koala nuage orage quart
lettre frappe touche papier crayon cahier marque cachet buvard phrase accent espace retour bouton levier cloche jardin maison
bateau soleil chemin voyage valise bagage camion navire dragon pirate soldat combat ennemi danger flamme cendre poison tampon
bavure rature volcan empire bijoux canard mouton cheval citron salade farine beurre barque girafe hamster jungle kimono
clavier machine virgule carbone village colline prairie chariot rouleau feuille journal lecture copiste encrier griffon
monstre vampire sorcier horizon silence courage bagarre attaque riposte tornade cascade falaise caverne royaume fortune
pouvoir sagesse dactylo voyelle syllabe horloge fromage oiseaux zizanie
chapitre bouclier victoire couronne montagne bataille alphabet consonne aventure escalier fauteuil chocolat papillon
baguette cavalier corsaire brouillon orchestre chevalier majuscule minuscule manuscrit signature guillemet grammaire
avalanche catapulte crocodile framboise parapluie chandelle croissant boulanger capitaine interligne paragraphe correction
apostrophe imprimerie tabulation marguerite tourbillon forteresse labyrinthe hirondelle champignon citrouille conjugaison
orthographe vocabulaire ponctuation typographie dictionnaire calligraphie
`;

const BY_LEN = new Map<number, string[]>();
for (const w of new Set(RAW.split(/\s+/))) {
  if (!/^[a-z]{3,12}$/.test(w)) continue; // filtre de sécurité : lettres simples uniquement
  const up = w.toUpperCase();
  const list = BY_LEN.get(up.length);
  if (list) list.push(up);
  else BY_LEN.set(up.length, [up]);
}

const recent: string[] = [];

const randomString = (len: number, allowed: string, avoid: Set<string>) => {
  let out = '';
  for (let i = 0; i < len; i++) {
    let c = allowed[(Math.random() * allowed.length) | 0];
    for (let k = 0; i === 0 && k < 8 && avoid.has(c); k++) c = allowed[(Math.random() * allowed.length) | 0];
    out += c;
  }
  return out;
};

const fits = (w: string, allowed?: string) => {
  if (!allowed) return true;
  for (const ch of w) if (!allowed.includes(ch)) return false;
  return true;
};

/** Nombre de mots du dictionnaire de longueur [min, max] écrits uniquement avec les lettres autorisées. */
export function countWords(allowed: string, min: number, max: number): number {
  let n = 0;
  for (let l = min; l <= max; l++) for (const w of BY_LEN.get(l) ?? []) if (fits(w, allowed)) n++;
  return n;
}

/**
 * Mot aléatoire de longueur [min, max], en évitant si possible les initiales déjà à l'écran.
 * Avec des lettres autorisées (séance de l'enseignant) : seuls les mots écrits avec ces lettres sont tirés ;
 * s'il y en a trop peu, on tire de courtes suites de lettres (« fjfj ») pour s'exercer quand même.
 */
export function pickWord(min: number, max: number, avoid: Set<string>, allowed?: string): string {
  const pool: string[] = [];
  for (let l = min; l <= max; l++) {
    const list = BY_LEN.get(l);
    if (list) for (const w of list) if (fits(w, allowed)) pool.push(w);
  }
  if (allowed && pool.length < 8) {
    return randomString(Math.max(2, Math.min(min, max, 4)) + ((Math.random() * 2) | 0), allowed, avoid);
  }
  if (pool.length === 0) return 'ENCRE';
  let choice = pool[(Math.random() * pool.length) | 0];
  for (let i = 0; i < 24; i++) {
    const w = pool[(Math.random() * pool.length) | 0];
    choice = w;
    if (!avoid.has(w[0]) && !recent.includes(w)) break;
  }
  recent.push(choice);
  if (recent.length > 14) recent.shift();
  return choice;
}

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** Lettre isolée (pour les gouttes), en évitant les initiales déjà à l'écran. */
export function pickLetter(avoid: Set<string>, pool: string = LETTERS): string {
  for (let i = 0; i < 16; i++) {
    const c = pool[(Math.random() * pool.length) | 0];
    if (!avoid.has(c)) return c;
  }
  return pool[(Math.random() * pool.length) | 0];
}
