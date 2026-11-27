import { useEffect, useState } from 'react';
import { Dialog } from '../../components/Dialog';
import { BackButton, useFitRows } from '../../components/BackButton';
import { DuelResult, ReviewNote } from '../../components/EncreNotes';
import type { RuleId } from '../../game/encre/rules';
import { boardKey, COURSE_DIFFS, fmtNum, PAGES } from '../../game/course/questions';
import type { Missed } from '../../game/course/questions';
import { loadCourseScores } from '../../game/course/scores';
import type { StudentAccount } from '../../server/types';
import type { Cloud, Run } from './types';
import { fmt, levelLabel } from './helpers';
import { Board, LocalTable } from './Tables';

// ───────────────────────── Fin de partie ─────────────────────────

export interface OverProps {
  run: Run;
  account: StudentAccount | null;
  cloud: Cloud;
  onRestart: () => void;
  onDrill: (m: Missed[]) => void;
  onDuel: (rule: RuleId) => void;
  onMenu: () => void;
  onHome: () => void;
}

export function OverScreen({ run, account, cloud, onRestart, onDrill, onDuel, onMenu, onHome }: OverProps) {
  const r = run.result;
  const [tab, setTab] = useState<'bilan' | 'classement'>('bilan');
  const [armed, setArmed] = useState(false);
  const rows = useFitRows(430, 30, 3, 8);
  useEffect(() => {
    const t = window.setTimeout(() => setArmed(true), 550);
    return () => window.clearTimeout(t);
  }, []);
  const scores = loadCourseScores(boardKey(r.level, r.diff));
  const total = r.correct + r.wrong;
  const title = r.drill ? 'Bravo, bien travaillé !' : r.won ? 'Cahier terminé !' : run.record ? 'Nouveau record !' : 'Rattrapé par l’encre';
  const showMissed = r.missed.slice(0, 4);

  return (
    <div className="overlay">
      <Dialog className="card card-game card-cover w-full max-w-[600px]" labelledBy="over-title">
        <div className="card-top">
          <BackButton onClick={onHome} />
          <span className="subhead">
            {levelLabel(r.level)} · {COURSE_DIFFS.find((d) => d.id === r.diff)?.label}
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
            {!r.drill && (
              <div className="mt-2 flex items-end gap-3">
                <div className="score-big" aria-label={`Score : ${r.score}`}>
                  {fmt(r.score)}
                </div>
                <div className="pb-2 text-[14px] uppercase tracking-[0.12em] text-ink/65">
                  points{run.rank > 0 ? ` · n° ${run.rank}` : ''} · page {r.page}/{PAGES}
                </div>
              </div>
            )}
            <dl className="mt-2 grid grid-cols-3 border-2 border-ink">
              {[
                ['Justes', `${r.correct}${total ? ` / ${total}` : ''}`],
                ['Fautes', String(r.wrong)],
                ['Meilleure série', String(r.bestStreak)],
              ].map(([k, v], i) => (
                <div key={k} className={`px-2 py-2 text-center ${i > 0 ? 'border-l-2 border-ink' : ''}`}>
                  <dt className="text-[14px] uppercase tracking-[0.08em] text-ink/65">{k}</dt>
                  <dd className="font-display text-[20px] leading-tight">{v}</dd>
                </div>
              ))}
            </dl>
            {!r.drill && r.correct > 0 && (
              <p className="mt-2 text-[15px] font-bold">
                {r.correct === 1 ? '1 calcul juste' : `${r.correct} calculs justes`}
                {r.bestStreak >= 3 ? `, dont ${r.bestStreak} d’affilée` : ''}. Bien joué&nbsp;!
              </p>
            )}
            {showMissed.length > 0 ? (
              <div className="cover-missed mt-2">
                <h3 className="subhead">Pour t’entraîner</h3>
                <ul className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1 text-[15px]">
                  {showMissed.map((m) => (
                    <li key={m.text} className="num">
                      {m.text.replace('?', fmtNum(m.answer))}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="mt-2 text-[15px] text-ink/75">{r.wrong === 0 ? 'Aucune faute : parfait !' : ''}</p>
            )}
            {run.encre?.duel && <DuelResult duel={run.encre.duel} />}
            {run.encre?.top && !r.drill && <ReviewNote rule={run.encre.top} onDuel={onDuel} />}
          </>
        ) : (
          <div className="mt-2">
            <LocalTable scores={scores} limit={rows} highlightId={run.id} />
            {account && <Board account={account} level={boardKey(r.level, r.diff)} refreshKey={cloud} />}
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
          {r.missed.length > 0 && !r.drill && (
            <button type="button" className="btn btn-ghost" onClick={() => onDrill(r.missed)}>
              S’entraîner<span className="cover-long"> sur mes fautes</span> ({r.missed.length})
            </button>
          )}
          <button type="button" className="btn btn-ghost" onClick={onMenu}>
            Menu du jeu
          </button>
        </div>
      </Dialog>
    </div>
  );
}
