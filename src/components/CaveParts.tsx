import { GoutteArt } from './GoutteArt';
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
