import { useEffect, useMemo, useState } from 'react';
import { DIFFICULTIES } from '../game/difficulty';
import type { Difficulty } from '../game/difficulty';
import type { RunRecord } from '../game/history';
import type { ScoreEntry } from '../game/storage';
import { explain } from '../server/api';
import { fetchBoard } from '../server/student';
import type { BoardRow, Scope, StudentAccount } from '../server/types';
import { BackButton } from './BackButton';
import { ScoreTable } from './Screens';

const fmt = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0');

// ───────────────────────── Classement de la classe / de l'école ─────────────────────────

function BoardTable({ rows, limit, label }: { rows: BoardRow[]; limit: number; label: string }) {
  const mine = rows.findIndex((r) => r.is_me);
  const shown = mine >= limit ? [...rows.slice(0, limit - 1), rows[mine]] : rows.slice(0, limit);
  return (
    <table className="scores">
      <caption className="sr-only">{label}</caption>
      <thead>
        <tr>
          <th scope="col">#</th>
          <th scope="col">Prénom</th>
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
        {shown.map((s) => (
          <tr key={s.rank + s.name} className={s.is_me ? 'me' : undefined}>
            <td>{s.rank}.</td>
            <td>{s.name}</td>
            <td className="num">{fmt(s.score)}</td>
            <td className="num">{s.wave}</td>
            <td className="num">{Math.round(s.wpm)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

interface ScoresPanelProps {
  diff: Difficulty;
  /** scores de cet appareil, déjà filtrés par mode */
  local: ScoreEntry[];
  /** élève connecté : active les classements Classe et École */
  account: StudentAccount | null;
  limit: number;
  highlightId?: string | null;
  /** change quand un nouveau score vient d'être envoyé : le classement est rechargé */
  refreshKey?: string | number;
  /** saisie du prénom (appareil sans compte uniquement) */
  name?: string;
  onName?: (name: string) => void;
  onClear?: () => void;
  /** sans marge ni grand titre (le titre est déjà affiché par l'écran) */
  bare?: boolean;
}

export function ScoresPanel({ diff, local, account, limit, highlightId, refreshKey, name, onName, onClear, bare = false }: ScoresPanelProps) {
  const token = account?.token ?? null;
  const [tab, setTab] = useState<'class' | 'school' | 'local'>(token ? 'class' : 'local');
  const [rows, setRows] = useState<BoardRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [confirm, setConfirm] = useState(false);

  useEffect(() => {
    if (!token || tab === 'local') return;
    let alive = true;
    setError(null);
    setRows(null);
    fetchBoard(token, 'typing', diff, tab as Scope, 10)
      .then((r) => alive && setRows(r))
      .catch((e) => alive && setError(explain(e)));
    return () => {
      alive = false;
    };
  }, [token, tab, diff, refreshKey, tick]);

  const label = DIFFICULTIES[diff].label;
  return (
    <div className={bare ? undefined : 'mt-[var(--sp)]'}>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="subhead">{bare ? `Niveau ${label}` : `Meilleurs scores · ${label}`}</h2>
        {token && (
          <div className="seg" role="tablist" aria-label="Classement">
            <button type="button" role="tab" aria-selected={tab === 'class'} className="seg-b" onClick={() => setTab('class')}>
              Classe
            </button>
            <button type="button" role="tab" aria-selected={tab === 'school'} className="seg-b" onClick={() => setTab('school')}>
              École
            </button>
            <button type="button" role="tab" aria-selected={tab === 'local'} className="seg-b" onClick={() => setTab('local')}>
              Appareil
            </button>
          </div>
        )}
      </div>

      {token && tab !== 'local' ? (
        error ? (
          <p className="text-[15px] leading-snug text-ink/75">
            Classement indisponible pour l’instant.{' '}
            <button type="button" className="link" onClick={() => setTick((t) => t + 1)}>
              Réessayer
            </button>
          </p>
        ) : rows === null ? (
          <p className="text-[15px] text-ink/75" aria-live="polite">
            Chargement du classement…
          </p>
        ) : rows.length === 0 ? (
          <p className="text-[15px] leading-snug text-ink/75">
            Personne {tab === 'class' ? 'dans la classe' : 'dans l’école'} n’a encore joué ce mode.
          </p>
        ) : (
          <BoardTable rows={rows} limit={limit} label={tab === 'class' ? 'Meilleurs scores de la classe' : 'Meilleurs scores de l’école'} />
        )
      ) : (
        <>
          <ScoreTable scores={local} limit={limit} highlightId={highlightId} name={name} onName={onName} />
          {onClear && local.length > 0 && (
            <button
              type="button"
              className="link mt-2"
              onClick={() => {
                if (confirm) {
                  onClear();
                  setConfirm(false);
                } else setConfirm(true);
              }}
              onBlur={() => setConfirm(false)}
            >
              {confirm ? 'Confirmer l’effacement' : 'Effacer les scores de cet appareil'}
            </button>
          )}
        </>
      )}
    </div>
  );
}

// ───────────────────────── Progression ─────────────────────────

function LineChart({
  values,
  title,
  unit,
  fixedMax,
}: {
  values: number[];
  title: string;
  unit: string;
  fixedMax?: number;
}) {
  const W = 300;
  const H = 112;
  const L = 34;
  const R = 10;
  const T = 10;
  const B = 18;
  const top = fixedMax ?? Math.max(10, Math.ceil(Math.max(...values) / 10) * 10);
  const x = (i: number) => (values.length === 1 ? (L + W - R) / 2 : L + (i * (W - L - R)) / (values.length - 1));
  const y = (v: number) => T + (H - T - B) * (1 - Math.min(v, top) / top);
  const pts = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const last = values[values.length - 1];
  return (
    <figure className="chart">
      <figcaption className="text-[14px]">
        {title} <span className="num text-ribbon">{Math.round(last)}&nbsp;{unit}</span>
      </figcaption>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`${title} : de ${Math.round(values[0])} à ${Math.round(last)} ${unit} sur ${values.length} parties`}
      >
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1={L} x2={W - R} y1={y(top * f)} y2={y(top * f)} stroke="currentColor" strokeOpacity={0.2} strokeDasharray="3 3" />
            <text x={L - 5} y={y(top * f) + 3.5} textAnchor="end" fontSize="10" fill="currentColor" fillOpacity={0.7}>
              {Math.round(top * f)}
            </text>
          </g>
        ))}
        <text x={(L + W - R) / 2} y={H - 3} textAnchor="middle" fontSize="10" fill="currentColor" fillOpacity={0.7}>
          parties : anciennes → récentes
        </text>
        {values.length > 1 && <polyline points={pts} fill="none" stroke="var(--color-ribbon)" strokeWidth={2.5} strokeLinejoin="round" />}
        {values.map((v, i) => (
          <circle key={i} cx={x(i)} cy={y(v)} r={3.4} fill={i === values.length - 1 ? 'var(--color-ribbon)' : 'var(--color-ink)'} />
        ))}
      </svg>
    </figure>
  );
}

const avg = (a: number[]) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);

export function Progress({ runs, loading, currentName, onBack }: { runs: RunRecord[]; loading?: boolean; currentName: string; onBack: () => void }) {
  const real = useMemo(() => runs.filter((r) => r.kind === 'game' && r.correct >= 10), [runs]);
  const names = useMemo(() => [...new Set(real.map((r) => r.name || 'ANONYME'))], [real]);
  const [who, setWho] = useState(() => (names.includes(currentName || 'ANONYME') ? currentName || 'ANONYME' : (names[0] ?? '')));
  const [mode, setMode] = useState<'all' | Difficulty>('all');
  const list = real.filter((r) => (r.name || 'ANONYME') === who && (mode === 'all' || r.diff === mode)).slice(-20);
  const wpm = list.map((r) => r.wpm);
  const acc = list.map((r) => r.acc);
  const recent = wpm.slice(-5);
  const before = wpm.slice(-10, -5);
  const delta = before.length > 0 ? avg(recent) - avg(before) : null;

  return (
    <div className="overlay">
      <section className="card card-game card-progress w-full" role="dialog" aria-modal="true" aria-labelledby="prog-title">
        <div className="card-top">
          <BackButton onClick={onBack} label="Retour" autoFocus />
        </div>
        <h2 id="prog-title" className="title-sm">
          Mes progrès
        </h2>
        <div className="rule" aria-hidden="true" />

        {loading ? (
          <p className="mt-4 text-[15px]" aria-live="polite">
            Chargement de tes parties…
          </p>
        ) : real.length === 0 ? (
          <p className="mt-4 text-[15px] leading-snug">
            Pas encore de partie enregistrée. Joue quelques parties : la courbe apparaîtra ici.
          </p>
        ) : (
          <>
            <div className="mt-[var(--sp)] flex flex-wrap items-center gap-x-4 gap-y-2">
              <label className="flex items-center gap-2 text-[14px]">
                Élève
                <select className="field" value={who} onChange={(e) => setWho(e.target.value)}>
                  {names.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-2 text-[14px]">
                Mode
                <select className="field" value={mode} onChange={(e) => setMode(e.target.value as 'all' | Difficulty)}>
                  <option value="all">Tous</option>
                  <option value="apprenti">Apprenti</option>
                  <option value="standard">Standard</option>
                  <option value="expert">Expert</option>
                </select>
              </label>
            </div>

            {list.length === 0 ? (
              <p className="mt-4 text-[15px] leading-snug">Aucune partie pour ce choix.</p>
            ) : (
              <>
                <p className="mt-[var(--sp)] text-[15px] leading-snug" aria-live="polite">
                  {list.length} partie{list.length > 1 ? 's' : ''} · meilleur&nbsp;: <strong>{Math.round(Math.max(...wpm))}</strong> mots/min.
                  {delta !== null && (
                    <>
                      {' '}
                      Tes 5 dernières parties&nbsp;:{' '}
                      <strong className={delta >= 0 ? 'text-ribbon' : undefined}>
                        {delta >= 0 ? '+' : '−'}
                        {Math.abs(Math.round(delta * 10) / 10).toLocaleString('fr-FR')} mot/min
                      </strong>{' '}
                      par rapport aux 5 d’avant.
                    </>
                  )}
                </p>
                <div className="charts">
                  <LineChart values={wpm} title="Mots par minute" unit="mots/min" />
                  <LineChart values={acc} title="Précision" unit="%" fixedMax={100} />
                </div>
              </>
            )}
          </>
        )}

      </section>
    </div>
  );
}
