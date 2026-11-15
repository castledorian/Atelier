import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { BackButton, useFitRows } from '../components/BackButton';
import { Check } from '../components/Screens';
import { Sfx } from '../game/audio';
import { CourseGame } from '../game/course/engine';
import type { CourseResult } from '../game/course/engine';
import { LEVELS } from '../game/course/questions';
import type { Level, Missed } from '../game/course/questions';
import {
  addCourseScore,
  clearCourseScores,
  loadCourseLevel,
  loadCourseScores,
  saveCourseLevel,
} from '../game/course/scores';
import type { CourseScore } from '../game/course/scores';
import { newRunId } from '../game/history';
import { loadSettings, saveSettings } from '../game/storage';
import type { Settings, TextSize } from '../game/storage';
import { explain } from '../server/api';
import { enqueue, flush } from '../server/outbox';
import { fetchBoard, sendRun } from '../server/student';
import type { BoardRow, RunPayload, Scope, StudentAccount } from '../server/types';

/**
 * « Course à l'encre » — jeu de calcul mental (CM1 / CM2) : trois lignes de cahier, des étiquettes-réponses,
 * une plume à placer sur la bonne ligne pendant qu'une tache d'encre la poursuit.
 */

type Phase = 'menu' | 'play' | 'pause' | 'over';
type MenuView = 'main' | 'howto' | 'scores' | 'settings';
type Cloud = 'off' | 'sending' | 'sent' | 'queued';

const TEXT_LABEL: Record<TextSize, string> = { normal: 'normal', large: 'grand', xlarge: 'très grand' };
const NEXT_SIZE: Record<TextSize, TextSize> = { normal: 'large', large: 'xlarge', xlarge: 'normal' };
const fmt = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
const levelLabel = (l: Level) => LEVELS.find((x) => x.id === l)?.label ?? l.toUpperCase();

interface Props {
  account: StudentAccount | null;
  onHome: () => void;
  onSessionLost: () => void;
}

interface Run {
  result: CourseResult;
  rank: number;
  id: string;
  record: boolean;
}

export default function Course({ account, onHome, onSessionLost }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<CourseGame | null>(null);
  const [sfx] = useState(() => new Sfx());
  const [phase, setPhase] = useState<Phase>('menu');
  const [view, setView] = useState<MenuView>('main');
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [level, setLevel] = useState<Level>(loadCourseLevel);
  const [run, setRun] = useState<Run | null>(null);
  const [cloud, setCloud] = useState<Cloud>('off');
  const lost = useRef(false);
  const accountRef = useRef(account);
  accountRef.current = account;
  const live = useRef({ phase, level, settings, overAt: 0, drill: false, recId: '' });
  live.current.phase = phase;
  live.current.level = level;
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
      mode: result.level,
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
      const before = loadCourseScores(result.level);
      record = before.length === 0 ? result.score > 0 : result.score > before[0].score;
      const res = addCourseScore(result.level, { id, name, score: result.score, streak: result.bestStreak, date: Date.now() });
      rank = res.rank;
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
    } else setCloud('off');
    live.current.drill = result.drill;
    live.current.overAt = performance.now();
    setRun({ result, rank, id, record });
    setPhase('over');
  };

  // ───────────── Moteur ─────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const game = new CourseGame(canvas, sfx, { onOver: (r) => onOver.current(r) });
    gameRef.current = game;
    try {
      if (localStorage.getItem('atelier.debug')) (window as unknown as { __course?: CourseGame }).__course = game;
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
    document.documentElement.dataset.text = settings.textSize;
  }, [settings, sfx]);

  const change = useCallback(
    (patch: Partial<Settings>) => {
      if (patch.sound) sfx.unlock();
      setSettings((s) => ({ ...s, ...patch }));
    },
    [sfx],
  );

  const begin = useCallback(
    (lv: Level, drill?: Missed[]) => {
      sfx.unlock();
      (document.activeElement as HTMLElement | null)?.blur?.();
      saveCourseLevel(lv);
      setLevel(lv);
      live.current.level = lv;
      live.current.drill = !!drill;
      gameRef.current?.start(lv, { drill });
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
        } else if (k === 'arrowup' || k === 'z' || k === 'w' || k === 'k') {
          e.preventDefault();
          game.step(-1);
        } else if (k === 'arrowdown' || k === 's' || k === 'j') {
          e.preventDefault();
          game.step(1);
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
  const onPointer = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (live.current.phase !== 'play') return;
    if (e.type === 'pointermove' && e.buttons === 0) return;
    const r = e.currentTarget.getBoundingClientRect();
    sfx.unlock();
    gameRef.current?.moveToY(e.clientY - r.top);
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
            aria-label="Zone de jeu : une plume sur trois lignes de cahier choisit la bonne réponse pendant qu’une tache d’encre la poursuit."
            onPointerDown={onPointer}
            onPointerMove={onPointer}
          />
          {phase === 'play' && (
            <button type="button" className="pause-btn" tabIndex={-1} aria-label="Pause" onClick={pause}>
              <span />
              <span />
            </button>
          )}
        </div>

        {phase === 'menu' && (
          <MenuScreen
            view={view}
            setView={setView}
            level={level}
            setLevel={setLevel}
            settings={settings}
            account={account}
            onChange={change}
            onStart={begin}
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
            </section>
          </div>
        )}
        {phase === 'over' && run && (
          <OverScreen
            run={run}
            account={account}
            cloud={cloud}
            onRestart={() => begin(run.result.level)}
            onDrill={(m) => begin(run.result.level, m)}
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
  settings: Settings;
  account: StudentAccount | null;
  onChange: (p: Partial<Settings>) => void;
  onStart: (l: Level) => void;
  onHome: () => void;
}

function MenuScreen({ view, setView, level, setLevel, settings, account, onChange, onStart, onHome }: MenuProps) {
  const [scores, setScores] = useState<CourseScore[]>(() => loadCourseScores(level));
  const [sLevel, setSLevel] = useState<Level>(level);
  useEffect(() => {
    setScores(loadCourseScores(sLevel));
  }, [sLevel, view]);

  if (view !== 'main') {
    const titles = { howto: 'Comment jouer', scores: 'Scores', settings: 'Réglages' } as const;
    let body: ReactNode = null;
    if (view === 'howto') {
      body = (
        <ul className="howto-list">
          <li className="howto">
            <kbd className="kbd kbd-sym">↑↓</kbd>
            <span>Place la plume sur la ligne de la bonne réponse. Clavier&nbsp;: ↑ ↓ ou 1 2 3. Tablette&nbsp;: touche une ligne.</span>
          </li>
          <li className="howto">
            <kbd className="kbd">✗</kbd>
            <span>Une erreur&nbsp;: la tache bondit. Si elle attrape la plume, c’est perdu.</span>
          </li>
          <li className="howto">
            <kbd className="kbd">✓</kbd>
            <span>Une bonne réponse repousse la tache. En série&nbsp;: points ×2, ×3… et bouclier tous les 5.</span>
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
          <div className="seg mb-2" role="tablist" aria-label="Niveau">
            {LEVELS.map((l) => (
              <button key={l.id} type="button" role="tab" aria-selected={sLevel === l.id} className="seg-b" onClick={() => setSLevel(l.id)}>
                {l.label}
              </button>
            ))}
          </div>
          <LocalTable scores={scores} limit={6} />
          {account && <Board account={account} level={sLevel} refreshKey="menu" />}
          {scores.length > 0 && (
            <button
              type="button"
              className="btn btn-ghost mt-3"
              onClick={() => {
                if (window.confirm('Effacer les scores de cet appareil pour ce niveau ?')) setScores(clearCourseScores(sLevel));
              }}
            >
              Effacer les scores
            </button>
          )}
        </>
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
      <section className="card card-game card-menu w-full max-w-[600px]" aria-labelledby="game-title">
        <div className="menu-a">
          <div className="card-top">
            <BackButton onClick={onHome} />
          </div>
          <p className="eyebrow">Calcul mental · CM1 et CM2</p>
          <h1 id="game-title" className="title-sm">
            Course à l’encre
          </h1>
          <div className="rule" aria-hidden="true" />
          <p className="tagline">Place la plume sur la ligne de la bonne réponse et fuis la tache d’encre&nbsp;!</p>
          <div className="tools" data-n="3" role="group" aria-label="Plus d’options">
            <button type="button" className="tool" onClick={() => setView('howto')}>
              <span aria-hidden="true">?</span> Comment jouer
            </button>
            <button type="button" className="tool" onClick={() => setView('scores')}>
              <span aria-hidden="true">★</span> Scores
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
          <h2 className="subhead mt-[var(--sp)]">Choisis ton niveau pour jouer</h2>
          <div className="games games-levels" data-n="2">
            {LEVELS.map((l) => {
              const best = loadCourseScores(l.id)[0]?.score;
              return (
                <button
                  key={l.id}
                  type="button"
                  className="gcard"
                  autoFocus={l.id === level}
                  onFocus={() => setLevel(l.id)}
                  onClick={() => onStart(l.id)}
                >
                  <span className="gcard-name">{l.label}</span>
                  <span className="gcard-text">{l.hint}</span>
                  <span className="gcard-go">{best ? `Record : ${fmt(best)}` : 'Jouer →'}</span>
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

function Board({ account, level, refreshKey }: { account: StudentAccount; level: Level; refreshKey: string }) {
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
  onMenu: () => void;
  onHome: () => void;
}

function OverScreen({ run, account, cloud, onRestart, onDrill, onMenu, onHome }: OverProps) {
  const r = run.result;
  const [tab, setTab] = useState<'bilan' | 'classement'>('bilan');
  const [armed, setArmed] = useState(false);
  const rows = useFitRows(430, 30, 3, 8);
  useEffect(() => {
    const t = window.setTimeout(() => setArmed(true), 550);
    return () => window.clearTimeout(t);
  }, []);
  const scores = loadCourseScores(r.level);
  const total = r.correct + r.wrong;
  const title = r.drill ? 'Bravo, bien travaillé !' : r.score === 0 ? 'Rattrapé par l’encre' : run.record ? 'Nouveau record !' : 'Rattrapé par l’encre';
  const showMissed = r.missed.slice(0, 4);

  return (
    <div className="overlay">
      <section className="card card-game card-cover w-full max-w-[600px]" role="dialog" aria-modal="true" aria-labelledby="over-title">
        <div className="card-top">
          <BackButton onClick={onHome} />
          <span className="subhead">{levelLabel(r.level)}</span>
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
                <div className="pb-2 text-[13px] uppercase tracking-[0.12em] text-ink/65">
                  points{run.rank > 0 ? ` · n° ${run.rank}` : ''}
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
                  <dt className="text-[11px] uppercase tracking-[0.08em] text-ink/65">{k}</dt>
                  <dd className="font-display text-[20px] leading-tight">{v}</dd>
                </div>
              ))}
            </dl>
            {showMissed.length > 0 ? (
              <div className="cover-missed mt-2">
                <h3 className="subhead">À retravailler</h3>
                <ul className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1 text-[15px]">
                  {showMissed.map((m) => (
                    <li key={m.text} className="num">
                      {m.text.includes('?') ? m.text.replace('?', String(m.answer)) : m.text}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="mt-2 text-[15px] text-ink/75">{r.wrong === 0 ? 'Aucune faute : parfait !' : ''}</p>
            )}
          </>
        ) : (
          <div className="mt-2">
            <LocalTable scores={scores} limit={rows} highlightId={run.id} />
            {account && <Board account={account} level={r.level} refreshKey={cloud} />}
          </div>
        )}

        {account && (
          <p className="mt-2 text-[13px] text-ink/75" aria-live="polite">
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
      </section>
    </div>
  );
}
