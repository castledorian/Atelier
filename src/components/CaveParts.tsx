import { GoutteArt } from './GoutteArt';
import { InkBoss } from './InkBoss';
import { BOSS_NAMES, POWER_STEPS } from '../game/boss/state';
import { defaultLook, levelOf, stageOf } from '../game/goutte/rules';
import type { Look } from '../game/goutte/rules';
import type { Team } from '../server/goutte';

/** Un membre de l'équipe, prêt à dessiner. */
export interface Fighter {
  name: string;
  look: Look;
  level: number;
  me: boolean;
}

export function fightersOf(team: Team | null): Fighter[] {
  if (!team) return [];
  return team.team.map((m, i) => ({ name: m.name, look: m.look ?? defaultLook(i), level: levelOf(m.xp), me: team.me === m.id }));
}

/**
 * Les étapes de la créature : celles déjà atteintes sont dessinées, les suivantes restent des silhouettes mystère.
 * On ne dit pas « encore N fautes » (on ne pousse jamais à se tromper) : on montre seulement le chemin parcouru.
 */
export function StageStrip({ stage }: { stage: number }) {
  return (
    <ol className="cave-stages" aria-label="Les étapes de la créature">
      {BOSS_NAMES.map((n, i) => (
        <li key={n} data-state={i < stage ? 'past' : i === stage ? 'now' : 'next'}>
          <span className="cave-stage-art" aria-hidden="true">
            <InkBoss stage={i} mood={i <= stage ? 'idle' : 'sleep'} />
          </span>
          <span className="cave-stage-name">{i <= stage ? n : '?'}</span>
          {i > stage && <span className="sr-only">étape pas encore atteinte</span>}
          {i === stage && <span className="sr-only">(aujourd’hui)</span>}
        </li>
      ))}
    </ol>
  );
}

/** Lanternes de la classe : une par palier de réussites, et ce qu'il reste pour la suivante (un objectif positif). */
export function LanternHint({ power, level }: { power: number; level: number }) {
  const next = POWER_STEPS[level + 1];
  return (
    <p className="cave-lanterns">
      <span aria-hidden="true">{Array.from({ length: POWER_STEPS.length - 1 }, (_, i) => (i < level ? '◆' : '◇')).join(' ')}</span>{' '}
      {next === undefined
        ? 'Toutes les lanternes sont allumées : la classe est prête !'
        : `${level} lanterne${level > 1 ? 's' : ''} allumée${level > 1 ? 's' : ''}. Encore ${(next - power).toLocaleString('fr-FR')} bonne${next - power > 1 ? 's' : ''} réponse${next - power > 1 ? 's' : ''} pour la suivante.`}
    </p>
  );
}

/** L'équipe de la classe pour le combat final : chaque élève avec sa goutte. */
export function CaveTeam({ fighters }: { fighters: Fighter[] }) {
  if (fighters.length === 0) return null;
  const mine = fighters.find((f) => f.me);
  return (
    <section className="cave-team" aria-labelledby="cave-team-h">
      <h2 id="cave-team-h" className="cave-team-h">
        L’équipe de la classe
      </h2>
      <p className="cave-team-sub">
        {fighters.length} goutte{fighters.length > 1 ? 's' : ''} guerrière{fighters.length > 1 ? 's' : ''} pour le grand combat.
        {mine ? ' La tienne est entourée.' : ''}
      </p>
      <ul className="cave-team-list">
        {fighters.map((f, i) => (
          <li key={`${f.name}-${i}`} className={f.me ? 'is-me' : undefined}>
            <GoutteArt look={f.look} stage={stageOf(f.level)} />
            <span className="cave-team-name">
              {f.name}
              {f.me && <span className="sr-only"> (toi)</span>}
            </span>
            <span className="cave-team-lv">niv. {f.level}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
