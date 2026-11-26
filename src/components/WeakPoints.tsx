import { useMemo } from 'react';
import { Bar, Card } from './ui';
import { picksText } from '../game/balanceView';
import { GAME_NAMES } from '../game/sessionConfig';
import { classWeakPoints } from '../game/studentView';

/** Une famille (rule) ou un exercice précis (item), cumulé sur plusieurs élèves. */
export interface WeakRow {
  /** absent quand tout vient du même jeu (une séance) */
  game?: string;
  kind: 'rule' | 'item';
  item: string;
  label: string;
  players: number;
  shown: number;
  wrong: number;
  /** % d'erreurs */
  err: number;
  picks: Record<string, number>;
}

const gameLabel = (g: string) => (GAME_NAMES as Record<string, string>)[g] ?? g;

/**
 * Ce qu'un groupe d'élèves rate le plus (une classe, ou une séance) : familles et exercices ratés au moins une fois sur quatre,
 * avec les mauvaises réponses les plus choisies. Rien n'est affiché s'il n'y a rien à signaler.
 */
export function WeakPoints({ rows, title, note }: { rows: readonly WeakRow[]; title: string; note: string }) {
  const { rules, items } = useMemo(() => classWeakPoints(rows), [rows]);
  if (rules.length === 0 && items.length === 0) return null;
  const list = (l: WeakRow[]) => (
    <ul className="u-rows">
      {l.map((r) => (
        <li key={`${r.game ?? ''}-${r.kind}-${r.item}`}>
          <div className="u-row-top">
            <span>
              {r.label}
              {r.game && <span className="u-dim"> · {gameLabel(r.game)}</span>}
            </span>
            <strong>{Math.round(r.err)} % d’erreurs</strong>
          </div>
          <Bar pct={r.err} tone="bad" label={`Erreurs en ${r.label}`} />
          <span className="u-dim">
            {r.players} élève{r.players > 1 ? 's' : ''} · {r.wrong} ratés sur {r.shown}
            {Object.keys(r.picks).length ? ` · souvent répondu : ${picksText(r.picks, 2)}` : ''}
          </span>
        </li>
      ))}
    </ul>
  );
  return (
    <Card title={title} note={note}>
      <div className="u-cols">
        {rules.length > 0 && (
          <div>
            <h3 className="subhead mb-2">Familles et règles</h3>
            {list(rules)}
          </div>
        )}
        {items.length > 0 && (
          <div>
            <h3 className="subhead mb-2">Calculs, mots, phrases</h3>
            {list(items)}
          </div>
        )}
      </div>
    </Card>
  );
}
