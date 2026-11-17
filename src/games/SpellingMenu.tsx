import { useState } from 'react';
import type { ReactNode } from 'react';
import { BackButton } from '../components/BackButton';
import { GameProgress } from '../components/GameProgress';
import { InkEnemy } from '../components/InkEnemy';
import { SettingsRow, StampTitle } from '../components/MenuParts';
import { COURSE_DIFFS, boardKey } from '../game/course/questions';
import type { CourseDiff, Level } from '../game/course/questions';
import type { RuleId } from '../game/encre/rules';
import { gradeLabel } from '../game/grade';
import { loadSpellingScores } from '../game/spelling/scores';
import type { Settings } from '../game/storage';

/**
 * Menu de « Chasse aux fautes » : même structure et mêmes animations que les autres jeux
 * (fond vivant, titre tamponné, quatre rubriques : Comment jouer, Scores, Mes progrès, Réglages).
 */

export type SpellingView = 'main' | 'howto' | 'scores' | 'progress' | 'settings';

const fmt = (n: number) => n.toLocaleString('fr-FR');

/** Fond animé du menu : des mots fautifs qui se corrigent, et trois créatures d'encre qui attendent. */
export function MenuScene() {
  const words: Array<{ bad: string; good: string; x: number; d: number }> = [
    { bad: 'sa', good: 'ça', x: 8, d: 0 },
    { bad: 'ils mange', good: 'ils mangent', x: 62, d: 1.6 },
    { bad: 'aprés', good: 'après', x: 30, d: 3.2 },
    { bad: 'a', good: 'à', x: 80, d: 4.8 },
    { bad: 'leur amis', good: 'leurs amis', x: 46, d: 6.4 },
  ];
  return (
    <div className="sp-scene" aria-hidden="true">
      {words.map((w) => (
        <span key={w.good} className="sp-word" style={{ left: `${w.x}%`, animationDelay: `${w.d}s` }}>
          <s>{w.bad}</s> <b>{w.good}</b>
        </span>
      ))}
      <div className="sp-foes">
        <span className="sp-foe sp-foe-1">
          <InkEnemy kind={0} mood="idle" name="Bavure" />
        </span>
        <span className="sp-foe sp-foe-2">
          <InkEnemy kind={4} mood="write" name="Moutardin" />
        </span>
        <span className="sp-foe sp-foe-3">
          <InkEnemy kind={2} mood="idle" name="Goutte" />
        </span>
      </div>
    </div>
  );
}

interface Props {
  view: SpellingView;
  setView: (v: SpellingView) => void;
  level: Level;
  diff: CourseDiff;
  setDiff: (d: CourseDiff) => void;
  hint: string;
  settings: Settings;
  onChange: (p: Partial<Settings>) => void;
  onStart: () => void;
  onTrain: (rule: RuleId) => void;
  onHome: () => void;
}

export function SpellingMenu({ view, setView, level, diff, setDiff, hint, settings, onChange, onStart, onTrain, onHome }: Props) {
  const [sDiff, setSDiff] = useState<CourseDiff>(diff);

  if (view !== 'main') {
    const titles = { howto: 'Comment jouer', scores: 'Scores', progress: 'Mes progrès', settings: 'Réglages' } as const;
    let body: ReactNode = null;
    if (view === 'howto') {
      body = (
        <ul className="howto-list">
          <li className="howto">
            <kbd className="kbd">👁</kbd>
            <span>Une créature d’encre écrit une phrase sous tes yeux. Elle y a caché <strong>une faute</strong>&nbsp;: trouve-la.</span>
          </li>
          <li className="howto">
            <kbd className="kbd">☝</kbd>
            <span>Touche le mot mal écrit, puis choisis (ou écris) la bonne orthographe. Ton canon tire et la phrase est corrigée.</span>
          </li>
          <li className="howto">
            <kbd className="kbd">♥</kbd>
            <span>Une erreur, et la créature t’attaque : tu perds une vie. Dix phrases, la dernière écrite par le Grand Pâté.</span>
          </li>
          <li className="howto">
            <kbd className="kbd">💡</kbd>
            <span>Chaque phrase te laisse une astuce pour retenir la règle. Les règles qui reviennent sont dans « Mes progrès ».</span>
          </li>
        </ul>
      );
    } else if (view === 'scores') {
      const list = loadSpellingScores(boardKey(level, sDiff));
      body = (
        <>
          <div className="seg mb-2" role="tablist" aria-label="Difficulté">
            {COURSE_DIFFS.map((d) => (
              <button key={d.id} type="button" role="tab" aria-selected={sDiff === d.id} className="seg-b" onClick={() => setSDiff(d.id)}>
                {d.label}
              </button>
            ))}
          </div>
          {list.length === 0 ? (
            <p className="text-[15px] leading-snug text-ink/75">Aucun score pour l’instant : la première ligne est à toi.</p>
          ) : (
            <ol className="list-decimal pl-6 text-[16px] leading-relaxed">
              {list.map((x) => (
                <li key={x.id} className="num">
                  <strong>{fmt(x.score)}</strong> points <span className="text-ink/70">· série de {x.streak}</span>
                </li>
              ))}
            </ol>
          )}
          <p className="mt-2 text-[14px] leading-snug text-ink/70">Meilleurs scores gardés sur cet appareil.</p>
        </>
      );
    } else if (view === 'progress') {
      body = <GameProgress game="spelling" onTrain={onTrain} />;
    } else {
      body = <SettingsRow settings={settings} onChange={onChange} />;
    }
    return (
      <div className="overlay">
        <section className="card card-game w-full max-w-[600px]" aria-labelledby="sub-title">
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

  const best = loadSpellingScores(boardKey(level, diff))[0]?.score;
  return (
    <div className="overlay">
      <section className="card card-game card-menu card-compact w-full max-w-[600px]" aria-labelledby="sp-title">
        <div className="menu-a">
          <div className="card-top">
            <BackButton onClick={onHome} />
          </div>
          <p className="eyebrow">Orthographe · {gradeLabel(level)}</p>
          <StampTitle id="sp-title" label="Chasse aux fautes" lines={[{ text: 'CHASSE' }, { ribbon: 'AUX', text: 'FAUTES' }]} />
          <div className="rule" aria-hidden="true" />
          <p className="tagline menu-opt">Trouve la faute cachée dans chaque phrase, avant que la créature d’encre ne t’attrape&nbsp;!</p>
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
          <h2 className="subhead">Ta difficulté</h2>
          <div className="seg mt-1" role="radiogroup" aria-label="Difficulté">
            {COURSE_DIFFS.map((d) => (
              <button key={d.id} type="button" role="radio" aria-checked={diff === d.id} className="seg-b" onClick={() => setDiff(d.id)}>
                {d.label}
              </button>
            ))}
          </div>
          <p className="menu-hint mt-1 text-[14px] leading-snug text-ink/75">{hint}</p>
          <div className="mt-[var(--sp)] flex flex-wrap items-center gap-x-4 gap-y-2">
            <button type="button" className="btn btn-primary btn-play" autoFocus onClick={onStart}>
              Commencer
            </button>
            {best ? <span className="text-[15px]">Record&nbsp;: <strong>{fmt(best)}</strong></span> : null}
          </div>
        </div>
      </section>
    </div>
  );
}
