import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { BackButton, useFitRows } from '../components/BackButton';
import { Dialog } from '../components/Dialog';
import { useFit } from '../components/FitCard';
import { GameProgress } from '../components/GameProgress';
import { Check } from '../components/Screens';
import { SessionIntro, SessionOver, useSessionRun } from '../components/SessionPanels';
import { Sfx } from '../game/audio';
import { feedBoss } from '../game/boss/state';
import { effectiveGrade, gradeLabel, levelOf } from '../game/grade';
import type { Grade } from '../game/grade';
import { newRunId } from '../game/history';
import { LexiqueGame } from '../game/lexique/engine';
import type { LexResult } from '../game/lexique/engine';
import { LEX_DIFFS, LEX_RELS, lexBoard, lexLevelOf } from '../game/lexique/rounds';
import type { LexBoard, LexDiff, LexLevel, Rel } from '../game/lexique/rounds';
import { addLexScore, addMissed, clearLexScores, clearMissed, loadLexPrefs, loadLexScores, loadMissed, saveLexPrefs } from '../game/lexique/scores';
import type { LexScore, Missed } from '../game/lexique/scores';
import { morphText } from '../game/lexique/data';
import { addLog } from '../game/progress';
import { parseLexique } from '../game/sessionConfig';
import { loadSettings, saveSettings } from '../game/storage';
import type { Settings, TextSize } from '../game/storage';
import { explain } from '../server/api';
import { enqueue, flush } from '../server/outbox';
import { dropCave, fetchBoard, sendRun } from '../server/student';
import type { BoardRow, RunPayload, Scope, SessionInfo, StudentAccount } from '../server/types';

/**
 * « Mots en orbite » — jeu de vocabulaire et de morphologie : un mot au centre, des mots ennemis qui arrivent de partout ;
 * on tape celui qui répond à la consigne (même sens, contraire, même famille). Une bonne réponse déclenche l'onde de choc.
 */

type Phase = 'menu' | 'play' | 'pause' | 'over';
type MenuView = 'main' | 'howto' | 'scores' | 'progress' | 'settings';
type Cloud = 'off' | 'sending' | 'sent' | 'queued';

const TEXT_LABEL: Record<TextSize, string> = { normal: 'normal', large: 'grand', xlarge: 'très grand' };
const NEXT_SIZE: Record<TextSize, TextSize> = { normal: 'large', large: 'xlarge', xlarge: 'normal' };
const fmt = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
const relLabel = (r: Rel) => LEX_RELS.find((x) => x.id === r)?.label ?? r;
const diffLabel = (d: LexDiff) => LEX_DIFFS.find((x) => x.id === d)?.label ?? d;
/** Rel d'un classement : « famille-expert » → famille. */
const boardRel = (b: LexBoard): Rel => b.split('-')[0] as Rel;
const levelWord = (l: LexLevel) => l.toUpperCase();

interface Props {
  account: StudentAccount | null;
  onHome: () => void;
  onSessionLost: () => void;
  /** séance de classe à jouer (essais limités) */
  session?: SessionInfo | null;
  /** retour à la liste des séances */
  onSessions?: () => void;
}

interface Run {
  result: LexResult;
  rank: number;
  id: string;
  record: boolean;
}

export default function Lexique({ account, onHome, onSessionLost, session, onSessions }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<LexiqueGame | null>(null);
  const [sfx] = useState(() => new Sfx());
  const [phase, setPhase] = useState<Phase>('menu');
  const [view, setView] = useState<MenuView>('main');
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const grade = levelOf(effectiveGrade(account?.student.id ?? null));
  const level: LexLevel = session ? parseLexique(session.config).level : lexLevelOf(grade);
  const [prefs] = useState(loadLexPrefs);
  const [rel, setRel] = useState<Rel>(() => (session ? parseLexique(session.config).rel : prefs.rel));
  const [diff, setDiff] = useState<LexDiff>(() => (session ? parseLexique(session.config).diff : prefs.diff));
  const ses = useSessionRun(account, session);
  const sesRef = useRef(ses);
  sesRef.current = ses;
  const [run, setRun] = useState<Run | null>(null);
  const [cloud, setCloud] = useState<Cloud>('off');
  const [say, setSay] = useState('');
  const lost = useRef(false);
  const accountRef = useRef(account);
  accountRef.current = account;
  const live = useRef({ phase, rel, diff, level, settings, overAt: 0, recId: '' });
  live.current.phase = phase;
  live.current.rel = rel;
  live.current.diff = diff;
  live.current.level = level;
  live.current.settings = settings;

  // ───────────── Fin de partie ─────────────
  const onOver = useRef<(r: LexResult) => void>(() => {});
  onOver.current = (result) => {
    const acct = accountRef.current;
    const st = live.current.settings;
    const name = (acct ? acct.student.name.slice(0, 12).toUpperCase() : st.name) || 'ANONYME';
    const id = newRunId();
    live.current.recId = id;
    const board = lexBoard(result.rel, result.diff);
    const total = result.correct + result.wrong;
    const payload: RunPayload = {
      clientId: id,
      game: 'lexique',
      mode: board,
      kind: 'game',
      score: result.score,
      wave: result.correct,
      wpm: 0,
      acc: total ? Math.round((result.correct / total) * 100) : 0,
      correct: result.correct,
      duration: Math.min(7200, Math.max(0, Math.round(result.time))),
      playedMs: Date.now(),
    };
    if (sesRef.current.sess) {
      sesRef.current.submit(payload, () => {
        lost.current = true;
      });
      live.current.overAt = performance.now();
      setRun({ result, rank: -1, id, record: false });
      setPhase('over');
      return;
    }
    if (total > 0) {
      payload.balance = {
        game: 'lexique',
        difficulty: board,
        level: result.level,
        version: 1,
        outcome: 'lost',
        score: result.score,
        wave: result.correct,
        acc: payload.acc,
        duration: payload.duration,
        rounds_ok: result.correct,
        rounds_err: result.wrong,
      };
    }
    let rank = -1;
    let record = false;
    if (result.score > 0) {
      const before = loadLexScores(board);
      record = before.length === 0 ? result.score > 0 : result.score > before[0].score;
      rank = addLexScore(board, { id, name, score: result.score, span: result.correct, date: Date.now() }).rank;
    }
    if (total > 0) {
      addLog('lexique', { t: Date.now(), ok: result.correct, err: result.wrong, score: result.score, board });
      feedBoss(result.correct, result.wrong);
      payload.cave = { ink: result.wrong, power: result.correct };
    }
    if (result.missed.length > 0) addMissed(result.missed);
    if (acct && result.correct > 0) {
      setCloud('sending');
      sendRun(acct.token, payload)
        .then((r) => {
          if (r === 'invalid_session') {
            enqueue(acct.student.id, payload);
            lost.current = true;
          }
          if (id === live.current.recId) setCloud(r === 'ok' ? 'sent' : 'queued');
        })
        .catch(() => {
          enqueue(acct.student.id, payload);
          if (id === live.current.recId) setCloud('queued');
        });
    } else {
      if (acct && payload.cave && !payload.sessionId) void dropCave(acct.student.id, acct.token, id, payload.cave.ink, payload.cave.power);
      setCloud('off');
    }
    live.current.overAt = performance.now();
    setRun({ result, rank, id, record });
    setPhase('over');
  };

  // ───────────── Moteur ─────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const game = new LexiqueGame(canvas, sfx, { onOver: (r) => onOver.current(r), onAnnounce: setSay });
    gameRef.current = game;
    try {
      if (localStorage.getItem('atelier.debug')) (window as unknown as { __lexique?: LexiqueGame }).__lexique = game;
    } catch {
      /* ignoré */
    }
    return () => {
      game.destroy();
      gameRef.current = null;
    };
  }, [sfx]);

  useEffect(() => {
    saveSettings(settings);
    sfx.enabled = settings.sound;
    gameRef.current?.setOptions({ shake: settings.shake, wordScale: settings.textSize === 'xlarge' ? 1.3 : settings.textSize === 'large' ? 1.15 : 1 });
    document.documentElement.dataset.text = settings.textSize;
    document.documentElement.dataset.comfort = settings.comfort ? 'on' : 'off';
  }, [settings, sfx]);

  const change = useCallback(
    (patch: Partial<Settings>) => {
      if (patch.sound) sfx.unlock();
      setSettings((s) => ({ ...s, ...patch }));
    },
    [sfx],
  );

  const begin = useCallback(
    (r: Rel) => {
      const s = sesRef.current;
      if (s.sess && (s.left <= 0 || !s.sess.active)) return;
      sfx.unlock();
      (document.activeElement as HTMLElement | null)?.blur?.();
      const cfg = s.sess ? parseLexique(s.sess.config) : null;
      const d = cfg ? cfg.diff : live.current.diff;
      const rr = cfg ? cfg.rel : r;
      if (!s.sess) saveLexPrefs({ rel: r, diff: d, level: null });
      setRel(rr);
      live.current.rel = rr;
      gameRef.current?.start(rr, cfg ? cfg.level : live.current.level, d);
      setRun(null);
      setPhase('play');
    },
    [sfx],
  );

  const pause = useCallback(() => {
    if (live.current.phase !== 'play') return;
    gameRef.current?.setPaused(true);
    setPhase('pause');
  }, []);

  const resume = useCallback(() => {
    (document.activeElement as HTMLElement | null)?.blur?.();
    gameRef.current?.setPaused(false);
    setPhase('play');
  }, []);

  const toMenu = useCallback(() => {
    gameRef.current?.startDemo();
    setView('main');
    setPhase('menu');
    if (lost.current) onSessionLost();
  }, [onSessionLost]);

  // Clavier
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const game = gameRef.current;
      if (!game || e.ctrlKey || e.metaKey || e.altKey) return;
      const p = live.current.phase;
      const target = e.target as HTMLElement | null;
      const interactive = !!target?.closest?.('button, input, a, select, textarea');
      if (p === 'play') {
        if (e.key === 'Escape') {
          e.preventDefault();
          pause();
        } else if (e.key === 'Tab' || e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
          e.preventDefault();
          game.cycle(e.key === 'ArrowLeft' || e.key === 'ArrowUp' || (e.key === 'Tab' && e.shiftKey) ? -1 : 1);
        } else if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) {
          e.preventDefault();
          game.confirm();
        }
      } else if (p === 'pause') {
        if (e.key === 'Escape' || (e.key === 'Enter' && !interactive)) {
          e.preventDefault();
          resume();
        }
      } else if (p === 'menu') {
        if (e.key === 'Enter' && !interactive) {
          e.preventDefault();
          begin(live.current.rel);
        }
      } else if (p === 'over') {
        if ((e.key === 'Enter' || e.key === ' ') && !interactive && performance.now() - live.current.overAt > 550) {
          e.preventDefault();
          begin(live.current.rel);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pause, resume, begin]);

  // Pause automatique quand la fenêtre perd le focus
  useEffect(() => {
    const onHide = () => {
      if (document.hidden) pause();
    };
    window.addEventListener('blur', pause);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      window.removeEventListener('blur', pause);
      document.removeEventListener('visibilitychange', onHide);
    };
  }, [pause]);

  // Parties jouées sans réseau : on réessaie au démarrage et au retour du réseau
  const studentId = account?.student.id ?? null;
  const token = account?.token ?? null;
  useEffect(() => {
    if (!studentId || !token) return;
    const go = () => void flush(studentId, token);
    go();
    window.addEventListener('online', go);
    return () => window.removeEventListener('online', go);
  }, [studentId, token]);

  // Pointeur : un appui sur un mot ennemi le valide ; on peut aussi saisir le mot central et glisser jusqu'au bon mot
  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top] as const;
  };
  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (live.current.phase !== 'play') return;
    sfx.unlock();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* ignoré */
    }
    const [x, y] = pos(e);
    gameRef.current?.downAt(x, y);
  };
  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const [x, y] = pos(e);
    gameRef.current?.moveAt(x, y);
  };
  const onUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const [x, y] = pos(e);
    gameRef.current?.upAt(x, y);
  };

  const status =
    phase === 'pause'
      ? 'Jeu en pause'
      : phase === 'over' && run
        ? `Partie terminée. Score ${run.result.score}.`
        : phase === 'play'
          ? say
          : '';

  return (
    <div className="desk">
      <main className="sheet">
        <div className="stage">
          <canvas
            ref={canvasRef}
            className="absolute inset-0 block h-full w-full"
            style={{ touchAction: 'none' }}
            role="img"
            aria-label="Zone de jeu : un mot au centre et des mots qui arrivent de toutes les directions. Touche le mot qui répond à la consigne, ou tire un fil depuis le mot central. Au clavier : Tab ou les flèches pour choisir un mot, Entrée pour le valider."
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
          />
          {phase === 'play' && (
            <button type="button" className="pause-btn" tabIndex={-1} aria-label="Pause" onClick={pause}>
              <span />
              <span />
            </button>
          )}
        </div>

        {phase === 'menu' && ses.sess && (
          <SessionIntro session={ses.sess} left={ses.left} onStart={() => begin(rel)} onBack={() => (onSessions ?? onHome)()} />
        )}
        {phase === 'menu' && !ses.sess && (
          <MenuScreen
            view={view}
            setView={setView}
            grade={grade}
            level={level}
            rel={rel}
            setRel={setRel}
            diff={diff}
            setDiff={setDiff}
            settings={settings}
            account={account}
            onChange={change}
            onStart={begin}
            onHome={onHome}
          />
        )}
        {phase === 'pause' && (
          <div className="overlay">
            <Dialog className="card card-game w-full max-w-[440px]" labelledBy="pause-title">
              <div className="card-top">
                <BackButton onClick={onHome} />
              </div>
              <h2 id="pause-title" className="title-sm">
                Pause
              </h2>
              <div className="rule" aria-hidden="true" />
              <div className="mt-[var(--sp)] grid gap-3">
                <button type="button" className="btn btn-primary" autoFocus onClick={resume}>
                  Reprendre
                </button>
                <div className="grid grid-cols-2 gap-3">
                  <button type="button" className="btn btn-ghost" onClick={() => begin(rel)}>
                    Recommencer
                  </button>
                  <button type="button" className="btn btn-ghost" onClick={toMenu}>
                    Menu du jeu
                  </button>
                </div>
              </div>
              <div className="mt-[var(--sp)] border-t-2 border-dashed border-ink/25 pt-2">
                <SettingsRow settings={settings} onChange={change} />
              </div>
            </Dialog>
          </div>
        )}
        {phase === 'over' && run && ses.sess && (
          <SessionOver
            session={ses.sess}
            state={ses.state}
            score={run.result.score}
            left={ses.left}
            details={
              <p className="mt-1 text-[15px]">
                Manches gagnées : <strong>{run.result.correct}</strong>
                {run.result.wrong > 0 ? ` · ratées : ${run.result.wrong}` : ''}
              </p>
            }
            onRetry={() => begin(run.result.rel)}
            onBack={() => (onSessions ?? onHome)()}
          />
        )}
        {phase === 'over' && run && !ses.sess && (
          <OverScreen run={run} account={account} cloud={cloud} onRestart={() => begin(run.result.rel)} onMenu={toMenu} onHome={onHome} />
        )}
        <p className="sr-only" role="status" aria-live="polite">
          {status}
        </p>
      </main>
    </div>
  );
}

// ───────────────────────── Réglages ─────────────────────────

function SettingsRow({ settings, onChange }: { settings: Settings; onChange: (p: Partial<Settings>) => void }) {
  return (
    <div className="flex flex-wrap gap-x-2 gap-y-1" role="group" aria-label="Options">
      <Check on={settings.sound} onClick={() => onChange({ sound: !settings.sound })}>
        Son
      </Check>
      <Check on={settings.shake} onClick={() => onChange({ shake: !settings.shake })}>
        Secousses
      </Check>
      <Check on={settings.comfort} onClick={() => onChange({ comfort: !settings.comfort })}>
        Lecture confortable
      </Check>
      <button
        type="button"
        className="opt"
        aria-label={`Taille du texte : ${TEXT_LABEL[settings.textSize]}. Changer.`}
        onClick={() => onChange({ textSize: NEXT_SIZE[settings.textSize] })}
      >
        Texte&nbsp;: <strong className="text-ribbon">{TEXT_LABEL[settings.textSize]}</strong>
      </button>
    </div>
  );
}

// ───────────────────────── Menu ─────────────────────────

interface MenuProps {
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

function MissedList({ list, onClear }: { list: Missed[]; onClear: () => void }) {
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

function MenuScreen({ view, setView, grade, level, rel, setRel, diff, setDiff, settings, account, onChange, onStart, onHome }: MenuProps) {
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
              Un <strong>mot</strong> est au centre, avec une <strong>consigne</strong> : même sens, contraire ou même famille. Des mots arrivent de partout&nbsp;: <strong>touche le bon mot</strong> (ou, si tu préfères, maintiens le mot central et glisse jusqu’au bon mot).
            </span>
          </li>
          <li className="howto">
            <kbd className="kbd">✱</kbd>
            <span>Bonne réponse&nbsp;: une onde de choc détruit tous les mots, le mot central change et ça va un peu plus vite. Tu vois alors comment le mot est construit (préfixe, racine, suffixe).</span>
          </li>
          <li className="howto">
            <kbd className="kbd">♥</kbd>
            <span>Un mauvais mot relié, ou la bonne réponse laissée arriver au centre, coûte une vie (5 en Apprenti, 3 sinon). Les autres mots qui arrivent au centre ne font pas de mal.</span>
          </li>
          <li className="howto">
            <kbd className="kbd">×</kbd>
            <span>Les points&nbsp;: chaque bonne réponse rapporte 100 points, un peu plus si tu es rapide. Trois bonnes réponses d’affilée font monter la série (×2, ×3… jusqu’à ×6) et multiplient tes points. Tu ne perds jamais de points&nbsp;; une vie perdue te fait redescendre d’un palier (en Expert, la série repart de ×1).</span>
          </li>
          <li className="howto howto-opt">
            <kbd className="kbd">Tab</kbd>
            <span>Au clavier&nbsp;: Tab ou les flèches choisissent un mot, Entrée le valide.</span>
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
            <button
              type="button"
              className="btn btn-ghost mt-3"
              onClick={() => {
                if (window.confirm('Effacer les scores de cet appareil pour cette consigne ?')) setScores(clearLexScores(sBoard));
              }}
            >
              Effacer les scores
            </button>
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
          <p className="tagline menu-opt">Touche le bon mot avant que les taches d’encre n’arrivent au centre&nbsp;!</p>
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

// ───────────────────────── Tableaux ─────────────────────────

function LocalTable({ scores, limit, highlightId }: { scores: LexScore[]; limit: number; highlightId?: string }) {
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
            Manches
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

function Board({ account, board, refreshKey }: { account: StudentAccount; board: LexBoard; refreshKey: string }) {
  const [scope, setScope] = useState<Scope>('class');
  const [rows, setRows] = useState<BoardRow[] | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    if (refreshKey === 'sending') return;
    let alive = true;
    setRows(null);
    setErr('');
    fetchBoard(account.token, 'lexique', board, scope, 5)
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
        <p className="text-[15px] text-ink/75">Personne n’a encore joué cette consigne.</p>
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
                Manches
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

// ───────────────────────── Fin de partie ─────────────────────────

interface OverProps {
  run: Run;
  account: StudentAccount | null;
  cloud: Cloud;
  onRestart: () => void;
  onMenu: () => void;
  onHome: () => void;
}

function OverScreen({ run, account, cloud, onRestart, onMenu, onHome }: OverProps) {
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
