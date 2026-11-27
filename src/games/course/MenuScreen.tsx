import { ConfirmButton } from '../../components/ConfirmButton';
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { BackButton } from '../../components/BackButton';
import { useFit } from '../../components/FitCard';
import { GameProgress } from '../../components/GameProgress';
import type { RuleId } from '../../game/encre/rules';
import { boardKey, COURSE_DIFFS } from '../../game/course/questions';
import type { CourseDiff, Level } from '../../game/course/questions';
import { clearCourseScores, loadCourseScores } from '../../game/course/scores';
import type { CourseScore } from '../../game/course/scores';
import type { Settings } from '../../game/storage';
import type { StudentAccount } from '../../server/types';
import type { MenuView } from './types';
import { fmt, levelLabel } from './helpers';
import { SettingsRow } from './SettingsRow';
import { Board, LocalTable } from './Tables';

// ───────────────────────── Menu ─────────────────────────

export interface MenuProps {
  view: MenuView;
  setView: (v: MenuView) => void;
  level: Level;
  setLevel: (l: Level) => void;
  diff: CourseDiff;
  setDiff: (d: CourseDiff) => void;
  settings: Settings;
  account: StudentAccount | null;
  onChange: (p: Partial<Settings>) => void;
  onStart: (l: Level) => void;
  onTrain: (rule: RuleId) => void;
  onHome: () => void;
}

export function MenuScreen({ view, setView, level, diff, setDiff, settings, account, onChange, onStart, onTrain, onHome }: MenuProps) {
  const fit = useFit<HTMLElement>(view);
  const [scores, setScores] = useState<CourseScore[]>(() => loadCourseScores(boardKey(level, diff)));
  useEffect(() => {
    setScores(loadCourseScores(boardKey(level, diff)));
  }, [level, diff, view]);

  if (view !== 'main') {
    const titles = { howto: 'Comment jouer', scores: 'Scores', progress: 'Mes progrès', settings: 'Réglages' } as const;
    let body: ReactNode = null;
    if (view === 'howto') {
      body = (
        <ul className="howto-list">
          <li className="howto">
            <kbd className="kbd kbd-sym">← →</kbd>
            <span>Place la plume sous la bonne réponse (flèches, 1 2 3, ou touche une colonne).</span>
          </li>
          <li className="howto">
            <kbd className="kbd">↵</kbd>
            <span>Entrée, ↑ ou glisser vers le haut&nbsp;: l’étiquette tombe tout de suite.</span>
          </li>
          <li className="howto">
            <kbd className="kbd">✓</kbd>
            <span>6 pages de plus en plus dures. Une erreur fait monter l’encre : si elle touche la plume, c’est perdu.</span>
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
          <div className="seg mb-2" role="tablist" aria-label="Difficulté">
            {COURSE_DIFFS.map((d) => (
              <button key={d.id} type="button" role="tab" aria-selected={diff === d.id} className="seg-b" onClick={() => setDiff(d.id)}>
                {d.label}
              </button>
            ))}
          </div>
          <LocalTable scores={scores} limit={6} />
          {account && <Board account={account} level={boardKey(level, diff)} refreshKey="menu" />}
          {scores.length > 0 && (
            <ConfirmButton className="btn btn-ghost mt-3" confirm="Sûr ?" onConfirm={() => setScores(clearCourseScores(boardKey(level, diff)))}>
              Effacer les scores
            </ConfirmButton>
          )}
        </>
      );
    } else if (view === 'progress') {
      body = <GameProgress game="math" onTrain={onTrain} />;
    } else {
      body = <SettingsRow settings={settings} onChange={onChange} />;
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
          <p className="eyebrow">Calcul mental · {levelLabel(level)}</p>
          <h1 id="game-title" className="title title-2l" aria-label="Course à l’encre">
            <span className="tl" aria-hidden="true">
              {'COURSE'.split('').map((ch, i) => (
                <span key={i} style={{ animationDelay: `${80 + i * 70}ms` }}>
                  {ch}
                </span>
              ))}
            </span>{' '}
            <span className="tl" aria-hidden="true">
              <span className="text-ribbon" style={{ animationDelay: '520ms' }}>
                À
              </span>
              {'\u00a0L’ENCRE'.split('').map((ch, i) => (
                <span key={i} style={{ animationDelay: `${590 + i * 70}ms` }}>
                  {ch}
                </span>
              ))}
            </span>
          </h1>
          <div className="rule" aria-hidden="true" />
          <p className="tagline">Choisis la bonne réponse avant qu’elle ne tombe&nbsp;!</p>
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
          <h2 className="subhead mt-[var(--sp)]">Choisis ta difficulté</h2>
          <div className="seg mt-1" role="radiogroup" aria-label="Difficulté">
            {COURSE_DIFFS.map((d) => (
              <button key={d.id} type="button" role="radio" aria-checked={diff === d.id} className="seg-b" onClick={() => setDiff(d.id)}>
                {d.label}
              </button>
            ))}
          </div>
          <p className="mt-1 text-[14px] leading-snug text-ink/75">{COURSE_DIFFS.find((d) => d.id === diff)?.hint}</p>
          <div className="mt-[var(--sp)]">
            <button type="button" className="btn btn-primary" autoFocus onClick={() => onStart(level)}>
              Jouer
            </button>
            {loadCourseScores(boardKey(level, diff))[0] && (
              <span className="ml-3 text-[15px]">Record : {fmt(loadCourseScores(boardKey(level, diff))[0].score)}</span>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
