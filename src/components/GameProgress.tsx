import { ConfirmButton } from './ConfirmButton';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { ruleInfo } from '../game/encre/rules';
import type { Family, RuleId } from '../game/encre/rules';
import { loadStore } from '../game/encre/tracker';
import type { RuleStatus } from '../game/encre/tracker';
import { accuracyOf, clearLog, clearRules, focusRules, loadLog, summarize } from '../game/progress';
import type { GameLog, ProgressGame, Trend } from '../game/progress';

/**
 * « Mes progrès » : la même page pour tous les jeux, adaptée à la mécanique de chacun.
 * Calcul et orthographe : les règles à revoir (avec l'astuce et un entraînement ciblé). Mémoire : la longueur des suites.
 * Tout vient de l'appareil de l'élève ; rien n'est envoyé.
 */

type Kind = Extract<ProgressGame, 'math' | 'spelling' | 'memory' | 'lexique'>;

const FAMILY: Partial<Record<Kind, Family>> = { math: 'calcul', spelling: 'orthographe' };

const BADGE: Record<RuleStatus, { sym: string; text: string }> = {
  'a-revoir': { sym: '▲', text: 'À revoir' },
  isolee: { sym: '●', text: 'À surveiller' },
  progres: { sym: '↗', text: 'En progrès' },
  acquise: { sym: '✓', text: 'Acquise' },
  neuve: { sym: '○', text: 'Pas encore vue' },
};

const TREND_TEXT: Record<Trend, string> = {
  none: 'Joue encore quelques parties : ta tendance apparaîtra ici.',
  up: 'Tu progresses : tes dernières parties sont meilleures que les précédentes. Continue !',
  flat: 'Tu es régulier. Pour avancer, attaque la règle « à revoir » ci-dessous.',
  down: 'Un peu moins bien ces derniers temps : ça arrive ! Relis l’astuce d’une règle, puis entraîne-toi.',
};
const TREND_TEXT_MEMORY: Record<Trend, string> = {
  none: TREND_TEXT.none,
  up: TREND_TEXT.up,
  flat: 'Tu es régulier. Pour retenir plus, fais une petite pause d’une seconde avant de répondre.',
  down: 'Un peu moins bien ces derniers temps. Respire, regarde toute la suite, puis refais-la dans ta tête.',
};

const GAME_NAME: Record<Kind, string> = { math: 'calculs', spelling: 'phrases', memory: 'manches', lexique: 'manches' };
const TREND_TEXT_LEXIQUE: Record<Trend, string> = {
  none: TREND_TEXT.none,
  up: TREND_TEXT.up,
  flat: 'Tu es régulier. Relis la liste « Mots à revoir » : les relations ratées reviendront plus facilement.',
  down: 'Un peu moins bien ces derniers temps. Lis bien la consigne avant de taper.',
};

export function GameProgress({ game, onTrain, extra }: { game: Kind; onTrain?: (rule: RuleId) => void; extra?: ReactNode }) {
  const [log, setLog] = useState<GameLog[]>(() => loadLog(game));
  const [store, setStore] = useState(loadStore);
  const family = FAMILY[game];
  const sum = summarize(log);
  const last = log.slice(-10);
  const rules = family ? focusRules(store, family).filter((r) => r.status !== 'neuve') : [];
  const todo = rules.filter((r) => r.status === 'a-revoir' || r.status === 'isolee');
  const open = rules.filter((r) => r.status !== 'acquise');
  const done = rules.filter((r) => r.status === 'acquise');
  const maxSpan = Math.max(1, ...last.map((e) => e.span ?? 0));

  if (log.length === 0 && rules.length === 0) {
    return (
      <div className="prog">
        <p className="text-[16px] leading-snug">Pas encore de partie. Joue un peu : tes progrès apparaîtront ici.</p>
        {extra}
      </div>
    );
  }

  return (
    <div className="prog">
      <dl className="prog-tiles">
        <div>
          <dt>Parties</dt>
          <dd>{sum.games}</dd>
        </div>
        <div>
          <dt>Meilleur score</dt>
          <dd>{sum.best.toLocaleString('fr-FR')}</dd>
        </div>
        <div>
          <dt>Réussite récente</dt>
          <dd>{sum.recent}&nbsp;%</dd>
        </div>
      </dl>
      <p className="prog-trend" role="status">
        <span aria-hidden="true">{sum.trend === 'up' ? '↗' : sum.trend === 'down' ? '↘' : '→'}</span> {(game === 'memory' ? TREND_TEXT_MEMORY : game === 'lexique' ? TREND_TEXT_LEXIQUE : TREND_TEXT)[sum.trend]}
      </p>

      {last.length > 0 && (
        <figure className="prog-chart">
          <figcaption className="subhead">{game === 'memory' ? 'Suite la plus longue, par partie' : `Réussite des ${GAME_NAME[game]}, par partie`}</figcaption>
          <ol className="prog-bars" aria-label={game === 'memory' ? 'Longueur de la plus longue suite pour chacune de tes dernières parties' : 'Pourcentage de réussite pour chacune de tes dernières parties'}>
            {last.map((e, i) => {
              const v = game === 'memory' ? (e.span ?? 0) : accuracyOf(e);
              const h = game === 'memory' ? (v / maxSpan) * 100 : v;
              return (
                <li key={`${e.t}-${i}`} aria-label={`Partie ${i + 1} : ${v}${game === 'memory' ? '' : ' %'}`}>
                  <span className="prog-bar" style={{ height: `${Math.max(6, h)}%` }} />
                  <span className="prog-val" aria-hidden="true">
                    {v}
                  </span>
                </li>
              );
            })}
          </ol>
        </figure>
      )}

      {extra}

      {family && (
        <section aria-labelledby={`prog-rules-${game}`} className="prog-rules">
          <h3 id={`prog-rules-${game}`} className="subhead">
            {todo.length > 0 ? 'À travailler en priorité' : 'Tes règles'}
          </h3>
          {open.length === 0 ? (
            <p className="text-[15px] leading-snug">Aucune erreur répétée : bravo ! Les règles à revoir apparaîtront ici.</p>
          ) : (
            <ul className="prog-list">
              {open.map((r) => {
                const info = ruleInfo(r.id);
                const b = BADGE[r.status];
                const train = !!onTrain;
                return (
                  <li key={r.id} className="prog-rule" data-status={r.status}>
                    <div className="prog-rule-head">
                      <strong>{info.name}</strong>
                      <span className="prog-badge">
                        <span aria-hidden="true">{b.sym}</span> {b.text}
                      </span>
                    </div>
                    <p className="prog-parade">
                      {r.recent > 0 ? `${r.recent} faute${r.recent > 1 ? 's' : ''} sur tes dernières parties. ` : ''}
                      <em>{info.parade}</em>
                    </p>
                    {train && (
                      <button type="button" className="btn btn-ghost prog-train" onClick={() => onTrain(r.id)}>
                        S’entraîner (3 questions)
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {done.length > 0 && (
            <p className="prog-done">
              <span aria-hidden="true">✓</span> <strong>Acquises&nbsp;:</strong> {done.map((r) => ruleInfo(r.id).name).join(' · ')}
            </p>
          )}
        </section>
      )}

      <ConfirmButton
        className="btn btn-ghost mt-3"
        confirm="Sûr ? Les scores restent."
        onConfirm={() => {
          clearLog(game);
          if (family) clearRules(family);
          setLog([]);
          setStore(loadStore());
        }}
      >
        Effacer mes progrès
      </ConfirmButton>
    </div>
  );
}
