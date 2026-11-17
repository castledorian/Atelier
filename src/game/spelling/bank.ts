import type { RuleId } from '../encre/rules';
import type { Grade } from '../grade';

/**
 * Banque de phrases de « Chasse aux fautes », rangées par CLASSE.
 * Chaque phrase contient UN mot faux, écrit entre crochets : [mot faux | bonne écriture | autre proposition…].
 * `tip` : l'astuce qui permet de trouver la réponse, formulée comme la procédure enseignée en classe.
 *
 * COMMENT LES PHRASES ONT ÉTÉ CHOISIES
 * 1. La notion est placée dans la classe où les programmes la font travailler :
 *    - cycle 2 (BOENJS du 31 octobre 2024) : relation sujet-verbe et chaîne d'accords déterminant/nom/adjectif du CE1 au
 *      CE2, conjugaison au passé composé (avoir/être) et infinitif dès le CE1-CE2, valeur des lettres (s/ss, c/ç…) ;
 *    - cycle 3 (BO n° 16 du 17 avril 2025) : CM1 — déterminants possessifs et démonstratifs (ses/ces), nom noyau du
 *      sujet, participe passé avec « être », marques de personne des verbes fréquents, appui sur la morphologie (familles
 *      de mots) ; CM2 — sujet inversé, accord sujet/attribut, participe passé avec « avoir » et COD placé avant.
 * 2. Les fautes proposées sont celles que font réellement les élèves de cet âge :
 *    - ordre d'acquisition du pluriel : nom, puis adjectif, puis verbe, et le participe passé en dernier (Fayol, Largy,
 *      Totereau, Thévenin) ; d'où, au CE1, des accords de voisinage seulement ;
 *    - erreurs d'« attraction » (le chien des voisins *aboient ; il les *timbres) : Fayol, Largy & Lemaire (1994),
 *      Largy, Fayol & Lemaire (1996), introduites au CM1 et au CM2 ;
 *    - confusion des finales en [e] (é / er / ez / ait) : Totereau & Brissaud (2006), du CE2 au CM2 ;
 *    - accords les plus ratés à la dictée de la DEPP en fin de CM2 (« inquiets », « perdus »…) : Note d'information
 *      22.37 (2022), qui montre que l'orthographe grammaticale concentre l'essentiel des erreurs ;
 *    - les surgénéralisations de la marque -nt sur les noms (les *chatent) observées au CE1.
 *    Aucune forme absurde (lettre triplée, faute impossible) : des propositions plausibles obligent à réfléchir à
 *    chacune (choix multiples « compétitifs », Little, Bjork & al., 2012).
 * 3. Orthographe lexicale (lettres doubles) en quantité limitée : voir une forme fausse peut brouiller la mémoire du mot
 *    (Brown, 1988 ; Jacoby & Hollingshead, 1990), et ce sont les fautes les moins fréquentes en fin d'école (DEPP). Les
 *    mots sont fréquents et l'astuce renvoie à leur famille (« appel » → « appeler ») ; la phrase corrigée est toujours
 *    montrée à la fin.
 * Les phrases sont écrites pour Atelier, pas recopiées de manuels : elles sont à faire relire par des enseignants.
 */

export type SpellGrade = Exclude<Grade, 'cp'>;
export type Entry = readonly [rule: RuleId, grade: SpellGrade, template: string, tip?: string];

// ═══════════════════════════════ CE1 ═══════════════════════════════
// Phrases très courtes (6 mots au plus), présent, sujet juste avant le verbe.

const CE1: readonly Entry[] = [
  // ─── Lettres doubles : mots très fréquents ───
  ['doublon', 'ce1', 'Je [m’apelle|m’appelle|m’appele|m’apèle] Léo.', 'Dans « appelle », il y a deux p et deux l.'],
  ['doublon', 'ce1', 'Je mets ma [chausete|chaussette|chaussete|chausette].', 'Pense à « chausser » : deux s, puis deux t.'],
  ['doublon', 'ce1', 'Il frotte une [alumette|allumette|allumete|alumete].', 'Pense à « allumer » : deux l, puis deux t.'],
  ['doublon', 'ce1', 'Ma poupée est [bele|belle|bèle|bel].', 'Au masculin « beau », au féminin « belle » : deux l.'],
  ['doublon', 'ce1', 'La [tere|terre|tère|tèrre] est ronde.', 'Pense à « un terrain » : deux r.'],
  ['doublon', 'ce1', 'Ma [clase|classe|clace|clas] est grande.', 'Pense à « un classeur » : deux s.'],
  ['doublon', 'ce1', 'Je bois une [tase|tasse|tace|tas] de lait.', 'Entre deux voyelles, « ss » fait le son [s].'],
  ['doublon', 'ce1', 'Le [poison|poisson|poiçon|poissons] nage vite.', 'Entre deux voyelles, un seul s fait [z] : il faut « ss ».'],
  ['doublon', 'ce1', 'C’est une [bone|bonne|bône|bon] idée.', 'Au masculin « bon », au féminin « bonne » : deux n.'],
  ['doublon', 'ce1', 'Je [done|donne|dône|donnes] un bonbon.', 'Pense à « donner » : deux n.'],
  ['doublon', 'ce1', 'Le téléphone [sone|sonne|sône|sonnent].', 'Pense à « une sonnerie » : deux n.'],
  ['doublon', 'ce1', 'J’écris une [letre|lettre|lètre|lèttre].', 'Dans « lettre », il y a deux t.'],
  ['doublon', 'ce1', 'Le chat lèche sa [pate|patte|pâte|pattes].', 'La « patte » du chat a deux t ; la « pâte » se mange.'],
  ['doublon', 'ce1', 'Je range ma [gome|gomme|gôme|gommes].', 'Pense à « gommer » : deux m.'],
  ['doublon', 'ce1', 'Je croque une [pome|pomme|paume|pommes].', 'Pense à « un pommier » : deux m.'],
  ['doublon', 'ce1', 'Le lapin mange une [carote|carotte|carrote|carrotte].', 'Dans « carotte », un seul r et deux t.'],

  // ─── Les Jumeaux : a / à, et / est, son / sont, on / ont ───
  ['jumeaux', 'ce1', 'Léa [à|a|as] un chat.', 'Essaie avec « avait » : Léa avait un chat.'],
  ['jumeaux', 'ce1', 'Je vais [a|à|as] l’école.', 'Essaie avec « avait » : impossible, donc c’est « à ».'],
  ['jumeaux', 'ce1', 'Tom [à|a|as] faim.', 'Essaie avec « avait » : Tom avait faim.'],
  ['jumeaux', 'ce1', 'Il joue [a|à|as] la balle.', 'Essaie avec « avait » : impossible, donc c’est « à ».'],
  ['jumeaux', 'ce1', 'Papa [à|a|as] une moto.', 'Essaie avec « avait » : papa avait une moto.'],
  ['jumeaux', 'ce1', 'Nous allons [a|à|as] la mer.', 'Essaie avec « avait » : impossible, donc c’est « à ».'],
  ['jumeaux', 'ce1', 'Le ciel [et|est|es] bleu.', 'Essaie avec « était » : le ciel était bleu.'],
  ['jumeaux', 'ce1', 'Papa [est|et|es] maman chantent.', 'On peut dire « et puis » : papa et puis maman.'],
  ['jumeaux', 'ce1', 'La soupe [et|est|es] chaude.', 'Essaie avec « était » : la soupe était chaude.'],
  ['jumeaux', 'ce1', 'Le chien [est|et|es] le chat jouent.', 'On peut dire « et puis » : le chien et puis le chat.'],
  ['jumeaux', 'ce1', 'Mon frère [et|est|es] malade.', 'Essaie avec « était » : mon frère était malade.'],
  ['jumeaux', 'ce1', 'J’aime le lait [est|et|es] le pain.', 'On peut dire « et puis » : le lait et puis le pain.'],
  ['jumeaux', 'ce1', 'Les chats [son|sont|sons] gris.', 'Essaie avec « étaient » : les chats étaient gris.'],
  ['jumeaux', 'ce1', 'Léo prend [sont|son|sons] sac.', 'Essaie avec « mon » : mon sac.'],
  ['jumeaux', 'ce1', 'Mes amis [son|sont|sons] là.', 'Essaie avec « étaient » : mes amis étaient là.'],
  ['jumeaux', 'ce1', 'Lou lave [sont|son|sons] vélo.', 'Essaie avec « mon » : mon vélo.'],
  ['jumeaux', 'ce1', 'Les fleurs [son|sont|sons] belles.', 'Essaie avec « étaient » : les fleurs étaient belles.'],
  ['jumeaux', 'ce1', 'Les enfants [on|ont|ons] faim.', 'Essaie avec « avaient » : les enfants avaient faim.'],
  ['jumeaux', 'ce1', '[Ont|On|Un] joue dehors.', 'Essaie avec « il » : il joue dehors.'],
  ['jumeaux', 'ce1', 'Ils [on|ont|ons] un chien.', 'Essaie avec « avaient » : ils avaient un chien.'],
  ['jumeaux', 'ce1', '[Ont|On|Un] mange à midi.', 'Essaie avec « il » : il mange à midi.'],
  ['jumeaux', 'ce1', 'Mes cousins [on|ont|ons] froid.', 'Essaie avec « avaient » : mes cousins avaient froid.'],

  // ─── L'Accordeur : le pluriel du nom d'abord, puis l'adjectif et le verbe tout proches ───
  ['accordeur', 'ce1', 'Les [chat|chats|chatent|chas] dorment.', 'Les : plusieurs chats, donc un « s ».'],
  ['accordeur', 'ce1', 'J’ai deux [crayon|crayons|crayont|crayonent].', 'Deux : plusieurs crayons, donc un « s ».'],
  ['accordeur', 'ce1', 'Mes [ami|amis|amit|amient] sont gentils.', 'Mes : plusieurs amis, donc un « s ».'],
  ['accordeur', 'ce1', 'Les [fleur|fleurs|fleurent|fleure] poussent.', 'Les : plusieurs fleurs, donc un « s ».'],
  ['accordeur', 'ce1', 'Il a des [bille|billes|billent].', 'Des : plusieurs billes, donc un « s ».'],
  ['accordeur', 'ce1', 'Les [voiture|voitures|voiturent|voitur] roulent.', 'Les : plusieurs voitures, donc un « s ».'],
  ['accordeur', 'ce1', 'Les chiens [aboie|aboient|aboies|aboyez].', 'Qui aboie ? Les chiens : plusieurs, donc « -ent ».'],
  ['accordeur', 'ce1', 'Ils [joue|jouent|joues|jouez] au ballon.', 'Avec « ils », le verbe finit par « -ent ».'],
  ['accordeur', 'ce1', 'Elles [chante|chantent|chantes|chantez] fort.', 'Avec « elles », le verbe finit par « -ent ».'],
  ['accordeur', 'ce1', 'Les bébés [dort|dorment|dors|dorme].', 'Qui dort ? Les bébés : plusieurs, donc « -ent ».'],
  ['accordeur', 'ce1', 'Les élèves [écoute|écoutent|écoutes|écoutez].', 'Qui écoute ? Les élèves : plusieurs, donc « -ent ».'],
  ['accordeur', 'ce1', 'Ils [mange|mangent|manges|mangez] des pâtes.', 'Avec « ils », le verbe finit par « -ent ».'],
  ['accordeur', 'ce1', 'Tu [joue|joues|jouent|jouez] avec moi.', 'Avec « tu », le verbe finit par « -es ».'],
  ['accordeur', 'ce1', 'Nous [chantent|chantons|chante|chantez] ensemble.', 'Avec « nous », le verbe finit par « -ons ».'],
  ['accordeur', 'ce1', 'Les poules [picore|picorent|picores|picorez].', 'Qui picore ? Les poules : plusieurs, donc « -ent ».'],
  ['accordeur', 'ce1', 'Ma sœur est [petit|petite|petits|petites].', 'Ma sœur : une fille, donc « petite ».'],
  ['accordeur', 'ce1', 'La maison est [grand|grande|grands|grandes].', 'La maison : féminin, donc « grande ».'],
  ['accordeur', 'ce1', 'Une [petit|petite|petits|petites] souris court.', 'Une souris : féminin, donc « petite ».'],
  ['accordeur', 'ce1', 'Mon chat est [noire|noir|noirs|noires].', 'Mon chat : masculin, un seul, donc « noir ».'],
  ['accordeur', 'ce1', 'La porte est [ouvert|ouverte|ouverts|ouvertes].', 'La porte : féminin, donc « ouverte ».'],
  ['accordeur', 'ce1', 'Mes mains sont [sale|sales|salent|sal].', 'Mes mains : plusieurs, donc « sales ».'],
];

// ═══════════════════════════════ CE2 ═══════════════════════════════
// Phrases un peu plus longues ; chaîne d'accords dans le groupe nominal ; pluriels en -x ; finales en [e].

const CE2: readonly Entry[] = [
  // ─── Lettres doubles ───
  ['doublon', 'ce2', 'Nous [alons|allons|allont|allon] au marché.', 'Pense à « aller » : deux l.'],
  ['doublon', 'ce2', 'Il n’y a [persone|personne|pèrsonne|personnes] dans la cour.', 'Dans « personne », il y a deux n.'],
  ['doublon', 'ce2', 'Fais [atention|attention|attantion|atantion] en traversant.', 'Pense à « attentif » : deux t.'],
  ['doublon', 'ce2', 'Nous [atendons|attendons|attandons|atandons] le bus.', 'Pense à « une attente » : deux t.'],
  ['doublon', 'ce2', 'Il [frape|frappe|frâpe|frappes] à la porte.', 'Pense à « une frappe » : deux p.'],
  ['doublon', 'ce2', 'Je fais un [desin|dessin|déssin|dèssin] de ma maison.', 'Pense à « dessiner » : deux s, et pas d’accent sur le e.'],
  ['doublon', 'ce2', 'Elle est très [gentile|gentille|gentiye|gentil].', 'Pense à « la gentillesse » : deux l.'],
  ['doublon', 'ce2', 'Il a [casé|cassé|cacé|casser] son jouet.', 'Pense à « une casse » : deux s.'],
  ['doublon', 'ce2', 'Je mets de la [cole|colle|côle|colles] sur la feuille.', 'Pense à « coller » : deux l.'],
  ['doublon', 'ce2', 'J’adore le [chocollat|chocolat|choccolat|chocolas] chaud.', 'Il n’y a aucune lettre double dans « chocolat ».'],
  ['doublon', 'ce2', 'Le [ballai|balai|ballet|balais] est dans le placard.', 'Pense à « balayer » : un seul l.'],
  ['doublon', 'ce2', 'Le [pomier|pommier|pommié|pomié] est en fleurs.', 'Pense à « une pomme » : deux m.'],
  ['doublon', 'ce2', 'Mon [aniversaire|anniversaire|anniverssaire|anniversère] est en mai.', 'Pense à « un an » : « anniversaire » commence par deux n.'],
  ['doublon', 'ce2', 'Papa [apelle|appelle|appele|appèle] le médecin.', 'Dans « appelle », il y a deux p et deux l.'],
  ['doublon', 'ce2', 'Nous allons [aprendre|apprendre|apprandre|aprandre] une poésie.', 'Pense à « un apprentissage » : deux p.'],
  ['doublon', 'ce2', 'Une [bouteile|bouteille|bouteye|bouteil] d’eau est sur la table.', 'Le son [j] après « ei » s’écrit « ill » : « bouteille ».'],
  ['doublon', 'ce2', 'Ce [colier|collier|collié|colié] est en perles.', 'Pense à « le cou »… et à « collier » : deux l.'],
  ['doublon', 'ce2', 'Papi cherche ses [lunetes|lunettes|lunnettes|lunètes].', 'Dans « lunettes », un seul n et deux t.'],

  // ─── Les Jumeaux ───
  ['jumeaux', 'ce2', 'Le garçon [à|a|as] perdu sa casquette.', 'Essaie avec « avait » : le garçon avait perdu.'],
  ['jumeaux', 'ce2', 'Julie téléphone [a|à|as] sa grand-mère.', 'Essaie avec « avait » : impossible, donc c’est « à ».'],
  ['jumeaux', 'ce2', 'Le facteur [à|a|as] laissé un colis.', 'Essaie avec « avait » : le facteur avait laissé.'],
  ['jumeaux', 'ce2', 'Il pense [a|à|as] ses vacances.', 'Essaie avec « avait » : impossible, donc c’est « à ».'],
  ['jumeaux', 'ce2', 'Tu [a|as|à] de la chance.', 'Avec « tu », on écrit « as ».'],
  ['jumeaux', 'ce2', 'Ma tante habite [a|à|as] Lyon.', 'Essaie avec « avait » : impossible, donc c’est « à ».'],
  ['jumeaux', 'ce2', 'Ce film [et|est|es] vraiment drôle.', 'Essaie avec « était » : ce film était drôle.'],
  ['jumeaux', 'ce2', 'Pierre [est|et|ai] Paul sont frères.', 'On peut dire « et puis » : Pierre et puis Paul.'],
  ['jumeaux', 'ce2', 'Tu [est|es|et] très gentil avec moi.', 'Avec « tu », on écrit « es ».'],
  ['jumeaux', 'ce2', 'Il [es|est|et] déjà midi.', 'Essaie avec « était » : il était déjà midi.'],
  ['jumeaux', 'ce2', 'La route [et|est|es] longue et étroite.', 'Essaie avec « était » : la route était longue.'],
  ['jumeaux', 'ce2', 'Paul prend [sont|son|sons] manteau bleu.', 'Essaie avec « mon » : mon manteau.'],
  ['jumeaux', 'ce2', 'Mes chaussures [son|sont|sons] toutes sales.', 'Essaie avec « étaient » : mes chaussures étaient sales.'],
  ['jumeaux', 'ce2', 'Elles [son|sont|ont] en retard ce matin.', 'Essaie avec « étaient » : elles étaient en retard.'],
  ['jumeaux', 'ce2', 'Il a oublié [sont|son|sons] livre de lecture.', 'Essaie avec « mon » : mon livre.'],
  ['jumeaux', 'ce2', 'Les fruits [son|sont|sons] bien mûrs.', 'Essaie avec « étaient » : les fruits étaient mûrs.'],
  ['jumeaux', 'ce2', 'Ils [son|sont|ont] contents de leur journée.', 'Essaie avec « étaient » : ils étaient contents.'],
  ['jumeaux', 'ce2', 'Les voisins [on|ont|ons] un grand chien.', 'Essaie avec « avaient » : les voisins avaient un chien.'],
  ['jumeaux', 'ce2', 'Mes parents [on|ont|ons] acheté une maison.', 'Essaie avec « avaient » : mes parents avaient acheté.'],
  ['jumeaux', 'ce2', '[Ont|On|Un] mange à la cantine le lundi.', 'Essaie avec « il » : il mange à la cantine.'],
  ['jumeaux', 'ce2', 'Quand il pleut, [ont|on|un] reste à l’intérieur.', 'Essaie avec « il » : il reste à l’intérieur.'],
  ['jumeaux', 'ce2', 'Les élèves [on|ont|ons] rangé la classe.', 'Essaie avec « avaient » : ils avaient rangé.'],

  // ─── L'Accordeur : chaîne d'accords et sujet ───
  ['accordeur', 'ce2', 'Les [petit|petits|petite|petites] chats dorment au soleil.', 'Les chats : plusieurs, l’adjectif prend un « s ».'],
  ['accordeur', 'ce2', 'Des fleurs [rouge|rouges|rougent] poussent dans le jardin.', 'Des fleurs : plusieurs, l’adjectif prend un « s ».'],
  ['accordeur', 'ce2', 'Les [gâteau|gâteaux|gâteaus] sont délicieux.', 'Un gâteau, des gâteaux : avec un « x ».'],
  ['accordeur', 'ce2', 'Elle a de longs [cheveu|cheveux|cheveus].', 'Un cheveu, des cheveux : avec un « x ».'],
  ['accordeur', 'ce2', 'Les [oiseau|oiseaux|oiseaus] chantent le matin.', 'Un oiseau, des oiseaux : avec un « x ».'],
  ['accordeur', 'ce2', 'Nous jouons à des [jeu|jeux|jeus] de société.', 'Un jeu, des jeux : avec un « x ».'],
  ['accordeur', 'ce2', 'Mes [genou|genoux|genous] sont tout égratignés.', 'Un genou, des genoux : avec un « x ».'],
  ['accordeur', 'ce2', 'Les enfants [joue|jouent|jouez] dans la cour.', 'Qui joue ? Les enfants : plusieurs, donc « -ent ».'],
  ['accordeur', 'ce2', 'Mes amis [arrive|arrivent|arrivons] demain matin.', 'Qui arrive ? Mes amis : plusieurs, donc « -ent ».'],
  ['accordeur', 'ce2', 'Léo et Zoé [danse|dansent|danses|dansez] ensemble.', 'Qui danse ? Léo et Zoé : deux personnes, donc « -ent ».'],
  ['accordeur', 'ce2', 'Les nuages [passe|passent|passes|passez] très vite.', 'Qui passe ? Les nuages : plusieurs, donc « -ent ».'],
  ['accordeur', 'ce2', 'Les chevaux [galope|galopent|galopes|galopez] dans le pré.', 'Qui galope ? Les chevaux : plusieurs, donc « -ent ».'],
  ['accordeur', 'ce2', 'Ils [regarde|regardent|regardes|regardez] un dessin animé.', 'Avec « ils », le verbe finit par « -ent ».'],
  ['accordeur', 'ce2', 'Mon chien et mon chat [dort|dorment|dors|dorme] ensemble.', 'Qui dort ? Mon chien et mon chat : deux animaux, donc « -ent ».'],
  ['accordeur', 'ce2', 'Vous [chantons|chantez|chantent|chanter] très bien.', 'Avec « vous », le verbe finit par « -ez ».'],
  ['accordeur', 'ce2', 'Nous [jouez|jouons|jouent|joue] dans le parc.', 'Avec « nous », le verbe finit par « -ons ».'],
  ['accordeur', 'ce2', 'Mes cousines sont très [gentil|gentilles|gentils|gentille].', 'Mes cousines : féminin pluriel, donc « gentilles ».'],
  ['accordeur', 'ce2', 'Ces pommes sont bien [mûr|mûres|mûrs|mûre].', 'Ces pommes : féminin pluriel, donc « mûres ».'],
  ['accordeur', 'ce2', 'Ma voisine est très [content|contente|contents|contentes].', 'Ma voisine : féminin, donc « contente ».'],
  ['accordeur', 'ce2', 'Les élèves [attentif|attentifs|attentive|attentives] écoutent la maîtresse.', 'Les élèves : plusieurs, l’adjectif prend un « s ».'],
  ['accordeur', 'ce2', 'Les petites filles sont [content|contentes|contents|contente].', 'Les petites filles : féminin pluriel, donc « contentes ».'],
  ['accordeur', 'ce2', 'Une [grand|grande|grands|grandes] tour domine la ville.', 'Une tour : féminin, donc « grande ».'],

  // ─── Les finales en [e] : infinitif « -er », participe « -é », « vous … -ez » ───
  ['terminaisons', 'ce2', 'Je vais [mangé|manger|mangez] une pomme.', 'Essaie « je vais vendre » : c’est l’infinitif en « -er ».'],
  ['terminaisons', 'ce2', 'Il a [manger|mangé|mangez] sa soupe.', 'Essaie « il a vendu » : c’est le participe en « -é ».'],
  ['terminaisons', 'ce2', 'Nous allons [jouez|jouer|joué] au foot.', 'Essaie « nous allons vendre » : c’est l’infinitif en « -er ».'],
  ['terminaisons', 'ce2', 'Tu as [ranger|rangé|rangez] ta chambre.', 'Essaie « tu as vendu » : c’est le participe en « -é ».'],
  ['terminaisons', 'ce2', 'Elle veut [dessiné|dessiner|dessinez] un chat.', 'Essaie « elle veut vendre » : c’est l’infinitif en « -er ».'],
  ['terminaisons', 'ce2', 'Le chat a [sauter|sauté|sautez] sur la table.', 'Essaie « le chat a vendu » : c’est le participe en « -é ».'],
  ['terminaisons', 'ce2', 'Il faut [fermé|fermer|fermez] la porte.', 'Essaie « il faut vendre » : c’est l’infinitif en « -er ».'],
  ['terminaisons', 'ce2', 'Nous avons [chanter|chanté|chantez] à la fête.', 'Essaie « nous avons vendu » : c’est le participe en « -é ».'],
  ['terminaisons', 'ce2', 'Je peux [rentré|rentrer|rentrez] chez moi ?', 'Essaie « je peux vendre » : c’est l’infinitif en « -er ».'],
  ['terminaisons', 'ce2', 'Papa a [laver|lavé|lavez] la voiture.', 'Essaie « papa a vendu » : c’est le participe en « -é ».'],
  ['terminaisons', 'ce2', 'Vous [jouer|jouez|joué] très bien.', 'Avec « vous », le verbe finit par « -ez ».'],
  ['terminaisons', 'ce2', 'Vous [parler|parlez|parlé] trop fort.', 'Avec « vous », le verbe finit par « -ez ».'],
  ['terminaisons', 'ce2', 'Va [cherché|chercher|cherchez] ton manteau.', 'Essaie « va prendre » : c’est l’infinitif en « -er ».'],
  ['terminaisons', 'ce2', 'Les enfants ont [gagner|gagné|gagnez] le match.', 'Essaie « ils ont vendu » : c’est le participe en « -é ».'],
];

// ═══════════════════════════════ CM1 ═══════════════════════════════
// Familles de mots ; ou/où, ce/se, ces/ses, la/là ; nom noyau du sujet ; participe passé avec « être » ; imparfait.

const CM1: readonly Entry[] = [
  // ─── Lettres doubles : s'appuyer sur la famille du mot ───
  ['doublon', 'cm1', 'Ce [terain|terrain|tèrrain|térrain] est très grand.', 'Pense à « la terre » : deux r.'],
  ['doublon', 'cm1', 'Il a [atrapé|attrapé|attrappé|atrappé] la balle.', 'Dans « attraper », deux t et un seul p.'],
  ['doublon', 'cm1', 'Ils visitent un [apartement|appartement|appartemment|apartemment].', 'Deux p, un seul t, puis « -ement ».'],
  ['doublon', 'cm1', 'Cet exercice est [dificile|difficile|difficille|dificille].', 'Pense à « une difficulté » : deux f.'],
  ['doublon', 'cm1', 'Nous faisons une [adition|addition|addittion|adittion] avant la récréation.', 'Pense à « additionner » : deux d, un seul t.'],
  ['doublon', 'cm1', 'Le [proffesseur|professeur|proffeseur|profèsseur] distribue les cahiers.', 'Pense à « une profession » : un seul f.'],
  ['doublon', 'cm1', 'Ce [personage|personnage|pèrsonnage|pèrsonage] est drôle.', 'Pense à « une personne » : deux n.'],
  ['doublon', 'cm1', 'Le [tonère|tonnerre|tonnère|tonerre] gronde au loin.', 'Pense à « tonner » : deux n, puis deux r.'],
  ['doublon', 'cm1', 'Mon frère dort d’un profond [someil|sommeil|sommeille|someille].', 'Pense à « sommeiller » : deux m ; le nom finit par « -eil ».'],
  ['doublon', 'cm1', 'Le chat est très [tranquile|tranquille|tranquil|tranquilles].', 'Pense à « la tranquillité » : deux l.'],
  ['doublon', 'cm1', 'La mer est [imense|immense|immance|imence].', 'Pense à « l’immensité » : deux m.'],
  ['doublon', 'cm1', 'Il faut [aporter|apporter|apportter|aportter] ton livre demain.', 'Pense à « un apport » : deux p.'],
  ['doublon', 'cm1', 'Il a bon [apétit|appétit|appétis|apétis].', 'Pense à « appétissant » : deux p.'],
  ['doublon', 'cm1', 'Les étoiles [brilent|brillent|briyent|brille] dans la nuit.', 'Pense à « brillant » : deux l.'],
  ['doublon', 'cm1', 'Il faut [aroser|arroser|arrosser|arosser] les plantes.', 'Pense à « un arrosoir » : deux r, un seul s.'],
  ['doublon', 'cm1', 'Le facteur apporte le [courier|courrier|courrié|courié].', 'Dans « courrier », il y a deux r.'],

  // ─── Les Jumeaux : ou/où, ce/se, ces/ses, la/là/l'a ───
  ['jumeaux', 'cm1', 'Dis-moi [ou|où|ous] tu habites.', 'On parle d’un endroit : « où » avec un accent.'],
  ['jumeaux', 'cm1', 'Veux-tu du thé [où|ou|u] du café ?', 'Essaie avec « ou bien » : du thé ou bien du café.'],
  ['jumeaux', 'cm1', 'La ville [ou|où|ous] j’habite est très grande.', 'On parle d’un endroit : « où » avec un accent.'],
  ['jumeaux', 'cm1', 'Tu préfères le rouge [où|ou|ous] le bleu ?', 'Essaie avec « ou bien » : le rouge ou bien le bleu.'],
  ['jumeaux', 'cm1', 'Je ne sais pas [ou|où|ous] ranger mes affaires.', 'On parle d’un endroit : « où » avec un accent.'],
  ['jumeaux', 'cm1', 'On ira au cinéma [où|ou|ous] au musée.', 'Essaie avec « ou bien » : au cinéma ou bien au musée.'],
  ['jumeaux', 'cm1', 'Le chien [ce|se|ses] lave dans la cour.', 'Devant un verbe, on écrit « se » : il se lave.'],
  ['jumeaux', 'cm1', '[Se|Ce|Ces] livre est très intéressant.', 'Devant un nom, on écrit « ce » : ce livre.'],
  ['jumeaux', 'cm1', 'Elle [ce|se|ses] lève à sept heures.', 'Devant un verbe, on écrit « se » : elle se lève.'],
  ['jumeaux', 'cm1', '[Se|Ce|Ces] matin, il pleut sur la ville.', 'Devant un nom, on écrit « ce » : ce matin.'],
  ['jumeaux', 'cm1', 'Les enfants [ce|se|ces] lavent les mains.', 'Devant un verbe, on écrit « se » : ils se lavent.'],
  ['jumeaux', 'cm1', 'Mon frère a cassé [se|ce|ces] vase.', 'Devant un nom, on écrit « ce » : ce vase.'],
  ['jumeaux', 'cm1', 'Paul a rangé [ces|ses|se] jouets dans sa chambre.', 'Ce sont les jouets de Paul, les siens : « ses ».'],
  ['jumeaux', 'cm1', 'Regarde [ses|ces|se] nuages noirs dans le ciel !', 'Au singulier, on dirait « ce nuage » : donc « ces ».'],
  ['jumeaux', 'cm1', 'Je n’aime pas [ses|ces|se] légumes-là.', 'Au singulier, on dirait « ce légume-là » : donc « ces ».'],
  ['jumeaux', 'cm1', 'Julie met [ces|ses|se] lunettes sur son nez.', 'Ce sont les lunettes de Julie, les siennes : « ses ».'],
  ['jumeaux', 'cm1', 'Le chat fait [ces|ses|se] griffes sur le tapis.', 'Les griffes du chat, les siennes : « ses ».'],
  ['jumeaux', 'cm1', 'À qui sont [ses|ces|se] chaussettes sales ?', 'Au singulier, on dirait « cette chaussette » : donc « ces ».'],
  ['jumeaux', 'cm1', 'Le livre est [la|là|l’a], sur la table.', 'Essaie avec « ici » : le livre est ici.'],
  ['jumeaux', 'cm1', 'Ce gâteau, maman [la|l’a|là] préparé hier.', 'Essaie avec « l’avait » : maman l’avait préparé.'],
  ['jumeaux', 'cm1', 'Pose ton sac [la|là|l’a], près de la porte.', 'Essaie avec « ici » : pose ton sac ici.'],
  ['jumeaux', 'cm1', 'Le bateau que mon oncle [à|a|as] construit flotte bien.', 'Essaie avec « avait » : que mon oncle avait construit.'],
  ['jumeaux', 'cm1', 'Les cerises du jardin [son|sont|ont] déjà mûres.', 'Essaie avec « étaient » : les cerises étaient mûres.'],
  ['jumeaux', 'cm1', 'Avant de partir [a|à|as] la piscine, il mange.', 'Essaie avec « avait » : impossible, donc c’est « à ».'],

  // ─── L'Accordeur : participe passé avec « être », nom noyau du sujet, pluriels -al/-aux ───
  ['accordeur', 'cm1', 'Les filles sont [parti|parties|partie|partis] tôt.', 'Qui est parti ? Les filles : féminin pluriel, donc « parties ».'],
  ['accordeur', 'cm1', 'Léa est [tombé|tombée|tombés] dans la cour.', 'Qui est tombée ? Léa : féminin singulier, donc « tombée ».'],
  ['accordeur', 'cm1', 'Les garçons sont [arrivé|arrivés|arrivées] en retard.', 'Les garçons : masculin pluriel, donc « arrivés ».'],
  ['accordeur', 'cm1', 'Mes sœurs sont [allé|allées|allés] au cinéma.', 'Mes sœurs : féminin pluriel, donc « allées ».'],
  ['accordeur', 'cm1', 'Elles sont [resté|restées|restés] à la maison.', 'Elles : féminin pluriel, donc « restées ».'],
  ['accordeur', 'cm1', 'La porte est [fermé|fermée|fermés] à clé.', 'La porte : féminin singulier, donc « fermée ».'],
  ['accordeur', 'cm1', 'Le chien des voisins [aboient|aboie|aboies] la nuit.', 'Qui aboie ? Le chien (des voisins) : un seul chien.'],
  ['accordeur', 'cm1', 'La boîte de crayons [sont|est|es] sur le bureau.', 'Qu’est-ce qui est sur le bureau ? La boîte : une seule.'],
  ['accordeur', 'cm1', 'Les feuilles de l’arbre [tombe|tombent|tombes|tombez] en automne.', 'Qui tombe ? Les feuilles : plusieurs, donc « -ent ».'],
  ['accordeur', 'cm1', 'Le panier de pommes [sont|est|es] lourd.', 'Qu’est-ce qui est lourd ? Le panier : un seul.'],
  ['accordeur', 'cm1', 'Les amis de mon frère [arrive|arrivent|arrives|arrivez] ce soir.', 'Qui arrive ? Les amis : plusieurs, donc « -ent ».'],
  ['accordeur', 'cm1', 'Le bruit des vagues [m’endorment|m’endort|m’endors].', 'Qu’est-ce qui m’endort ? Le bruit : un seul.'],
  ['accordeur', 'cm1', 'Les [cheval|chevaux|chevals|chevaus] courent dans le pré.', 'Un cheval, des chevaux.'],
  ['accordeur', 'cm1', 'Les [animal|animaux|animals|animaus] vivent dans la forêt.', 'Un animal, des animaux.'],
  ['accordeur', 'cm1', 'Le chemin est plein de [caillou|cailloux|caillous].', 'Un caillou, des cailloux : avec un « x ».'],
  ['accordeur', 'cm1', 'Les [journal|journaux|journals|journaus] sont sur la table.', 'Un journal, des journaux.'],
  ['accordeur', 'cm1', 'Des chaussettes [bleu|bleues|bleus|bleue] sèchent sur le fil.', 'Des chaussettes : féminin pluriel, donc « bleues ».'],
  ['accordeur', 'cm1', 'La maîtresse a rendu les cahiers [corrigé|corrigés|corrigée].', 'Les cahiers : masculin pluriel, donc « corrigés ».'],
  ['accordeur', 'cm1', 'Mes chaussures sont [neuf|neuves|neufs|neuve].', 'Mes chaussures : féminin pluriel, donc « neuves ».'],
  ['accordeur', 'cm1', 'Des fleurs [parfumé|parfumées|parfumée] ornent la table.', 'Des fleurs : féminin pluriel, donc « parfumées ».'],
  ['accordeur', 'cm1', 'Les musiciens [accorde|accordent|accordes|accordez] leurs violons.', 'Qui accorde ? Les musiciens : plusieurs, donc « -ent ».'],
  ['accordeur', 'cm1', 'Le chat et le chien [joue|jouent|jouons] ensemble.', 'Qui joue ? Le chat et le chien : deux animaux, donc « -ent ».'],
  ['accordeur', 'cm1', 'Toi et moi [partent|partons|partez|parton] demain.', 'Toi et moi, c’est « nous » : le verbe finit par « -ons ».'],
  ['accordeur', 'cm1', 'Mes parents [prend|prennent|prends|prenent] le train.', 'Qui prend ? Mes parents : plusieurs, donc « prennent ».'],

  // ─── Les finales : -é / -er / -ez, et l'imparfait (-ais, -ait, -aient) ───
  ['terminaisons', 'cm1', 'Il a [oublier|oublié|oubliez] son cahier.', 'Essaie « il a vendu » : c’est le participe en « -é ».'],
  ['terminaisons', 'cm1', 'Nous devons [terminé|terminer|terminez] avant midi.', 'Essaie « nous devons vendre » : c’est l’infinitif en « -er ».'],
  ['terminaisons', 'cm1', 'Le gâteau est [décorer|décoré|décorez] de fraises.', 'Essaie « le gâteau est vendu » : c’est le participe en « -é ».'],
  ['terminaisons', 'cm1', 'J’entends le chien [aboyé|aboyer|aboyez].', 'Essaie « j’entends le chien mordre » : c’est l’infinitif en « -er ».'],
  ['terminaisons', 'cm1', 'Vous [écouter|écoutez|écouté] la radio.', 'Avec « vous », le verbe finit par « -ez ».'],
  ['terminaisons', 'cm1', 'Il commence à [neigé|neiger|neigez].', 'Essaie « il commence à vendre » : c’est l’infinitif en « -er ».'],
  ['terminaisons', 'cm1', 'Les élèves ont [préparer|préparé|préparez] une surprise.', 'Essaie « ils ont vendu » : c’est le participe en « -é ».'],
  ['terminaisons', 'cm1', 'Prends ton vélo pour [allé|aller|allez] à l’école.', 'Essaie « pour vendre » : c’est l’infinitif en « -er ».'],
  ['terminaisons', 'cm1', 'Nous voulons [visité|visiter|visitez] le château.', 'Essaie « nous voulons vendre » : c’est l’infinitif en « -er ».'],
  ['terminaisons', 'cm1', 'Mon père a [réparer|réparé|réparez] mon vélo.', 'Essaie « mon père a vendu » : c’est le participe en « -é ».'],
  ['terminaisons', 'cm1', 'Il faut [arrosé|arroser|arrosez] les fleurs.', 'Essaie « il faut vendre » : c’est l’infinitif en « -er ».'],
  ['terminaisons', 'cm1', 'Hier, je [jouait|jouais|jouaient] dans le jardin.', 'Avec « je », l’imparfait finit par « -ais ».'],
  ['terminaisons', 'cm1', 'Autrefois, il [habitais|habitait|habitaient] à la campagne.', 'Avec « il », l’imparfait finit par « -ait ».'],
  ['terminaisons', 'cm1', 'Tu [chantait|chantais|chantaient] très fort.', 'Avec « tu », l’imparfait finit par « -ais ».'],
  ['terminaisons', 'cm1', 'Les oiseaux [volait|volaient|volais] au-dessus du lac.', 'Qui volait ? Les oiseaux : plusieurs, donc « -aient ».'],
  ['terminaisons', 'cm1', 'Chaque soir, elle [rangeais|rangeait|rangeaient] sa chambre.', 'Avec « elle », l’imparfait finit par « -ait ».'],
];

// ═══════════════════════════════ CM2 ═══════════════════════════════
// Leur/leurs, c'est/s'est, peu/peut ; sujet inversé ou éloigné ; attribut ; participe passé avec « avoir ».

const CM2: readonly Entry[] = [
  // ─── Lettres doubles ───
  ['doublon', 'cm2', 'Nous allons [acueillir|accueillir|accueuillir|acceuillir] les invités.', 'Dans « accueillir », il y a deux c.'],
  ['doublon', 'cm2', 'Ce remède est très [éficace|efficace|efficasse|éfficace].', 'Pense à « l’efficacité » : deux f.'],
  ['doublon', 'cm2', 'C’est une belle [ocasion|occasion|occassion|ocassion] de se revoir.', 'Dans « occasion », il y a deux c et un seul s.'],
  ['doublon', 'cm2', 'Le [comencement|commencement|commencemant|comencemant] du film est triste.', 'Pense à « commencer » : deux m.'],
  ['doublon', 'cm2', 'On peut [dévelloper|développer|dévellopper|déveloper] ses idées.', 'Dans « développer », un seul l et deux p.'],
  ['doublon', 'cm2', 'Cet élève est très [inteligent|intelligent|intelligant|intéligent].', 'Pense à « l’intelligence » : deux l.'],
  ['doublon', 'cm2', 'La [gramaire|grammaire|grammère|gramère] française est riche.', 'Pense à « grammatical » : deux m.'],
  ['doublon', 'cm2', 'Elle a obtenu un résultat [exellent|excellent|excelent|excélent].', 'Pense à « l’excellence » : « xc », puis deux l.'],
  ['doublon', 'cm2', 'Je suis très [ocupé|occupé|occuppé|ocuppé] aujourd’hui.', 'Dans « occupé », il y a deux c et un seul p.'],
  ['doublon', 'cm2', 'Le chat est sur le côté [oposé|opposé|opossé|oppossé].', 'Pense à « une opposition » : deux p.'],
  ['doublon', 'cm2', 'Cet [aparail|appareil|appareille|apareil] est en panne.', 'Dans « appareil », deux p et un seul l.'],
  ['doublon', 'cm2', 'J’ai fait la [conaissance|connaissance|connaisance|conaisance] de mon voisin.', 'Pense à « connaître » : deux n, puis deux s.'],
  ['doublon', 'cm2', 'Il faut [nourir|nourrir|nourire|nourrire] les poissons chaque jour.', 'Pense à « la nourriture » : deux r.'],
  ['doublon', 'cm2', 'Il aime [courrir|courir|courire|courrire] dans le parc.', '« Courir » n’a qu’un seul r (deux seulement au futur : il courra).'],

  // ─── Les Jumeaux : leur/leurs, c'est/s'est, peu/peut/peux, ça/sa, quelle/qu'elle… ───
  ['jumeaux', 'cm2', 'Les élèves rangent [leur|leurs|l’heure] cahiers.', 'Plusieurs cahiers : « leurs » prend un « s ».'],
  ['jumeaux', 'cm2', 'Je [leurs|leur|l’heure] ai donné un conseil.', 'Devant un verbe, « leur » veut dire « à eux » : jamais de « s ».'],
  ['jumeaux', 'cm2', 'Ils ont perdu [leurs|leur|l’heure] chien.', 'Un seul chien : « leur » sans « s ».'],
  ['jumeaux', 'cm2', 'Le maire [leurs|leur|l’heure] a répondu hier.', 'Devant un verbe, « leur » ne prend jamais de « s ».'],
  ['jumeaux', 'cm2', 'Les enfants embrassent [leur|leurs|l’heure] parents.', 'Plusieurs parents : « leurs » prend un « s ».'],
  ['jumeaux', 'cm2', 'Mon frère [c’est|s’est|ses] coupé le doigt.', 'Au présent, on dirait « il se coupe » : donc « s’est ».'],
  ['jumeaux', 'cm2', '[S’est|C’est|Ces] mon meilleur ami.', 'Essaie avec « cela est » : donc « c’est ».'],
  ['jumeaux', 'cm2', 'Léa [c’est|s’est|ces] réveillée tard.', 'Au présent, on dirait « elle se réveille » : donc « s’est ».'],
  ['jumeaux', 'cm2', '[S’est|C’est|Ses] vraiment une belle journée.', 'Essaie avec « cela est » : donc « c’est ».'],
  ['jumeaux', 'cm2', 'Il [peu|peut|peux] venir demain.', 'Essaie avec « pouvait » : il pouvait venir.'],
  ['jumeaux', 'cm2', 'Elle mange très [peut|peu|peux].', '« Peu » est le contraire de « beaucoup ».'],
  ['jumeaux', 'cm2', 'Tu [peu|peux|peut] sortir maintenant.', 'Avec « tu », on écrit « peux ».'],
  ['jumeaux', 'cm2', 'Il reste un [peut|peu|peux] de pain.', '« Un peu » : le contraire de « beaucoup ».'],
  ['jumeaux', 'cm2', '[Sa|Ça|Ses] ne me dérange pas.', 'Essaie avec « cela » : cela ne me dérange pas.'],
  ['jumeaux', 'cm2', 'Léa range [ça|sa|ses] chambre.', 'Essaie avec « ma » : ma chambre, donc « sa ».'],
  ['jumeaux', 'cm2', 'Je n’aime pas [sa|ça|ses] du tout !', 'Essaie avec « cela » : je n’aime pas cela.'],
  ['jumeaux', 'cm2', 'Je crois [quel|qu’elle|quelle] viendra.', 'Essaie avec « qu’il » : je crois qu’il viendra.'],
  ['jumeaux', 'cm2', '[Qu’elle|Quelle|Quel] belle surprise !', 'Essaie avec « qu’il » : impossible, donc « quelle ».'],
  ['jumeaux', 'cm2', 'Ils [n’on|n’ont|non] rien compris à la consigne.', 'Essaie avec « n’avaient » : ils n’avaient rien compris.'],
  ['jumeaux', 'cm2', 'Quand [ont|on|un] a fini ses devoirs, on peut jouer.', 'Essaie avec « il » : quand il a fini ses devoirs.'],
  ['jumeaux', 'cm2', 'Le village [ou|où|ous] je suis né est loin d’ici.', 'On parle d’un endroit : « où » avec un accent.'],
  ['jumeaux', 'cm2', 'Les vacances [son|sont|ont] enfin arrivées.', 'Essaie avec « étaient » : les vacances étaient arrivées.'],
  ['jumeaux', 'cm2', 'Elle [à|a|as] beaucoup lu pendant les vacances.', 'Essaie avec « avait » : elle avait beaucoup lu.'],
  ['jumeaux', 'cm2', 'Le fermier nourrit [ces|ses|c’est] poules chaque matin.', 'Les poules du fermier, les siennes : « ses ».'],

  // ─── L'Accordeur : sujet inversé ou éloigné, attraction, attribut, participe passé ───
  ['accordeur', 'cm2', 'Dans la cour [joue|jouent|joues|jouez] les enfants.', 'Qui joue ? Les enfants, placés après le verbe : « -ent ».'],
  ['accordeur', 'cm2', 'Au loin [brille|brillent|brilles|brillez] les lumières du port.', 'Qui brille ? Les lumières, après le verbe : « -ent ».'],
  ['accordeur', 'cm2', 'Où [va|vont|vas|von] ces oiseaux en hiver ?', 'Qui va ? Ces oiseaux : plusieurs, donc « vont ».'],
  ['accordeur', 'cm2', 'Sur la branche [chante|chantent|chantes|chantez] deux merles.', 'Qui chante ? Deux merles, après le verbe : « -ent ».'],
  ['accordeur', 'cm2', 'Que [dit|disent|dis] tes parents de ce projet ?', 'Qui dit ? Tes parents : plusieurs, donc « disent ».'],
  ['accordeur', 'cm2', 'Le bruit des voitures [empêchent|empêche|empêches] de dormir.', 'Qu’est-ce qui empêche ? Le bruit : un seul.'],
  ['accordeur', 'cm2', 'Les enfants que je garde [joue|jouent|joues|jouez] bien.', 'Qui joue ? Les enfants : plusieurs, donc « -ent ».'],
  ['accordeur', 'cm2', 'La liste des invités [sont|est|es] prête.', 'Qu’est-ce qui est prêt ? La liste : une seule.'],
  ['accordeur', 'cm2', 'Le facteur prend les lettres et les [timbres|timbre|timbrent].', '« Les » n’est pas le sujet : qui timbre ? Le facteur, un seul.'],
  ['accordeur', 'cm2', 'Mon frère cueille des fleurs et les [ranges|range|rangent] dans un vase.', '« Les » n’est pas le sujet : qui range ? Mon frère, un seul.'],
  ['accordeur', 'cm2', 'Chacun des élèves [présentent|présente|présentes] son exposé.', 'Qui présente ? Chacun : un seul.'],
  ['accordeur', 'cm2', 'Les fleurs que j’ai [cueilli|cueillies|cueillie|cueillis] sentent bon.', 'Avec « avoir », on accorde avec le COD placé avant : « les fleurs ».'],
  ['accordeur', 'cm2', 'Ces lettres, je les ai [écrit|écrites|écrits|écrite] hier.', '« Les » (ces lettres) est placé avant « avoir » : féminin pluriel.'],
  ['accordeur', 'cm2', 'La tarte que tu as [préparé|préparée|préparés] est délicieuse.', 'COD placé avant : « la tarte », féminin singulier.'],
  ['accordeur', 'cm2', 'Les gâteaux qu’il a [mangé|mangés|mangées] étaient bons.', 'COD placé avant : « les gâteaux », masculin pluriel.'],
  ['accordeur', 'cm2', 'Elle a [mangées|mangé|mangée] des cerises.', 'Le COD est placé après « avoir » : pas d’accord.'],
  ['accordeur', 'cm2', 'Mes parents semblent [inquiet|inquiets|inquiètes|inquiète].', 'Qui semble inquiet ? Mes parents : masculin pluriel.'],
  ['accordeur', 'cm2', 'Les rues deviennent [glissante|glissantes|glissants|glissant] en hiver.', 'Les rues : féminin pluriel, donc « glissantes ».'],
  ['accordeur', 'cm2', 'Cette histoire paraît [vrai|vraie|vrais|vraies].', 'Cette histoire : féminin singulier, donc « vraie ».'],
  ['accordeur', 'cm2', 'Les nuits restent [froide|froides|froids|froid] en avril.', 'Les nuits : féminin pluriel, donc « froides ».'],
  ['accordeur', 'cm2', 'Les invités sont [arrivé|arrivés|arrivées] avant nous.', 'Qui est arrivé ? Les invités : masculin pluriel.'],
  ['accordeur', 'cm2', 'Hier soir, mes cousines sont [venu|venues|venus|venue] dîner.', 'Qui est venu ? Mes cousines : féminin pluriel.'],
  ['accordeur', 'cm2', 'Les enfants, inquiets, se sont [perdu|perdus|perdues|perdue] dans le bois.', 'Qui s’est perdu ? Les enfants : masculin pluriel.'],
  ['accordeur', 'cm2', 'Les [hôpital|hôpitaux|hôpitals|hôpitaus] sont ouverts la nuit.', 'Un hôpital, des hôpitaux.'],
  ['accordeur', 'cm2', 'Les [bijou|bijoux|bijous] brillent dans la boîte.', 'Un bijou, des bijoux : avec un « x ».'],
  ['accordeur', 'cm2', 'Les [pneu|pneus|pneux] du vélo sont crevés.', 'Un pneu, des pneus : ici, c’est un « s » !'],

  // ─── Les finales : -é / -er / -ez / -ait / -aient dans des phrases plus longues ───
  ['terminaisons', 'cm2', 'Le bébé commençait à [pleuré|pleurer|pleurait] doucement.', 'Essaie « commençait à vendre » : c’est l’infinitif en « -er ».'],
  ['terminaisons', 'cm2', 'Ils sont venus nous [aidé|aider|aidez] à déménager.', 'Essaie « venus nous vendre » : c’est l’infinitif en « -er ».'],
  ['terminaisons', 'cm2', 'Après avoir [manger|mangé|mangez], nous sommes sortis.', 'Essaie « après avoir vendu » : c’est le participe en « -é ».'],
  ['terminaisons', 'cm2', 'Le film était [terminer|terminé|terminait] quand il est arrivé.', 'Essaie « le film était vendu » : c’est le participe en « -é ».'],
  ['terminaisons', 'cm2', 'Je l’ai entendu [crié|crier|criait] dans la rue.', 'Essaie « je l’ai entendu vendre » : c’est l’infinitif en « -er ».'],
  ['terminaisons', 'cm2', 'Avant de [traversé|traverser|traversez], regarde à gauche.', 'Essaie « avant de vendre » : c’est l’infinitif en « -er ».'],
  ['terminaisons', 'cm2', 'Est-ce que vous [aimer|aimez|aimé] les romans d’aventure ?', 'Avec « vous », le verbe finit par « -ez ».'],
  ['terminaisons', 'cm2', 'Les randonneurs [marchait|marchaient|marchais] depuis l’aube.', 'Qui marchait ? Les randonneurs : plusieurs, donc « -aient ».'],
  ['terminaisons', 'cm2', 'Mon grand-père me [racontaient|racontait|racontais] des histoires.', 'Qui raconte ? Mon grand-père : un seul, donc « -ait ».'],
  ['terminaisons', 'cm2', 'Les enfants les [regardait|regardaient|regardais] passer.', 'Qui regarde ? Les enfants : plusieurs, donc « -aient ».'],
  ['terminaisons', 'cm2', 'Elle a fini de [rangé|ranger|rangeait] ses affaires.', 'Essaie « elle a fini de vendre » : c’est l’infinitif en « -er ».'],
  ['terminaisons', 'cm2', 'Nous avons [visiter|visité|visitez] un musée passionnant.', 'Essaie « nous avons vendu » : c’est le participe en « -é ».'],
  ['terminaisons', 'cm2', 'Il faudra [révisé|réviser|révisez] avant le contrôle.', 'Essaie « il faudra vendre » : c’est l’infinitif en « -er ».'],
  ['terminaisons', 'cm2', 'Tu [voulait|voulais|voulaient] partir plus tôt.', 'Avec « tu », l’imparfait finit par « -ais ».'],
  ['terminaisons', 'cm2', 'Ce tableau a été [acheter|acheté|achetez] très cher.', 'Essaie « ce tableau a été vendu » : c’est le participe en « -é ».'],
  ['terminaisons', 'cm2', 'Ils ont décidé de [déménagé|déménager|déménagez] cet été.', 'Essaie « ils ont décidé de vendre » : c’est l’infinitif en « -er ».'],
];

export const BANK: readonly Entry[] = [...CE1, ...CE2, ...CM1, ...CM2];
