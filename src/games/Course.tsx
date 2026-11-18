import { useCallback, useEffect, useRef, useState } from 'react';
import { Dialog } from '../components/Dialog';
import { RotateNotice, useShortLandscape } from '../components/RotateNotice';
import type { ReactNode } from 'react';
import { BackButton, useFitRows } from '../components/BackButton';
import { DuelResult, ReviewNote } from '../components/EncreNotes';
import { useFit } from '../components/FitCard';
import { GameProgress } from '../components/GameProgress';
import { Check } from '../components/Screens';
import { SessionIntro, SessionOver, useSessionRun } from '../components/SessionPanels';
import { Sfx } from '../game/audio';
import { addLog } from '../game/progress';
import { CALM, calmBoss, feedBoss } from '../game/boss/state';
import { CourseGame } from '../game/course/engine';
import type { CourseResult } from '../game/course/engine';
import { ruleInfo, ruleOfCalc, rulesOf } from '../game/encre/rules';
import type { RuleId } from '../game/encre/rules';
import { DUEL_SIZE, activeRules, dayKey, loadStore, recordDuel, recordGame, saveStore, stateOf } from '../game/encre/tracker';
import type { RuleStatus } from '../game/encre/tracker';
import { COURSE_DIFFS, LEVELS, PAGES, boardKey, fmtNum, questionsMatching } from '../game/course/questions';
import type { BoardKey, CourseDiff, Level, Missed } from '../game/course/questions';
import {
  addCourseScore,
  recordCourseStamps,
  clearCourseScores,
  loadCourseDiff,
  loadCourseScores,
  saveCourseDiff,
  saveCourseLevel,
} from '../game/course/scores';
import type { CourseScore } from '../game/course/scores';
import { effectiveGrade, levelOf } from '../game/grade';
import { newRunId } from '../game/history';
import { summarize } from '../game/itemstats';
import { parseMath } from '../game/sessionConfig';
import { loadSettings, saveSettings } from '../game/storage';
import type { Settings, TextSize } from '../game/storage';
import { explain } from '../server/api';
import { enqueue, flush } from '../server/outbox';
import { dropCave, fetchBoard, sendItemStats, sendRun } from '../server/student';
import type { BoardRow, RunPayload, Scope, SessionInfo, StudentAccount } from '../server/types';

/**
 * « Course à l'encre » — jeu de calcul mental (CM1 / CM2) : trois lignes de cahier, des étiquettes-réponses,
 * une plume à placer sur la bonne ligne pendant qu'une tache d'encre la poursuit.
 */

type Phase = 'menu' | 'play' | 'pause' | 'over';
type MenuView = 'main' | 'howto' | 'scores' | 'progress' | 'settings';
type Cloud = 'off' | 'sending' | 'sent' | 'queued';

const TEXT_LABEL: Record<TextSize, string> = { normal: 'normal', large: 'grand', xlarge: 'très grand' };
const NEXT_SIZE: Record<TextSize, TextSize> = { normal: 'large', large: 'xlarge', xlarge: 'normal' };
const fmt = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
const levelLabel = (l: Level) => LEVELS.find((x) => x.id === l)?.label ?? l.toUpperCase();

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
  result: CourseResult;
  rank: number;
  id: string;
  record: boolean;
  encre?: {
    /** la Rature la plus présente dans cette partie */
    top: RuleId | null;
    /** Ratures apparues à la fin de cette partie */
    promoted: RuleId[];
    /** résultat du duel qui vient d'être joué */
    duel?: { rule: RuleId; before: RuleStatus; after: RuleStatus; won: boolean };
  };
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
      sesRef.current.submit(payload, () => {
        lost.current = true;
      });
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
      sendRun(acct.token, payload)
        .then((r) => {
          if (r === 'invalid_session') {
            enqueue(acct.student.id, payload);
            lost.current = true;
          }
          // suivi anonyme des calculs ratés (parties libres seulement : payload.balance n'existe ni en séance ni en entraînement)
          if (r === 'ok' && payload.balance) void sendItemStats(acct.token, 'math', result.level, result.diff, summarize(result.outcomes));
          if (id === live.current.recId) setCloud(r === 'ok' ? 'sent' : 'queued');
        })
        .catch(() => {
          enqueue(acct.student.id, payload);
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

function MenuScreen({ view, setView, level, diff, setDiff, settings, account, onChange, onStart, onTrain, onHome }: MenuProps) {
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
            <span>Entrée, ↑ ou glisser vers le haut&nbsp;: l’étiquette tombe tout de suite. Plus tu es rapide, plus tu gagnes de points&nbsp;!</span>
          </li>
          <li className="howto">
            <kbd className="kbd">✓</kbd>
            <span>6 pages de plus en plus difficiles. Une erreur fait monter l’encre&nbsp;; si elle atteint la plume, c’est perdu. Termine le cahier pour un bonus&nbsp;!</span>
          </li>
          <li className="howto howto-opt">
            <kbd className="kbd">Échap</kbd>
            <span>Pause. Tu peux aussi toucher le bouton pause en haut à droite.</span>
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
            <button
              type="button"
              className="btn btn-ghost mt-3"
              onClick={() => {
                if (window.confirm('Effacer les scores de cet appareil pour ce niveau ?')) setScores(clearCourseScores(boardKey(level, diff)));
              }}
            >
              Effacer les scores
            </button>
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
          <p className="tagline">Choisis la bonne réponse avant qu’elle ne tombe, et fais reculer l’encre&nbsp;!</p>
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

// ───────────────────────── Tableaux ─────────────────────────

function LocalTable({ scores, limit, highlightId }: { scores: CourseScore[]; limit: number; highlightId?: string }) {
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
            Série
          </th>
        </tr>
      </thead>
      <tbody>
        {shown.map(({ s, rank }) => (
          <tr key={s.id} className={s.id === highlightId ? 'me' : undefined}>
            <td>{rank}.</td>
            <td>{s.name}</td>
            <td className="num font-bold">{fmt(s.score)}</td>
            <td className="num">{s.streak}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Board({ account, level, refreshKey }: { account: StudentAccount; level: BoardKey; refreshKey: string }) {
  const [scope, setScope] = useState<Scope>('class');
  const [rows, setRows] = useState<BoardRow[] | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    if (refreshKey === 'sending') return;
    let alive = true;
    setRows(null);
    setErr('');
    fetchBoard(account.token, 'math', level, scope, 5)
      .then((r) => alive && setRows(r))
      .catch((e) => alive && setErr(explain(e)));
    return () => {
      alive = false;
    };
  }, [account.token, level, scope, refreshKey]);
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
        <p className="text-[15px] text-ink/75">Personne n’a encore joué ce niveau.</p>
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
                Série
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
  onDrill: (m: Missed[]) => void;
  onDuel: (rule: RuleId) => void;
  onMenu: () => void;
  onHome: () => void;
}

function OverScreen({ run, account, cloud, onRestart, onDrill, onDuel, onMenu, onHome }: OverProps) {
  const r = run.result;
  const [tab, setTab] = useState<'bilan' | 'classement'>('bilan');
  const [armed, setArmed] = useState(false);
  const rows = useFitRows(430, 30, 3, 8);
  useEffect(() => {
    const t = window.setTimeout(() => setArmed(true), 550);
    return () => window.clearTimeout(t);
  }, []);
  const scores = loadCourseScores(boardKey(r.level, r.diff));
  const total = r.correct + r.wrong;
  const title = r.drill ? 'Bravo, bien travaillé !' : r.won ? 'Cahier terminé !' : run.record ? 'Nouveau record !' : 'Rattrapé par l’encre';
  const showMissed = r.missed.slice(0, 4);

  return (
    <div className="overlay">
      <Dialog className="card card-game card-cover w-full max-w-[600px]" labelledBy="over-title">
        <div className="card-top">
          <BackButton onClick={onHome} />
          <span className="subhead">
            {levelLabel(r.level)} · {COURSE_DIFFS.find((d) => d.id === r.diff)?.label}
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
            {!r.drill && (
              <div className="mt-2 flex items-end gap-3">
                <div className="score-big" aria-label={`Score : ${r.score}`}>
                  {fmt(r.score)}
                </div>
                <div className="pb-2 text-[14px] uppercase tracking-[0.12em] text-ink/65">
                  points{run.rank > 0 ? ` · n° ${run.rank}` : ''} · page {r.page}/{PAGES}
                </div>
              </div>
            )}
            <dl className="mt-2 grid grid-cols-3 border-2 border-ink">
              {[
                ['Justes', `${r.correct}${total ? ` / ${total}` : ''}`],
                ['Fautes', String(r.wrong)],
                ['Meilleure série', String(r.bestStreak)],
              ].map(([k, v], i) => (
                <div key={k} className={`px-2 py-2 text-center ${i > 0 ? 'border-l-2 border-ink' : ''}`}>
                  <dt className="text-[14px] uppercase tracking-[0.08em] text-ink/65">{k}</dt>
                  <dd className="font-display text-[20px] leading-tight">{v}</dd>
                </div>
              ))}
            </dl>
            {!r.drill && r.correct > 0 && (
              <p className="mt-2 text-[15px] font-bold">
                {r.correct === 1 ? '1 calcul juste' : `${r.correct} calculs justes`}
                {r.bestStreak >= 3 ? `, dont ${r.bestStreak} d’affilée` : ''}. Bien joué&nbsp;!
              </p>
            )}
            {showMissed.length > 0 ? (
              <div className="cover-missed mt-2">
                <h3 className="subhead">Pour t’entraîner</h3>
                <ul className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1 text-[15px]">
                  {showMissed.map((m) => (
                    <li key={m.text} className="num">
                      {m.text.replace('?', fmtNum(m.answer))}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="mt-2 text-[15px] text-ink/75">{r.wrong === 0 ? 'Aucune faute : parfait !' : ''}</p>
            )}
            {run.encre?.duel && <DuelResult duel={run.encre.duel} />}
            {run.encre?.top && !r.drill && <ReviewNote rule={run.encre.top} onDuel={onDuel} />}
          </>
        ) : (
          <div className="mt-2">
            <LocalTable scores={scores} limit={rows} highlightId={run.id} />
            {account && <Board account={account} level={boardKey(r.level, r.diff)} refreshKey={cloud} />}
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
          {r.missed.length > 0 && !r.drill && (
            <button type="button" className="btn btn-ghost" onClick={() => onDrill(r.missed)}>
              S’entraîner<span className="cover-long"> sur mes fautes</span> ({r.missed.length})
            </button>
          )}
          <button type="button" className="btn btn-ghost" onClick={onMenu}>
            Menu du jeu
          </button>
        </div>
      </Dialog>
    </div>
  );
}
