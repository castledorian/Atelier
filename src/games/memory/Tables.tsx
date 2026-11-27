import { useEffect, useState } from 'react';
import type { MemBoard, Mode } from '../../game/memory/rounds';
import type { MemoryScore } from '../../game/memory/scores';
import { explain } from '../../server/api';
import { fetchBoard } from '../../server/student';
import type { BoardRow, Scope, StudentAccount } from '../../server/types';
import { boardMode, fmt, spanLabel } from './helpers';

// ───────────────────────── Tableaux ─────────────────────────

export function LocalTable({ scores, limit, highlightId, mode }: { scores: MemoryScore[]; limit: number; highlightId?: string; mode: Mode }) {
  if (scores.length === 0) return <p className="text-[15px] leading-snug text-ink/75">Aucun score pour l’instant : la première ligne est à toi.</p>;
  const rows = scores.map((s, i) => ({ s, rank: i + 1 }));
  const mine = highlightId ? rows.findIndex((r) => r.s.id === highlightId) : -1;
  const shown = mine >= limit ? [...rows.slice(0, limit - 1), rows[mine]] : rows.slice(0, limit);
  return (
    <table className="scores">
      <caption className="sr-only">Meilleurs scores sur cet appareil</caption>
      <thead>
        <tr>
          <th scope="col">#</th>
          <th scope="col">Prénom</th>
          <th scope="col" className="num">
            Score
          </th>
          <th scope="col" className="num">
            {spanLabel(mode)}
          </th>
        </tr>
      </thead>
      <tbody>
        {shown.map(({ s, rank }) => (
          <tr key={s.id} className={s.id === highlightId ? 'me' : undefined}>
            <td>{rank}.</td>
            <td>{s.name}</td>
            <td className="num font-bold">{fmt(s.score)}</td>
            <td className="num">{s.span}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function Board({ account, board, refreshKey }: { account: StudentAccount; board: MemBoard; refreshKey: string }) {
  const mode = boardMode(board);
  const [scope, setScope] = useState<Scope>('class');
  const [rows, setRows] = useState<BoardRow[] | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    if (refreshKey === 'sending') return;
    let alive = true;
    setRows(null);
    setErr('');
    fetchBoard(account.token, 'memory', board, scope, 5)
      .then((r) => alive && setRows(r))
      .catch((e) => alive && setErr(explain(e)));
    return () => {
      alive = false;
    };
  }, [account.token, board, scope, refreshKey]);
  return (
    <div className="mt-3">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 className="subhead">{scope === 'class' ? 'Ma classe' : 'Mon école'}</h3>
        <div className="seg" role="tablist" aria-label="Classement">
          <button type="button" role="tab" aria-selected={scope === 'class'} className="seg-b" onClick={() => setScope('class')}>
            Classe
          </button>
          <button type="button" role="tab" aria-selected={scope === 'school'} className="seg-b" onClick={() => setScope('school')}>
            École
          </button>
        </div>
      </div>
      {err ? (
        <p className="text-[15px] text-ink/75">{err}</p>
      ) : rows === null ? (
        <p className="text-[15px] text-ink/75">Chargement du classement…</p>
      ) : rows.length === 0 ? (
        <p className="text-[15px] text-ink/75">Personne n’a encore joué ce mode.</p>
      ) : (
        <table className="scores">
          <caption className="sr-only">Classement</caption>
          <thead>
            <tr>
              <th scope="col">#</th>
              <th scope="col">Prénom</th>
              <th scope="col" className="num">
                Score
              </th>
              <th scope="col" className="num">
                {spanLabel(mode)}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.rank + r.name} className={r.is_me ? 'me' : undefined}>
                <td>{r.rank}.</td>
                <td>{r.name}</td>
                <td className="num">{fmt(r.score)}</td>
                <td className="num">{r.wave}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
