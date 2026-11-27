import { ConfirmButton } from '../../components/ConfirmButton';
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { BackButton } from '../../components/BackButton';
import { useFit } from '../../components/FitCard';
import { GameProgress } from '../../components/GameProgress';
import { MEM_DIFFS, memBoard, MODES, PAGES } from '../../game/memory/rounds';
import type { MemDiff, Mode } from '../../game/memory/rounds';
import { clearMemoryScores, loadMemoryScores, loadProgress } from '../../game/memory/scores';
import type { MemoryScore } from '../../game/memory/scores';
import { gradeLabel } from '../../game/grade';
import type { Grade } from '../../game/grade';
import type { Settings } from '../../game/storage';
import type { StudentAccount } from '../../server/types';
import type { MenuView } from './types';
import { fmt } from './helpers';
import { SettingsRow } from '../../components/MenuParts';
import { Board, LocalTable } from './Tables';

// ───────────────────────── Menu ─────────────────────────

export interface MenuProps {
  view: MenuView;
  setView: (v: MenuView) => void;
  grade: Grade;
  mode: Mode;
  setMode: (m: Mode) => void;
  diff: MemDiff;
  setDiff: (d: MemDiff) => void;
  settings: Settings;
  account: StudentAccount | null;
  onChange: (p: Partial<Settings>) => void;
  onStart: (m: Mode) => void;
  startPage: number;
  setStartPage: (p: number) => void;
  onHome: () => void;
}

export function MenuScreen({ view, setView, grade, mode, setMode, diff, setDiff, settings, account, onChange, onStart, startPage, setStartPage, onHome }: MenuProps) {
  const fit = useFit<HTMLElement>(view);
  const [sMode, setSMode] = useState<Mode>(mode);
  const [sDiff, setSDiff] = useState<MemDiff>(diff);
  const sBoard = memBoard(sMode, sDiff);
  const [scores, setScores] = useState<MemoryScore[]>(() => loadMemoryScores(sBoard));
  useEffect(() => {
    setScores(loadMemoryScores(sBoard));
  }, [sBoard, view]);
  const board = memBoard(mode, diff);

  if (view !== 'main') {
    const titles = { howto: 'Comment jouer', scores: 'Scores', progress: 'Mes progrès', settings: 'Réglages' } as const;
    let body: ReactNode = null;
    if (view === 'howto') {
      body = (
        <ul className="howto-list">
          <li className="howto">
            <kbd className="kbd">👁</kbd>
            <span>
              <strong>La Suite</strong>&nbsp;: refais la suite des taches, qui s’allonge d’une tache à chaque réussite. <strong>Les Cases</strong>&nbsp;: retrouve leurs places.
            </span>
          </li>
          <li className="howto">
            <kbd className="kbd">♥</kbd>
            <span>Une erreur coûte une vie (5 en Apprenti, 3 sinon). Une page sans erreur en rend une&nbsp;!</span>
          </li>
          <li className="howto howto-opt">
            <kbd className="kbd kbd-sym">← ↑ ↓ →</kbd>
            <span>Au clavier&nbsp;: flèches et Entrée (chiffres 1 à 9 pour La Suite).</span>
          </li>
          <li className="howto howto-opt">
            <kbd className="kbd">Échap</kbd>
            <span>Pause (ou bouton en haut à droite).</span>
          </li>
        </ul>
      );
    } else if (view === 'scores') {
      body = (
        <>
          <div className="seg mb-2" role="tablist" aria-label="Mode">
            {MODES.map((m) => (
              <button key={m.id} type="button" role="tab" aria-selected={sMode === m.id} className="seg-b" onClick={() => setSMode(m.id)}>
                {m.label}
              </button>
            ))}
          </div>
          <div className="seg mb-2" role="tablist" aria-label="Difficulté">
            {MEM_DIFFS.map((d) => (
              <button key={d.id} type="button" role="tab" aria-selected={sDiff === d.id} className="seg-b" onClick={() => setSDiff(d.id)}>
                {d.label}
              </button>
            ))}
          </div>
          <LocalTable scores={scores} limit={6} mode={sMode} />
          {account && <Board account={account} board={sBoard} refreshKey="menu" />}
          {scores.length > 0 && (
            <ConfirmButton className="btn btn-ghost mt-3" confirm="Sûr ?" onConfirm={() => setScores(clearMemoryScores(sBoard))}>
              Effacer les scores
            </ConfirmButton>
          )}
        </>
      );
    } else if (view === 'progress') {
      body = (
        <GameProgress
          game="memory"
          extra={
            <section aria-labelledby="prog-pages" className="prog-rules">
              <h3 id="prog-pages" className="subhead">
                Tes pages du cahier ({MEM_DIFFS.find((d) => d.id === diff)?.label})
              </h3>
              <ul className="prog-list">
                {MODES.map((m) => {
                  const pr = loadProgress(memBoard(m.id, diff));
                  return (
                    <li key={m.id} className="prog-rule" data-status={pr.stamps >= PAGES ? 'acquise' : 'progres'}>
                      <div className="prog-rule-head">
                        <strong>{m.label}</strong>
                        <span className="prog-badge" role="img" aria-label={`Tampons : ${pr.stamps} sur ${PAGES}`}>
                          {Array.from({ length: PAGES }, (_, k) => (k < pr.stamps ? '●' : '○')).join(' ')}
                        </span>
                      </div>
                      <p className="prog-parade">
                        {pr.lastSpan > 0 ? `Dernière partie : ${pr.lastSpan} ${m.id === 'suite' ? 'taches de suite' : 'cases retenues'}. ` : 'Pas encore joué. '}
                        <em>{pr.stamps >= PAGES ? 'Cahier complet : essaie un niveau plus dur !' : 'Chaque page sans erreur te donne un tampon.'}</em>
                      </p>
                    </li>
                  );
                })}
              </ul>
            </section>
          }
        />
      );
    } else {
      body = <SettingsRow settings={settings} onChange={onChange} shake />;
    }
    return (
      <div className="overlay">
        <section ref={fit} className="card card-game w-full max-w-[600px]" aria-labelledby="sub-title">
          <div className="card-top">
            <BackButton label="Retour" onClick={() => setView('main')} autoFocus />
          </div>
          <h2 id="sub-title" className="title-sm">
            {titles[view]}
          </h2>
          <div className="rule" aria-hidden="true" />
          <div className="sub-body">{body}</div>
        </section>
      </div>
    );
  }

  return (
    <div className="overlay">
      <section ref={fit} className="card card-game card-menu card-compact w-full max-w-[600px]" aria-labelledby="game-title">
        <div className="menu-a">
          <div className="card-top">
            <BackButton onClick={onHome} />
          </div>
          <p className="eyebrow">Mémoire · {gradeLabel(grade)}</p>
          <h1 id="game-title" className="title title-2l" aria-label="Mémoire d’encre">
            <span className="tl" aria-hidden="true">
              {'MÉMOIRE'.split('').map((ch, i) => (
                <span key={i} style={{ animationDelay: `${80 + i * 70}ms` }}>
                  {ch}
                </span>
              ))}
            </span>{' '}
            <span className="tl" aria-hidden="true">
              <span className="text-ribbon" style={{ animationDelay: '600ms' }}>
                D’
              </span>
              {'ENCRE'.split('').map((ch, i) => (
                <span key={i} style={{ animationDelay: `${670 + i * 70}ms` }}>
                  {ch}
                </span>
              ))}
            </span>
          </h1>
          <div className="rule" aria-hidden="true" />
          <p className="tagline menu-opt">Retiens ce que l’encre te montre, puis refais-le&nbsp;!</p>
          <div className="tools" data-n="4" role="group" aria-label="Plus d’options">
            <button type="button" className="tool" onClick={() => setView('howto')}>
              <span aria-hidden="true">?</span> Comment jouer
            </button>
            <button type="button" className="tool" onClick={() => setView('scores')}>
              <span aria-hidden="true">★</span> Scores
            </button>
            <button type="button" className="tool" onClick={() => setView('progress')}>
              <span aria-hidden="true">↗</span> Mes progrès
            </button>
            <button type="button" className="tool" onClick={() => setView('settings')}>
              <span aria-hidden="true">⚙</span> Réglages
            </button>
          </div>
        </div>
        <div className="menu-b">
          {account ? (
            <p className="text-[15px] leading-snug">
              <span className="subhead">Joueur</span>&nbsp; <strong>{account.student.name}</strong>
              <span className="text-ink/70"> · {account.class.name}</span>
            </p>
          ) : (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <label className="subhead" htmlFor="player-name">
                Prénom
              </label>
              <input
                id="player-name"
                className="field"
                value={settings.name}
                maxLength={12}
                size={12}
                placeholder="TON PRÉNOM"
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                enterKeyHint="done"
                onChange={(e) => onChange({ name: e.target.value.toUpperCase() })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === 'Escape') {
                    e.preventDefault();
                    e.currentTarget.blur();
                  }
                }}
              />
            </div>
          )}
          <h2 className="subhead mt-[var(--sp)]">Ta difficulté</h2>
          <div className="seg mt-1" role="radiogroup" aria-label="Difficulté">
            {MEM_DIFFS.map((d) => (
              <button key={d.id} type="button" role="radio" aria-checked={diff === d.id} className="seg-b" onClick={() => setDiff(d.id)}>
                {d.label}
              </button>
            ))}
          </div>
          <p className="menu-hint mt-1 text-[14px] leading-snug text-ink/75">{MEM_DIFFS.find((d) => d.id === diff)?.hint}</p>
          <h2 className="subhead mt-[var(--sp)]">Choisis ton jeu</h2>
          <div className="games games-levels" data-n="2">
            {MODES.map((m) => {
              const best = loadMemoryScores(memBoard(m.id, diff))[0]?.score;
              const stamps = loadProgress(memBoard(m.id, diff)).stamps;
              return (
                <button
                  key={m.id}
                  type="button"
                  className="gcard"
                  autoFocus={m.id === mode}
                  onFocus={() => setMode(m.id)}
                  onClick={() => onStart(m.id)}
                >
                  <span className="gcard-name">{m.label}</span>
                  <span className="gcard-text">{m.hint}</span>
                  <span className="gcard-stamps menu-opt" role="img" aria-label={`Tampons : ${stamps} sur ${PAGES}`}>
                    {Array.from({ length: PAGES }, (_, k) => (k < stamps ? '●' : '○')).join(' ')}
                  </span>
                  <span className="gcard-go">{best ? `Record : ${fmt(best)}` : 'Jouer →'}</span>
                </button>
              );
            })}
          </div>
          {loadProgress(board).stamps > 0 && (
            <div className="menu-opt mt-2 flex flex-wrap items-center gap-2" role="group" aria-label="Page de départ">
              <span className="subhead">Départ</span>
              <div className="seg">
                {Array.from({ length: Math.min(PAGES, loadProgress(board).stamps + 1) }, (_, k) => (
                  <button
                    key={k}
                    type="button"
                    className="seg-b"
                    aria-pressed={Math.min(startPage, loadProgress(board).stamps) === k}
                    onClick={() => setStartPage(k)}
                  >
                    {k === 0 ? 'Début' : `Page ${k + 1}`}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
