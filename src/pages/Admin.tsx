import { useCallback, useEffect, useState } from 'react';
import { BackButton } from '../components/BackButton';
import { downloadText, toCsv } from '../game/history';
import { ApiError, explain } from '../server/api';
import { GAME_NAME, adminLogs, adminOverview, adminSchool } from '../server/admin';
import type { AdminLogs, AdminOverview, AdminRun, AdminSchool } from '../server/admin';
import { Frame, Notice } from './Frame';

const fmt = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
const when = (ms: number | null | undefined) =>
  ms ? new Date(ms).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
const dur = (s: number) => (s >= 3600 ? `${Math.floor(s / 3600)} h ${Math.round((s % 3600) / 60)} min` : s >= 60 ? `${Math.round(s / 60)} min` : `${s} s`);
const game = (g: string | null) => (g ? (GAME_NAME[g] ?? g) : '—');

type Tab = 'overview' | 'school' | 'logs';

interface Props {
  email: string;
  onHome: () => void;
  onSignOut: () => void;
}

/** Espace administrateur : tout voir (écoles, classes, élèves, parties, inscriptions, anomalies), rien modifier. */
export default function Admin({ email, onHome, onSignOut }: Props) {
  const [tab, setTab] = useState<Tab>('overview');
  const [ov, setOv] = useState<AdminOverview | null>(null);
  const [sch, setSch] = useState<AdminSchool | null>(null);
  const [logs, setLogs] = useState<AdminLogs | null>(null);
  const [q, setQ] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const act = useCallback(
    async <R,>(f: () => Promise<R>): Promise<R | undefined> => {
      setErr('');
      setBusy(true);
      try {
        return await f();
      } catch (e) {
        if (e instanceof ApiError && e.code === 'not_authenticated') onSignOut();
        else if (e instanceof ApiError && e.status === 404) setErr('La mise à jour « administrateur » n’a pas encore été exécutée sur le serveur (voir le guide).');
        else setErr(explain(e));
        return undefined;
      } finally {
        setBusy(false);
      }
    },
    [onSignOut],
  );

  const loadOverview = useCallback(async () => {
    const d = await act(adminOverview);
    if (d) setOv(d);
  }, [act]);
  const loadLogs = useCallback(async () => {
    const d = await act(() => adminLogs(200));
    if (d) setLogs(d);
  }, [act]);
  const openSchool = useCallback(
    async (id: string) => {
      setTab('school');
      setSch(null);
      const d = await act(() => adminSchool(id));
      if (d) setSch(d);
    },
    [act],
  );

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);
  useEffect(() => {
    if (tab === 'logs' && !logs) void loadLogs();
  }, [tab, logs, loadLogs]);

  const schools = (ov?.schools ?? []).filter((s) => {
    const t = q.trim().toLowerCase();
    return !t || s.name.toLowerCase().includes(t) || s.teachers.some((e) => e.toLowerCase().includes(t));
  });

  const exportRuns = (runs: AdminRun[]) =>
    downloadText(
      'journal-des-parties.csv',
      toCsv(
        ['Date', 'École', 'Classe', 'Élève', 'Jeu', 'Mode', 'Type', 'Score', 'Précision %', 'Durée (s)'],
        runs.map((r) => [when(r.at), r.school ?? '', r.class ?? '', r.student, game(r.game), r.mode, r.kind, r.score, r.acc, r.duration]),
      ),
    );

  const max = Math.max(1, ...(ov?.daily.map((d) => d.runs) ?? [1]));

  return (
    <Frame wide fill>
      <div className="card-top">
        <BackButton onClick={onHome} />
      </div>
      <div className="dash-head">
        <div>
          <p className="eyebrow">Administration du site</p>
          <h1 className="title-sm">Tout voir, rien modifier</h1>
        </div>
        <div className="dash-who">
          <span className="text-[14px] text-ink/70">{email}</span>
          <div className="who-actions">
            <button type="button" className="link" onClick={() => (tab === 'logs' ? void loadLogs() : tab === 'school' && sch ? void openSchool(sch.school.id) : void loadOverview())} disabled={busy}>
              Actualiser
            </button>
          </div>
        </div>
      </div>
      <div className="rule" aria-hidden="true" />

      <div className="seg seg-wide mt-2" role="tablist" aria-label="Sections">
        {(
          [
            ['overview', 'Vue d’ensemble'],
            ['school', 'École'],
            ['logs', 'Journal'],
          ] as [Tab, string][]
        ).map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} className="seg-b" onClick={() => setTab(id)} disabled={id === 'school' && !sch && tab !== 'school'}>
            {label}
          </button>
        ))}
      </div>

      <p className="adm-note">Les codes d’accès des élèves ne sont jamais affichés. Chaque consultation de cet espace est enregistrée (qui, quand, quoi).</p>
      {err && <Notice kind="error">{err}</Notice>}

      {tab === 'overview' &&
        (!ov ? (
          <p className="mt-4 text-[15px]">{busy ? 'Chargement…' : ''}</p>
        ) : (
          <>
            <ul className="adm-kpis" aria-label="Chiffres clés">
              {(
                [
                  ['Écoles', ov.totals.schools],
                  ['Enseignants', ov.totals.teachers],
                  ['Classes', ov.totals.classes],
                  ['Élèves', ov.totals.students],
                  ['Parties (total)', ov.totals.runs],
                  ['Parties (7 jours)', ov.totals.runs_7d],
                  ['Élèves actifs (7 jours)', ov.totals.active_students_7d],
                  ['Inscriptions (7 jours)', ov.totals.signups_7d],
                  ['Parties refusées (7 jours)', ov.totals.flags_7d],
                ] as [string, number][]
              ).map(([k, v]) => (
                <li key={k}>
                  <strong>{fmt(v)}</strong>
                  <span>{k}</span>
                </li>
              ))}
            </ul>

            <h2 className="subhead mt-4">Parties par jour (14 derniers jours)</h2>
            <div className="adm-bars" role="img" aria-label={`Parties par jour : ${ov.daily.map((d) => `${d.day} ${d.runs}`).join(', ')}`}>
              {ov.daily.map((d) => (
                <div key={d.day} className="adm-bar" title={`${d.day} : ${d.runs}`}>
                  <i style={{ height: `${Math.max(2, (d.runs / max) * 100)}%` }} />
                  <span>{d.day.slice(8)}</span>
                </div>
              ))}
            </div>
            <p className="adm-games">
              {ov.games.length === 0 ? 'Aucune partie enregistrée.' : ov.games.map((g) => `${game(g.game)} : ${fmt(g.runs)}`).join(' · ')}
            </p>

            <h2 className="subhead mt-4">Écoles</h2>
            <label className="sr-only" htmlFor="adm-q">
              Chercher une école ou un enseignant
            </label>
            <input id="adm-q" className="adm-search" type="search" placeholder="Chercher une école ou un e-mail…" value={q} onChange={(e) => setQ(e.target.value)} />
            <div className="adm-wrap">
              <table className="adm-table">
                <thead>
                  <tr>
                    <th>École</th>
                    <th>Enseignants</th>
                    <th>Classes</th>
                    <th>Élèves</th>
                    <th>Parties</th>
                    <th>Dernière partie</th>
                    <th>Créée le</th>
                  </tr>
                </thead>
                <tbody>
                  {schools.map((s) => (
                    <tr key={s.id}>
                      <td>
                        <button type="button" className="link" onClick={() => void openSchool(s.id)}>
                          {s.name}
                        </button>
                      </td>
                      <td>{s.teachers.join(', ') || '—'}</td>
                      <td>{s.classes}</td>
                      <td>{s.students}</td>
                      <td>{fmt(s.runs)}</td>
                      <td>{when(s.last_run)}</td>
                      <td>{when(s.created)}</td>
                    </tr>
                  ))}
                  {schools.length === 0 && (
                    <tr>
                      <td colSpan={7}>Aucune école.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        ))}

      {tab === 'school' &&
        (!sch ? (
          <p className="mt-4 text-[15px]">{busy ? 'Chargement…' : 'Choisis une école dans la vue d’ensemble.'}</p>
        ) : (
          <>
            <h2 className="subhead mt-3">{sch.school.name}</h2>
            <p className="adm-note">Créée le {when(sch.school.created)}</p>
            <h3 className="font-bold mt-2">Enseignants</h3>
            <div className="adm-wrap">
              <table className="adm-table">
                <thead>
                  <tr>
                    <th>E-mail</th>
                    <th>Rôle</th>
                    <th>Depuis</th>
                    <th>Dernière connexion</th>
                  </tr>
                </thead>
                <tbody>
                  {sch.teachers.map((t) => (
                    <tr key={t.email}>
                      <td>{t.email}</td>
                      <td>{t.role === 'admin' ? 'Responsable' : 'Enseignant'}</td>
                      <td>{when(t.since)}</td>
                      <td>{when(t.last_sign_in)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {sch.classes.length === 0 && <p className="mt-3 text-[15px]">Aucune classe créée.</p>}
            {sch.classes.map((c) => (
              <section key={c.id} className="mt-3" aria-label={`Classe ${c.name}`}>
                <h3 className="font-bold">
                  {c.name} {c.grade ? <small>({c.grade.toUpperCase()})</small> : null} <small>· {c.students.length} élève{c.students.length > 1 ? 's' : ''}</small>
                </h3>
                <div className="adm-wrap">
                  <table className="adm-table">
                    <thead>
                      <tr>
                        <th>Élève</th>
                        <th>Parties</th>
                        <th>Temps de jeu</th>
                        <th>Dernière partie</th>
                        <th>Ajouté le</th>
                      </tr>
                    </thead>
                    <tbody>
                      {c.students.map((s) => (
                        <tr key={s.id}>
                          <td>{s.name}</td>
                          <td>{s.runs}</td>
                          <td>{dur(s.seconds)}</td>
                          <td>{when(s.last_played)}</td>
                          <td>{when(s.created)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ))}
            <h3 className="font-bold mt-3">Dernières parties de l’école</h3>
            <RunsTable runs={sch.recent} showSchool={false} />
          </>
        ))}

      {tab === 'logs' &&
        (!logs ? (
          <p className="mt-4 text-[15px]">{busy ? 'Chargement…' : ''}</p>
        ) : (
          <>
            <h2 className="subhead mt-3">Dernières parties (toutes écoles)</h2>
            <p className="adm-note">
              <button type="button" className="link" onClick={() => exportRuns(logs.runs)}>
                Exporter en CSV
              </button>
            </p>
            <RunsTable runs={logs.runs} showSchool />

            <h2 className="subhead mt-4">Inscriptions d’enseignants</h2>
            <div className="adm-wrap">
              <table className="adm-table">
                <thead>
                  <tr>
                    <th>E-mail</th>
                    <th>Inscrit le</th>
                    <th>Dernière connexion</th>
                    <th>E-mail confirmé</th>
                    <th>Écoles</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.signups.map((s) => (
                    <tr key={s.email + s.at}>
                      <td>{s.email}</td>
                      <td>{when(s.at)}</td>
                      <td>{when(s.last_sign_in)}</td>
                      <td>{s.confirmed ? 'Oui' : 'Non'}</td>
                      <td>{s.schools}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <h2 className="subhead mt-4">Parties refusées (anti-triche)</h2>
            <p className="adm-note">Parties impossibles à réaliser normalement, non enregistrées. Effacées après 90 jours.</p>
            <div className="adm-wrap">
              <table className="adm-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>École</th>
                    <th>Élève</th>
                    <th>Jeu</th>
                    <th>Raison</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.flags.map((f, i) => (
                    <tr key={i}>
                      <td>{when(f.at)}</td>
                      <td>{f.school ?? '—'}</td>
                      <td>{f.student ?? '—'}</td>
                      <td>{game(f.game)}</td>
                      <td>{f.reason}</td>
                    </tr>
                  ))}
                  {logs.flags.length === 0 && (
                    <tr>
                      <td colSpan={5}>Aucune partie refusée.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <h2 className="subhead mt-4">Consultations de cet espace</h2>
            <div className="adm-wrap">
              <table className="adm-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Administrateur</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.audit.map((a, i) => (
                    <tr key={i}>
                      <td>{when(a.at)}</td>
                      <td>{a.admin ?? '—'}</td>
                      <td>{a.action === 'overview' ? 'Vue d’ensemble' : a.action === 'logs' ? 'Journal' : a.action === 'school' ? `École ${a.target ?? ''}` : a.action}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ))}
    </Frame>
  );
}

function RunsTable({ runs, showSchool }: { runs: AdminRun[]; showSchool: boolean }) {
  return (
    <div className="adm-wrap">
      <table className="adm-table">
        <thead>
          <tr>
            <th>Date</th>
            {showSchool && <th>École</th>}
            <th>Classe</th>
            <th>Élève</th>
            <th>Jeu</th>
            <th>Mode</th>
            <th>Score</th>
            <th>Précision</th>
            <th>Durée</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((r, i) => (
            <tr key={i}>
              <td>{when(r.at)}</td>
              {showSchool && <td>{r.school}</td>}
              <td>{r.class}</td>
              <td>{r.student}</td>
              <td>{game(r.game)}</td>
              <td>
                {r.mode}
                {r.kind === 'drill' ? ' · entraînement' : ''}
              </td>
              <td>{fmt(r.score)}</td>
              <td>{Math.round(r.acc)} %</td>
              <td>{dur(r.duration)}</td>
            </tr>
          ))}
          {runs.length === 0 && (
            <tr>
              <td colSpan={showSchool ? 9 : 8}>Aucune partie.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
