import { useCallback, useEffect, useRef, useState } from 'react';
import { Dialog } from '../components/Dialog';
import { BackButton } from '../components/BackButton';
import { SessionIntro, SessionOver, useSessionRun } from '../components/SessionPanels';
import { Sfx } from '../game/audio';
import { addLog } from '../game/progress';
import { feedBoss } from '../game/boss/state';
import { MemoryGame } from '../game/memory/engine';
import type { MemoryResult } from '../game/memory/engine';
import { memBoard, PAGES } from '../game/memory/rounds';
import type { MemDiff, Mode } from '../game/memory/rounds';
import { addMemoryScore, loadMemoryDiff, loadMemoryMode, loadMemoryScores, loadProgress, recordProgress, saveMemoryDiff, saveMemoryMode } from '../game/memory/scores';
import { newRunId } from '../game/history';
import { parseMemory } from '../game/sessionConfig';
import { effectiveGrade, levelOf } from '../game/grade';
import { loadSettings, saveSettings } from '../game/storage';
import type { Settings } from '../game/storage';
import { enqueue, flush } from '../server/outbox';
import { dropCave, sendRun } from '../server/student';
import type { RunPayload, SessionInfo, StudentAccount } from '../server/types';
import type { Cloud, MenuView, Phase, Run } from './memory/types';
import { bestSpan } from './memory/helpers';
import { SettingsRow } from '../components/MenuParts';
import { MenuScreen } from './memory/MenuScreen';
import { OverScreen } from './memory/OverScreen';

/**
 * « Mémoire d'encre » — jeu de mémoire (tous âges) : des taches d'encre s'allument sur une grille d'étiquettes ;
 * on refait la suite (La Suite) ou on retrouve leurs places (Les Cases).
 */



interface Props {
  account: StudentAccount | null;
  onHome: () => void;
  onSessionLost: () => void;
  /** séance de classe à jouer (essais limités) */
  session?: SessionInfo | null;
  /** retour à la liste des séances */
  onSessions?: () => void;
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
    if (total > 0) {
      addLog('memory', { t: Date.now(), ok: result.correct, err: result.wrong, score: result.score, board: memBoard(result.mode, result.diff), span: result.maxSpan });
      feedBoss(result.correct, result.wrong);
      payload.cave = { ink: result.wrong, power: result.correct };
    }
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
                  <button type="button" className="btn btn-ghost" onClick={() => begin(mode)}>
                    Recommencer
                  </button>
                  <button type="button" className="btn btn-ghost" onClick={toMenu}>
                    Menu du jeu
                  </button>
                </div>
              </div>
              <div className="mt-[var(--sp)] border-t-2 border-dashed border-ink/25 pt-2">
                <SettingsRow settings={settings} onChange={change} shake />
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
