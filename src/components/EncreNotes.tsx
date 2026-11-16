import { CreatureArt } from './Creatures';
import { creatureOf } from '../game/encre/bestiary';
import type { RuleId } from '../game/encre/bestiary';
import { DUEL_SIZE } from '../game/encre/tracker';
import type { CreatureState } from '../game/encre/tracker';
import { loadSettings } from '../game/storage';

const STATE_AFTER: Record<CreatureState, string> = {
  inconnue: '',
  silhouette: '',
  encree: 'Elle est encore là : elle reviendra, tu la connais.',
  palie: 'Elle a pâli : elle recule !',
  crayon: 'Elle est dessinée au crayon : bien joué !',
};

/** Résultat d'un duel : un message d'encouragement, jamais un reproche. */
export interface DuelInfo {
  rule: RuleId;
  before: CreatureState;
  after: CreatureState;
  won: boolean;
}

export function DuelResult({ duel }: { duel: DuelInfo }) {
  const c = creatureOf(duel.rule);
  const calm = loadSettings().calm;
  return (
    <div className="encre-note mt-2" role="status">
      <CreatureArt id={duel.rule} state={duel.after} calm={calm} size={56} label={c.name} />
      <p className="text-[15px] leading-snug">
        <strong>{duel.won ? 'Duel réussi !' : 'Duel interrompu.'}</strong> {c.name}. {duel.won ? STATE_AFTER[duel.after] : 'Tu pourras recommencer quand tu veux.'}
      </p>
    </div>
  );
}

/** Une Rature : la règle qui revient souvent, sa parade, et un duel de trois calculs. */
export function RatureNote({ rule, fresh, onDuel }: { rule: RuleId; fresh: boolean; onDuel: (r: RuleId) => void }) {
  const c = creatureOf(rule);
  const calm = loadSettings().calm;
  return (
    <div className="encre-note mt-2">
      <CreatureArt id={rule} state="encree" calm={calm} size={56} label={c.name} />
      <div className="text-[15px] leading-snug">
        <p>
          <strong>{fresh ? `${c.name} vient d’apparaître.` : `${c.name} est passée par là.`}</strong> {c.parade}
        </p>
        <details className="mt-1">
          <summary className="cursor-pointer text-[14px] underline">Pourquoi cette créature ?</summary>
          <p className="mt-1 text-[14px] text-ink/80">
            Cette règle t’a surpris plusieurs fois ces dernières parties. Elle revient un peu plus souvent pour t’aider à la maîtriser, mais les calculs ne
            deviennent pas plus durs.
          </p>
        </details>
        <button type="button" className="btn btn-ghost mt-2" onClick={() => onDuel(rule)}>
          Duel : {DUEL_SIZE} calculs
        </button>
      </div>
    </div>
  );
}
