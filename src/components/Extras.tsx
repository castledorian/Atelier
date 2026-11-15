import { useCallback, useEffect, useMemo, useState } from 'react';
import { cloudCsv, fetchAll, fetchTop, isCloudReady, isScriptUrl, normCode } from '../game/cloud';
import type { CloudConfig, CloudScore } from '../game/cloud';
import { DIFFICULTIES } from '../game/difficulty';
import type { Difficulty } from '../game/difficulty';
import { downloadText, historyCsv } from '../game/history';
import type { RunRecord } from '../game/history';
import { buildLink } from '../game/storage';
import type { ScoreEntry, Settings } from '../game/storage';
import { ScoreTable } from './Screens';

const fmt = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0');

// ───────────────────────── Classement de la classe ─────────────────────────

function ClassTable({
  rows,
  limit,
  highlightId,
  name,
  onName,
}: {
  rows: CloudScore[];
  limit: number;
  highlightId?: string | null;
  name?: string;
  onName?: (name: string) => void;
}) {
  const all = rows.map((s, i) => ({ s, rank: i + 1 }));
  const mine = highlightId ? all.findIndex((r) => r.s.id === highlightId) : -1;
  const shown = mine >= limit ? [...all.slice(0, limit - 1), all[mine]] : all.slice(0, limit);
  return (
    <table className="scores">
      <caption className="sr-only">Meilleurs scores de la classe</caption>
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
        {shown.map(({ s, rank }) => (
          <tr key={s.id} className={s.id === highlightId ? 'me' : undefined}>
            <td>{rank}.</td>
            <td>
              {s.id === highlightId && onName ? (
                <input
                  className="name-input"
                  value={name ?? ''}
                  maxLength={12}
                  size={9}
                  placeholder="TON PRÉNOM"
                  aria-label="Ton prénom pour le classement de la classe"
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
  cloud: CloudConfig;
  limit: number;
  highlightId?: string | null;
  /** identifiant de la partie dans le classement partagé */
  cloudId?: string | null;
  /** change quand un nouveau score vient d'être envoyé : le classement est rechargé */
  refreshKey?: string | number;
  name?: string;
  onName?: (name: string) => void;
  onClear?: () => void;
}

export function ScoresPanel({ diff, local, cloud, limit, highlightId, cloudId, refreshKey, name, onName, onClear }: ScoresPanelProps) {
  const ready = isCloudReady(cloud);
  const [tab, setTab] = useState<'class' | 'local'>(ready ? 'class' : 'local');
  const [rows, setRows] = useState<CloudScore[] | null>(null);
  const [error, setError] = useState(false);
  const [tick, setTick] = useState(0);
  const [confirm, setConfirm] = useState(false);

  useEffect(() => {
    if (!ready || tab !== 'class') return;
    let alive = true;
    setError(false);
    setRows(null);
    fetchTop(cloud, diff, 10)
      .then((r) => alive && setRows(r))
      .catch(() => alive && setError(true));
    return () => {
      alive = false;
    };
  }, [ready, tab, cloud, diff, refreshKey, tick]);

  const label = DIFFICULTIES[diff].label;
  return (
    <div className="mt-6">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="subhead">Meilleurs scores · {label}</h2>
        {ready && (
          <div className="seg" role="tablist" aria-label="Classement">
            <button type="button" role="tab" aria-selected={tab === 'class'} className="seg-b" onClick={() => setTab('class')}>
              Classe
            </button>
            <button type="button" role="tab" aria-selected={tab === 'local'} className="seg-b" onClick={() => setTab('local')}>
              Appareil
            </button>
          </div>
        )}
      </div>

      {tab === 'class' && ready ? (
        error ? (
          <p className="text-[15px] leading-snug text-ink/75">
            Classement indisponible pour l’instant (pas de réseau ?).{' '}
            <button type="button" className="link" onClick={() => setTick((t) => t + 1)}>
              Réessayer
            </button>
          </p>
        ) : rows === null ? (
          <p className="text-[15px] text-ink/75" aria-live="polite">
            Chargement du classement…
          </p>
        ) : rows.length === 0 ? (
          <p className="text-[15px] leading-snug text-ink/75">Personne dans la classe n’a encore joué ce mode.</p>
        ) : (
          <ClassTable rows={rows} limit={limit} highlightId={cloudId} name={name} onName={onName} />
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

export function Progress({ runs, currentName, onBack }: { runs: RunRecord[]; currentName: string; onBack: () => void }) {
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
      <section className="card w-full max-w-[520px]" role="dialog" aria-modal="true" aria-labelledby="prog-title">
        <p className="eyebrow">Mes progrès</p>
        <h2 id="prog-title" className="title-sm">
          Courbe de progression
        </h2>
        <div className="rule" aria-hidden="true" />

        {real.length === 0 ? (
          <p className="mt-4 text-[15px] leading-snug">
            Pas encore de partie enregistrée sur cet appareil. Joue quelques parties : la courbe apparaîtra ici.
          </p>
        ) : (
          <>
            <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
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
                <p className="mt-4 text-[15px] leading-snug" aria-live="polite">
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
                <LineChart values={wpm} title="Mots par minute" unit="mots/min" />
                <LineChart values={acc} title="Précision" unit="%" fixedMax={100} />
              </>
            )}
          </>
        )}

        <div className="mt-5">
          <button type="button" className="btn btn-primary" autoFocus onClick={onBack}>
            Retour
          </button>
        </div>
      </section>
    </div>
  );
}

// ───────────────────────── Espace enseignant ─────────────────────────

interface TeacherProps {
  settings: Settings;
  runs: RunRecord[];
  onChange: (patch: Partial<Settings>) => void;
  onClearHistory: () => void;
  onBack: () => void;
}

export function Teacher({ settings, runs, onChange, onClearHistory, onBack }: TeacherProps) {
  const [url, setUrl] = useState(settings.cloud.url);
  const [code, setCode] = useState(settings.cloud.code);
  const [withCustom, setWithCustom] = useState(settings.difficulty === 'perso');
  const [test, setTest] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  const urlOk = isScriptUrl(url);
  const codeNorm = normCode(code);
  const draft: CloudConfig = { url: url.trim(), code: codeNorm };
  const ready = isCloudReady(draft);
  const saved = isCloudReady(settings.cloud) && settings.cloud.url === draft.url && settings.cloud.code === draft.code;

  const save = useCallback(() => {
    onChange({ cloud: ready ? draft : { url: '', code: '' } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onChange, ready, draft.url, draft.code]);

  const link = buildLink({ ...settings, cloud: ready ? draft : settings.cloud }, withCustom);

  const runTest = async () => {
    setBusy(true);
    setTest('Test en cours…');
    try {
      const rows = await fetchTop(draft, 'standard', 3);
      setTest(`Connexion réussie (${rows.length} score${rows.length > 1 ? 's' : ''} en Standard pour cette classe).`);
    } catch {
      setTest('Échec : vérifie l’adresse, le déploiement du script (accès « Tout le monde ») et ta connexion.');
    }
    setBusy(false);
  };

  const exportClass = async () => {
    setBusy(true);
    try {
      const rows = await fetchAll(draft);
      downloadText(`frappe-classe-${codeNorm}.csv`, cloudCsv(rows));
      setTest(`${rows.length} partie${rows.length > 1 ? 's' : ''} exportée${rows.length > 1 ? 's' : ''}.`);
    } catch {
      setTest('Export impossible pour l’instant (pas de réseau ou script mal déployé).');
    }
    setBusy(false);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* le lien reste sélectionnable à la main */
    }
  };

  return (
    <div className="overlay">
      <section className="card w-full max-w-[560px]" role="dialog" aria-modal="true" aria-labelledby="teach-title">
        <p className="eyebrow">Espace enseignant</p>
        <h2 id="teach-title" className="title-sm">
          Classe et résultats
        </h2>
        <div className="rule" aria-hidden="true" />

        <div className="cfg mt-4">
          <h3 className="subhead mb-2">Classement partagé</h3>
          <p className="text-[13px] leading-snug text-ink/75">
            Les élèves se comparent dans une même classe. Il faut un petit script Google gratuit, créé une seule fois
            (voir <strong>enseignant/GUIDE-ENSEIGNANT.md</strong>). Les scores arrivent dans ta feuille Google Sheets.
          </p>
          <div className="cfg-row cfg-col">
            <label className="cfg-label" htmlFor="t-url">
              Adresse du script
            </label>
            <input
              id="t-url"
              className="cfg-link"
              placeholder="https://script.google.com/macros/s/…/exec"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
            {url && !urlOk && <p className="text-[13px] text-ribbon">L’adresse doit ressembler à https://script.google.com/macros/s/…/exec</p>}
          </div>
          <div className="cfg-row cfg-col">
            <label className="cfg-label" htmlFor="t-code">
              Code de la classe (2 à 24 lettres, chiffres ou tirets)
            </label>
            <input
              id="t-code"
              className="cfg-link"
              placeholder="CM2-DURAND"
              value={code}
              maxLength={24}
              onChange={(e) => setCode(e.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" className="btn btn-ghost" disabled={!ready && !!(url || code)} onClick={save}>
              {saved ? 'Enregistré' : 'Enregistrer'}
            </button>
            <button type="button" className="btn btn-ghost" disabled={!ready || busy} onClick={runTest}>
              Tester la connexion
            </button>
            {(settings.cloud.url || url) && (
              <button
                type="button"
                className="link"
                onClick={() => {
                  setUrl('');
                  setCode('');
                  onChange({ cloud: { url: '', code: '' } });
                }}
              >
                Désactiver
              </button>
            )}
          </div>
          {test && (
            <p className="mt-2 text-[14px] leading-snug" aria-live="polite">
              {test}
            </p>
          )}
        </div>

        <div className="cfg mt-4">
          <h3 className="subhead mb-2">Lien pour les élèves</h3>
          <p className="text-[13px] leading-snug text-ink/75">
            Les élèves qui ouvrent ce lien rejoignent la classe sans rien régler.
          </p>
          <div className="mt-1">
            <label className="opt" style={{ cursor: 'pointer' }}>
              <input type="checkbox" checked={withCustom} onChange={(e) => setWithCustom(e.target.checked)} />
              &nbsp;Inclure les réglages de la séance « Perso »
            </label>
          </div>
          <div className="mt-2 flex gap-2">
            <input className="cfg-link" readOnly value={link} aria-label="Lien pour les élèves" onFocus={(e) => e.currentTarget.select()} />
            <button type="button" className="btn btn-ghost" onClick={copy}>
              {copied ? 'Copié' : 'Copier'}
            </button>
          </div>
        </div>

        <div className="cfg mt-4">
          <h3 className="subhead mb-2">Résultats</h3>
          <div className="flex flex-col items-start gap-2">
            <button type="button" className="btn btn-ghost" disabled={!ready || busy} onClick={exportClass}>
              Télécharger les résultats de la classe (CSV)
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={runs.length === 0}
              onClick={() => downloadText('frappe-historique-appareil.csv', historyCsv(runs))}
            >
              Historique de cet appareil (CSV)
            </button>
            <button
              type="button"
              className="link"
              disabled={runs.length === 0}
              onClick={() => {
                if (confirm) {
                  onClearHistory();
                  setConfirm(false);
                } else setConfirm(true);
              }}
              onBlur={() => setConfirm(false)}
            >
              {confirm ? 'Confirmer : tout effacer sur cet appareil' : 'Effacer l’historique de cet appareil'}
            </button>
          </div>
          <p className="mt-2 text-[13px] leading-snug text-ink/75">
            Les fichiers CSV s’ouvrent dans Excel ou LibreOffice. Utilise des prénoms ou des pseudos, jamais de noms complets.
          </p>
        </div>

        <div className="mt-5">
          <button type="button" className="btn btn-primary" autoFocus onClick={onBack}>
            Retour
          </button>
        </div>
      </section>
    </div>
  );
}
