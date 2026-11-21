import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { BackButton } from '../components/BackButton';
import { ConfirmButton } from '../components/ConfirmButton';
import { SettingsRow, StampTitle } from '../components/MenuParts';
import { SessionIntro, SessionOver, useSessionRun } from '../components/SessionPanels';
import { Sfx } from '../game/audio';
import { newRunId } from '../game/history';
import { parseFacteur } from '../game/sessionConfig';
import { enqueue, flush } from '../server/outbox';
import { dropCave, sendItemStats, sendRun } from '../server/student';
import { feedBoss } from '../game/boss/state';
import type { RunPayload } from '../server/types';
import { effectiveGrade, gradeLabel } from '../game/grade';
import { loadSettings, saveSettings } from '../game/storage';
import type { Settings } from '../game/storage';
import { hasPicture } from '../game/facteur/pictures';
import { Mailbox, Mark, PictureView } from '../components/FacteurParts';
import { FacteurGame, TRAVEL_SECONDS, newSession } from '../game/facteur/rounds';
import type { FResult, Parcel } from '../game/facteur/rounds';
import { clearFScores, loadFBest, loadFLevel, saveFLevel, saveFResult } from '../game/facteur/scores';
import { GameProgress } from '../components/GameProgress';
import { addLog } from '../game/progress';
import { facteurOutcome, summarize as summarizeItems } from '../game/itemstats';
import { clearReview, noteReview, reviewWords } from '../game/facteur/review';
import { preloadVoices, say as readAloud, stopSaying } from '../game/facteur/voice';
import { F_LEVELS, WORDS, isFLevel, plain } from '../game/facteur/words';
import type { FLevel } from '../game/facteur/words';
import type { SessionInfo, StudentAccount } from '../server/types';

/**
 * « Le facteur » — lecture au CP : des colis (une image) arrivent sur le tapis, on les range dans la boîte aux lettres qui porte le bon mot.
 * Pas de chrono, pas de vie : une erreur grise la boîte et le colis reviendra plus tard (voir src/game/facteur/rounds.ts).
 */

interface Props {
  account: StudentAccount | null;
  onHome: () => void;
  onSessionLost: () => void;
  session?: SessionInfo | null;
  onSessions?: () => void;
}

type Phase = 'menu' | 'play' | 'over';
type MenuView = 'main' | 'howto' | 'scores' | 'progress' | 'settings';

const stars = (n: number) => '★'.repeat(n) + '☆'.repeat(3 - n);
const fmt = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

export default function Facteur({ account, onHome, onSessionLost, session, onSessions }: Props) {
  const [phase, setPhase] = useState<Phase>('menu');
  const [view, setView] = useState<MenuView>('main');
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [level, setLevel] = useState<FLevel>(() => (session ? parseFacteur(session.config).level : loadFLevel()));
  const ses = useSessionRun(account, session);
  const sesRef = useRef(ses);
  sesRef.current = ses;
  const accountRef = useRef(account);
  accountRef.current = account;
  const [cloud, setCloud] = useState<'off' | 'sending' | 'sent' | 'queued'>('off');
  const lost = useRef(false);
  const startedAt = useRef(0);
  const [sfx] = useState(() => new Sfx());
  const gameRef = useRef<FacteurGame | null>(null);
  const [, setTick] = useState(0);
  const [sent, setSent] = useState<{ parcel: Parcel; i: number; points: number; x0: number; dx: number; dy: number } | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [nope, setNope] = useState<{ i: number; n: number } | null>(null);
  const [say, setSay] = useState('');
  const [result, setResult] = useState<{ r: FResult; record: boolean; prev: number } | null>(null);
  const [missing, setMissing] = useState(false);
  const busy = useRef(false);
  const timer = useRef(0);
  const live = useRef({ phase, settings });
  live.current = { phase, settings };
  const grade = effectiveGrade(null);

  useEffect(() => {
    document.documentElement.dataset.text = settings.textSize;
    document.documentElement.dataset.comfort = settings.comfort ? 'on' : 'off';
    sfx.enabled = settings.sound;
  }, [settings, sfx]);
  useEffect(
    () => () => {
      window.clearTimeout(timer.current);
      stopSaying();
    },
    [],
  );
  // la voix du mot du colis qui défile est chargée d'avance : elle part sans attente à la livraison
  const comingMark = phase === 'play' ? gameRef.current?.parcel?.word.mark : undefined;
  useEffect(() => {
    if (comingMark && settings.sound) preloadVoices([comingMark]);
  }, [comingMark, settings.sound]);

  const change = (p: Partial<Settings>) =>
    setSettings((s) => {
      const n = { ...s, ...p };
      saveSettings(n);
      return n;
    });

  const ready = (l: FLevel) => WORDS.filter((w) => w.level <= l && !w.tool && hasPicture(w)).length >= 6;

  const begin = (l0: FLevel) => {
    const s = sesRef.current;
    if (s.sess && (s.left <= 0 || !s.sess.active)) return;
    const l = s.sess ? parseFacteur(s.sess.config).level : l0;
    sfx.unlock();
    if (!ready(l)) {
      setMissing(true);
      return;
    }
    setMissing(false);
    window.clearTimeout(timer.current);
    busy.current = false;
    saveFLevel(l);
    setLevel(l);
    gameRef.current = newSession(l, Math.random, hasPicture, s.sess ? [] : reviewWords());
    setSent(null);
    setNope(null);
    setSay('');
    setResult(null);
    setCloud('off');
    startedAt.current = performance.now();
    setPhase('play');
    sfx.play('start');
  };

  const toMenu = useCallback(() => {
    window.clearTimeout(timer.current);
    busy.current = false;
    stopSaying();
    gameRef.current = null;
    setPhase('menu');
    setView('main');
    if (lost.current) onSessionLost();
  }, [onSessionLost]);

  const finish = (g: FacteurGame) => {
    const r = g.result;
    const prev = loadFBest(r.level)?.score ?? 0;
    const saved = saveFResult(r.level, r.score, r.stars);
    setResult({ r, record: saved.record && prev > 0, prev });
    setPhase('over');
    sfx.play('victory');
    // envoi à la classe : une partie libre est gardée en file si le réseau manque ; une séance passe par son propre suivi
    const acct = accountRef.current;
    const payload: RunPayload = {
      clientId: newRunId(),
      game: 'facteur',
      mode: `n${r.level}`,
      kind: 'game',
      score: r.score,
      wave: r.firstTry,
      wpm: 0,
      acc: r.delivered ? Math.round((r.firstTry / r.delivered) * 100) : 0,
      correct: r.delivered,
      duration: Math.min(7200, Math.max(1, Math.round((performance.now() - startedAt.current) / 1000))),
      playedMs: Date.now(),
    };
    // grotte : les colis ratés nourrissent la créature, les colis rangés renforcent la classe (hors séance)
    if (!sesRef.current.sess && r.delivered + r.slips > 0) {
      feedBoss(r.delivered, r.slips);
      payload.cave = { ink: r.slips, power: r.delivered };
    }
    // « Mes progrès » et mots à revoir : sur l'appareil seulement
    if (r.delivered > 0) {
      addLog('facteur', { t: Date.now(), ok: r.firstTry, err: r.delivered - r.firstTry, score: r.score, board: `n${r.level}` });
      noteReview(r.missed, r.clean);
    }
    // résumé anonyme pour l'équilibrage (parties libres seulement)
    if (!sesRef.current.sess && r.delivered > 0) {
      payload.balance = {
        game: 'facteur',
        difficulty: `n${r.level}`,
        level: 'cp',
        version: 1,
        outcome: 'finished',
        score: r.score,
        wave: r.firstTry,
        acc: payload.acc,
        duration: payload.duration,
        rounds_ok: r.firstTry,
        rounds_err: r.delivered - r.firstTry,
      };
    }
    const items = summarizeItems(r.outcomes.map((o) => facteurOutcome(plain(o.word.mark), o.word.level, o.ok, o.picks)));
    if (sesRef.current.sess) {
      sesRef.current.submit(payload, () => {
        lost.current = true;
      });
    } else if (acct && r.delivered > 0) {
      setCloud('sending');
      sendRun(acct.token, payload)
        .then((s) => {
          if (s === 'invalid_session') {
            enqueue(acct.student.id, payload);
            lost.current = true;
          }
          setCloud(s === 'ok' ? 'sent' : 'queued');
          if (s === 'ok' && payload.balance) void sendItemStats(acct.token, 'facteur', 'cp', `n${r.level}`, items);
        })
        .catch(() => {
          enqueue(acct.student.id, payload);
          setCloud('queued');
        });
    } else if (acct && payload.cave) {
      void dropCave(acct.student.id, acct.token, payload.clientId, payload.cave.ink, payload.cave.power);
    }
  };

  // parties jouées sans réseau : on réessaie au démarrage et au retour du réseau
  const studentId = account?.student.id ?? null;
  const token = account?.token ?? null;
  useEffect(() => {
    if (!studentId || !token) return;
    const go = () => void flush(studentId, token);
    go();
    window.addEventListener('online', go);
    return () => window.removeEventListener('online', go);
  }, [studentId, token]);

  const tap = useCallback(
    (i: number) => {
      const g = gameRef.current;
      if (!g || busy.current || live.current.phase !== 'play') return;
      sfx.unlock();
      const p = g.parcel;
      if (!p) return;
      const r = g.tap(i);
      if (r.kind === 'ignored') return;
      if (r.kind === 'ok') {
        busy.current = true;
        sfx.play('correct');
        if (live.current.settings.sound) window.setTimeout(() => readAloud(p.word.mark), 250);
        // le colis part de l'endroit exact où il se trouve sur le tapis, et vole jusqu'à la boîte touchée
        const pr = stageRef.current?.querySelector('.fct-parcel')?.getBoundingClientRect();
        const br = stageRef.current?.querySelectorAll('.fct-box')[i]?.getBoundingClientRect();
        const sr = stageRef.current?.getBoundingClientRect();
        const x0 = pr && sr ? pr.left + pr.width / 2 - (sr.left + sr.width / 2) : 0;
        const dx = pr && br ? br.left + br.width / 2 - (pr.left + pr.width / 2) : 0;
        const dy = pr && br ? br.top + br.height * 0.45 - (pr.top + pr.height / 2) : 200;
        setSent({ parcel: p, i, points: r.points, x0, dx, dy });
        setNope(null);
        setSay(r.first ? 'Bravo !' : 'Voilà, c’est rangé !');
        timer.current = window.setTimeout(() => {
          busy.current = false;
          setSent(null);
          if (g.over) finish(g);
          else setTick((t) => t + 1);
        }, 1000);
      } else {
        sfx.play('error');
        setNope((n) => ({ i, n: (n?.n ?? 0) + 1 }));
        setSay(r.hint ? 'Regarde bien : il ne reste qu’une boîte.' : 'Pas celle-là. Relis le mot !');
        setTick((t) => t + 1);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sfx],
  );

  // clavier : 1, 2, 3 pour les boîtes, Échap pour revenir au menu
  useEffect(() => {
    if (phase !== 'play') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') toMenu();
      else if (e.key >= '1' && e.key <= '3') tap(Number(e.key) - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, tap, toMenu]);

  // ───────────── Partie ─────────────
  if (phase === 'play' && gameRef.current) {
    const g = gameRef.current;
    const shown = sent ? sent.parcel : g.parcel;
    const done = g.total - g.left + (sent ? 1 : 0);
    const state = (k: number): 'idle' | 'off' | 'hint' | 'no' | 'ok' => {
      if (!shown) return 'idle';
      if (sent) return k === sent.i ? 'ok' : 'idle';
      if (shown.tried[k]) return nope && nope.i === k ? 'no' : 'off';
      return shown.tried.filter(Boolean).length >= shown.choices.length - 1 ? 'hint' : 'idle';
    };
    return (
      <div className="desk">
        <main className="sheet">
          <div className="stage fct" data-level={level} ref={stageRef} style={{ ['--ride' as string]: `${TRAVEL_SECONDS[level]}s` }}>
            <div className="fct-top">
              <BackButton label="Menu" onClick={toMenu} />
              <div className="fct-prog" role="progressbar" aria-label="Colis rangés" aria-valuemin={0} aria-valuemax={g.total} aria-valuenow={Math.min(done, g.total)}>
                <span style={{ width: `${Math.round((Math.min(done, g.total) / Math.max(1, g.total)) * 100)}%` }} />
              </div>
              <div className="fct-score" aria-label={`Score ${g.points}`}>
                {g.mult > 1 && <b className="fct-mult">×{g.mult}</b>} {fmt(g.points)}
              </div>
            </div>
            <div className="fct-belt" aria-hidden="true">
              {shown && (
                <div className={sent ? 'fct-parcel is-sent' : 'fct-parcel'} key={`${shown.id}-${sent ? 's' : 'c'}`} style={sent ? { ['--x0' as string]: `${sent.x0}px`, ['--dx' as string]: `${sent.dx}px`, ['--dy' as string]: `${sent.dy}px` } : undefined}>
                  <PictureView word={shown.word} />
                </div>
              )}
              {sent && (
                <span className="fct-pts" key={`p${shown?.id}`}>
                  +{sent.points}
                </span>
              )}
            </div>
            <p className="fct-say" aria-hidden="true">
              {say}
            </p>
            <div className="fct-boxes" role="group" aria-label="Les boîtes aux lettres">
              {shown?.choices.map((c, k) => <Mailbox key={`${shown.word.mark}-${k}-${c.mark}`} i={k} word={c} state={state(k)} onTap={tap} />)}
            </div>
            <p className="sr-only" role="status" aria-live="polite">
              {say}
            </p>
          </div>
        </main>
      </div>
    );
  }

  // ───────────── Fin ─────────────
  if (phase === 'over' && result && ses.sess) {
    const r = result.r;
    return (
      <div className="desk">
        <main className="sheet">
          <div className="stage">
            <SessionOver
              session={ses.sess}
              state={ses.state}
              score={r.score}
              left={ses.left}
              details={
                <p className="mt-1 text-[15px]">
                  Colis rangés du premier coup : <strong>{r.firstTry}</strong> sur {r.delivered}
                </p>
              }
              onRetry={() => begin(r.level)}
              onBack={() => (onSessions ?? onHome)()}
            />
          </div>
        </main>
      </div>
    );
  }

  if (phase === 'over' && result) {
    const { r, record } = result;
    const next = r.level < 4 && r.stars >= 2 ? ((r.level + 1) as FLevel) : null;
    return (
      <div className="desk">
        <main className="sheet">
          <div className="stage">
            <div className="overlay">
              <section className="card card-game w-full max-w-[560px]" aria-labelledby="fct-over">
                <div className="card-top">
                  <BackButton label="Menu" onClick={toMenu} />
                </div>
                <h2 id="fct-over" className="title-sm">
                  {r.stars === 3 ? 'Bravo, facteur !' : r.stars === 2 ? 'Très bien !' : 'Bien joué !'}
                </h2>
                <p className="fct-stars" aria-label={`${r.stars} étoile${r.stars > 1 ? 's' : ''} sur 3`}>
                  {stars(r.stars)}
                </p>
                <div className="rule" aria-hidden="true" />
                <p className="text-[18px] leading-snug">
                  Tu as rangé <strong>{r.delivered}</strong> colis, dont <strong>{r.firstTry}</strong> du premier coup.
                </p>
                <p className="mt-1 text-[16px]">
                  Score : <strong>{fmt(r.score)}</strong>
                  {record && <span className="text-ribbon"> · nouveau record !</span>}
                </p>
                {cloud !== 'off' && (
                  <p className="mt-1 text-[14px] text-ink/75" role="status" aria-live="polite">
                    {cloud === 'sending' && 'Envoi du score à la classe…'}
                    {cloud === 'sent' && 'Score envoyé à la classe ✓'}
                    {cloud === 'queued' && 'Pas de réseau : score gardé, envoyé plus tard.'}
                  </p>
                )}
                {r.missed.length > 0 && (
                  <>
                    <h3 className="subhead mt-[var(--sp)]">Des mots à relire</h3>
                    <p className="fct-missed">
                      {r.missed.map((m) => {
                        const w = WORDS.find((x) => plain(x.mark) === m);
                        return (
                          <span key={m} className="fct-chip">
                            {w ? <Mark mark={w.mark} /> : m}
                          </span>
                        );
                      })}
                    </p>
                  </>
                )}
                <div className="mt-[var(--sp)] grid gap-3">
                  {next ? (
                    <button type="button" className="btn btn-primary" autoFocus onClick={() => begin(next)}>
                      Niveau {next} →
                    </button>
                  ) : null}
                  <button type="button" className={next ? 'btn btn-ghost' : 'btn btn-primary'} autoFocus={!next} onClick={() => begin(r.level)}>
                    Rejouer
                  </button>
                  <button type="button" className="btn btn-ghost" onClick={toMenu}>
                    Menu
                  </button>
                </div>
              </section>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // ───────────── Menu ─────────────
  if (phase === 'menu' && view === 'main' && ses.sess) {
    return (
      <div className="desk">
        <main className="sheet">
          <div className="stage">
            <SessionIntro session={ses.sess} left={ses.left} onStart={() => begin(level)} onBack={() => (onSessions ?? onHome)()} />
          </div>
        </main>
      </div>
    );
  }
  if (view !== 'main') {
    const body: ReactNode =
      view === 'howto' ? (
        <ul className="howto-list">
          <li className="howto">
            <kbd className="kbd">📦</kbd>
            <span>Le colis avance sur le tapis. Regarde l’image, prends ton temps : au bout, il refait un tour.</span>
          </li>
          <li className="howto">
            <kbd className="kbd">✉</kbd>
            <span>Touche la boîte qui porte le mot de l’image.</span>
          </li>
          <li className="howto">
            <kbd className="kbd">↺</kbd>
            <span>Raté ? Pas grave : la boîte se grise, essaie une autre. Le colis reviendra.</span>
          </li>
          <li className="howto">
            <kbd className="kbd">ab</kbd>
            <span>Les lettres grises ne se disent pas.</span>
          </li>
          <li className="howto howto-opt">
            <kbd className="kbd">1 2 3</kbd>
            <span>Au clavier : 1, 2, 3 pour choisir la boîte.</span>
          </li>
        </ul>
      ) : view === 'scores' ? (
        <>
          <ul className="fct-scores">
            {F_LEVELS.map((l) => {
              const b = loadFBest(l.id);
              return (
                <li key={l.id}>
                  <strong>{l.label}</strong>
                  <span>{b ? `${stars(b.stars)} · ${fmt(b.score)} points` : 'Pas encore joué'}</span>
                </li>
              );
            })}
          </ul>
          {F_LEVELS.some((l) => loadFBest(l.id)) && (
            <ConfirmButton
              className="btn btn-ghost mt-3"
              confirm="Sûr ?"
              onConfirm={() => {
                clearFScores();
                setLevel(1);
              }}
            >
              Effacer les scores
            </ConfirmButton>
          )}
        </>
      ) : view === 'progress' ? (
        <GameProgress game="facteur" extra={<ReviewList />} />
      ) : (
        <SettingsRow settings={settings} onChange={change} />
      );
    return (
      <div className="desk">
        <main className="sheet">
          <div className="stage">
            <div className="overlay">
              <section className="card card-game w-full max-w-[600px]" aria-labelledby="sub-title">
                <div className="card-top">
                  <BackButton label="Retour" onClick={() => setView('main')} autoFocus />
                </div>
                <h2 id="sub-title" className="title-sm">
                  {view === 'howto' ? 'Comment jouer' : view === 'scores' ? 'Scores' : view === 'progress' ? 'Mes progrès' : 'Réglages'}
                </h2>
                <div className="rule" aria-hidden="true" />
                <div className="sub-body">{body}</div>
              </section>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="desk">
      <main className="sheet">
        <div className="stage">
          <div className="overlay">
            <section className="card card-game card-menu card-compact w-full max-w-[600px]" aria-labelledby="game-title">
              <div className="menu-a">
                <div className="card-top">
                  <BackButton onClick={onHome} />
                </div>
                <p className="eyebrow">Lecture · {gradeLabel(grade ?? 'cp')}</p>
                <StampTitle id="game-title" label="Le facteur" lines={[{ text: 'FACTEUR', ribbon: 'LE' }]} />
                <div className="rule" aria-hidden="true" />
                <p className="tagline menu-opt">Range chaque colis dans la bonne boîte&nbsp;!</p>
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
                <h2 className="subhead mt-[var(--sp)]">Choisis ton niveau</h2>
                <div className="games games-levels" data-n="4">
                  {F_LEVELS.map((l) => {
                    const b = loadFBest(l.id);
                    return (
                      <button key={l.id} type="button" className="gcard" autoFocus={l.id === level} onFocus={() => isFLevel(l.id) && setLevel(l.id)} onClick={() => begin(l.id)} aria-disabled={!ready(l.id) || undefined}>
                        <span className="gcard-name">{l.label}</span>
                        <span className="gcard-text">{l.hint}</span>
                        <span className="gcard-go">{ready(l.id) ? (b ? `${stars(b.stars)} · ${fmt(b.score)}` : 'Jouer →') : 'Bientôt'}</span>
                      </button>
                    );
                  })}
                </div>
                {missing && <p className="menu-hint mt-2 text-[15px] text-ribbon">Il manque encore des images pour ce niveau.</p>}
              </div>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}

/** Mots ratés lors des séances précédentes : ils reviennent en premier dans les prochains colis. */
function ReviewList() {
  const [list, setList] = useState(reviewWords);
  return (
    <section aria-labelledby="fct-review" className="prog-rules">
      <h3 id="fct-review" className="subhead">
        Mots à revoir
      </h3>
      {list.length === 0 ? (
        <p className="text-[15px] leading-snug">Aucun mot à revoir : bravo !</p>
      ) : (
        <>
          <p className="fct-missed">
            {list.map((w) => (
              <span key={w.mark} className="fct-chip">
                <Mark mark={w.mark} />
              </span>
            ))}
          </p>
          <p className="text-[15px] leading-snug mt-2">Ils reviendront dans tes prochains colis.</p>
          <ConfirmButton className="btn btn-ghost mt-2" confirm="Sûr ?" onConfirm={() => { clearReview(); setList([]); }}>
            Vider la liste
          </ConfirmButton>
        </>
      )}
    </section>
  );
}
