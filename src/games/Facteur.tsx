import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { BackButton } from '../components/BackButton';
import { SettingsRow, StampTitle } from '../components/MenuParts';
import { Sfx } from '../game/audio';
import { effectiveGrade, gradeLabel } from '../game/grade';
import { loadSettings, saveSettings } from '../game/storage';
import type { Settings } from '../game/storage';
import { hasPicture, pictureOf } from '../game/facteur/pictures';
import { FacteurGame, newSession } from '../game/facteur/rounds';
import type { FResult, Parcel } from '../game/facteur/rounds';
import { loadFBest, loadFLevel, saveFLevel, saveFResult } from '../game/facteur/scores';
import { F_LEVELS, WORDS, isFLevel, parts, plain } from '../game/facteur/words';
import type { FLevel, FWord } from '../game/facteur/words';
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
type MenuView = 'main' | 'howto' | 'settings';

const stars = (n: number) => '★'.repeat(n) + '☆'.repeat(3 - n);
const fmt = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

/** Les lettres d'un mot ; les lettres muettes sont grisées. */
export function Mark({ mark }: { mark: string }) {
  return (
    <>
      {parts(mark).map((p, i) => (
        <span key={i} className={p.mute ? 'fct-mute' : undefined}>
          {p.text}
        </span>
      ))}
    </>
  );
}

/** Le mot lu à voix haute, une fois le colis rangé (voix du navigateur, rien n'est téléchargé). */
function speak(text: string) {
  try {
    const synth = window.speechSynthesis;
    if (!synth) return;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'fr-FR';
    u.rate = 0.8;
    synth.speak(u);
  } catch {
    /* pas de voix sur ce poste : le jeu fonctionne sans */
  }
}

function PictureView({ word }: { word: FWord }) {
  const pic = pictureOf(word);
  const [broken, setBroken] = useState(false);
  if (!pic) return null;
  if (pic.src && !broken) return <img className="fct-img" src={pic.src} alt="" draggable={false} onError={() => setBroken(true)} />;
  return (
    <span className="fct-emoji" aria-hidden="true">
      {pic.emoji}
    </span>
  );
}

function Mailbox({ i, word, state, onTap }: { i: number; word: FWord; state: 'idle' | 'off' | 'hint' | 'no' | 'ok'; onTap: (i: number) => void }) {
  return (
    <button
      type="button"
      className="fct-box"
      data-state={state}
      aria-disabled={state === 'off' ? true : undefined}
      aria-label={`Boîte ${i + 1} : ${plain(word.mark)}`}
      onClick={() => onTap(i)}
    >
      <svg className="fct-box-art" viewBox="0 0 120 80" aria-hidden="true" focusable="false">
        <path className="fct-box-body" d="M8 78 V32 a52 30 0 0 1 104 0 V78 Z" />
        <rect className="fct-box-slot" x="30" y="30" width="60" height="7" rx="3.5" />
        <g className="fct-box-flag">
          <rect x="104" y="12" width="4" height="30" />
          <rect x="94" y="12" width="14" height="10" rx="2" />
        </g>
      </svg>
      <span className="fct-word" style={{ fontSize: `clamp(18px, ${(45 / Math.max(5, plain(word.mark).length)).toFixed(2)}cqw, 48px)` }}>
        <Mark mark={word.mark} />
      </span>
    </button>
  );
}

export default function Facteur({ onHome }: Props) {
  const [phase, setPhase] = useState<Phase>('menu');
  const [view, setView] = useState<MenuView>('main');
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [level, setLevel] = useState<FLevel>(loadFLevel);
  const [sfx] = useState(() => new Sfx());
  const gameRef = useRef<FacteurGame | null>(null);
  const [, setTick] = useState(0);
  const [sent, setSent] = useState<{ parcel: Parcel; i: number; points: number } | null>(null);
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
      try {
        window.speechSynthesis?.cancel();
      } catch {
        /* rien */
      }
    },
    [],
  );

  const change = (p: Partial<Settings>) =>
    setSettings((s) => {
      const n = { ...s, ...p };
      saveSettings(n);
      return n;
    });

  const ready = (l: FLevel) => WORDS.filter((w) => w.level <= l && !w.tool && hasPicture(w)).length >= 6;

  const begin = (l: FLevel) => {
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
    gameRef.current = newSession(l, Math.random, hasPicture);
    setSent(null);
    setNope(null);
    setSay('');
    setResult(null);
    setPhase('play');
    sfx.play('start');
  };

  const toMenu = useCallback(() => {
    window.clearTimeout(timer.current);
    busy.current = false;
    try {
      window.speechSynthesis?.cancel();
    } catch {
      /* rien */
    }
    gameRef.current = null;
    setPhase('menu');
    setView('main');
  }, []);

  const finish = (g: FacteurGame) => {
    const r = g.result;
    const prev = loadFBest(r.level)?.score ?? 0;
    const saved = saveFResult(r.level, r.score, r.stars);
    setResult({ r, record: saved.record && prev > 0, prev });
    setPhase('over');
    sfx.play('victory');
  };

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
        if (live.current.settings.sound) window.setTimeout(() => speak(plain(p.word.mark)), 250);
        setSent({ parcel: p, i, points: r.points });
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
          <div className="stage fct" data-level={level}>
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
                <div className={sent ? 'fct-parcel is-sent' : 'fct-parcel'} key={`${g.left}-${shown.word.mark}-${sent ? 's' : 'c'}`} style={{ ['--i' as string]: sent ? sent.i : 1 }}>
                  <PictureView word={shown.word} />
                </div>
              )}
              {sent && (
                <span className="fct-pts" key={`p${g.left}`}>
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
  if (view !== 'main') {
    const body: ReactNode =
      view === 'howto' ? (
        <ul className="howto-list">
          <li className="howto">
            <kbd className="kbd">📦</kbd>
            <span>Un colis arrive sur le tapis : regarde bien l’image.</span>
          </li>
          <li className="howto">
            <kbd className="kbd">✉</kbd>
            <span>Touche la boîte aux lettres qui porte le mot de l’image.</span>
          </li>
          <li className="howto">
            <kbd className="kbd">↺</kbd>
            <span>Tu t’es trompé ? Ce n’est pas grave : la boîte se grise et tu peux réessayer. Le colis reviendra plus tard.</span>
          </li>
          <li className="howto">
            <kbd className="kbd">ab</kbd>
            <span>Les lettres en gris ne se prononcent pas.</span>
          </li>
          <li className="howto howto-opt">
            <kbd className="kbd">1 2 3</kbd>
            <span>Au clavier, les touches 1, 2 et 3 choisissent la boîte.</span>
          </li>
        </ul>
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
                  {view === 'howto' ? 'Comment jouer' : 'Réglages'}
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
                <p className="tagline menu-opt">Range chaque colis dans la boîte aux lettres qui porte le bon mot&nbsp;!</p>
                <div className="tools" data-n="2" role="group" aria-label="Plus d’options">
                  <button type="button" className="tool" onClick={() => setView('howto')}>
                    <span aria-hidden="true">?</span> Comment jouer
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
