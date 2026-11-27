import { ConfirmButton } from '../../components/ConfirmButton';
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { BackButton } from '../../components/BackButton';
import { useFit } from '../../components/FitCard';
import { GameProgress } from '../../components/GameProgress';
import { gradeLabel } from '../../game/grade';
import type { Grade } from '../../game/grade';
import { LEX_DIFFS, LEX_RELS, lexBoard } from '../../game/lexique/rounds';
import type { LexDiff, LexLevel, Rel } from '../../game/lexique/rounds';
import { clearLexScores, clearMissed, loadLexScores, loadMissed } from '../../game/lexique/scores';
import type { LexScore, Missed } from '../../game/lexique/scores';
import { morphText } from '../../game/lexique/data';
import type { Settings } from '../../game/storage';
import type { StudentAccount } from '../../server/types';
import type { MenuView } from './types';
import { fmt, levelWord } from './helpers';
import { SettingsRow } from '../../components/MenuParts';
import { Board, LocalTable } from './Tables';

// ───────────────────────── Menu ─────────────────────────

export interface MenuProps {
  view: MenuView;
  setView: (v: MenuView) => void;
  grade: Grade;
  level: LexLevel;
  rel: Rel;
  setRel: (r: Rel) => void;
  diff: LexDiff;
  setDiff: (d: LexDiff) => void;
  settings: Settings;
  account: StudentAccount | null;
  onChange: (p: Partial<Settings>) => void;
  onStart: (r: Rel) => void;
  onHome: () => void;
}

export function MissedList({ list, onClear }: { list: Missed[]; onClear: () => void }) {
  if (list.length === 0) return <p className="text-[15px] leading-snug text-ink/75">Aucun mot à revoir pour l’instant : bravo, ou à toi de jouer&nbsp;!</p>;
  return (
    <>
      <ul className="prog-list">
        {list.slice(0, 8).map((m) => (
          <li key={`${m.prompt}-${m.center}-${m.answer}`} className="prog-rule" data-status="a-revoir">
            <div className="prog-rule-head">
              <strong>{m.center}</strong>
              <span className="prog-badge">{m.n > 1 ? `ratée ${m.n} fois` : 'à revoir'}</span>
            </div>
            <p className="prog-parade">
              {m.prompt.toLowerCase()} « {m.center} » : <strong>{m.answer}</strong>
              {m.morph ? <em> ({morphText(m.morph)})</em> : null}
            </p>
          </li>
        ))}
      </ul>
      <button type="button" className="btn btn-ghost mt-2" onClick={onClear}>
        Vider la liste
      </button>
    </>
  );
}

export function MenuScreen({ view, setView, grade, level, rel, setRel, diff, setDiff, settings, account, onChange, onStart, onHome }: MenuProps) {
  const fit = useFit<HTMLElement>(view);
  const [sRel, setSRel] = useState<Rel>(rel);
  const [sDiff, setSDiff] = useState<LexDiff>(diff);
  const sBoard = lexBoard(sRel, sDiff);
  const [scores, setScores] = useState<LexScore[]>(() => loadLexScores(sBoard));
  const [missed, setMissed] = useState<Missed[]>(loadMissed);
  useEffect(() => {
    setScores(loadLexScores(sBoard));
    setMissed(loadMissed());
  }, [sBoard, view]);

  if (view !== 'main') {
    const titles = { howto: 'Comment jouer', scores: 'Scores', progress: 'Mes progrès', settings: 'Réglages' } as const;
    let body: ReactNode = null;
    if (view === 'howto') {
      body = (
        <ul className="howto-list">
          <li className="howto">
            <kbd className="kbd">◎</kbd>
            <span>
              Un <strong>mot</strong> au centre, une <strong>consigne</strong> (même sens, contraire, même famille). <strong>Touche le bon mot</strong> parmi ceux qui arrivent.
            </span>
          </li>
          <li className="howto">
            <kbd className="kbd">✱</kbd>
            <span>Bonne réponse&nbsp;: une onde détruit les mots, le mot central change et le rythme monte. On voit comment le mot est construit.</span>
          </li>
          <li className="howto">
            <kbd className="kbd">♥</kbd>
            <span>Un mauvais mot, ou la bonne réponse laissée arriver au centre, coûte une vie (5 en Apprenti, 3 sinon).</span>
          </li>
          <li className="howto howto-opt">
            <kbd className="kbd">Tab</kbd>
            <span>Au clavier&nbsp;: Tab ou flèches, puis Entrée.</span>
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
          <div className="seg mb-2" role="tablist" aria-label="Consigne">
            {LEX_RELS.map((r) => (
              <button key={r.id} type="button" role="tab" aria-selected={sRel === r.id} className="seg-b" onClick={() => setSRel(r.id)}>
                {r.label}
              </button>
            ))}
          </div>
          <div className="seg mb-2" role="tablist" aria-label="Difficulté">
            {LEX_DIFFS.map((d) => (
              <button key={d.id} type="button" role="tab" aria-selected={sDiff === d.id} className="seg-b" onClick={() => setSDiff(d.id)}>
                {d.label}
              </button>
            ))}
          </div>
          <LocalTable scores={scores} limit={6} />
          {account && <Board account={account} board={sBoard} refreshKey="menu" />}
          {scores.length > 0 && (
            <ConfirmButton className="btn btn-ghost mt-3" confirm="Sûr ?" onConfirm={() => setScores(clearLexScores(sBoard))}>
              Effacer les scores
            </ConfirmButton>
          )}
        </>
      );
    } else if (view === 'progress') {
      body = (
        <GameProgress
          game="lexique"
          extra={
            <section aria-labelledby="prog-miss" className="prog-rules">
              <h3 id="prog-miss" className="subhead">
                Mots à revoir
              </h3>
              <MissedList list={missed} onClear={() => setMissed(clearMissed())} />
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

  const best = (r: Rel) => loadLexScores(lexBoard(r, diff))[0]?.score;
  return (
    <div className="overlay">
      <section ref={fit} className="card card-game card-menu card-compact w-full max-w-[600px]" aria-labelledby="game-title">
        <div className="menu-a">
          <div className="card-top">
            <BackButton onClick={onHome} />
          </div>
          <p className="eyebrow">Vocabulaire · {gradeLabel(grade)}</p>
          <h1 id="game-title" className="title title-2l" aria-label="Mots en orbite">
            <span className="tl" aria-hidden="true">
              {'MOTS'.split('').map((ch, i) => (
                <span key={i} style={{ animationDelay: `${80 + i * 70}ms` }}>
                  {ch}
                </span>
              ))}
            </span>{' '}
            <span className="tl" aria-hidden="true">
              <span className="text-ribbon" style={{ animationDelay: '400ms' }}>
                EN
              </span>
              {' ORBITE'.split('').map((ch, i) => (
                <span key={i} style={{ animationDelay: `${470 + i * 70}ms` }}>
                  {ch === ' ' ? ' ' : ch}
                </span>
              ))}
            </span>
          </h1>
          <div className="rule" aria-hidden="true" />
          <p className="tagline menu-opt">Touche le bon mot avant que l’encre n’arrive au centre&nbsp;!</p>
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
              <span className="text-ink/70"> · {account.class.name} · mots {levelWord(level)}</span>
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
            {LEX_DIFFS.map((d) => (
              <button key={d.id} type="button" role="radio" aria-checked={diff === d.id} className="seg-b" onClick={() => setDiff(d.id)}>
                {d.label}
              </button>
            ))}
          </div>
          <p className="menu-hint mt-1 text-[14px] leading-snug text-ink/75">{LEX_DIFFS.find((d) => d.id === diff)?.hint}</p>
          <h2 className="subhead mt-[var(--sp)]">Choisis ta consigne</h2>
          <div className="games games-levels" data-n="4">
            {LEX_RELS.map((r) => {
              const b = best(r.id);
              return (
                <button key={r.id} type="button" className="gcard" autoFocus={r.id === rel} onFocus={() => setRel(r.id)} onClick={() => onStart(r.id)}>
                  <span className="gcard-name">{r.label}</span>
                  <span className="gcard-text">{r.hint}</span>
                  <span className="gcard-go">{b ? `Record : ${fmt(b)}` : 'Jouer →'}</span>
                </button>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
}
