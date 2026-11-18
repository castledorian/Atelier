/**
 * « Mots en orbite » — le lexique du jeu : synonymes, contraires et familles de mots (cycles 2 et 3).
 *
 * Écriture d'un mot : « terrain » s'écrit tel quel ; quand on veut montrer sa construction, on sépare ses morceaux par des espaces
 * et on marque le préfixe « en- » et le suffixe « -er » par un tiret : « en- terr -er » = enterrer (préfixe en-, racine terr, suffixe -er).
 * Les morceaux mis bout à bout redonnent toujours le mot (vérifié par les tests).
 *
 * Niveaux : 1 = mots de tous les jours (CE2), 2 = CM1, 3 = CM2. Nature : n nom, v verbe, a adjectif, o autre.
 */

export type Tier = 1 | 2 | 3;
export type Kind = 'n' | 'v' | 'a' | 'o';

export interface RelEntry {
  /** mot proposé au centre */
  w: string;
  t: Tier;
  k: Kind;
  /** réponses acceptées */
  r: string[];
}

export interface FamEntry {
  /** mot proposé au centre (la racine) */
  w: string;
  t: Tier;
  /** mots de la famille */
  r: string[];
  /** mots qui lui ressemblent mais n'en sont PAS (même son, même début…) : de bons pièges */
  faux?: string[];
}

/** Même sens que… */
export const SYNONYMES: RelEntry[] = [
  { w: 'grand', t: 1, k: 'a', r: ['énorme', 'immense', 'gigantesque'] },
  { w: 'petit', t: 1, k: 'a', r: ['minuscule', 'menu'] },
  { w: 'joli', t: 1, k: 'a', r: ['beau', 'mignon', 'charmant'] },
  { w: 'content', t: 1, k: 'a', r: ['heureux', 'joyeux', 'ravi'] },
  { w: 'triste', t: 1, k: 'a', r: ['malheureux', 'chagriné'] },
  { w: 'peur', t: 1, k: 'n', r: ['crainte', 'frayeur', 'effroi'] },
  { w: 'maison', t: 1, k: 'n', r: ['habitation', 'demeure', 'logis'] },
  { w: 'voiture', t: 1, k: 'n', r: ['automobile', 'auto'] },
  { w: 'ami', t: 1, k: 'n', r: ['copain', 'camarade', 'compagnon'] },
  { w: 'enfant', t: 1, k: 'n', r: ['gamin', 'gosse'] },
  { w: 'parler', t: 1, k: 'v', r: ['bavarder', 'discuter', 'causer'] },
  { w: 'regarder', t: 1, k: 'v', r: ['observer', 'contempler', 'fixer'] },
  { w: 'commencer', t: 1, k: 'v', r: ['débuter', 'entamer', 'démarrer'] },
  { w: 'finir', t: 1, k: 'v', r: ['terminer', 'achever', 'conclure'] },
  { w: 'facile', t: 1, k: 'a', r: ['simple', 'aisé'] },
  { w: 'gentil', t: 1, k: 'a', r: ['aimable', 'doux', 'serviable'] },
  { w: 'méchant', t: 1, k: 'a', r: ['cruel', 'malveillant'] },
  { w: 'cacher', t: 2, k: 'v', r: ['dissimuler', 'masquer', 'camoufler'] },
  { w: 'aider', t: 2, k: 'v', r: ['secourir', 'assister', 'soutenir'] },
  { w: 'difficile', t: 2, k: 'a', r: ['compliqué', 'dur', 'ardu'] },
  { w: 'fatigué', t: 2, k: 'a', r: ['épuisé', 'éreinté', 'las'] },
  { w: 'chemin', t: 2, k: 'n', r: ['sentier', 'route', 'voie'] },
  { w: 'bruit', t: 2, k: 'n', r: ['vacarme', 'tapage', 'fracas'] },
  { w: 'colère', t: 2, k: 'n', r: ['fureur', 'rage', 'courroux'] },
  { w: 'endroit', t: 2, k: 'n', r: ['lieu', 'site'] },
  { w: 'tomber', t: 2, k: 'v', r: ['chuter', 'dégringoler'] },
  { w: 'lancer', t: 2, k: 'v', r: ['jeter', 'projeter'] },
  { w: 'solide', t: 2, k: 'a', r: ['robuste', 'résistant', 'costaud'] },
  { w: 'trouver', t: 2, k: 'v', r: ['découvrir', 'dénicher'] },
  { w: 'courageux', t: 2, k: 'a', r: ['brave', 'vaillant', 'audacieux'] },
  { w: 'ancien', t: 2, k: 'a', r: ['vieux', 'antique'] },
  { w: 'joyeux', t: 2, k: 'a', r: ['gai', 'enjoué'] },
  { w: 'bateau', t: 2, k: 'n', r: ['navire', 'embarcation'] },
  { w: 'forêt', t: 2, k: 'n', r: ['bois'] },
  { w: 'attraper', t: 2, k: 'v', r: ['saisir', 'capturer', 'empoigner'] },
  { w: 'casser', t: 2, k: 'v', r: ['briser', 'fracasser', 'rompre'] },
  { w: 'pays', t: 2, k: 'n', r: ['nation', 'contrée'] },
  { w: 'histoire', t: 2, k: 'n', r: ['récit', 'conte'] },
  { w: 'bizarre', t: 3, k: 'a', r: ['étrange', 'insolite', 'curieux'] },
  { w: 'dangereux', t: 3, k: 'a', r: ['périlleux', 'risqué'] },
  { w: 'briller', t: 3, k: 'v', r: ['luire', 'scintiller', 'étinceler'] },
  { w: 'voyage', t: 3, k: 'n', r: ['périple', 'expédition'] },
  { w: 'choisir', t: 3, k: 'v', r: ['sélectionner', 'opter'] },
  { w: 'garder', t: 3, k: 'v', r: ['conserver', 'protéger'] },
  { w: 'travail', t: 3, k: 'n', r: ['tâche', 'besogne', 'labeur'] },
  { w: 'visage', t: 3, k: 'n', r: ['figure', 'face'] },
  { w: 'mince', t: 3, k: 'a', r: ['fin', 'svelte'] },
  { w: 'inquiet', t: 3, k: 'a', r: ['anxieux', 'soucieux'] },
  { w: 'malin', t: 3, k: 'a', r: ['rusé', 'astucieux', 'futé'] },
  { w: 'abandonner', t: 3, k: 'v', r: ['renoncer', 'délaisser'] },
  { w: 'ennuyeux', t: 3, k: 'a', r: ['monotone', 'lassant', 'fastidieux'] },
  { w: 'gronder', t: 3, k: 'v', r: ['réprimander', 'sermonner'] },
  { w: 'peureux', t: 3, k: 'a', r: ['craintif', 'timoré'] },
];

/** Le contraire de… (les mots construits avec un préfixe montrent leur découpage : « im- possible »). */
export const CONTRAIRES: RelEntry[] = [
  { w: 'chaud', t: 1, k: 'a', r: ['froid'] },
  { w: 'lourd', t: 1, k: 'a', r: ['léger'] },
  { w: 'haut', t: 1, k: 'a', r: ['bas'] },
  { w: 'jour', t: 1, k: 'n', r: ['nuit'] },
  { w: 'début', t: 1, k: 'n', r: ['fin'] },
  { w: 'entrer', t: 1, k: 'v', r: ['sortir'] },
  { w: 'monter', t: 1, k: 'v', r: ['descendre'] },
  { w: 'ouvrir', t: 1, k: 'v', r: ['fermer'] },
  { w: 'acheter', t: 1, k: 'v', r: ['vendre'] },
  { w: 'aimer', t: 1, k: 'v', r: ['détester'] },
  { w: 'gagner', t: 1, k: 'v', r: ['perdre'] },
  { w: 'vrai', t: 1, k: 'a', r: ['faux'] },
  { w: 'riche', t: 1, k: 'a', r: ['pauvre'] },
  { w: 'fort', t: 1, k: 'a', r: ['faible'] },
  { w: 'rapide', t: 1, k: 'a', r: ['lent'] },
  { w: 'propre', t: 1, k: 'a', r: ['sale'] },
  { w: 'vide', t: 1, k: 'a', r: ['plein'] },
  { w: 'jeune', t: 1, k: 'a', r: ['vieux'] },
  { w: 'long', t: 1, k: 'a', r: ['court'] },
  { w: 'large', t: 1, k: 'a', r: ['étroit'] },
  { w: 'avant', t: 1, k: 'o', r: ['après'] },
  { w: 'dedans', t: 1, k: 'o', r: ['dehors'] },
  { w: 'devant', t: 1, k: 'o', r: ['derrière'] },
  { w: 'grand', t: 1, k: 'a', r: ['petit'] },
  { w: 'facile', t: 1, k: 'a', r: ['difficile'] },
  { w: 'ami', t: 1, k: 'n', r: ['ennemi'] },
  { w: 'content', t: 1, k: 'a', r: ['triste', 'mé- content'] },
  { w: 'triste', t: 1, k: 'a', r: ['joyeux', 'gai', 'content'] },
  { w: 'rire', t: 1, k: 'v', r: ['pleurer'] },
  { w: 'donner', t: 1, k: 'v', r: ['prendre'] },
  { w: 'pousser', t: 1, k: 'v', r: ['tirer'] },
  { w: 'allumer', t: 1, k: 'v', r: ['éteindre'] },
  { w: 'toujours', t: 1, k: 'o', r: ['jamais'] },
  { w: 'beaucoup', t: 1, k: 'o', r: ['peu'] },
  { w: 'tôt', t: 1, k: 'o', r: ['tard'] },
  { w: 'arriver', t: 2, k: 'v', r: ['partir'] },
  { w: 'avancer', t: 2, k: 'v', r: ['reculer'] },
  { w: 'sec', t: 2, k: 'a', r: ['humide', 'mouillé'] },
  { w: 'gros', t: 2, k: 'a', r: ['mince', 'maigre'] },
  { w: 'silence', t: 2, k: 'n', r: ['bruit', 'vacarme'] },
  { w: 'ancien', t: 2, k: 'a', r: ['nouveau', 'moderne', 'récent'] },
  { w: 'présent', t: 2, k: 'a', r: ['absent'] },
  { w: 'victoire', t: 2, k: 'n', r: ['défaite'] },
  { w: 'amour', t: 2, k: 'n', r: ['haine'] },
  { w: 'joie', t: 2, k: 'n', r: ['tristesse'] },
  { w: 'augmenter', t: 2, k: 'v', r: ['diminuer'] },
  { w: 'accepter', t: 2, k: 'v', r: ['refuser'] },
  { w: 'construire', t: 2, k: 'v', r: ['détruire'] },
  { w: 'réussir', t: 2, k: 'v', r: ['échouer'] },
  { w: 'permettre', t: 2, k: 'v', r: ['interdire'] },
  { w: 'calme', t: 2, k: 'a', r: ['agité', 'nerveux'] },
  { w: 'lumière', t: 2, k: 'n', r: ['obscurité', 'ombre'] },
  { w: 'possible', t: 2, k: 'a', r: ['im- possible'] },
  { w: 'poli', t: 2, k: 'a', r: ['im- poli'] },
  { w: 'patient', t: 2, k: 'a', r: ['im- patient'] },
  { w: 'visible', t: 2, k: 'a', r: ['in- visible'] },
  { w: 'connu', t: 2, k: 'a', r: ['in- connu'] },
  { w: 'juste', t: 2, k: 'a', r: ['in- juste'] },
  { w: 'utile', t: 2, k: 'a', r: ['in- utile'] },
  { w: 'heureux', t: 2, k: 'a', r: ['mal- heureux'] },
  { w: 'adroit', t: 2, k: 'a', r: ['mal- adroit'] },
  { w: 'honnête', t: 2, k: 'a', r: ['mal- honnête'] },
  { w: 'ordre', t: 2, k: 'n', r: ['dés- ordre'] },
  { w: 'accord', t: 2, k: 'n', r: ['dés- accord'] },
  { w: 'faire', t: 2, k: 'v', r: ['dé- faire'] },
  { w: 'plaire', t: 2, k: 'v', r: ['dé- plaire'] },
  { w: 'couvrir', t: 2, k: 'v', r: ['dé- couvrir'] },
  { w: 'obéir', t: 2, k: 'v', r: ['dés- obéir'] },
  { w: 'habiller', t: 2, k: 'v', r: ['dés- habiller'] },
  { w: 'lisible', t: 3, k: 'a', r: ['il- lisible'] },
  { w: 'légal', t: 3, k: 'a', r: ['il- légal'] },
  { w: 'logique', t: 3, k: 'a', r: ['il- logique'] },
  { w: 'régulier', t: 3, k: 'a', r: ['ir- régulier'] },
  { w: 'réel', t: 3, k: 'a', r: ['ir- réel'] },
  { w: 'mobile', t: 3, k: 'a', r: ['im- mobile'] },
  { w: 'capable', t: 3, k: 'a', r: ['in- capable'] },
  { w: 'agréable', t: 3, k: 'a', r: ['dés- agréable'] },
  { w: 'sincère', t: 3, k: 'a', r: ['hypocrite'] },
  { w: 'courage', t: 3, k: 'n', r: ['lâcheté'] },
  { w: 'optimiste', t: 3, k: 'a', r: ['pessimiste'] },
  { w: 'rare', t: 3, k: 'a', r: ['fréquent', 'courant'] },
  { w: 'générosité', t: 3, k: 'n', r: ['avarice'] },
  { w: 'timide', t: 3, k: 'a', r: ['hardi', 'audacieux'] },
];

/** De la même famille que… (le mot du centre est la racine). */
export const FAMILLES: FamEntry[] = [
  { w: 'terre', t: 1, r: ['terr -ain', 'terr -estre', 'en- terr -er', 'at- terr -ir', 'terr -ier', 'sou- terr -ain', 'dé- terr -er', 'terr -asse'], faux: ['terrible', 'terrifier'] },
  { w: 'mer', t: 1, r: ['mar -in', 'mar -ée', 'maritime', 'amerrir', 'marinier'], faux: ['mère', 'maire', 'amer'] },
  { w: 'dent', t: 1, r: ['dent -iste', 'dent -aire', 'dent -ier', 'é- dent -é', 'dent -elle', 'dent -ifrice'], faux: ['dans', 'danse'] },
  { w: 'jour', t: 1, r: ['journée', 'journal', 'journaliste', 'bon- jour', 'séjour', 'ajourner', 'journalier'], faux: ['jouer', 'jouet'] },
  { w: 'vie', t: 1, r: ['vivre', 'vivant', 'vital', 'sur- vivre', 're- vivre', 'vivace'], faux: ['vite', 'vide', 'vigne'] },
  { w: 'jouer', t: 1, r: ['jou -eur', 'jou -et', 'jou -able', 'dé- jou -er', 're- jouer'], faux: ['joue', 'jour'] },
  { w: 'fleur', t: 1, r: ['fleur -iste', 'fleur -ir', 'fleur -i', 'fleur -ette', 're- fleur -ir'], faux: ['fleuve', 'fleuret'] },
  { w: 'lait', t: 1, r: ['lait -ier', 'lait -age', 'lait -erie', 'al- lait -er', 'lait -eux'], faux: ['laid', 'laiton'] },
  { w: 'chaud', t: 1, r: ['chal -eur', 'chauff -er', 'ré- chauff -er', 'chauff -age', 'chaud -ière', 'chauff -eur'], faux: ['chaux', 'chauve', 'chaussure'] },
  { w: 'froid', t: 1, r: ['re- froid -ir', 'froid -eur', 'froid -ement', 'froid -ure'], faux: ['froisser', 'froment', 'frotter'] },
  { w: 'grand', t: 1, r: ['grand -ir', 'grand -eur', 'a- grand -ir', 'grand -iose', 'grand -ement'], faux: ['grain', 'grange', 'grenier'] },
  { w: 'petit', t: 1, r: ['rapetisser', 'petit -esse', 'petit -ement'], faux: ['pétale', 'pétrin'] },
  { w: 'chant', t: 2, r: ['chant -er', 'chant -eur', 'en- chant -er', 'chant -onner', 'dé- chant -er', 'chanteuse'], faux: ['chantier', 'champ', 'chanvre'] },
  { w: 'feuille', t: 2, r: ['feuill -age', 'feuill -eter', 'ef- feuill -er', 'feuill -u', 'portefeuille'], faux: ['feu', 'feutre'] },
  { w: 'roue', t: 2, r: ['roul -er', 'roul -eau', 'roul -ette', 'roul -ement', 'rou -age', 'dé- roul -er'], faux: ['route', 'rouge', 'rouille'] },
  { w: 'sang', t: 2, r: ['saign -er', 'sanglant', 'sanguin', 'ensanglanté', 'saign -ement'], faux: ['sans', 'sanglier', 'sangle'] },
  { w: 'tête', t: 2, r: ['têt -u', 'en- têt -er', 'é- têt -er', 'têt -ard'], faux: ['tétine', 'tempête'] },
  { w: 'vent', t: 2, r: ['vent -eux', 'é- vent -ail', 'é- vent -er', 'ventilateur', 'ventiler', 'para- vent'], faux: ['ventre', 'vendre', 'venir'] },
  { w: 'porter', t: 2, r: ['port -eur', 'port -able', 'trans- port -er', 'em- port -er', 'ap- port -er', 'sup- port', 'im- port -er'], faux: ['porte', 'portail', 'sport'] },
  { w: 'cheval', t: 2, r: ['cheval -ier', 'chevaucher', 'cheval -in', 'cavalier', 'cavalerie', 'cheval -et'], faux: ['cheveu', 'chevet'] },
  { w: 'livre', t: 2, r: ['libr -aire', 'libr -airie', 'livr -et', 'livr -esque'], faux: ['libre', 'liberté', 'livrer'] },
  { w: 'mont', t: 2, r: ['mont -agne', 'mont -agnard', 'mont -er', 'mont -icule', 're- mont -er', 'sur- mont -er', 'dé- mont -er'], faux: ['montre', 'montrer'] },
  { w: 'tour', t: 2, r: ['tourn -er', 'dé- tour', 're- tourn -er', 'tournevis', 'con- tourn -er', 'tourn -age'], faux: ['tourte', 'tourterelle', 'tourbe'] },
  { w: 'soleil', t: 2, r: ['en- soleill -é', 'solaire', 'insolation', 'para- sol', 'tournesol'], faux: ['sol', 'solide', 'solo'] },
  { w: 'main', t: 2, r: ['man -uel', 'man -ette', 'man -ier', 'manucure', 'maniable'], faux: ['maire', 'maïs'] },
  { w: 'pierre', t: 2, r: ['pierr -eux', 'em- pierr -er', 'pierr -aille', 'pierr -erie'], faux: ['pièce', 'piège'] },
  { w: 'eau', t: 2, r: ['aquatique', 'aquarium', 'aqueduc', 'aquarelle'] },
  { w: 'lune', t: 2, r: ['lun -aire', 'a- lun -ir', 'lun -ette', 'lun -atique'] },
  { w: 'pied', t: 3, r: ['piétiner', 'piéton', 'tré- pied', 'marchepied', 'pédale', 'pédestre'], faux: ['piège', 'pièce'] },
];

// ───────────────────────── Outils ─────────────────────────

/** Le mot en toutes lettres : « en- terr -er » → « enterrer ». */
export const plain = (w: string): string => w.replace(/[-\s]/g, '');

/** Ce que l'élève tape : lettres minuscules sans accent ni tiret (« éducation » → « education »). */
export const norm = (w: string): string =>
  plain(w)
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .normalize('NFD')
    .replace(/[^a-z]/g, '');

/** Le découpage d'un mot, s'il en a un : « en- terr -er » → préfixe « en- », racine « terr », suffixe « -er ». */
export interface Morph {
  prefix: string[];
  root: string[];
  suffix: string[];
}
export function morphOf(w: string): Morph | null {
  const parts = w.split(/\s+/).filter(Boolean);
  if (parts.length < 2) return null;
  const m: Morph = { prefix: [], root: [], suffix: [] };
  for (const p of parts) {
    if (p.endsWith('-')) m.prefix.push(p);
    else if (p.startsWith('-')) m.suffix.push(p);
    else m.root.push(p);
  }
  return m;
}

/** « en- + terr + -er » : le découpage à montrer à l'élève après une bonne réponse. */
export const morphText = (w: string): string => w.split(/\s+/).join(' + ');
