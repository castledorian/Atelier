import { useEffect, useState } from 'react';
import { BackButton, useFitRows } from '../../components/BackButton';
import { Dialog } from '../../components/Dialog';
import { lexBoard } from '../../game/lexique/rounds';
import { loadLexScores } from '../../game/lexique/scores';
import { morphText } from '../../game/lexique/data';
import type { StudentAccount } from '../../server/types';
import type { Cloud, Run } from './types';
import { boardRel, diffLabel, fmt, relLabel } from './helpers';
import { Board, LocalTable } from './Tables';

// ───────────────────────── Fin de partie ─────────────────────────

export interface OverProps {
  run: Run;
  account: StudentAccount | null;
  cloud: Cloud;
  onRestart: () => void;
  onMenu: () => void;
  onHome: () => void;
}

export function OverScreen({ run, account, cloud, onRestart, onMenu, onHome }: OverProps) {
  const r = run.result;
  const [tab, setTab] = useState<'bilan' | 'classement'>('bilan');
  const [armed, setArmed] = useState(false);
  const rows = useFitRows(430, 30, 3, 8);
  useEffect(() => {
    const t = window.setTimeout(() => setArmed(true), 550);
    return () => window.clearTimeout(t);
  }, []);
  const board = lexBoard(r.rel, r.diff);
  const scores = loadLexScores(board);
  const total = r.correct + r.wrong;
  const title = run.record ? 'Nouveau record !' : 'Plus de vies, bien joué !';

  return (
    <div className="overlay">
      <Dialog className="card card-game card-cover w-full max-w-[600px]" labelledBy="over-title">
        <div className="card-top">
          <BackButton onClick={onHome} />
          <span className="subhead">
            {relLabel(boardRel(board))} · {diffLabel(r.diff)}
          </span>
        </div>
        <h2 id="over-title" className="title-sm">
          {title}
        </h2>
        <div className="rule" aria-hidden="true" />
        <div className="seg mt-2" role="tablist" aria-label="Affichage">
          <button type="button" role="tab" aria-selected={tab === 'bilan'} className="seg-b" onClick={() => setTab('bilan')}>
            Bilan
          </button>
          <button type="button" role="tab" aria-selected={tab === 'classement'} className="seg-b" onClick={() => setTab('classement')}>
            Classement
          </button>
        </div>

        {tab === 'bilan' ? (
          <>
            <div className="mt-2 flex items-end gap-3">
              <div className="score-big" aria-label={`Score : ${r.score}`}>
                {fmt(r.score)}
              </div>
              <div className="pb-2 text-[14px] uppercase tracking-[0.12em] text-ink/65">points{run.rank > 0 ? ` · n° ${run.rank}` : ''}</div>
            </div>
            <dl className="mt-2 grid grid-cols-3 border-2 border-ink">
              {[
                ['Manches', `${r.correct}${total ? ` / ${total}` : ''}`],
                ['Meilleure série', String(r.bestStreak)],
                ['Vies perdues', String(r.wrong)],
              ].map(([k, v], i) => (
                <div key={k} className={`px-2 py-2 text-center ${i > 0 ? 'border-l-2 border-ink' : ''}`}>
                  <dt className="text-[14px] uppercase tracking-[0.08em] text-ink/65">{k}</dt>
                  <dd className="font-display text-[20px] leading-tight">{v}</dd>
                </div>
              ))}
            </dl>
            {r.missed.length > 0 ? (
              <div className="mt-2">
                <h3 className="subhead">À retenir</h3>
                <ul className="mt-1 grid gap-1 text-[15px] leading-snug">
                  {r.missed.slice(0, 4).map((m) => (
                    <li key={`${m.prompt}-${m.center}`}>
                      {m.prompt.toLowerCase()} « {m.center} » : <strong>{m.answer}</strong>
                      {m.morph ? <span className="text-ink/70"> ({morphText(m.morph)})</span> : null}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="mt-2 text-[15px] text-ink/75">{r.correct > 0 ? 'Aucune manche ratée avant la fin : bravo !' : 'Pas de panique : lis bien la consigne, puis réessaie !'}</p>
            )}
          </>
        ) : (
          <div className="mt-2">
            <LocalTable scores={scores} limit={rows} highlightId={run.id} />
            {account && <Board account={account} board={board} refreshKey={cloud} />}
          </div>
        )}

        {account && (
          <p className="mt-2 text-[14px] text-ink/75" aria-live="polite">
            {cloud === 'sending' && 'Envoi du score à la classe…'}
            {cloud === 'sent' && 'Score envoyé à la classe ✓'}
            {cloud === 'queued' && 'Pas de réseau : ton score est gardé et sera envoyé plus tard.'}
          </p>
        )}

        <div className="mt-[var(--sp)] flex flex-wrap gap-3">
          <button type="button" className="btn btn-primary" autoFocus disabled={!armed} onClick={onRestart}>
            Rejouer
          </button>
          <button type="button" className="btn btn-ghost" onClick={onMenu}>
            Menu du jeu
          </button>
        </div>
      </Dialog>
    </div>
  );
}
