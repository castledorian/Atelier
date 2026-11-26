import { useMemo, useState } from 'react';
import { diffName, gameName, levelName, TOLERANCE } from '../../game/balanceView';
import { ACTION_LABEL, MIN_PLAYERS, countByAction, exerciseAdvice } from '../../game/exerciseAdvice';
import type { Action, ExerciseAdvice } from '../../game/exerciseAdvice';
import { CONFIDENCE_LABEL, confidenceOf } from '../../game/reliability';
import { Card, Pill, RangeBar } from '../../components/ui';
import { Tip } from '../../components/Tip';
import type { Tone } from '../../components/ui';
import type { AdminItems, ItemSpreadRow } from '../../server/admin';

const ACTION_TONE: Record<Action, Tone> = { diminuer: 'bad', equilibrer: 'warn', ameliorer: 'info', garder: 'good', attendre: 'mute' };
const FILTERS: Array<[Action | 'todo', string]> = [
  ['todo', 'À traiter'],
  ['diminuer', 'À diminuer'],
  ['equilibrer', 'À équilibrer'],
  ['ameliorer', 'À améliorer'],
  ['garder', 'Bien réglés'],
  ['attendre', 'Trop tôt'],
];

/**
 * Chaque famille d'exercices et chaque exercice précis reçoit une action : diminuer (trop difficile), équilibrer (trop facile),
 * améliorer (le contenu est en cause) ou garder. Les chiffres sont toujours donnés avec leur marge d'incertitude à 95 % :
 * sur peu de manches, on préfère « trop tôt pour juger » à une fausse certitude.
 */
export function ExercisePanel({ rules, items, spread = null }: { rules: AdminItems['rules']; items: AdminItems['items']; spread?: ItemSpreadRow[] | null }) {
  const all = useMemo(() => exerciseAdvice(rules, items, spread), [rules, items, spread]);
  const counts = useMemo(() => countByAction(all), [all]);
  const [filter, setFilter] = useState<Action | 'todo'>('todo');
  const [gameF, setGameF] = useState('all');
  const [more, setMore] = useState(false);
  const shown = all.filter((a) => (filter === 'todo' ? a.action === 'diminuer' || a.action === 'equilibrer' || a.action === 'ameliorer' : a.action === filter) && (gameF === 'all' || a.game === gameF));
  const list = more ? shown : shown.slice(0, 10);
  const games: string[] = [...new Set<string>(all.map((a) => a.game))];
  return (
    <Card
      className="mt-4"
      title="À régler : exercice par exercice"
      note={`Chaque famille de calculs, règle ou mot est comparée à l’objectif de son niveau. Une conclusion n’est tirée que si toute la marge d’incertitude (95 %) est du même côté de l’objectif, et jamais avec moins de ${MIN_PLAYERS} élèves différents. La marge est élargie quand les résultats varient beaucoup d’un élève à l’autre. Barre : zone hachurée = objectif, trait noir = marge, trait rouge = valeur mesurée.`}
    >
      {all.length === 0 ? (
        <p className="u-empty">Pas encore de données : elles viennent des parties libres d’élèves connectés.</p>
      ) : (
        <>
          <div className="u-chips" role="radiogroup" aria-label="Filtrer les conseils">
            {FILTERS.map(([k, label]) => {
              const n = k === 'todo' ? counts.diminuer + counts.equilibrer + counts.ameliorer : counts[k];
              return (
                <button key={k} type="button" role="radio" aria-checked={filter === k} className="u-chip" onClick={() => { setFilter(k); setMore(false); }}>
                  {label} <span className="u-chip-n">{n}</span>
                </button>
              );
            })}
            <select className="field u-chip-select" aria-label="Jeu" value={gameF} onChange={(e) => { setGameF(e.target.value); setMore(false); }}>
              <option value="all">Tous les jeux</option>
              {games.map((g) => (
                <option key={g} value={g}>
                  {gameName(g)}
                </option>
              ))}
            </select>
          </div>
          {list.length === 0 ? (
            <p className="u-empty">Rien dans cette catégorie.</p>
          ) : (
            <ul className="u-advice">
              {list.map((a) => (
                <AdviceCard key={`${a.game}-${a.level}-${a.difficulty}-${a.kind}-${a.id}`} a={a} />
              ))}
            </ul>
          )}
          {shown.length > 10 && (
            <button type="button" className="link" onClick={() => setMore((m) => !m)}>
              {more ? 'Voir moins' : `Voir les ${shown.length - 10} autres`}
            </button>
          )}
        </>
      )}
    </Card>
  );
}

function AdviceCard({ a }: { a: ExerciseAdvice }) {
  const conf = confidenceOf(a.shown / Math.max(1, a.deff));
  const who = a.players === null ? 'élèves : pas encore comptés' : `${a.players} élève${a.players > 1 ? 's' : ''}`;
  return (
    <li className="u-advice-item">
      <div className="u-advice-top">
        <Pill tone={ACTION_TONE[a.action]}>{ACTION_LABEL[a.action]}</Pill>
        <span className="u-dim">
          {a.kind === 'famille' ? 'Famille' : 'Exercice'} · {gameName(a.game)} · {levelName(a.level)} · {diffName(a.difficulty)}
        </span>
      </div>
      <p className="u-advice-reason">{a.reason}</p>
      {a.kind === 'famille' && a.interval && a.target !== null && (
        <RangeBar p={a.interval.p} lo={a.interval.lo} hi={a.interval.hi} target={a.target} tolerance={TOLERANCE} label={a.label} />
      )}
      <p className="u-advice-todo">
        <strong>À faire :</strong> {a.todo} <span className="u-dim">
          · {CONFIDENCE_LABEL[conf]} ({a.shown} manches, {who})
        </span>
        {a.deff > 1.05 && (
          <Tip label="Pourquoi cette marge ?">
            Les résultats varient d’un élève à l’autre : ces {a.shown} manches valent environ {Math.round(a.shown / a.deff)} réponses indépendantes. La marge en tient compte.
          </Tip>
        )}
      </p>
    </li>
  );
}
