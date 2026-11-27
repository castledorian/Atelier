import { useCallback, useEffect, useRef, useState } from 'react';
import { Dialog } from '../components/Dialog';
import { RotateNotice, useShortLandscape } from '../components/RotateNotice';
import { BackButton } from '../components/BackButton';
import { SessionIntro, SessionOver, useSessionRun } from '../components/SessionPanels';
import { Sfx } from '../game/audio';
import { addLog } from '../game/progress';
import { CALM, calmBoss, feedBoss } from '../game/boss/state';
import { CourseGame } from '../game/course/engine';
import type { CourseResult } from '../game/course/engine';
import { ruleInfo, ruleOfCalc, rulesOf } from '../game/encre/rules';
import type { RuleId } from '../game/encre/rules';
import { activeRules, dayKey, DUEL_SIZE, loadStore, recordDuel, recordGame, saveStore, stateOf } from '../game/encre/tracker';
import { boardKey, PAGES, questionsMatching } from '../game/course/questions';
import type { CourseDiff, Level, Missed } from '../game/course/questions';
import { addCourseScore, loadCourseDiff, loadCourseScores, recordCourseStamps, saveCourseDiff, saveCourseLevel } from '../game/course/scores';
import { effectiveGrade, levelOf } from '../game/grade';
import { newRunId } from '../game/history';
import { summarize } from '../game/itemstats';
import { parseMath } from '../game/sessionConfig';
import { loadSettings, saveSettings } from '../game/storage';
import type { Settings } from '../game/storage';
import { enqueue, flush, queueStudentItems } from '../server/outbox';
import { dropCave, sendItemStats, sendRun } from '../server/student';
import type { RunPayload, SessionInfo, StudentAccount } from '../server/types';
import type { Cloud, MenuView, Phase, Run } from './course/types';
import { SettingsRow } from './course/SettingsRow';
import { MenuScreen } from './course/MenuScreen';
import { OverScreen } from './course/OverScreen';

/**
 * « Course à l'encre » — jeu de calcul mental (CM1 / CM2) : trois lignes de cahier, des étiquettes-réponses,
 * une plume à placer sur la bonne ligne pendant qu'une tache d'encre la poursuit.
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

export default function Course({ account, onHome, onSessionLost, session, onSessions }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<CourseGame | null>(null);
  const [sfx] = useState(() => new Sfx());
  const [phase, setPhase] = useState<Phase>('menu');
  const [view, setView] = useState<MenuView>('main');
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [level, setLevel] = useState<Level>(() => (session ? parseMath(session.config).level : levelOf(effectiveGrade(account?.student.id ?? null))));
  const [diff, setDiff] = useState<CourseDiff>(() => (session ? parseMath(session.config).diff : loadCourseDiff()));
  const ses = useSessionRun(account, session);
  const sesRef = useRef(ses);
  sesRef.current = ses;
  const [run, setRun] = useState<Run | null>(null);
  const [cloud, setCloud] = useState<Cloud>('off');
  const [summon, setSummon] = useState<RuleId | null>(null);
  const summonTimer = useRef(0);
  const lost = useRef(false);
  const accountRef = useRef(account);
  accountRef.current = account;
  const live = useRef({ phase, level, diff, settings, overAt: 0, drill: false, recId: '', duelRule: null as RuleId | null });
  live.current.phase = phase;
  live.current.level = level;
  live.current.diff = diff;
  live.current.settings = settings;

  // ───────────── Fin de partie ─────────────
  const onOver = useRef<(r: CourseResult) => void>(() => {});
  onOver.current = (result) => {
    const acct = accountRef.current;
    const st = live.current.settings;
    const name = (acct ? acct.student.name.slice(0, 12).toUpperCase() : st.name) || 'ANONYME';
    const id = newRunId();
    live.current.recId = id;
    const total = result.correct + result.wrong;
    const payload: RunPayload = {
      clientId: id,
      game: 'math',
      mode: boardKey(result.level, result.diff),
      kind: result.drill ? 'drill' : 'game',
      score: result.score,
      wave: result.bestStreak,
      wpm: 0,
      acc: total ? Math.round((result.correct / total) * 100) : 0,
      correct: result.correct,
      duration: Math.min(7200, Math.max(0, result.time)),
      playedMs: Date.now(),
    };
    let rank = -1;
    let record = false;
    if (!result.drill && result.score > 0) {
      const before = loadCourseScores(boardKey(result.level, result.diff));
      record = before.length === 0 ? result.score > 0 : result.score > before[0].score;
      const res = addCourseScore(boardKey(result.level, result.diff), { id, name, score: result.score, streak: result.bestStreak, date: Date.now() });
      rank = res.rank;
      recordCourseStamps(result.won ? PAGES : result.page - 1);
    }
    // L'Encre : les fautes de la partie sont rangées par règle, sur cet appareil seulement
    let encre: Run['encre'];
    const duelRule = live.current.duelRule;
    live.current.duelRule = null;
    if (result.drill) {
      if (duelRule) {
        const d = recordDuel(loadStore(), duelRule, result.cleared, dayKey());
        saveStore(d.store);
        encre = { top: null, promoted: [], duel: { rule: duelRule, before: d.before, after: d.after, won: result.cleared } };
      }
    } else if (total > 0) {
      const faults: Partial<Record<RuleId, number>> = {};
      for (const m of result.missed) {
        const rule = ruleOfCalc(m.text);
        if (rule) faults[rule] = (faults[rule] ?? 0) + m.count;
      }
      const g = recordGame(loadStore(), rulesOf('calcul'), faults);
      saveStore(g.store);
      const seen = (Object.keys(faults) as RuleId[])
        .filter((id) => ['a-revoir', 'progres'].includes(stateOf(g.store[id])))
        .sort((a, b) => (faults[b] ?? 0) - (faults[a] ?? 0));
      encre = { top: seen[0] ?? null, promoted: g.promoted };
    }
    if (sesRef.current.sess) {
      // séance de classe : l'essai compte pour l'évaluation, il ne va ni dans les scores de l'appareil ni dans les classements libres
      sesRef.current.submit(
        payload,
        () => {
          lost.current = true;
        },
        { game: 'math', level: result.level, difficulty: result.diff, items: summarize(result.outcomes) },
      );
      live.current.drill = false;
      live.current.overAt = performance.now();
      setRun({ result, rank: -1, id, record: false });
      setPhase('over');
      return;
    }
    if (!result.drill && total > 0) {
      payload.balance = {
        game: 'math',
        level: result.level,
        difficulty: result.diff,
        version: 1,
        outcome: result.won ? 'finished' : 'lost',
        score: result.score,
        duration: payload.duration,
        rounds_ok: result.correct,
        rounds_err: result.wrong,
        pages: result.pages,
      };
    }
    if (!result.drill && total > 0) {
      addLog('math', { t: Date.now(), ok: result.correct, err: result.wrong, score: result.score, board: boardKey(result.level, result.diff) });
      feedBoss(result.correct, result.wrong);
      payload.cave = { ink: result.wrong, power: result.correct };
    }
    // entraînement ciblé réussi : la règle revue retire de l'encre à la créature de la grotte
    if (result.drill && result.cleared) {
      calmBoss();
      payload.cave = { ink: -CALM, power: 0 };
    }
    if (acct && result.correct > 0) {
      setCloud('sending');
      // fiche de l'élève (rattachée à lui, contrairement au suivi anonyme) : toute partie sauf l'entraînement ciblé
      const mine = result.drill ? null : { studentId: acct.student.id, clientId: payload.clientId, game: 'math' as const, level: result.level, difficulty: result.diff, items: summarize(result.outcomes) };
      sendRun(acct.token, payload)
        .then((r) => {
          if (r === 'invalid_session') {
            enqueue(acct.student.id, payload);
            lost.current = true;
          }
          // suivi anonyme des calculs ratés (parties libres seulement : payload.balance n'existe ni en séance ni en entraînement)
          if (r === 'ok' && payload.balance) void sendItemStats(acct.token, 'math', result.level, result.diff, summarize(result.outcomes));
          if (mine && (r === 'ok' || r === 'invalid_session')) queueStudentItems(acct.token, mine, r === 'ok');
          if (id === live.current.recId) setCloud(r === 'ok' ? 'sent' : 'queued');
        })
        .catch(() => {
          enqueue(acct.student.id, payload);
          if (mine) queueStudentItems(acct.token, mine, false);
          if (id === live.current.recId) setCloud('queued');
        });
    } else {
      // partie sans bonne réponse : non envoyée, mais ses fautes nourrissent quand même la grotte de la classe
      if (acct && payload.cave && !payload.sessionId) void dropCave(acct.student.id, acct.token, id, payload.cave.ink, payload.cave.power);
      setCloud('off');
    }
    live.current.drill = result.drill;
    live.current.overAt = performance.now();
    setRun({ result, rank, id, record, encre });
    setPhase('over');
  };

  // ───────────── Moteur ─────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const game = new CourseGame(canvas, sfx, {
      onOver: (r) => onOver.current(r),
      onSummon: (rule) => {
        setSummon(rule);
        window.clearTimeout(summonTimer.current);
        summonTimer.current = window.setTimeout(() => setSummon(null), 5000);
      },
    });
    gameRef.current = game;
    try {
      if (localStorage.getItem('atelier.debug')) (window as unknown as { __course?: CourseGame }).__course = game;
    } catch {
      /* ignoré */
    }
    return () => {
      window.clearTimeout(summonTimer.current);
      game.destroy();
      gameRef.current = null;
    };
  }, [sfx]);

  useEffect(() => {
    saveSettings(settings);
    sfx.enabled = settings.sound;
    gameRef.current?.setOptions({ shake: settings.shake });
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
    (lv: Level, drill?: Missed[], duel?: RuleId) => {
      const s = sesRef.current;
      if (s.sess && (s.left <= 0 || !s.sess.active)) return; // essais épuisés ou séance fermée
      sfx.unlock();
      (document.activeElement as HTMLElement | null)?.blur?.();
      if (!s.sess) {
        saveCourseLevel(lv);
        saveCourseDiff(live.current.diff);
      }
      setLevel(lv);
      live.current.level = lv;
      live.current.drill = !!drill;
      live.current.duelRule = duel ?? null;
      setSummon(null);
      // en séance de classe l'évaluation reste la même pour tous : l'Encre n'y revient pas
      gameRef.current?.start(lv, { drill, diff: live.current.diff, focus: s.sess || drill ? undefined : activeRules(loadStore(), 'calcul') });
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
    gameRef.current?.startDemo(live.current.level);
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
        } else if (k === 'arrowleft' || k === 'q' || k === 'a') {
          e.preventDefault();
          game.step(-1);
        } else if (k === 'arrowright' || k === 'd') {
          e.preventDefault();
          game.step(1);
        } else if (k === 'enter' || k === ' ' || k === 'arrowup' || k === 'arrowdown' || k === 's') {
          e.preventDefault();
          if (!e.repeat) game.validate();
        } else if (k === '1' || k === '2' || k === '3') {
          e.preventDefault();
          game.moveTo(Number(k) - 1);
        }
      } else if (p === 'pause') {
        if (e.key === 'Escape' || (e.key === 'Enter' && !interactive)) {
          e.preventDefault();
          resume();
        }
      } else if (p === 'menu') {
        if (e.key === 'Enter' && !interactive) {
          e.preventDefault();
          begin(live.current.level);
        }
      } else if (p === 'over') {
        if ((e.key === 'Enter' || e.key === ' ') && !interactive && performance.now() - live.current.overAt > 550) {
          e.preventDefault();
          begin(live.current.level);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pause, resume, begin]);

  // Téléphone en paysage : trop peu de hauteur pour ce jeu, on met en pause et on demande de tourner l'appareil
  const shortLandscape = useShortLandscape();
  useEffect(() => {
    if (shortLandscape) pause();
  }, [shortLandscape, pause]);

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

  // Toucher / souris : la plume va sur la ligne touchée
  // Glisser vers le haut valide (comme la flèche ↑) ; glisser sur le côté change de colonne.
  const touch = useRef<{ x: number; y: number; done: boolean } | null>(null);
  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (live.current.phase !== 'play') return;
    const r = e.currentTarget.getBoundingClientRect();
    sfx.unlock();
    touch.current = { x: e.clientX, y: e.clientY, done: false };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* ignoré */
    }
    gameRef.current?.moveToX(e.clientX - r.left);
  };
  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const t = touch.current;
    if (!t || live.current.phase !== 'play') return;
    const dx = e.clientX - t.x;
    const dy = e.clientY - t.y;
    if (!t.done && dy < -44 && -dy > 1.4 * Math.abs(dx)) {
      t.done = true;
      gameRef.current?.validate();
      return;
    }
    if (t.done || Math.abs(dx) < 14 || Math.abs(dx) < Math.abs(dy)) return;
    const r = e.currentTarget.getBoundingClientRect();
    gameRef.current?.moveToX(e.clientX - r.left);
  };
  const onUp = () => {
    touch.current = null;
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
      {shortLandscape && <RotateNotice game="La Course à l’encre" />}
      <main className="sheet">
        <div className="stage">
          <canvas
            ref={canvasRef}
            className="absolute inset-0 block h-full w-full"
            style={{ touchAction: 'none' }}
            role="img"
            aria-label="Zone de jeu : des étiquettes de calcul tombent sur trois colonnes ; la plume se place sous la bonne réponse pendant que l’encre monte."
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
          />
          {phase === 'play' && summon && (
            <div className="summon" role="status">
              <span>
                <strong>Astuce : {ruleInfo(summon).name}.</strong> {ruleInfo(summon).parade}
              </span>
            </div>
          )}
          {phase === 'play' && (
            <button type="button" className="pause-btn" tabIndex={-1} aria-label="Pause" onClick={pause}>
              <span />
              <span />
            </button>
          )}
        </div>

        <div className="validate-bar" aria-hidden={phase !== 'play'} style={{ visibility: phase === 'play' ? 'visible' : 'hidden' }}>
          <button type="button" className="vb-side" tabIndex={-1} aria-label="Colonne de gauche" onMouseDown={(e) => e.preventDefault()} onClick={() => gameRef.current?.step(-1)}>
            ◀
          </button>
          <button type="button" className="vb-main" tabIndex={-1} onMouseDown={(e) => e.preventDefault()} onClick={() => gameRef.current?.validate()}>
            Valider <span aria-hidden="true">✓</span>
            <small>Entrée</small>
          </button>
          <button type="button" className="vb-side" tabIndex={-1} aria-label="Colonne de droite" onMouseDown={(e) => e.preventDefault()} onClick={() => gameRef.current?.step(1)}>
            ▶
          </button>
        </div>

        {phase === 'menu' && ses.sess && (
          <SessionIntro session={ses.sess} left={ses.left} onStart={() => begin(level)} onBack={() => (onSessions ?? onHome)()} />
        )}
        {phase === 'menu' && !ses.sess && (
          <MenuScreen
            view={view}
            setView={setView}
            level={level}
            setLevel={setLevel}
            diff={diff}
            setDiff={setDiff}
            settings={settings}
            account={account}
            onChange={change}
            onStart={begin}
            onTrain={(rule) => begin(level, questionsMatching(level, (t) => ruleOfCalc(t) === rule, DUEL_SIZE).map((q) => ({ ...q, count: 1 })), rule)}
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
                  <button type="button" className="btn btn-ghost" onClick={() => begin(level)}>
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
                Justes : <strong>{run.result.correct}</strong> · Fautes : <strong>{run.result.wrong}</strong> · Page {run.result.page}/{PAGES}
              </p>
            }
            onRetry={() => begin(run.result.level)}
            onBack={() => (onSessions ?? onHome)()}
          />
        )}
        {phase === 'over' && run && !ses.sess && (
          <OverScreen
            run={run}
            account={account}
            cloud={cloud}
            onRestart={() => begin(run.result.level)}
            onDrill={(m) => begin(run.result.level, m)}
            onDuel={(rule) => begin(run.result.level, questionsMatching(run.result.level, (t) => ruleOfCalc(t) === rule, DUEL_SIZE).map((q) => ({ ...q, count: 1 })), rule)}
            onMenu={toMenu}
            onHome={onHome}
          />
        )}
        <p className="sr-only" role="status" aria-live="polite">
          {status}
        </p>
      </main>
    </div>
  );
}
