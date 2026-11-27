import { useEffect, useState } from 'react';
import { Dialog } from '../../components/Dialog';
import { BackButton, useFitRows } from '../../components/BackButton';
import { memBoard, PAGES } from '../../game/memory/rounds';
import type { Mode } from '../../game/memory/rounds';
import { loadMemoryScores } from '../../game/memory/scores';
import type { StudentAccount } from '../../server/types';
import type { Cloud, Run } from './types';
import { diffLabel, fmt, modeLabel, spanLabel } from './helpers';
import { Board, LocalTable } from './Tables';

// ───────────────────────── Fin de partie ─────────────────────────

/** Petites stratégies de mémorisation (regroupement, image mentale, répétition) : on en montre une après chaque partie. */
export const TIPS: Record<Mode, string[]> = {
  suite: [
    'invente un petit chemin ou un dessin avec les taches (un zigzag, un L, un escalier…).',
    'répète la suite dans ta tête, ou à voix basse, pendant que tu regardes.',
    'regroupe les taches par 2 ou par 3, comme on retient un numéro de téléphone.',
    'la suite garde toujours le même début : ne l’oublie pas, il revient à chaque manche.',
    'écoute les notes de musique : chaque case a la sienne.',
  ],
  cases: [
    'repère des formes (une ligne, un coin, un triangle) plutôt que des taches une par une.',
    'balaie la grille par rangées, de gauche à droite, comme pour lire.',
    'respire et ne te précipite pas : tu as le temps de regarder.',
    'retiens d’abord les taches des coins, elles servent de repères.',
  ],
};
export const tipFor = (m: Mode, k: number) => TIPS[m][Math.abs(k) % TIPS[m].length];

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
  const scores = loadMemoryScores(memBoard(r.mode, r.diff));
  const total = r.correct + r.wrong;
  const title = r.won ? 'Cahier terminé !' : run.record ? 'Nouveau record !' : 'Plus de vies, bien essayé !';

  return (
    <div className="overlay">
      <Dialog className="card card-game card-cover w-full max-w-[600px]" labelledBy="over-title">
        <div className="card-top">
          <BackButton onClick={onHome} />
          <span className="subhead">
            {modeLabel(r.mode)} · {diffLabel(r.diff)}
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
              <div className="pb-2 text-[14px] uppercase tracking-[0.12em] text-ink/65">
                points{run.rank > 0 ? ` · n° ${run.rank}` : ''} · {r.mode === 'suite' ? 'palier' : 'page'} {r.page}/{PAGES}
              </div>
            </div>
            <dl className="mt-2 grid grid-cols-3 border-2 border-ink">
              {[
                ['Manches', `${r.correct}${total ? ` / ${total}` : ''}`],
                [spanLabel(r.mode), String(r.maxSpan)],
                ['Meilleure série', String(r.bestStreak)],
              ].map(([k, v], i) => (
                <div key={k} className={`px-2 py-2 text-center ${i > 0 ? 'border-l-2 border-ink' : ''}`}>
                  <dt className="text-[14px] uppercase tracking-[0.08em] text-ink/65">{k}</dt>
                  <dd className="font-display text-[20px] leading-tight">{v}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-2 text-[15px] text-ink/75">
              {r.maxSpan === 0
                ? 'Pas de panique : regarde bien, respire, et réessaie\u00a0!'
                : r.mode === 'suite'
                  ? `Tu as retenu une suite de ${r.maxSpan} taches.`
                  : `Tu as retrouvé jusqu’à ${r.maxSpan} taches sur la grille.`}
            </p>
            {run.stampsAfter > run.stampsBefore ? (
              <p className="mt-1 text-[15px] font-bold text-ink">
                Nouveau tampon&nbsp;! {Array.from({ length: PAGES }, (_, k) => (k < run.stampsAfter ? '●' : '○')).join(' ')}
              </p>
            ) : (
              run.prevSpan > 0 &&
              r.maxSpan > run.prevSpan && (
                <p className="mt-1 text-[15px] font-bold text-ink">+{r.maxSpan - run.prevSpan} par rapport à ta dernière partie&nbsp;!</p>
              )
            )}
            {!r.won && (
              <p className="tip-opt mt-1 text-[14px] leading-snug text-ink/70">
                <strong>Astuce&nbsp;:</strong> {tipFor(r.mode, r.score + r.correct)}
              </p>
            )}
          </>
        ) : (
          <div className="mt-2">
            <LocalTable scores={scores} limit={rows} highlightId={run.id} mode={r.mode} />
            {account && <Board account={account} board={memBoard(r.mode, r.diff)} refreshKey={cloud} />}
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
