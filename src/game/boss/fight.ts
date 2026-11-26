import type { SfxName } from '../audio';
import type { EnemyMood } from '../../components/InkEnemy';
import { formName } from './forms';

/**
 * Le grand combat, écrit d'avance. La classe gagne toujours : c'est une fête de fin d'année, pas une évaluation.
 * Mais le scénario ménage un vrai moment de doute (la créature riposte et la classe tombe très bas) avant le sursaut.
 * Tout est décrit ici en « temps forts » : l'écran ne fait que les jouer, ce qui rend le déroulé testable.
 */

export interface Beat {
  /** moment du temps fort, en millisecondes depuis le début */
  at: number;
  /** phrase lue par le récit (annoncée aussi aux lecteurs d'écran) */
  text: string;
  /** vie restante de la créature, de 100 à 0 */
  hp?: number;
  /** vie restante de la classe, de 100 à 0 (elle ne descend jamais à 0) */
  classHp?: number;
  /** prénom qui frappe (indice dans la liste) */
  strike?: number;
  /** toute la classe frappe en même temps */
  all?: boolean;
  sound?: SfxName;
  mood?: EnemyMood;
  /** secousse de l'écran */
  shake?: boolean;
}

export interface Fight {
  beats: Beat[];
  /** durée totale, fin comprise */
  total: number;
  /** vrai nom de la créature, d'après sa forme */
  name: string;
}

/** Vie de la classe au plus bas : le moment où l'on croit que c'est perdu. */
export const LOW = 14;

const say = (b: Beat): Beat => b;

/**
 * Construit le combat.
 * `names` : les prénoms de la classe (au moins un) ; `form` : forme de la créature (0 à 9) ;
 * `power` : force de la classe (0 à 6), qui ne change pas l'issue mais ce que dit le récit.
 */
export function buildFight(names: readonly string[], form: number, power: number): Fight {
  const list = names.length > 0 ? names : ['La classe'];
  const n = list.length;
  const name = formName(form);
  const beats: Beat[] = [];

  beats.push(say({ at: 0, text: 'La grotte est silencieuse. Au fond, quelque chose bouge…', hp: 100, classHp: 100, mood: 'idle' }));
  beats.push(say({ at: 1100, text: `${name} se dresse : « Toutes vos fautes de l’année m’ont nourri ! »`, sound: 'attack', mood: 'angry', shake: true }));
  beats.push(
    say({
      at: 2300,
      text: power >= 4 ? 'La classe avance sans trembler : vous vous êtes bien entraînés.' : 'La classe avance, serrée, plume à la main.',
      mood: 'idle',
    }),
  );

  // Première vague : chaque prénom frappe à son tour. Plus la classe a de réussites derrière elle,
  // plus la créature descend bas avant de riposter (sans jamais changer l'issue).
  const mid = 60 - 2 * Math.max(0, Math.min(6, power));
  const per = Math.max(190, Math.min(430, Math.round(5600 / n)));
  const start = 3200;
  for (let i = 0; i < n; i++) {
    const hp = Math.round(100 - ((100 - mid) * (i + 1)) / n);
    beats.push(say({ at: start + i * per, text: `${list[i]} frappe !`, hp, strike: i, sound: i % 3 === 2 ? 'impact' : 'cannon', mood: 'angry' }));
  }

  let t = start + n * per + 500;
  beats.push(say({ at: t, text: `${name} vacille… puis gonfle d’un coup, plus noir qu’avant.`, mood: 'angry', sound: 'spawn' }));
  t += 1300;
  beats.push(say({ at: t, text: 'L’encre jaillit et recouvre toute la classe. Plus personne ne voit rien.', classHp: LOW, sound: 'breach', mood: 'attack', shake: true }));
  t += 1600;
  beats.push(say({ at: t, text: 'Un silence. On dirait que c’est fini…', mood: 'idle' }));
  t += 1500;
  beats.push(
    say({
      at: t,
      text: 'Puis une voix : « On connaît la règle ! » Toutes les plumes se rallument une à une.',
      classHp: 62,
      sound: 'ready',
      mood: 'angry',
    }),
  );
  t += 1500;
  beats.push(say({ at: t, text: 'Tous ensemble, maintenant !', hp: 18, all: true, sound: 'cannon', shake: true, mood: 'angry' }));
  t += 1100;
  beats.push(say({ at: t, text: `${name} se fissure de partout.`, hp: 4, sound: 'impact', mood: 'angry', shake: true }));
  t += 900;
  beats.push(say({ at: t, text: 'La dernière goutte s’évapore. La grotte s’éclaire.', hp: 0, sound: 'victory', mood: 'dead' }));
  t += 1200;
  beats.push(say({ at: t, text: 'L’encre est vaincue. La page est blanche : à vous d’écrire dessus.', hp: 0, mood: 'dead' }));

  return { beats, total: t + 900, name };
}

/** État du combat à un instant donné : ce que l'écran doit montrer. */
export function stateAt(fight: Fight, ms: number): { hp: number; classHp: number; text: string; mood: EnemyMood; index: number } {
  let hp = 100;
  let classHp = 100;
  let text = '';
  let mood: EnemyMood = 'idle';
  let index = 0;
  for (let i = 0; i < fight.beats.length; i++) {
    const b = fight.beats[i];
    if (b.at > ms) break;
    index = i;
    if (b.hp !== undefined) hp = b.hp;
    if (b.classHp !== undefined) classHp = b.classHp;
    if (b.mood) mood = b.mood;
    text = b.text;
  }
  return { hp, classHp, text, mood, index };
}
