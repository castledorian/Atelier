import { ruleInfo } from '../game/encre/rules';
import type { RuleId } from '../game/encre/rules';
import { DUEL_SIZE } from '../game/encre/tracker';
import type { RuleStatus } from '../game/encre/tracker';

/** Notes de fin de partie : la règle à revoir (avec son astuce) et le résultat d'un entraînement. */

export interface DuelInfo {
  rule: RuleId;
  before: RuleStatus;
  after: RuleStatus;
  won: boolean;
}

const AFTER: Record<RuleStatus, string> = {
  neuve: '',
  isolee: '',
  'a-revoir': 'On la retravaillera encore un peu.',
  progres: 'Tu progresses : elle te surprend de moins en moins !',
  acquise: 'Elle est acquise : bien joué !',
};

/** Résultat d'un entraînement : un message d'encouragement, jamais un reproche. */
export function DuelResult({ duel }: { duel: DuelInfo }) {
  const c = ruleInfo(duel.rule);
  return (
    <div className="encre-note mt-2" role="status">
      <p className="text-[15px] leading-snug">
        <strong>{duel.won ? 'Entraînement réussi !' : 'Entraînement interrompu.'}</strong> {c.name}. {duel.won ? AFTER[duel.after] : 'Tu pourras recommencer quand tu veux.'}
      </p>
    </div>
  );
}

/** Une règle qui revient : son astuce et un entraînement de trois questions. */
export function ReviewNote({ rule, onDuel }: { rule: RuleId; onDuel: (r: RuleId) => void }) {
  const c = ruleInfo(rule);
  return (
    <div className="encre-note mt-2">
      <div className="text-[15px] leading-snug">
        <p>
          <strong>À revoir : {c.name}.</strong> {c.parade}
        </p>
        <button type="button" className="btn btn-ghost mt-2" onClick={() => onDuel(rule)}>
          S’entraîner : {DUEL_SIZE} questions
        </button>
      </div>
    </div>
  );
}
