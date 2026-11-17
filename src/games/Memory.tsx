import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { BackButton, useFitRows } from '../components/BackButton';
import { GameProgress } from '../components/GameProgress';
import { Check } from '../components/Screens';
import { SessionIntro, SessionOver, useSessionRun } from '../components/SessionPanels';
import { Sfx } from '../game/audio';
import { addLog } from '../game/progress';
import { MemoryGame } from '../game/memory/engine';
import type { MemoryResult } from '../game/memory/engine';
import { MEM_DIFFS, MODES, PAGES, memBoard } from '../game/memory/rounds';
import type { MemBoard, MemDiff, Mode } from '../game/memory/rounds';
import { addMemoryScore, clearMemoryScores, loadMemoryDiff, loadMemoryMode, loadMemoryScores, loadProgress, recordProgress, saveMemoryDiff, saveMemoryMode } from '../game/memory/scores';
import type { MemoryScore } from '../game/memory/scores';
import { newRunId } from '../game/history';
import { parseMemory } from '../game/sessionConfig';
import { effectiveGrade, gradeLabel, levelOf } from '../game/grade';
import type { Grade } from '../game/grade';
import { loadSettings, saveSettings } from '../game/storage';
import type { Settings, TextSize } from '../game/storage';
import { explain } from '../server/api';
import { enqueue, flush } from '../server/outbox';
import { fetchBoard, sendRun } from '../server/student';
import type { BoardRow, RunPayload, Scope, SessionInfo, StudentAccount } from '../server/types';

/**
 * « Mémoire d'encre » — jeu de mémoire (tous âges) : des taches d'encre s'allument sur une grille d'étiquettes ;
 * on refait la suite (La Suite) ou on retrouve leurs places (Les Cases).
 */

type Phase = 'menu' | 'play' | 'pause' | 'over';
type MenuView = 'main' | 'howto' | 'scores' | 'progress' | 'settings';
type Cloud = 'off' | 'sending' | 'sent' | 'queued';

const TEXT_LABEL: Record<TextSize, string> = { normal: 'normal', large: 'grand', xlarge: 'très grand' };
const NEXT_SIZE: Record<TextSize, TextSize> = { normal: 'large', large: 'xlarge', xlarge: 'normal' };
const fmt = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
/** Plus longue suite (ou plus grand nombre de taches) déjà réussie sur cet appareil. */
const boardMode = (b: MemBoard): Mode => (b.startsWith('cases') ? 'cases' : 'suite');
const diffLabel = (d: MemDiff) => MEM_DIFFS.find((x) => x.id === d)?.label ?? d;
const bestSpan = (b: MemBoard) => loadMemoryScores(b).reduce((a, x) => Math.max(a, x.span), 0);
const modeLabel = (m: Mode) => MODES.find((x) => x.id === m)?.label ?? m;
const spanLabel = (m: Mode) => (m === 'suite' ? 'Suite max' : 'Cases max');

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
  result: MemoryResult;
  rank: number;
  id: string;
  record: boolean;
  /** plus longue suite de la partie précédente (0 si c'est la première) */
  prevSpan: number;
  stampsBefore: number;
  stampsAfter: number;
}

export default function Memory({ account, onHome, onSessionLost, session, onSessions }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<MemoryGame | null>(null);
  const [sfx] = useState(() => new Sfx());
  const [phase, setPhase] = useState<Phase>('menu');
  const [view, setView] = useState<MenuView>('main');
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const grade = levelOf(effectiveGrade(account?.student.id ?? null));
  const [mode, setMode] = useState<Mode>(() => (session ? parseMemory(session.config).mode : loadMemoryMode()));
  const [diff, setDiff] = useState<MemDiff>(() => (session ? parseMemory(session.config).diff : loadMemoryDiff()));
  const ses = useSessionRun(account, session);
  const sesRef = useRef(ses);
  sesRef.current = ses;
  const [run, setRun] = useState<Run | null>(null);
  const [startPage, setStartPage] = useState(0);
  const [cloud, setCloud] = useState<Cloud>('off');
  const lost = useRef(false);
  const accountRef = useRef(account);
  accountRef.current = account;
  const live = useRef({ phase, mode, diff, settings, overAt: 0, recId: '', startPage: 0 });
  live.current.phase = phase;
  live.current.mode = mode;
  live.current.diff = diff;
  live.current.settings = settings;
  live.current.startPage = startPage;

  // ───────────── Fin de partie ─────────────
  const onOver = useRef<(r: MemoryResult) => void>(() => {});
  onOver.current = (result) => {
    const acct = accountRef.current;
    const st = live.current.settings;
    const name = (acct ? acct.student.name.slice(0, 12).toUpperCase() : st.name) || 'ANONYME';
    const id = newRunId();
    live.current.recId = id;
    const total = result.correct + result.wrong;
    const payload: RunPayload = {
      clientId: id,
      game: 'memory',
      mode: memBoard(result.mode, result.diff),
      kind: 'game',
      score: result.score,
      wave: result.maxSpan,
      wpm: 0,
      acc: total ? Math.round((result.correct / total) * 100) : 0,
      correct: result.correct,
      duration: Math.min(7200, Math.max(0, Math.round(result.time))),
      playedMs: Date.now(),
    };
    if (sesRef.current.sess) {
      // séance de classe : l'essai compte pour l'évaluation, il ne va ni dans les scores de l'appareil ni dans les classements libres
      sesRef.current.submit(payload, () => {
        lost.current = true;
      });
      live.current.overAt = performance.now();
      setRun({ result, rank: -1, id, record: false, prevSpan: 0, stampsBefore: 0, stampsAfter: 0 });
      setPhase('over');
      return;
    }
    if (total > 0) {
      payload.balance = {
        game: 'memory',
        difficulty: memBoard(result.mode, result.diff),
        version: 1,
        outcome: result.won ? 'finished' : 'lost',
        score: result.score,
        wave: result.maxSpan,
        acc: payload.acc,
        duration: payload.duration,
        rounds_ok: result.correct,
        rounds_err: result.wrong,
        pages: result.pages,
      };
    }
    let rank = -1;
    let record = false;
    if (result.score > 0) {
      const before = loadMemoryScores(memBoard(result.mode, result.diff));
      record = before.length === 0 ? result.score > 0 : result.score > before[0].score;
      const res = addMemoryScore(memBoard(result.mode, result.diff), { id, name, score: result.score, span: result.maxSpan, date: Date.now() });
      rank = res.rank;
    }
    if (total > 0) addLog('memory', { t: Date.now(), ok: result.correct, err: result.wrong, score: result.score, board: memBoard(result.mode, result.diff), span: result.maxSpan });
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
    } else setCloud('off');
    live.current.overAt = performance.now();
    const prog = recordProgress(memBoard(result.mode, result.diff), result.won ? PAGES : result.page - 1, result.maxSpan);
    setRun({ result, rank, id, record, prevSpan: prog.before.lastSpan, stampsBefore: prog.before.stamps, stampsAfter: prog.after.stamps });
    setPhase('over');
  };

  // ───────────── Moteur ─────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const game = new MemoryGame(canvas, sfx, { onOver: (r) => onOver.current(r) });
    gameRef.current = game;
    try {
      if (localStorage.getItem('atelier.debug')) (window as unknown as { __memory?: MemoryGame }).__memory = game;
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
    gameRef.current?.setOptions({ shake: settings.shake });
    gameRef.current?.setGrade(grade);
    document.documentElement.dataset.text = settings.textSize;
    document.documentElement.dataset.comfort = settings.comfort ? 'on' : 'off';
  }, [settings, sfx, grade]);

  const change = useCallback(
    (patch: Partial<Settings>) => {
      if (patch.sound) sfx.unlock();
      setSettings((s) => ({ ...s, ...patch }));
    },
    [sfx],
  );

  const begin = useCallback(
    (m: Mode) => {
      const s = sesRef.current;
      if (s.sess && (s.left <= 0 || !s.sess.active)) return; // essais épuisés ou séance fermée
      sfx.unlock();
      (document.activeElement as HTMLElement | null)?.blur?.();
      if (!s.sess) {
        saveMemoryMode(m);
        saveMemoryDiff(live.current.diff);
      }
      setMode(m);
      live.current.mode = m;
      const d = s.sess ? parseMemory(s.sess.config).diff : live.current.diff;
      gameRef.current?.setOptions({ best: s.sess ? 0 : bestSpan(memBoard(m, d)) });
      gameRef.current?.start(m, s.sess ? parseMemory(s.sess.config).startPage : Math.min(live.current.startPage, loadProgress(memBoard(m, d)).stamps), d);
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
        const k = e.key.toLowerCase();
        if (k === 'escape' || k === 'p') {
          e.preventDefault();
          pause();
        } else if (k === 'arrowleft' || k === 'q') {
          e.preventDefault();
          game.moveCursor(-1, 0);
        } else if (k === 'arrowright' || k === 'd') {
          e.preventDefault();
          game.moveCursor(1, 0);
        } else if (k === 'arrowup' || k === 'z') {
          e.preventDefault();
          game.moveCursor(0, -1);
        } else if (k === 'arrowdown' || k === 's') {
          e.preventDefault();
          game.moveCursor(0, 1);
        } else if (k === 'enter' || k === ' ') {
          e.preventDefault();
          if (!e.repeat) game.confirm();
        } else if (/^[1-9]$/.test(k)) {
          e.preventDefault();
          game.digit(Number(k));
        }
      } else if (p === 'pause') {
        if (e.key === 'Escape' || (e.key === 'Enter' && !interactive)) {
          e.preventDefault();
          resume();
        }
      } else if (p === 'menu') {
        if (e.key === 'Enter' && !interactive) {
          e.preventDefault();
          begin(live.current.mode);
        }
      } else if (p === 'over') {
        if ((e.key === 'Enter' || e.key === ' ') && !interactive && performance.now() - live.current.overAt > 550) {
          e.preventDefault();
          begin(live.current.mode);
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

  // Toucher / souris
  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (live.current.phase !== 'play') return;
    const r = e.currentTarget.getBoundingClientRect();
    sfx.unlock();
    gameRef.current?.tapAt(e.clientX - r.left, e.clientY - r.top);
  };
  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    gameRef.current?.lookAt(e.clientX - r.left, e.clientY - r.top);
  };

  const status =
    phase === 'pause'
      ? 'Jeu en pause'
      : phase === 'over' && run
        ? `Partie terminée. Score ${run.result.score}.`
        : phase === 'play'
          ? 'Partie en cours'
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
            aria-label="Zone de jeu : une grille d’étiquettes où des taches d’encre s’allument. Retiens leur ordre ou leur place, puis refais-les. Au clavier : flèches pour te déplacer, Entrée pour choisir."
            onPointerDown={onDown}
            onPointerMove={onMove}
          />
          {phase === 'play' && (
            <button type="button" className="pause-btn" tabIndex={-1} aria-label="Pause" onClick={pause}>
              <span />
              <span />
            </button>
          )}
        </div>

        {phase === 'menu' && ses.sess && (
          <SessionIntro session={ses.sess} left={ses.left} onStart={() => begin(mode)} onBack={() => (onSessions ?? onHome)()} />
        )}
        {phase === 'menu' && !ses.sess && (
          <MenuScreen
            view={view}
            setView={setView}
            grade={grade}
            mode={mode}
            setMode={setMode}
            diff={diff}
            setDiff={setDiff}
            settings={settings}
            account={account}
            onChange={change}
            onStart={begin}
            startPage={startPage}
            setStartPage={setStartPage}
            onHome={onHome}
          />
        )}
        {phase === 'pause' && (
          <div className="overlay">
            <section className="card card-game w-full max-w-[440px]" role="dialog" aria-modal="true" aria-labelledby="pause-title">
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
                  <button type="button" className="btn btn-ghost" onClick={() => begin(mode)}>
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
            </section>
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
                Plus longue suite retenue : <strong>{run.result.maxSpan}</strong> · Page {run.result.page}/{PAGES}
              </p>
            }
            onRetry={() => begin(run.result.mode)}
            onBack={() => (onSessions ?? onHome)()}
          />
        )}
        {phase === 'over' && run && !ses.sess && (
          <OverScreen run={run} account={account} cloud={cloud} onRestart={() => begin(run.result.mode)} onMenu={toMenu} onHome={onHome} />
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

function MenuScreen({ view, setView, grade, mode, setMode, diff, setDiff, settings, account, onChange, onStart, startPage, setStartPage, onHome }: MenuProps) {
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
            <span>Des vies&nbsp;: une erreur en coûte une, puis tu réessaies (5 en Apprenti, 3 sinon). Une page sans erreur en rend une&nbsp;! Bats ton propre record.</span>
          </li>
          <li className="howto howto-opt">
            <kbd className="kbd kbd-sym">← ↑ ↓ →</kbd>
            <span>Au clavier&nbsp;: les flèches déplacent le curseur, Entrée choisit (chiffres 1 à 9 pour La Suite).</span>
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
            <button
              type="button"
              className="btn btn-ghost mt-3"
              onClick={() => {
                if (window.confirm('Effacer les scores de cet appareil pour ce mode ?')) setScores(clearMemoryScores(sBoard));
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

  return (
    <div className="overlay">
      <section className="card card-game card-menu card-compact w-full max-w-[600px]" aria-labelledby="game-title">
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
          <p className="tagline menu-opt">Retiens ce que l’encre te montre, puis refais-le sans te tromper&nbsp;!</p>
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

// ───────────────────────── Tableaux ─────────────────────────

function LocalTable({ scores, limit, highlightId, mode }: { scores: MemoryScore[]; limit: number; highlightId?: string; mode: Mode }) {
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

function Board({ account, board, refreshKey }: { account: StudentAccount; board: MemBoard; refreshKey: string }) {
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

// ───────────────────────── Fin de partie ─────────────────────────

/** Petites stratégies de mémorisation (regroupement, image mentale, répétition) : on en montre une après chaque partie. */
const TIPS: Record<Mode, string[]> = {
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
const tipFor = (m: Mode, k: number) => TIPS[m][Math.abs(k) % TIPS[m].length];

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
  const scores = loadMemoryScores(memBoard(r.mode, r.diff));
  const total = r.correct + r.wrong;
  const title = r.won ? 'Cahier terminé !' : run.record ? 'Nouveau record !' : 'Plus de vies, bien essayé !';

  return (
    <div className="overlay">
      <section className="card card-game card-cover w-full max-w-[600px]" role="dialog" aria-modal="true" aria-labelledby="over-title">
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
      </section>
    </div>
  );
}
