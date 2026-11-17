import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { weakLetters } from '../game/analysis';
import { DIFFICULTIES, DIFFICULTIES_ORDER } from '../game/difficulty';
import type { Content, CustomConfig, Difficulty, Penalty } from '../game/difficulty';
import type { RunStats } from '../game/engine';
import { fingerLabel } from '../game/layouts';
import { scoresFor } from '../game/storage';
import type { Layout, ScoreEntry, Settings, TextSize } from '../game/storage';
import type { StudentAccount } from '../server/types';
import { BackButton, useFitRows } from './BackButton';
import { ScoresPanel } from './Extras';

const fmt = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0');

// ───────────────────────── Options ─────────────────────────

export function Check({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
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

const TEXT_LABEL: Record<TextSize, string> = { normal: 'normal', large: 'grand', xlarge: 'très grand' };
const NEXT_SIZE: Record<TextSize, TextSize> = { normal: 'large', large: 'xlarge', xlarge: 'normal' };

// ───────────────────────── Difficulté ─────────────────────────

function DifficultyPicker({ value, onChange }: { value: Difficulty; onChange: (d: Difficulty) => void }) {
  // « Perso » est réservé aux séances de l'enseignant : visible seulement quand il est actif
  const modes = DIFFICULTIES_ORDER.filter((d) => d !== 'perso' || value === 'perso');
  return (
    <div>
      <h2 className="subhead mb-2" id="diff-title">
        Niveau
      </h2>
      <div className="diff-grid" data-n={modes.length} role="radiogroup" aria-labelledby="diff-title">
        {modes.map((d) => (
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
      <p className="diff-desc" aria-live="polite">
        {value === 'perso' ? DIFFICULTIES.perso.tagline : DIFFICULTIES[value].tagline}
      </p>
    </div>
  );
}

// ───────────────────────── Séance personnalisée (enseignant) ─────────────────────────

const CONTENT_LABEL: Record<Content, string> = { letters: 'Lettres', mixed: 'Mélange', words: 'Mots' };
const MISS_LABEL: Record<Penalty, string> = { none: 'Aucune', tier: 'Un palier', reset: 'Tout' };

function Seg<T extends string | number>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: [T, string][];
  onChange: (v: T) => void;
}) {
  return (
    <div className="cfg-row">
      <span className="cfg-label" id={`cfg-${label}`}>
        {label}
      </span>
      <div className="seg" role="radiogroup" aria-labelledby={`cfg-${label}`}>
        {options.map(([v, text]) => (
          <button key={String(v)} type="button" role="radio" aria-checked={value === v} className="seg-b" onClick={() => onChange(v)}>
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}

export function CustomPanel({ settings, onChange }: { settings: Settings; onChange: (patch: Partial<Settings>) => void }) {
  const c = settings.custom;
  const set = (patch: Partial<CustomConfig>) => onChange({ custom: { ...c, ...patch } });
  return (
    <div className="cfg mt-3" role="group" aria-label="Réglages de la séance">

      <div className="cfg-row">
        <label className="cfg-label" htmlFor="cfg-speed">
          Vitesse
        </label>
        <div className="flex items-center gap-3">
          <input
            id="cfg-speed"
            type="range"
            min={40}
            max={160}
            step={10}
            value={c.speed}
            onChange={(e) => set({ speed: Number(e.target.value) })}
          />
          <span className="num w-[4ch] text-right">{c.speed}&nbsp;%</span>
        </div>
      </div>

      <Seg label="Vies" value={c.lives} options={[1, 2, 3, 4, 5].map((n) => [n, String(n)] as [number, string])} onChange={(lives) => set({ lives })} />
      <Seg
        label="Contenu"
        value={c.content}
        options={(Object.keys(CONTENT_LABEL) as Content[]).map((k) => [k, CONTENT_LABEL[k]] as [Content, string])}
        onChange={(content) => set({ content })}
      />

      {c.content !== 'letters' && (
        <div className="cfg-row">
          <label className="cfg-label" htmlFor="cfg-len">
            Mots jusqu’à
          </label>
          <div className="flex items-center gap-3">
            <input id="cfg-len" type="range" min={3} max={9} step={1} value={c.maxLen} onChange={(e) => set({ maxLen: Number(e.target.value) })} />
            <span className="num w-[4ch] text-right">{c.maxLen}&nbsp;lettres</span>
          </div>
        </div>
      )}

      <div className="mt-1 flex flex-wrap gap-x-2 gap-y-1">
        <Check on={c.autoTarget} onClick={() => set({ autoTarget: !c.autoTarget })}>
          Cible automatique et touche en surbrillance
        </Check>
      </div>
      <Seg
        label="Pénalité de faute"
        value={c.miss}
        options={(Object.keys(MISS_LABEL) as Penalty[]).map((k) => [k, MISS_LABEL[k]] as [Penalty, string])}
        onChange={(miss) => set({ miss })}
      />

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

/** Installation de l'application : bouton natif (Chrome, Android…) ou consigne pour iPhone / iPad. */
export interface InstallInfo {
  mode: 'prompt' | 'ios' | null;
  onInstall: () => void;
}

interface MenuProps {
  scores: ScoreEntry[];
  settings: Settings;
  kbOn: boolean;
  install: InstallInfo;
  onStart: () => void;
  onChange: (patch: Partial<Settings>) => void;
  onClear: () => void;
  onProgress: () => void;
  /** élève connecté (prénom imposé, classements Classe et École) */
  account: StudentAccount | null;
  onHome: () => void;
}

type MenuView = 'main' | 'howto' | 'scores' | 'settings';

/** Règles du jeu, en phrases courtes. */
function HowTo({ assist, kbOn }: { assist: boolean; kbOn: boolean }) {
  return (
    <ul className="howto-list">
      <li className="howto">
        <kbd className="kbd">A–Z</kbd>
        <span>
          {assist
            ? 'La cible est choisie pour toi : tape la touche rouge du clavier.'
            : 'Tape la première lettre d’un mot pour le viser, puis les lettres suivantes pour le faire éclater.'}
        </span>
      </li>
      {assist && (
        <li className="howto">
          <kbd className="kbd">•</kbd>
          <span>Les points sous chaque touche montrent le doigt : 1 = index, 2 = majeur, 3 = annulaire, 4 = auriculaire.</span>
        </li>
      )}
      <li className="howto">
        <kbd className="kbd kbd-sym">↵</kbd>
        <span>Jauge du bas pleine&nbsp;? {kbOn ? 'La touche ↵' : 'Entrée'} balaie tout l’écran.</span>
      </li>
      <li className="howto">
        <kbd className="kbd kbd-sym">⌫</kbd>
        <span>Changer de cible{kbOn ? '.' : ' · Échap met le jeu en pause.'}</span>
      </li>
      <li className="howto">
        <kbd className="kbd">♥</kbd>
        <span>Une tache qui touche la marge rouge te fait perdre une vie.</span>
      </li>
    </ul>
  );
}

export function Menu({ scores, settings, kbOn, install, onStart, onChange, onClear, onProgress, account, onHome }: MenuProps) {
  const diff = settings.difficulty;
  const list = scoresFor(scores, diff);
  const assist = diff === 'perso' ? settings.custom.autoTarget : DIFFICULTIES[diff].autoTarget;
  const [view, setView] = useState<MenuView>('main');
  const rows = useFitRows(330, 31, 3, 10);
  const back = () => setView('main');

  // Échap : retour à l'écran principal du jeu
  useEffect(() => {
    if (view === 'main') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setView('main');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [view]);

  const sub = (title: string, children: ReactNode) => (
    <section className="card card-game w-full max-w-[600px]" aria-labelledby="sub-title">
      <div className="card-top">
        <BackButton onClick={back} label="Retour" autoFocus />
      </div>
      <h2 id="sub-title" className="title-sm">
        {title}
      </h2>
      <div className="rule" aria-hidden="true" />
      <div className="sub-body">{children}</div>
    </section>
  );

  if (view === 'howto') {
    return (
      <div className="overlay">
        {sub(
          'Comment jouer',
          <>
            <HowTo assist={assist} kbOn={kbOn} />
            <button type="button" className="btn btn-primary mt-[var(--sp)]" onClick={onStart}>
              J’ai compris, jouer&nbsp;!
            </button>
          </>,
        )}
      </div>
    );
  }
  if (view === 'scores') {
    return (
      <div className="overlay">
        {sub('Meilleurs scores', <ScoresPanel diff={diff} local={list} account={account} limit={rows} onClear={onClear} bare />)}
      </div>
    );
  }
  if (view === 'settings') {
    return (
      <div className="overlay">
        {sub(
          'Réglages',
          <>
            <Options settings={settings} kbOn={kbOn} onChange={onChange} />
            {install.mode === 'prompt' && (
              <button type="button" className="btn btn-ghost mt-[var(--sp)]" onClick={install.onInstall}>
                Installer l’application
              </button>
            )}
            {install.mode === 'ios' && (
              <p className="mt-[var(--sp)] text-[14px] leading-snug text-ink/75">
                Pour installer le jeu&nbsp;: touche <strong>Partager</strong> puis <strong>Sur l’écran d’accueil</strong>.
              </p>
            )}
          </>,
        )}
      </div>
    );
  }

  return (
    <div className="overlay">
      <section className="card card-game card-menu card-compact w-full max-w-[600px]" aria-labelledby="game-title">
        <div className="menu-a">
          <div className="card-top">
            <BackButton onClick={onHome} />
          </div>
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
          <p className="tagline menu-opt">Tape les mots pour faire éclater les taches d’encre avant qu’elles n’atteignent la marge.</p>

          <div className="tools" data-n="4" role="group" aria-label="Plus d’options">
            <button type="button" className="tool" onClick={() => setView('howto')}>
              <span aria-hidden="true">?</span> Comment jouer
            </button>
            <button type="button" className="tool" onClick={() => setView('scores')}>
              <span aria-hidden="true">★</span> Scores
            </button>
            <button type="button" className="tool" onClick={onProgress}>
              <span aria-hidden="true">↗</span> Mes progrès
            </button>
            <button type="button" className="tool" onClick={() => setView('settings')}>
              <span aria-hidden="true">⚙</span> Réglages
            </button>
          </div>
        </div>

        <div className="menu-b">
          <DifficultyPicker value={diff} onChange={(d) => onChange({ difficulty: d })} />

          {account ? (
            <p className="mt-[var(--sp)] text-[15px] leading-snug">
              <span className="subhead">Joueur</span>&nbsp; <strong>{account.student.name}</strong>
              <span className="text-ink/70"> · {account.class.name}</span>
            </p>
          ) : (
            <div className="mt-[var(--sp)] flex flex-wrap items-center gap-x-3 gap-y-1">
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

          <div className="mt-[var(--sp)] flex flex-wrap items-center gap-x-4 gap-y-2">
            <button type="button" className="btn btn-primary btn-play" autoFocus={!kbOn} onClick={onStart}>
              Jouer
            </button>
            {!kbOn && (
              <span className="enter-hint text-[14px] text-ink/70">
                ou <kbd className="kbd">Entrée ↵</kbd>
              </span>
            )}
          </div>
          {diff === 'perso' && <p className="mt-2 text-[14px] leading-snug text-ink/75">Séance de la classe : pas de classement.</p>}
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
  onHome: () => void;
  onChange: (patch: Partial<Settings>) => void;
}

export function Pause({ settings, kbOn, onResume, onRestart, onMenu, onHome, onChange }: PauseProps) {
  return (
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
          <button type="button" className="btn btn-primary" autoFocus={!kbOn} onClick={onResume}>
            Reprendre
          </button>
          <div className="grid grid-cols-2 gap-3">
            <button type="button" className="btn btn-ghost" onClick={onRestart}>
              Recommencer
            </button>
            <button type="button" className="btn btn-ghost" onClick={onMenu}>
              Menu du jeu
            </button>
          </div>
        </div>
        <div className="mt-[var(--sp)] border-t-2 border-dashed border-ink/25 pt-2">
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
  account: StudentAccount | null;
  /** état de l'envoi de la partie au serveur */
  cloudStatus: 'off' | 'sending' | 'sent' | 'queued';
  entryId: string | null;
  rank: number;
  initialName: string;
  kbOn: boolean;
  onName: (name: string) => void;
  onRestart: () => void;
  onMenu: () => void;
  onHome: () => void;
  onDrill: (letters: string) => void;
}

export function GameOver({
  stats,
  diff,
  drill,
  layout,
  scores,
  account,
  cloudStatus,
  entryId,
  rank,
  initialName,
  kbOn,
  onName,
  onRestart,
  onMenu,
  onHome,
  onDrill,
}: GameOverProps) {
  const [name, setName] = useState(initialName);
  const weak = weakLetters(stats.letters);
  const [armed, setArmed] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const ranked = !drill && diff !== 'perso';
  // Nom à écrire dans le tableau (appareil sans compte, partie dans le top 10) : on ouvre directement le classement.
  const [tab, setTab] = useState<'work' | 'board'>(() => (ranked && (!account && entryId ? true : weak.length === 0) ? 'board' : 'work'));
  const wide = useMedia('(min-width: 760px)');
  const short = useMedia('(max-height: 520px)');
  /** les deux blocs (lettres, classement) ensemble, ou un seul à la fois avec des onglets */
  const both = wide && !short;
  const rows = useFitRows(both ? 250 : wide ? 190 : 470, 30, 2, 8);

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
      .replace(/[̀-ͯ]/g, '')
      .toUpperCase()
      .replace(/[^A-Z0-9 ._-]/g, '')
      .slice(0, 12);
    setName(clean);
    onName(clean);
  };

  const cells: Array<[string, string]> = [
    ['Vague', String(stats.wave)],
    ['Mots/min', String(stats.wpm)],
    ['Précision', `${Math.round(stats.accuracy * 100)} %`],
    ['Combo', String(stats.maxCombo)],
  ];

  const work =
    weak.length > 0 ? (
      <div>
        <h3 className="subhead mb-2">Lettres à travailler</h3>
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
        <button type="button" className="btn btn-ghost mt-3" onClick={() => armed && onDrill(weak.join(''))}>
          S’entraîner sur ces lettres
        </button>
      </div>
    ) : (
      <p className="text-[15px] leading-snug text-ink/80">
        {stats.correct >= 20 ? 'Aucune lettre à retravailler : belle précision !' : 'Joue un peu plus longtemps pour savoir quelles lettres travailler.'}
      </p>
    );

  const board = ranked ? (
    <div>
      {cloudStatus === 'sending' && <p className="mb-2 text-[14px] text-ink/75">Envoi du score à la classe…</p>}
      {cloudStatus === 'sent' && <p className="mb-2 text-[14px] text-ink/75">Score envoyé à la classe ✓</p>}
      {cloudStatus === 'queued' && <p className="mb-2 text-[14px] text-ink/75">Pas de réseau : ton score sera envoyé plus tard.</p>}
      {cloudStatus === 'off' && entryId === null && stats.score > 0 && (
        <p className="mb-2 text-[14px] text-ink/75">Pas dans le top 10 cette fois. Encore une page&nbsp;?</p>
      )}
      {!account && entryId && <p className="mb-2 text-[14px] font-bold">Écris ton nom dans le tableau&nbsp;:</p>}
      <ScoresPanel
        diff={diff}
        local={scoresFor(scores, diff)}
        account={account}
        limit={rows}
        highlightId={entryId}
        refreshKey={cloudStatus}
        name={account ? undefined : name}
        onName={account ? undefined : changeName}
        bare
      />
    </div>
  ) : null;

  return (
    <div className="overlay">
      <section className="card card-game card-over relative w-full" role="dialog" aria-modal="true" aria-labelledby="over-title">
        <div className="over-a">
          <div className="card-top">
            <BackButton onClick={() => armed && onHome()} />
          </div>
          <p className="eyebrow">
            {drill ? 'Entraînement ciblé' : diff === 'perso' ? 'Séance de la classe' : `Fin de partie · ${DIFFICULTIES[diff].label}`}
          </p>
          <h2 id="over-title" className="title-sm">
            Page tachée
          </h2>
          {ranked && rank === 0 && stats.score > 0 && (
            <div className="stamp">
              Nouveau
              <br />
              record
            </div>
          )}

          <div className="mt-[var(--sp)] flex items-end gap-3">
            <div className="score-big" aria-label={`Score : ${stats.score}`}>
              <CountUp value={stats.score} />
            </div>
            <div className="pb-2 text-[14px] uppercase tracking-[0.12em] text-ink/65">points</div>
          </div>

          <dl className="stats-row mt-2 grid grid-cols-4 border-2 border-ink">
            {cells.map(([k, v], i) => (
              <div key={k} className={`px-1 py-1.5 text-center ${i > 0 ? 'border-l-2 border-ink' : ''}`}>
                <dt className="text-[14px] uppercase tracking-[0.06em] text-ink/65 sm:text-[14px]">{k}</dt>
                <dd className="font-display text-[20px] leading-tight sm:text-[22px]">{v}</dd>
              </div>
            ))}
          </dl>

          <div className="mt-[var(--sp)] grid grid-cols-[1.6fr_1fr] gap-3">
            <button ref={btn} type="button" className="btn btn-primary" aria-disabled={!armed} onClick={() => armed && onRestart()}>
              Rejouer
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => armed && onMenu()}>
              Menu du jeu
            </button>
          </div>
        </div>

        <div className="over-b">
          {both || !board ? (
            <>
              {(!board || weak.length > 0) && work}
              {board && <div className={weak.length > 0 ? 'mt-[var(--sp)]' : undefined}>{board}</div>}
            </>
          ) : (
            <>
              <div className="seg seg-wide" role="tablist" aria-label="Détails de la partie">
                <button type="button" role="tab" aria-selected={tab === 'work'} className="seg-b" onClick={() => setTab('work')}>
                  À travailler
                </button>
                <button type="button" role="tab" aria-selected={tab === 'board'} className="seg-b" onClick={() => setTab('board')}>
                  Classement
                </button>
              </div>
              <div className="mt-3" role="tabpanel">
                {tab === 'work' ? work : board}
              </div>
            </>
          )}
        </div>
      </section>
    </div>
  );
}

/** Suit une requête média (largeur, hauteur de l'écran…). */
function useMedia(q: string) {
  const [wide, setWide] = useState(() => typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia(q).matches);
  useEffect(() => {
    if (!window.matchMedia) return;
    const m = window.matchMedia(q);
    const on = () => setWide(m.matches);
    m.addEventListener?.('change', on);
    return () => m.removeEventListener?.('change', on);
  }, [q]);
  return wide;
}
