import { useCallback, useEffect, useRef, useState } from 'react';
import { BackButton } from '../components/BackButton';
import { Dialog } from '../components/Dialog';
import { SessionIntro, SessionOver, useSessionRun } from '../components/SessionPanels';
import { Sfx } from '../game/audio';
import { feedBoss } from '../game/boss/state';
import { effectiveGrade, levelOf } from '../game/grade';
import { newRunId } from '../game/history';
import { LexiqueGame } from '../game/lexique/engine';
import type { LexResult } from '../game/lexique/engine';
import { lexBoard, lexLevelOf } from '../game/lexique/rounds';
import type { LexDiff, LexLevel, Rel } from '../game/lexique/rounds';
import { addLexScore, addMissed, loadLexPrefs, loadLexScores, saveLexPrefs } from '../game/lexique/scores';
import { addLog } from '../game/progress';
import { parseLexique } from '../game/sessionConfig';
import { loadSettings, saveSettings } from '../game/storage';
import type { Settings } from '../game/storage';
import { enqueue, flush } from '../server/outbox';
import { dropCave, sendRun } from '../server/student';
import type { RunPayload, SessionInfo, StudentAccount } from '../server/types';
import type { Cloud, MenuView, Phase, Run } from './lexique/types';
import { SettingsRow } from '../components/MenuParts';
import { MenuScreen } from './lexique/MenuScreen';
import { OverScreen } from './lexique/OverScreen';

/**
 * « Mots en orbite » — jeu de vocabulaire et de morphologie : un mot au centre, des mots ennemis qui arrivent de partout ;
 * on tape celui qui répond à la consigne (même sens, contraire, même famille). Une bonne réponse déclenche l'onde de choc.
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
