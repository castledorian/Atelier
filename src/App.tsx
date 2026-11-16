import { useCallback, useEffect, useRef, useState } from 'react';
import { Progress } from './components/Extras';
import { Keyboard } from './components/Keyboard';
import { GameOver, Menu, Pause } from './components/Screens';
import { SessionIntro, SessionOver, useSessionRun } from './components/SessionPanels';
import type { InstallInfo } from './components/Screens';
import { Sfx } from './game/audio';
import type { Difficulty } from './game/difficulty';
import { effectiveGrade } from './game/grade';
import { Game } from './game/engine';
import type { RunStats } from './game/engine';
import { addRun, loadHistory, newRunId, renameRun } from './game/history';
import { parseTyping } from './game/sessionConfig';
import type { RunRecord } from './game/history';
import {
  addScore,
  recordTypingStamps,
  clearScores,
  loadScores,
  loadSettings,
  settingsFromLink,
  renameScore,
  saveSettings,
} from './game/storage';
import type { ScoreEntry, Settings } from './game/storage';
import { enqueue, flush } from './server/outbox';
import { fetchMyRuns, sendRun } from './server/student';
import type { RunPayload, SessionInfo, StudentAccount } from './server/types';

type Screen = 'menu' | 'play' | 'pause' | 'over' | 'progress';

type CloudStatus = 'off' | 'sending' | 'sent' | 'queued';

interface RunResult {
  stats: RunStats;
  diff: Difficulty;
  drill: boolean;
  id: string | null;
  rank: number;
  /** identifiant de la partie dans l'historique (et dans le classement de la classe) */
  recId: string;
}

const TEXT_SCALE = { normal: 1, large: 1.1, xlarge: 1.2 } as const;

function detectTouch() {
  if (typeof window === 'undefined') return false;
  const coarse = !!window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  return coarse && navigator.maxTouchPoints > 0;
}

export interface TypingProps {
  /** élève connecté (null = mode local, sans compte) */
  account: StudentAccount | null;
  onHome: () => void;
  /** la session de l'élève n'est plus valable : retour à la connexion */
  onSessionLost: () => void;
  install: InstallInfo;
  /** séance de classe à jouer (essais limités) */
  session?: SessionInfo | null;
  /** retour à la liste des séances */
  onSessions?: () => void;
}

export default function App({ account, onHome, onSessionLost, install, session, onSessions }: TypingProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game | null>(null);
  const [sfx] = useState(() => new Sfx());
  const [screen, setScreen] = useState<Screen>('menu');
  const [settings, setSettings] = useState<Settings>(() => {
    const s = settingsFromLink(loadSettings());
    if (!session) return s;
    const c = parseTyping(session.config); // la séance impose sa difficulté et ses réglages
    return { ...s, difficulty: c.diff, custom: c.custom };
  });
  const ses = useSessionRun(account, session);
  const sesRef = useRef(ses);
  sesRef.current = ses;
  const [scores, setScores] = useState<ScoreEntry[]>(loadScores);
  const [run, setRun] = useState<RunResult | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [chargeReady, setChargeReady] = useState(false);
  const [touch, setTouch] = useState(detectTouch);
  const [drill, setDrill] = useState<string | null>(null);
  const [runs, setRuns] = useState<RunRecord[]>(loadHistory);
  const [cloudStatus, setCloudStatus] = useState<CloudStatus>('off');
  const [serverRuns, setServerRuns] = useState<RunRecord[] | null>(null);
  const lost = useRef(false);
  const accountRef = useRef(account);
  accountRef.current = account;

  // Mode Apprenti : le clavier à l'écran (touche à frapper en surbrillance) est affiché par défaut.
  const persoAssist = settings.difficulty === 'perso' && settings.custom.autoTarget;
  const kbOn = settings.keyboard ?? (touch || settings.difficulty === 'apprenti' || persoAssist || drill !== null);

  // Valeurs « vivantes » pour les écouteurs globaux
  const live = useRef({ screen, settings, overAt: 0, diff: settings.difficulty as Difficulty, drill: null as string | null, recId: '' });
  live.current.screen = screen;
  live.current.settings = settings;
  const accName = account ? account.student.name.slice(0, 12).toUpperCase() : null;

  const onGameOver = useRef<(s: RunStats) => void>(() => {});
  onGameOver.current = (stats) => {
    const { diff, settings: st } = live.current;
    const isDrill = live.current.drill !== null;
    const ranked = !isDrill && diff !== 'perso' && !sesRef.current.sess;
    const acct = accountRef.current;
    const name = (acct ? acct.student.name.slice(0, 12).toUpperCase() : st.name) || 'ANONYME';
    const recId = newRunId();
    const acc = Math.round(stats.accuracy * 100);
    const payload: RunPayload = {
      clientId: recId,
      game: 'typing',
      mode: diff,
      kind: isDrill ? 'drill' : 'game',
      score: stats.score,
      wave: stats.wave,
      wpm: stats.wpm,
      acc,
      correct: stats.correct,
      duration: Math.round(stats.time),
      playedMs: Date.now(),
    };
    if (sesRef.current.sess) {
      // séance de classe : l'essai compte pour l'évaluation, il ne va ni dans l'historique ni dans les classements libres
      sesRef.current.submit(payload, () => {
        lost.current = true;
      });
      setRun({ stats, diff, drill: false, id: null, rank: -1, recId });
      live.current.overAt = performance.now();
      setScreen('over');
      return;
    }
    if (!isDrill && stats.correct + stats.errors > 0) {
      payload.balance = {
        game: 'typing',
        difficulty: diff,
        version: 1,
        outcome: 'lost',
        score: stats.score,
        wave: stats.wave,
        acc,
        wpm: Math.round(stats.wpm * 10) / 10,
        duration: payload.duration,
        rounds_ok: stats.correct,
        rounds_err: stats.errors,
      };
    }
    // Compte élève : toute partie (même entraînement) est envoyée au serveur ; seules les parties classées comptent au classement.
    const sendToServer = () => {
      if (!acct || stats.correct === 0) return false;
      setCloudStatus('sending');
      void sendRun(acct.token, payload)
        .then((r) => {
          if (r === 'invalid_session') {
            enqueue(acct.student.id, payload);
            lost.current = true;
          }
          setServerRuns(null);
          if (recId === live.current.recId) setCloudStatus(r === 'ok' ? 'sent' : r === 'invalid_session' ? 'queued' : 'off');
        })
        .catch(() => {
          enqueue(acct.student.id, payload);
          if (recId === live.current.recId) setCloudStatus('queued');
        });
      return true;
    };
    live.current.recId = recId;

    // historique de l'appareil (courbe de progression, export)
    setRuns(
      addRun({
        id: recId,
        date: Date.now(),
        name,
        diff,
        kind: isDrill ? 'drill' : 'game',
        score: stats.score,
        wave: stats.wave,
        wpm: stats.wpm,
        acc,
        correct: stats.correct,
        time: stats.time,
      }),
    );

    if (!ranked) {
      // entraînement ou séance personnalisée : pas de classement
      if (!sendToServer()) setCloudStatus('off');
      setRun({ stats, diff, drill: isDrill, id: null, rank: -1, recId });
      live.current.overAt = performance.now();
      setScreen('over');
      return;
    }

    const res = addScore({ diff, name, score: stats.score, wave: stats.wave, wpm: stats.wpm, acc });
    recordTypingStamps(stats.wpm, acc);
    setScores(res.scores);

    if (!sendToServer()) setCloudStatus('off');

    setRun({ stats, diff, drill: false, id: res.id, rank: res.rank, recId });
    live.current.overAt = performance.now();
    setScreen('over');
  };

  // Création du moteur
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const game = new Game(canvas, sfx, {
      onGameOver: (s) => onGameOver.current(s),
      onHint: (h) => setHint(h ? h.toLowerCase() : null),
      onCharge: setChargeReady,
    });
    gameRef.current = game;
    return () => {
      game.destroy();
      gameRef.current = null;
    };
  }, [sfx]);

  // Réglages → moteur + stockage
  useEffect(() => {
    if (!sesRef.current.sess) saveSettings(settings); // une séance ne modifie pas les réglages de l'appareil
    sfx.enabled = settings.sound;
    gameRef.current?.setOptions({
      shake: settings.shake,
      touch: kbOn,
      layout: settings.layout,
      wordScale: TEXT_SCALE[settings.textSize],
    });
    document.documentElement.dataset.text = settings.textSize;
    document.documentElement.dataset.comfort = settings.comfort ? 'on' : 'off';
  }, [settings, kbOn, sfx]);

  const changeSettings = useCallback(
    (patch: Partial<Settings>) => {
      if (patch.sound) sfx.unlock();
      setSettings((s) => ({ ...s, ...patch }));
    },
    [sfx],
  );

  const begin = useCallback(
    (letters: string | null) => {
      const s = sesRef.current;
      if (s.sess && (s.left <= 0 || !s.sess.active)) return; // essais épuisés ou séance fermée
      sfx.unlock();
      (document.activeElement as HTMLElement | null)?.blur?.();
      live.current.diff = live.current.settings.difficulty; // la difficulté est figée pendant la partie
      live.current.drill = letters;
      setDrill(letters);
      gameRef.current?.start(live.current.diff, letters ?? undefined, live.current.settings.custom, effectiveGrade(accountRef.current?.student.id ?? null));
      setRun(null);
      setScreen('play');
    },
    [sfx],
  );
  /** Nouvelle partie classée (depuis l'accueil). */
  const start = useCallback(() => begin(null), [begin]);
  /** Rejouer : même type de partie (un entraînement reste un entraînement). */
  const restart = useCallback(() => begin(live.current.drill), [begin]);
  const startDrill = useCallback((letters: string) => begin(letters), [begin]);

  const pause = useCallback(() => {
    if (live.current.screen !== 'play') return;
    gameRef.current?.setPaused(true);
    setScreen('pause');
  }, []);

  const resume = useCallback(() => {
    (document.activeElement as HTMLElement | null)?.blur?.();
    gameRef.current?.setPaused(false);
    setScreen('play');
  }, []);

  const toMenu = useCallback(() => {
    live.current.drill = null;
    setDrill(null);
    gameRef.current?.startDemo();
    setScreen('menu');
    if (lost.current) onSessionLost();
  }, [onSessionLost]);

  // Clavier physique
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const game = gameRef.current;
      if (!game || e.ctrlKey || e.metaKey || e.altKey) return;
      const s = live.current.screen;

      if (s === 'play') {
        if (e.key === 'Escape') {
          e.preventDefault();
          pause();
        } else if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          if (!e.repeat) game.chariot();
        } else if (e.key === 'Backspace' || e.key === 'Tab') {
          e.preventDefault();
          game.release();
        } else if (e.key.length === 1) {
          const ch = e.key
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase();
          if (ch.length === 1 && ch >= 'a' && ch <= 'z') {
            e.preventDefault();
            if (!e.repeat) {
              sfx.unlock();
              game.key(ch);
            }
          }
        }
        return;
      }

      const target = e.target as HTMLElement | null;
      const interactive = !!target?.closest?.('button, input, a, select, textarea');
      if (s === 'pause') {
        if (e.key === 'Escape' || (e.key === 'Enter' && !interactive)) {
          e.preventDefault();
          resume();
        }
      } else if (s === 'menu') {
        if (e.key === 'Enter' && !interactive) {
          e.preventDefault();
          start();
        }
      } else if (s === 'over') {
        if (e.key === 'Enter' && !interactive && performance.now() - live.current.overAt > 550) {
          e.preventDefault();
          restart();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [pause, resume, start, restart, sfx]);

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

  // Premier contact tactile → on affiche le clavier à l'écran
  useEffect(() => {
    if (touch) return;
    const onTouch = () => setTouch(true);
    window.addEventListener('touchstart', onTouch, { once: true, passive: true });
    return () => window.removeEventListener('touchstart', onTouch);
  }, [touch]);

  // Entrées du clavier tactile
  const kbKey = useCallback(
    (ch: string) => {
      sfx.unlock();
      gameRef.current?.key(ch);
      if (live.current.settings.shake) {
        try {
          navigator.vibrate?.(8);
        } catch {
          /* sans vibreur */
        }
      }
    },
    [sfx],
  );
  const kbRelease = useCallback(() => gameRef.current?.release(), []);
  const kbChariot = useCallback(() => {
    gameRef.current?.chariot();
  }, []);

  const runId = useRef<string | null>(null);
  runId.current = run?.id ?? null;
  const recId = useRef<string | null>(null);
  recId.current = run?.recId ?? null;
  const rename = useCallback((name: string) => {
    setSettings((s) => ({ ...s, name }));
    if (runId.current) setScores(renameScore(runId.current, name || 'ANONYME'));
    if (recId.current) setRuns(renameRun(recId.current, name || 'ANONYME'));
  }, []);

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

  // Courbe de progression de l'élève connecté : lue sur le serveur (toutes ses parties, sur tous ses appareils)
  useEffect(() => {
    if (screen !== 'progress' || !token || serverRuns) return;
    let alive = true;
    fetchMyRuns(token, 'typing')
      .then((rows) => {
        if (!alive) return;
        setServerRuns(
          rows
            .filter((r) => r.mode === 'apprenti' || r.mode === 'standard' || r.mode === 'expert' || r.mode === 'perso')
            .map((r) => ({
              id: r.id,
              date: r.date,
              name: accName ?? 'ANONYME',
              diff: r.mode as Difficulty,
              kind: r.kind,
              score: r.score,
              wave: r.wave,
              wpm: r.wpm,
              acc: r.acc,
              correct: r.correct,
              time: r.duration,
            }))
            .reverse(), // le serveur renvoie les plus récentes d'abord
        );
      })
      .catch(() => alive && setServerRuns([]));
    return () => {
      alive = false;
    };
  }, [screen, token, serverRuns, accName]);

  const status =
    screen === 'pause'
      ? 'Jeu en pause'
      : screen === 'over' && run
        ? `Partie terminée. Score ${run.stats.score}, vague ${run.stats.wave}.`
        : screen === 'play'
          ? 'Partie en cours'
          : '';

  return (
    <div className="desk">
      <main className="sheet">
        <div className="stage">
          <canvas
            ref={canvasRef}
            className="absolute inset-0 block h-full w-full"
            role="img"
            aria-label="Zone de jeu : des taches d’encre portant des mots descendent vers la marge."
          />
          {screen === 'play' && (
            <button type="button" className="pause-btn" tabIndex={-1} aria-label="Pause" onClick={pause}>
              <span />
              <span />
            </button>
          )}
        </div>

        {kbOn && (screen === 'play' || screen === 'pause' || screen === 'over') && (
          <Keyboard
            layout={settings.layout}
            hint={hint}
            chargeReady={chargeReady}
            fingers={live.current.diff === 'apprenti' || drill !== null || (live.current.diff === 'perso' && live.current.settings.custom.autoTarget)}
            onKey={kbKey}
            onRelease={kbRelease}
            onChariot={kbChariot}
          />
        )}

        {screen === 'menu' && ses.sess && (
          <SessionIntro session={ses.sess} left={ses.left} onStart={start} onBack={() => (onSessions ?? onHome)()} />
        )}
        {screen === 'menu' && !ses.sess && (
          <Menu
            scores={scores}
            settings={settings}
            kbOn={kbOn}
            install={install}
            onStart={start}
            onChange={changeSettings}
            onClear={() => setScores(clearScores(settings.difficulty))}
            onProgress={() => setScreen('progress')}
            account={account}
            onHome={onHome}
          />
        )}
        {screen === 'progress' && (
          <Progress
            runs={account ? (serverRuns ?? []) : runs}
            loading={!!account && serverRuns === null}
            currentName={accName ?? settings.name}
            onBack={() => setScreen('menu')}
          />
        )}
        {screen === 'pause' && (
          <Pause
            settings={settings}
            kbOn={kbOn}
            onResume={resume}
            onRestart={restart}
            onMenu={toMenu}
            onHome={onHome}
            onChange={changeSettings}
          />
        )}
        {screen === 'over' && run && ses.sess && (
          <SessionOver
            session={ses.sess}
            state={ses.state}
            score={run.stats.score}
            left={ses.left}
            details={
              <p className="mt-1 text-[15px]">
                Vague <strong>{run.stats.wave}</strong> · Précision <strong>{Math.round(run.stats.accuracy * 100)} %</strong> · <strong>{Math.round(run.stats.wpm)}</strong> mots/min
              </p>
            }
            onRetry={restart}
            onBack={() => (onSessions ?? onHome)()}
          />
        )}
        {screen === 'over' && run && !ses.sess && (
          <GameOver
            stats={run.stats}
            diff={run.diff}
            drill={run.drill}
            layout={settings.layout}
            scores={scores}
            account={account}
            cloudStatus={cloudStatus}
            entryId={run.id}
            rank={run.rank}
            initialName={settings.name}
            kbOn={kbOn}
            onName={rename}
            onRestart={restart}
            onMenu={toMenu}
            onHome={onHome}
            onDrill={startDrill}
          />
        )}

        <p className="sr-only" role="status" aria-live="polite">
          {status}
        </p>
      </main>
    </div>
  );
}
