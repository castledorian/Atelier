import { useCallback, useEffect, useRef, useState } from 'react';
import { Keyboard } from './components/Keyboard';
import { GameOver, Menu, Pause } from './components/Screens';
import { Sfx } from './game/audio';
import type { Difficulty } from './game/difficulty';
import { Game } from './game/engine';
import type { RunStats } from './game/engine';
import {
  addScore,
  clearScores,
  loadScores,
  loadSettings,
  renameScore,
  saveSettings,
} from './game/storage';
import type { ScoreEntry, Settings } from './game/storage';

type Screen = 'menu' | 'play' | 'pause' | 'over';

interface RunResult {
  stats: RunStats;
  diff: Difficulty;
  drill: boolean;
  id: string | null;
  rank: number;
}

function detectTouch() {
  if (typeof window === 'undefined') return false;
  const coarse = !!window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  return coarse && navigator.maxTouchPoints > 0;
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game | null>(null);
  const [sfx] = useState(() => new Sfx());
  const [screen, setScreen] = useState<Screen>('menu');
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [scores, setScores] = useState<ScoreEntry[]>(loadScores);
  const [run, setRun] = useState<RunResult | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [chargeReady, setChargeReady] = useState(false);
  const [touch, setTouch] = useState(detectTouch);
  const [drill, setDrill] = useState<string | null>(null);

  // Mode Apprenti : le clavier à l'écran (touche à frapper en surbrillance) est affiché par défaut.
  const kbOn = settings.keyboard ?? (touch || settings.difficulty === 'apprenti' || drill !== null);

  // Valeurs « vivantes » pour les écouteurs globaux
  const live = useRef({ screen, settings, overAt: 0, diff: settings.difficulty as Difficulty, drill: null as string | null });
  live.current.screen = screen;
  live.current.settings = settings;

  const onGameOver = useRef<(s: RunStats) => void>(() => {});
  onGameOver.current = (stats) => {
    if (live.current.drill) {
      // entraînement : pas de classement
      setRun({ stats, diff: live.current.diff, drill: true, id: null, rank: -1 });
      live.current.overAt = performance.now();
      setScreen('over');
      return;
    }
    const res = addScore({
      diff: live.current.diff,
      name: live.current.settings.name || 'ANONYME',
      score: stats.score,
      wave: stats.wave,
      wpm: stats.wpm,
      acc: Math.round(stats.accuracy * 100),
    });
    setScores(res.scores);
    setRun({ stats, diff: live.current.diff, drill: false, id: res.id, rank: res.rank });
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
    saveSettings(settings);
    sfx.enabled = settings.sound;
    gameRef.current?.setOptions({ shake: settings.shake, touch: kbOn, layout: settings.layout });
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
      sfx.unlock();
      (document.activeElement as HTMLElement | null)?.blur?.();
      live.current.diff = live.current.settings.difficulty; // la difficulté est figée pendant la partie
      live.current.drill = letters;
      setDrill(letters);
      gameRef.current?.start(live.current.diff, letters ?? undefined);
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
  }, []);

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
  const rename = useCallback((name: string) => {
    setSettings((s) => ({ ...s, name }));
    if (runId.current) setScores(renameScore(runId.current, name || 'ANONYME'));
  }, []);

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

        {kbOn && screen !== 'menu' && (
          <Keyboard
            layout={settings.layout}
            hint={hint}
            chargeReady={chargeReady}
            fingers={live.current.diff === 'apprenti' || drill !== null}
            onKey={kbKey}
            onRelease={kbRelease}
            onChariot={kbChariot}
          />
        )}

        {screen === 'menu' && (
          <Menu
            scores={scores}
            settings={settings}
            kbOn={kbOn}
            onStart={start}
            onChange={changeSettings}
            onClear={() => setScores(clearScores(settings.difficulty))}
          />
        )}
        {screen === 'pause' && (
          <Pause
            settings={settings}
            kbOn={kbOn}
            onResume={resume}
            onRestart={restart}
            onMenu={toMenu}
            onChange={changeSettings}
          />
        )}
        {screen === 'over' && run && (
          <GameOver
            stats={run.stats}
            diff={run.diff}
            drill={run.drill}
            layout={settings.layout}
            scores={scores}
            entryId={run.id}
            rank={run.rank}
            initialName={settings.name}
            kbOn={kbOn}
            onName={rename}
            onRestart={restart}
            onMenu={toMenu}
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
