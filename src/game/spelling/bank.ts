import type { RuleId } from '../encre/bestiary';

/**
 * Banque de phrases de « Chasse aux fautes ». Chaque phrase contient UN mot faux, écrit entre crochets :
 * [mot faux | bonne écriture | autre proposition…]. Le niveau 1 sert au CM1 et au CM2, le niveau 2 au CM2 seulement.
 * `tip` : l'astuce qui permet de trouver la réponse (la « parade » de la créature sert quand il n'y en a pas).
 * Règles du cycle 3 : lettres doubles, homophones grammaticaux (a/à, et/est, on/ont, son/sont, ou/où, ce/se), accords.
 */

export type Entry = readonly [rule: RuleId, level: 1 | 2, template: string, tip?: string];

export const BANK: readonly Entry[] = [
  // ─── Le Doublon : une lettre double oubliée ou ajoutée ───
  ['doublon', 1, 'Je vais [apeler|appeler|apeller] mon ami.', 'Pense à « un appel ».'],
  ['doublon', 1, 'Nous allons [aprendre|apprendre|apprandre] une poésie.', 'Pense à « un apprentissage ».'],
  ['doublon', 1, 'Le [balon|ballon|balonn] roule dans le jardin.', 'Pense à « une balle ».'],
  ['doublon', 1, 'Une [bouteile|bouteille|boutelle] d’eau est posée sur la table.', 'Pense à « une bouteille » : deux l.'],
  ['doublon', 1, 'Il y a une [carote|carotte|caroote] dans la soupe.', 'Pense à « une carotte » : deux t.'],
  ['doublon', 1, 'Nous [alons|allons|alllons] à la piscine.', 'Pense à « aller » : « allons » garde deux l.'],
  ['doublon', 1, 'Une [pome|pomme|pommme] rouge est tombée de l’arbre.', 'Pense à « un pommier ».'],
  ['doublon', 1, 'Le [pomier|pommier|pommié] est en fleurs.', 'Pense à « une pomme » : deux m.'],
  ['doublon', 1, 'Léa porte un [bonet|bonnet|bonnê] chaud.', 'Pense à « bonnet » : deux n.'],
  ['doublon', 1, 'Elle est très [gentile|gentille|gentillle].', 'Pense à « gentillesse ».'],
  ['doublon', 1, 'Mon [aniversaire|anniversaire|anniversère] est en mai.', 'Pense à « un an » : « anniversaire » commence par deux n.'],
  ['doublon', 1, 'J’adore le [chocollat|chocolat|chocolatt] chaud.', 'Il n’y a pas de lettre double dans « chocolat ».'],
  ['doublon', 2, 'Le [tonère|tonnerre|tonnère] gronde au loin.', 'Pense à « tonner » : deux n, puis deux r.'],
  ['doublon', 2, 'Cet [personage|personnage|personnège] est drôle.', 'Pense à « une personne » : deux n.'],
  ['doublon', 2, 'Nous faisons une [adition|addition|addittion] avant la récréation.', 'Pense à « ajouter »… et à « addition » : deux d.'],
  ['doublon', 2, 'Le [proffesseur|professeur|proffeseur] distribue les cahiers.', 'Pense à « une profession » : un seul f.'],
  ['doublon', 2, 'Cet exercice est [dificile|difficile|difficille].', 'Pense à « une difficulté » : deux f.'],

  // ─── Les Jumeaux : deux mots qui sonnent pareil ───
  ['jumeaux', 1, 'Léa [à|a|as] faim après la récréation.', 'Essaie avec « avait » : Léa avait faim.'],
  ['jumeaux', 1, 'Nous allons [a|à|as] la piscine mardi.', 'Essaie avec « avait » : impossible, donc c’est « à ».'],
  ['jumeaux', 1, 'Le chat [et|est|es] sur le canapé.', 'Essaie avec « était » : le chat était sur le canapé.'],
  ['jumeaux', 1, 'Tom [est|et|e] Inès jouent aux cartes.', 'On peut dire « et puis » ; « était » ne va pas.'],
  ['jumeaux', 1, 'Les élèves [on|ont|ons] fini leur dictée.', 'Essaie avec « avaient » : ils avaient fini.'],
  ['jumeaux', 1, '[Ont|On|Un] va au parc cet après-midi.', 'Essaie avec « il » : il va au parc.'],
  ['jumeaux', 1, 'Mes amis [son|sont|sons] partis en vacances.', 'Essaie avec « étaient » : mes amis étaient partis.'],
  ['jumeaux', 1, 'Léo range [sont|son|sons] cartable.', 'Essaie avec « mon » : mon cartable.'],
  ['jumeaux', 1, 'Il [à|a|as] cassé son crayon.', 'Essaie avec « avait » : il avait cassé.'],
  ['jumeaux', 1, 'Ma sœur joue [a|à|as] la marelle.', 'Essaie avec « avait » : impossible, donc c’est « à ».'],
  ['jumeaux', 1, 'Ils [son|sont|ont] contents de leur journée.', 'Essaie avec « étaient » : ils étaient contents.'],
  ['jumeaux', 1, 'Les oiseaux [on|ont|ons] peur du chat.', 'Essaie avec « avaient » : ils avaient peur.'],
  ['jumeaux', 2, 'Dis-moi [ou|où|ous] tu habites.', 'On parle d’un endroit : « où » avec un accent.'],
  ['jumeaux', 2, 'Veux-tu du thé [où|ou|u] du café ?', 'Essaie avec « ou bien » : du thé ou bien du café.'],
  ['jumeaux', 2, 'Le chien [ce|se|ses] lave dans la cour.', 'Devant un verbe, on écrit « se » : il se lave.'],
  ['jumeaux', 2, '[Se|Ce|Ces] livre est très intéressant.', 'Devant un nom, on écrit « ce » : ce livre.'],

  // ─── L'Accordeur fantôme : un accord oublié ───
  ['accordeur', 1, 'Les enfants [joue|jouent|jouez] dans la cour.', 'Qui joue ? Les enfants : on accorde avec eux.'],
  ['accordeur', 1, 'Mes amis [arrive|arrivent|arrivons] demain.', 'Qui arrive ? Mes amis : plusieurs, donc « -ent ».'],
  ['accordeur', 1, 'Les oiseaux [chante|chantent|chantes] au matin.', 'Qui chante ? Les oiseaux : plusieurs, donc « -ent ».'],
  ['accordeur', 1, 'Des fleurs [rouge|rouges|rougent] fleurissent le long du mur.', 'Des fleurs : plusieurs, l’adjectif prend un « s ».'],
  ['accordeur', 1, 'Les petits chats [dort|dorment|dormons] sur le tapis.', 'Qui dort ? Les chats : plusieurs, donc « -ent ».'],
  ['accordeur', 1, 'Ma voisine est très [content|contente|contentes].', 'Qui est contente ? Ma voisine : une seule, au féminin.'],
  ['accordeur', 1, 'Les élèves [attentif|attentifs|attentives] écoutent la maîtresse.', 'Les élèves : plusieurs, l’adjectif prend un « s ».'],
  ['accordeur', 1, 'Tu [chante|chantes|chantent] très bien.', 'Avec « tu », le verbe se termine par « -es ».'],
  ['accordeur', 1, 'Léo et Zoé [danse|dansent|dansons] ensemble.', 'Qui danse ? Léo et Zoé : deux personnes, donc « -ent ».'],
  ['accordeur', 1, 'Nos [voisin|voisins|voisine] sont gentils.', 'Nos : plusieurs voisins, le nom prend un « s ».'],
  ['accordeur', 2, 'Les [chevals|chevaux|chevaus] courent dans le pré.', 'Un cheval, des chevaux.'],
  ['accordeur', 2, 'Les musiciens [accorde|accordent|accordes] leurs violons.', 'Qui accorde ? Les musiciens : plusieurs, donc « -ent ».'],
  ['accordeur', 2, 'La maîtresse a rendu les cahiers [corrigé|corrigés|corrigée].', 'Les cahiers : masculin pluriel, donc « corrigés ».'],
  ['accordeur', 2, 'Les filles sont [parti|parties|partie].', 'Qui est parti ? Les filles : féminin pluriel, donc « parties ».'],
  ['accordeur', 2, 'Des chaussettes [bleu|bleues|bleus] sèchent sur le fil.', 'Des chaussettes : féminin pluriel, donc « bleues ».'],
];
