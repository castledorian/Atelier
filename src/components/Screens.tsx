import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { weakLetters } from '../game/analysis';
import { DIFFICULTIES, DIFFICULTIES_ORDER } from '../game/difficulty';
import type { Difficulty } from '../game/difficulty';
import type { RunStats } from '../game/engine';
import { fingerLabel } from '../game/layouts';
import { scoresFor } from '../game/storage';
import type { Layout, ScoreEntry, Settings } from '../game/storage';

const fmt = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0');

// ───────────────────────── Options ─────────────────────────

function Check({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" role="switch" aria-checked={on} className="opt" onClick={onClick}>
      <span aria-hidden="true" className="opt-box">
        {on ? 'x' : '\u00a0'}
      </span>
      {children}
    </button>
  );
}

interface OptionsProps {
  settings: Settings;
  kbOn: boolean;
  onChange: (patch: Partial<Settings>) => void;
}

export function Options({ settings, kbOn, onChange }: OptionsProps) {
  return (
    <div className="flex flex-wrap gap-x-2 gap-y-1" role="group" aria-label="Options">
      <Check on={settings.sound} onClick={() => onChange({ sound: !settings.sound })}>
        Son
      </Check>
      <Check on={settings.shake} onClick={() => onChange({ shake: !settings.shake })}>
        Secousses
      </Check>
      <Check on={kbOn} onClick={() => onChange({ keyboard: !kbOn })}>
        Clavier à l’écran
      </Check>
      {kbOn && (
        <button
          type="button"
          className="opt"
          onClick={() => onChange({ layout: settings.layout === 'azerty' ? 'qwerty' : 'azerty' })}
        >
          Touches&nbsp;: <strong className="text-ribbon">{settings.layout.toUpperCase()}</strong>
        </button>
      )}
    </div>
  );
}

// ───────────────────────── Difficulté ─────────────────────────

function DifficultyPicker({ value, onChange }: { value: Difficulty; onChange: (d: Difficulty) => void }) {
  return (
    <div className="mt-5">
      <h2 className="subhead mb-2" id="diff-title">
        Difficulté
      </h2>
      <div className="diff-grid" role="radiogroup" aria-labelledby="diff-title">
        {DIFFICULTIES_ORDER.map((d) => (
          <button
            key={d}
            type="button"
            role="radio"
            aria-checked={value === d}
            className="diff"
            onClick={() => onChange(d)}
          >
            {DIFFICULTIES[d].label}
          </button>
        ))}
      </div>
      <p className="diff-desc mt-2 text-[14px] leading-snug text-ink/80" aria-live="polite">
        {DIFFICULTIES[value].tagline}
      </p>
    </div>
  );
}

// ───────────────────────── Scores ─────────────────────────

interface ScoreTableProps {
  scores: ScoreEntry[];
  limit: number;
  highlightId?: string | null;
  name?: string;
  onName?: (name: string) => void;
}

export function ScoreTable({ scores, limit, highlightId, name, onName }: ScoreTableProps) {
  if (scores.length === 0) {
    return (
      <p className="text-[15px] leading-snug text-ink/75">
        Aucun score pour l’instant. La première ligne du tableau est à vous.
      </p>
    );
  }
  const rows = scores.map((s, i) => ({ s, rank: i + 1 }));
  const mine = highlightId ? rows.findIndex((r) => r.s.id === highlightId) : -1;
  const shown = mine >= limit ? [...rows.slice(0, limit - 1), rows[mine]] : rows.slice(0, limit);
  return (
    <table className="scores">
      <caption className="sr-only">Meilleurs scores enregistrés sur cet appareil</caption>
      <thead>
        <tr>
          <th scope="col">#</th>
          <th scope="col">Nom</th>
          <th scope="col" className="num">
            Score
          </th>
          <th scope="col" className="num">
            Vague
          </th>
          <th scope="col" className="num">
            Mots/min
          </th>
        </tr>
      </thead>
      <tbody>
        {shown.map(({ s, rank }) => {
          const me = s.id === highlightId;
          return (
            <tr key={s.id} className={me ? 'me' : undefined}>
              <td>{rank}.</td>
              <td>
                {me && onName ? (
                  <input
                    className="name-input"
                    value={name ?? ''}
                    maxLength={12}
                    size={9}
                    placeholder="VOTRE NOM"
                    aria-label="Votre nom pour le tableau des scores"
                    autoComplete="off"
                    autoCapitalize="characters"
                    spellCheck={false}
                    enterKeyHint="done"
                    onChange={(e) => onName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === 'Escape') {
                        e.preventDefault();
                        e.stopPropagation();
                        e.currentTarget.blur();
                      }
                    }}
                  />
                ) : (
                  s.name
                )}
              </td>
              <td className="num font-bold">{fmt(s.score)}</td>
              <td className="num">{s.wave}</td>
              <td className="num">{s.wpm}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// ───────────────────────── Accueil ─────────────────────────

interface MenuProps {
  scores: ScoreEntry[];
  settings: Settings;
  kbOn: boolean;
  onStart: () => void;
  onChange: (patch: Partial<Settings>) => void;
  onClear: () => void;
}

export function Menu({ scores, settings, kbOn, onStart, onChange, onClear }: MenuProps) {
  const [confirm, setConfirm] = useState(false);
  const diff = settings.difficulty;
  const list = scoresFor(scores, diff);
  return (
    <div className="overlay">
      <section className="card w-full max-w-[600px]" aria-labelledby="game-title">
        <p className="eyebrow">Défense dactylographique</p>
        <h1 id="game-title" className="title" aria-label="Frappe !">
          {'FRAPPE'.split('').map((ch, i) => (
            <span key={i} aria-hidden="true" style={{ animationDelay: `${80 + i * 70}ms` }}>
              {ch}
            </span>
          ))}
          <span aria-hidden="true" className="text-ribbon" style={{ animationDelay: '560ms' }}>
            !
          </span>
        </h1>
        <div className="rule" aria-hidden="true" />
        <p className="mt-4 max-w-[46ch] text-pretty text-[16px] leading-snug sm:text-[17px]">
          Chaque touche est un coup. Tapez les mots pour faire éclater les taches d’encre avant
          qu’elles n’atteignent la marge.
        </p>

        <DifficultyPicker value={diff} onChange={(d) => onChange({ difficulty: d })} />

        <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-3">
          <button type="button" className="btn btn-primary" autoFocus={!kbOn} onClick={onStart}>
            Jouer
          </button>
          {!kbOn && (
            <span className="text-[14px] text-ink/70">
              ou <kbd className="kbd">Entrée ↵</kbd>
            </span>
          )}
        </div>

        <ul className="mt-6 grid gap-2 text-[15px] leading-snug">
          <li className="howto">
            <kbd className="kbd">A–Z</kbd>
            <span>
              {DIFFICULTIES[diff].autoTarget
                ? 'La cible est choisie pour toi : tape la touche rouge du clavier. Une autre première lettre change de cible.'
                : 'La première lettre verrouille une cible, chaque lettre suivante la frappe.'}
            </span>
          </li>
          <li className="howto">
            <kbd className="kbd kbd-sym">↵</kbd>
            <span>Jauge pleine&nbsp;? Le retour chariot balaie tout l’écran.</span>
          </li>
          <li className="howto">
            <kbd className="kbd kbd-sym">⌫</kbd>
            <span>
              Lâcher la cible.{' '}
              {!kbOn && (
                <>
                  <kbd className="kbd">Échap</kbd> met en pause.
                </>
              )}
            </span>
          </li>
        </ul>

        <div className="mt-6">
          <div className="mb-2 flex items-baseline justify-between gap-3">
            <h2 className="subhead">Meilleurs scores · {DIFFICULTIES[diff].label}</h2>
            {list.length > 0 && (
              <button
                type="button"
                className="link"
                onClick={() => {
                  if (confirm) {
                    onClear();
                    setConfirm(false);
                  } else setConfirm(true);
                }}
                onBlur={() => setConfirm(false)}
              >
                {confirm ? 'Confirmer l’effacement' : 'Effacer'}
              </button>
            )}
          </div>
          <ScoreTable scores={list} limit={5} />
        </div>

        <div className="mt-5 border-t-2 border-dashed border-ink/25 pt-3">
          <Options settings={settings} kbOn={kbOn} onChange={onChange} />
        </div>
      </section>
    </div>
  );
}

// ───────────────────────── Pause ─────────────────────────

interface PauseProps {
  settings: Settings;
  kbOn: boolean;
  onResume: () => void;
  onRestart: () => void;
  onMenu: () => void;
  onChange: (patch: Partial<Settings>) => void;
}

export function Pause({ settings, kbOn, onResume, onRestart, onMenu, onChange }: PauseProps) {
  return (
    <div className="overlay">
      <section className="card w-full max-w-[420px]" role="dialog" aria-modal="true" aria-labelledby="pause-title">
        <p className="eyebrow">Ruban à l’arrêt</p>
        <h2 id="pause-title" className="title-sm">
          Pause
        </h2>
        <div className="rule" aria-hidden="true" />
        <div className="mt-5 grid gap-3">
          <button type="button" className="btn btn-primary" autoFocus={!kbOn} onClick={onResume}>
            Reprendre
          </button>
          <div className="grid grid-cols-2 gap-3">
            <button type="button" className="btn btn-ghost" onClick={onRestart}>
              Recommencer
            </button>
            <button type="button" className="btn btn-ghost" onClick={onMenu}>
              Menu
            </button>
          </div>
        </div>
        <div className="mt-5 border-t-2 border-dashed border-ink/25 pt-3">
          <Options settings={settings} kbOn={kbOn} onChange={onChange} />
        </div>
      </section>
    </div>
  );
}

// ───────────────────────── Fin de partie ─────────────────────────

function CountUp({ value }: { value: number }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / 700);
      setV(value * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{fmt(v)}</>;
}

interface GameOverProps {
  stats: RunStats;
  diff: Difficulty;
  /** partie d'entraînement ciblé : pas de classement */
  drill: boolean;
  layout: Layout;
  scores: ScoreEntry[];
  entryId: string | null;
  rank: number;
  initialName: string;
  kbOn: boolean;
  onName: (name: string) => void;
  onRestart: () => void;
  onMenu: () => void;
  onDrill: (letters: string) => void;
}

export function GameOver({
  stats,
  diff,
  drill,
  layout,
  scores,
  entryId,
  rank,
  initialName,
  kbOn,
  onName,
  onRestart,
  onMenu,
  onDrill,
}: GameOverProps) {
  const [name, setName] = useState(initialName);
  const weak = weakLetters(stats.letters);
  const [armed, setArmed] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);

  // Petit délai de garde : on tapait encore à toute vitesse une demi-seconde plus tôt.
  useEffect(() => {
    const id = window.setTimeout(() => {
      setArmed(true);
      if (!kbOn) btn.current?.focus({ preventScroll: true });
    }, 550);
    return () => window.clearTimeout(id);
  }, [kbOn]);

  const changeName = (raw: string) => {
    const clean = raw
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()
      .replace(/[^A-Z0-9 ._-]/g, '')
      .slice(0, 12);
    setName(clean);
    onName(clean);
  };

  const cells: Array<[string, string]> = [
    ['Vague', String(stats.wave)],
    ['Mots/min', String(stats.wpm)],
    ['Précision', `${Math.round(stats.accuracy * 100)}\u00a0%`],
    ['Combo', String(stats.maxCombo)],
  ];

  return (
    <div className="overlay">
      <section className="card relative w-full max-w-[520px]" role="dialog" aria-modal="true" aria-labelledby="over-title">
        <p className="eyebrow">{drill ? 'Entraînement ciblé' : `Fin de partie · ${DIFFICULTIES[diff].label}`}</p>
        <h2 id="over-title" className="title-sm">
          Page tachée
        </h2>
        <div className="rule" aria-hidden="true" />
        {!drill && rank === 0 && stats.score > 0 && (
          <div className="stamp">
            Nouveau
            <br />
            record
          </div>
        )}

        <div className="mt-4 flex items-end gap-3">
          <div className="score-big" aria-label={`Score : ${stats.score}`}>
            <CountUp value={stats.score} />
          </div>
          <div className="pb-2 text-[13px] uppercase tracking-[0.12em] text-ink/65">points</div>
        </div>

        <dl className="mt-3 grid grid-cols-4 border-2 border-ink">
          {cells.map(([k, v], i) => (
            <div key={k} className={`px-2 py-2 text-center ${i > 0 ? 'border-l-2 border-ink' : ''}`}>
              <dt className="text-[10px] uppercase tracking-[0.08em] text-ink/65 sm:text-[11px]">{k}</dt>
              <dd className="font-display text-[20px] leading-tight sm:text-[24px]">{v}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-5 grid grid-cols-[1.6fr_1fr] gap-3">
          <button
            ref={btn}
            type="button"
            className="btn btn-primary"
            aria-disabled={!armed}
            onClick={() => armed && onRestart()}
          >
            Rejouer
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => armed && onMenu()}>
            Menu
          </button>
        </div>
        {!kbOn && (
          <p className="mt-3 text-[13px] text-ink/65">
            <kbd className="kbd">Entrée ↵</kbd> relance aussitôt une partie.
          </p>
        )}

        {weak.length > 0 ? (
          <div className="mt-5">
            <h3 className="subhead mb-2">À travailler</h3>
            <ul className="weak-list">
              {weak.map((ch) => (
                <li key={ch} className="weak">
                  <kbd className="kbd">{ch}</kbd>
                  <span>{fingerLabel(ch, layout)}</span>
                  <span className="num text-ink/70">
                    {stats.letters[ch].err} faute{stats.letters[ch].err > 1 ? 's' : ''}
                  </span>
                </li>
              ))}
            </ul>
            <button
              type="button"
              className="btn btn-ghost mt-3"
              onClick={() => armed && onDrill(weak.join(''))}
            >
              S’entraîner sur ces lettres
            </button>
          </div>
        ) : (
          stats.correct >= 20 && (
            <p className="mt-5 text-[14px] leading-snug text-ink/80">
              Aucune lettre à retravailler : belle précision&nbsp;!
            </p>
          )
        )}

        {!drill && (
        <div className="mt-5">
          <h3 className="subhead mb-2">Meilleurs scores · {DIFFICULTIES[diff].label}</h3>
          {entryId === null && stats.score > 0 && (
            <p className="mb-2 text-[14px] text-ink/75">Pas dans le top 10 cette fois. Encore une page&nbsp;?</p>
          )}
          <ScoreTable scores={scoresFor(scores, diff)} limit={6} highlightId={entryId} name={name} onName={changeName} />
        </div>
        )}
      </section>
    </div>
  );
}
