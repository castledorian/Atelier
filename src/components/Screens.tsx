import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { weakLetters } from '../game/analysis';
import { ALPHABET, DIFFICULTIES, DIFFICULTIES_ORDER, encodeCustom } from '../game/difficulty';
import type { Content, CustomConfig, Difficulty, Penalty } from '../game/difficulty';
import type { RunStats } from '../game/engine';
import { LAYOUTS, fingerLabel } from '../game/layouts';
import { scoresFor } from '../game/storage';
import type { Layout, ScoreEntry, Settings, TextSize } from '../game/storage';
import { countWords } from '../game/words';
import type { CloudConfig } from '../game/cloud';
import { ScoresPanel } from './Extras';

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
      <Check on={settings.font === 'dys'} onClick={() => onChange({ font: settings.font === 'dys' ? 'normal' : 'dys' })}>
        Police dyslexie
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

function CustomPanel({ settings, onChange }: { settings: Settings; onChange: (patch: Partial<Settings>) => void }) {
  const c = settings.custom;
  const set = (patch: Partial<CustomConfig>) => onChange({ custom: { ...c, ...patch } });
  const [copied, setCopied] = useState(false);
  const allowed = c.letters.toUpperCase();
  const words = countWords(allowed, Math.min(3, c.maxLen), c.maxLen);
  const link = `${window.location.href.split('#')[0]}#c=${encodeCustom(c)}`;
  const [top, mid, bot] = LAYOUTS[settings.layout];
  const toggle = (ch: string) => {
    const on = c.letters.includes(ch);
    if (on && c.letters.length === 1) return; // au moins une lettre
    set({ letters: on ? c.letters.replace(ch, '') : [...c.letters, ch].sort().join('') });
  };
  const preset = (letters: string) => set({ letters });
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* le lien reste affiché : on peut le copier à la main */
    }
  };

  return (
    <div className="cfg mt-4" role="group" aria-label="Réglages de la séance">
      <h3 className="subhead mb-2">Réglages de la séance</h3>

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

      <div className="cfg-row cfg-col">
        <span className="cfg-label" id="cfg-letters">
          Lettres autorisées
        </span>
        <div className="flex flex-wrap gap-2" role="group" aria-labelledby="cfg-letters">
          <button type="button" className="chip" onClick={() => preset(mid)}>
            Rangée du milieu
          </button>
          <button type="button" className="chip" onClick={() => preset(mid + top)}>
            Milieu + haut
          </button>
          <button type="button" className="chip" onClick={() => preset(ALPHABET)}>
            Toutes
          </button>
        </div>
        <div className="cfg-keys" aria-label="Choisir les lettres">
          {[top, mid, bot].map((row) => (
            <div key={row} className="cfg-keyrow">
              {[...row].map((ch) => (
                <button key={ch} type="button" role="switch" aria-checked={c.letters.includes(ch)} className="cfg-key" onClick={() => toggle(ch)}>
                  {ch.toUpperCase()}
                </button>
              ))}
            </div>
          ))}
        </div>
        {c.content !== 'letters' && c.letters.length < ALPHABET.length && (
          <p className="text-[13px] leading-snug text-ink/70">
            {words >= 8
              ? `${words} mots du dictionnaire utilisent ces lettres.`
              : `Seulement ${words} mot${words > 1 ? 's' : ''} avec ces lettres : le jeu proposera aussi de courtes suites de lettres.`}
          </p>
        )}
      </div>

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

      <div className="cfg-row cfg-col">
        <span className="cfg-label">Partager cette séance</span>
        <div className="flex gap-2">
          <input className="cfg-link" readOnly value={link} aria-label="Lien de la séance" onFocus={(e) => e.currentTarget.select()} />
          <button type="button" className="btn btn-ghost" onClick={copy}>
            {copied ? 'Copié' : 'Copier'}
          </button>
        </div>
        <p className="text-[13px] leading-snug text-ink/70">Les élèves qui ouvrent ce lien jouent avec les mêmes réglages.</p>
      </div>
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
  onTeacher: () => void;
}

export function Menu({ scores, settings, kbOn, install, onStart, onChange, onClear, onProgress, onTeacher }: MenuProps) {
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
        {diff === 'perso' && <CustomPanel settings={settings} onChange={onChange} />}

        <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-1">
          <label className="subhead" htmlFor="player-name">
            Prénom ou pseudo
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

        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-3">
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
              {(diff === 'perso' ? settings.custom.autoTarget : DIFFICULTIES[diff].autoTarget)
                ? 'La cible est choisie pour toi : tape la touche rouge du clavier. Une autre première lettre change de cible.'
                : 'La première lettre verrouille une cible, chaque lettre suivante la frappe.'}
            </span>
          </li>
          {(diff === 'perso' ? settings.custom.autoTarget : DIFFICULTIES[diff].autoTarget) && (
            <li className="howto">
              <kbd className="kbd">•</kbd>
              <span>Les points sous chaque touche indiquent le doigt : 1 = index, 2 = majeur, 3 = annulaire, 4 = auriculaire.</span>
            </li>
          )}
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

        {diff === 'perso' ? (
          <p className="mt-6 text-[14px] leading-snug text-ink/75">Séance personnalisée : les scores ne sont pas classés.</p>
        ) : (
          <ScoresPanel diff={diff} local={list} cloud={settings.cloud} limit={5} onClear={onClear} />
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" className="btn btn-ghost" onClick={onProgress}>
            Mes progrès
          </button>
          <button type="button" className="btn btn-ghost" onClick={onTeacher}>
            Espace enseignant
          </button>
        </div>

        {install.mode === 'prompt' && (
          <div className="mt-4">
            <button type="button" className="btn btn-ghost" onClick={install.onInstall}>
              Installer l’application
            </button>
            <p className="mt-1 text-[13px] leading-snug text-ink/70">Elle s’ouvre comme une application et fonctionne sans réseau.</p>
          </div>
        )}
        {install.mode === 'ios' && (
          <p className="mt-4 text-[13px] leading-snug text-ink/75">
            Pour installer le jeu&nbsp;: touche <strong>Partager</strong> puis <strong>Sur l’écran d’accueil</strong>.
          </p>
        )}

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
  cloud: CloudConfig;
  /** identifiant de la partie dans le classement partagé */
  cloudId: string | null;
  cloudStatus: 'off' | 'sending' | 'sent' | 'queued';
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
  cloud,
  cloudId,
  cloudStatus,
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
        <p className="eyebrow">
          {drill ? 'Entraînement ciblé' : diff === 'perso' ? 'Séance personnalisée' : `Fin de partie · ${DIFFICULTIES[diff].label}`}
        </p>
        <h2 id="over-title" className="title-sm">
          Page tachée
        </h2>
        <div className="rule" aria-hidden="true" />
        {!drill && diff !== 'perso' && rank === 0 && stats.score > 0 && (
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

        {!drill && diff !== 'perso' && (
          <>
            {cloudStatus === 'sending' && <p className="mt-4 text-[14px] text-ink/75">Envoi du score à la classe…</p>}
            {cloudStatus === 'sent' && <p className="mt-4 text-[14px] text-ink/75">Score envoyé à la classe ✓</p>}
            {cloudStatus === 'queued' && (
              <p className="mt-4 text-[14px] text-ink/75">Pas de réseau : ton score est gardé et sera envoyé plus tard.</p>
            )}
            {cloudStatus === 'off' && entryId === null && stats.score > 0 && (
              <p className="mt-4 text-[14px] text-ink/75">Pas dans le top 10 cette fois. Encore une page&nbsp;?</p>
            )}
            <ScoresPanel
              diff={diff}
              local={scoresFor(scores, diff)}
              cloud={cloud}
              limit={6}
              highlightId={entryId}
              cloudId={cloudId}
              refreshKey={cloudStatus}
              name={name}
              onName={changeName}
            />
          </>
        )}
      </section>
    </div>
  );
}
