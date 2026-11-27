import { useCallback, useEffect, useState } from 'react';
import { BackButton } from '../components/BackButton';
import { downloadText, toCsv } from '../game/history';
import { ApiError, explain } from '../server/api';
import { adminItemSpread, adminBalance, adminGameStats, adminObserve, observeStudent, adminItemStats, adminLogs, adminOverview, adminSchool } from '../server/admin';
import type { AdminBalance as AdminBalanceData, ItemSpreadRow, AdminItems, GameStats, AdminLogs, AdminOverview, AdminRun, AdminSchool } from '../server/admin';
import AdminBalance from './AdminBalance';
import AdminInvitations from './AdminInvitations';
import { ServerNotice } from '../components/ServerNotice';
import { Tip } from '../components/Tip';
import { Frame, Notice } from './Frame';
import Cave from './Cave';
import Dashboard from './Dashboard';
import ObserveStudent from './ObserveStudent';
import { LogsPanel } from './admin/LogsPanel';
import { OverviewPanel } from './admin/OverviewPanel';
import { SchoolPanel } from './admin/SchoolPanel';
import { game, when } from './admin/format';
import type { Watch } from './admin/types';

type Tab = 'overview' | 'school' | 'balance' | 'logs' | 'invites';

interface Props {
  email: string;
  onHome: () => void;
  onSignOut: () => void;
}

/** Espace administrateur : tout voir (écoles, classes, élèves, parties, inscriptions, anomalies) et inviter des enseignants ; aucune donnée d'élève n'est modifiable. */
export default function Admin({ email, onHome, onSignOut }: Props) {
  const [tab, setTab] = useState<Tab>('overview');
  const [ov, setOv] = useState<AdminOverview | null>(null);
  const [sch, setSch] = useState<AdminSchool | null>(null);
  const [logs, setLogs] = useState<AdminLogs | null>(null);
  const [bal, setBal] = useState<{ levels: AdminBalanceData['levels']; stats: AdminItems; detail: GameStats | null; spread: ItemSpreadRow[] | null } | null>(null);
  const [days, setDays] = useState(90);
  const [q, setQ] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [watch, setWatch] = useState<Watch | null>(null);

  const act = useCallback(
    async <R,>(f: () => Promise<R>, missing?: string): Promise<R | undefined> => {
      setErr('');
      setBusy(true);
      try {
        return await f();
      } catch (e) {
        if (e instanceof ApiError && e.code === 'not_authenticated') onSignOut();
        else if (e instanceof ApiError && e.status === 404) setErr(missing ?? 'La mise à jour « administrateur » n’a pas encore été exécutée sur le serveur (voir le guide).');
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
  const loadBalance = useCallback(async () => {
    const d = await act(async () => {
      // statistiques détaillées : seulement si la mise à jour « stats » a été faite (sinon, le reste s'affiche quand même)
      // nombre d'élèves par exercice : seulement si la mise à jour « fiche élève » a été faite
      const [b, s, g, sp] = await Promise.all([adminBalance(), adminItemStats(), adminGameStats(days).catch(() => null), adminItemSpread()]);
      return { levels: b.levels, stats: s, detail: g, spread: sp };
    }, 'La mise à jour « exercices » n’a pas encore été exécutée sur le serveur : collez serveur/mise-a-jour-exercices.sql dans Supabase (voir le guide).');
    if (d) setBal(d);
  }, [act, days]);
  const openSchool = useCallback(
    async (id: string) => {
      setTab('school');
      setSch(null);
      const d = await act(() => adminSchool(id));
      if (d) setSch(d);
    },
    [act],
  );

  /** Entre en observation : le début est noté dans le journal ; si le serveur refuse, on n'entre pas. */
  const observe = useCallback(
    async (w: Watch) => {
      const ok = await act(async () => {
        if (w.kind === 'teacher') await adminObserve('school', w.schoolId);
        else if (w.kind === 'student') w = { ...w, account: await observeStudent(w.studentId) };
        return w;
      }, 'La mise à jour « grotte » n’a pas encore été exécutée sur le serveur (serveur/mise-a-jour-grotte.sql, voir le guide).');
      if (ok) setWatch(ok);
    },
    [act],
  );

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);
  useEffect(() => {
    if (tab === 'logs' && !logs) void loadLogs();
  }, [tab, logs, loadLogs]);
  useEffect(() => {
    if (tab === 'balance' && !bal) void loadBalance();
  }, [tab, bal, loadBalance]);

  const exportRuns = (runs: AdminRun[]) =>
    downloadText(
      'journal-des-parties.csv',
      toCsv(
        ['Date', 'École', 'Classe', 'Élève', 'Jeu', 'Mode', 'Type', 'Score', 'Précision %', 'Durée (s)'],
        runs.map((r) => [when(r.at), r.school ?? '', r.class ?? '', r.student, game(r.game), r.mode, r.kind, r.score, r.acc, r.duration]),
      ),
    );

  if (watch?.kind === 'teacher') {
    return (
      <Dashboard
        email={email}
        onHome={() => setWatch(null)}
        onSignOut={onSignOut}
        onAccountDeleted={() => setWatch(null)}
        observe={{
          schoolId: watch.schoolId,
          schoolName: watch.schoolName,
          onQuit: () => setWatch(null),
          onStudent: (studentId, name, label) => void observe({ kind: 'student', studentId, name, label, back: watch }),
        }}
      />
    );
  }
  if (watch?.kind === 'class') return <Cave onBack={() => setWatch(null)} observe={{ source: { kind: 'class', classId: watch.classId }, label: watch.label, onQuit: () => setWatch(null) }} />;
  if (watch?.kind === 'student' && watch.account) return <ObserveStudent account={watch.account} label={watch.label} onQuit={() => setWatch(watch.back ?? null)} />;

  return (
    <Frame wide fill>
      <div className="card-top">
        <BackButton onClick={onHome} />
      </div>
      <div className="dash-head">
        <div>
          <p className="eyebrow">
            Administration du site
            <Tip label="Confidentialité de cet espace">Les codes des élèves ne sont jamais affichés. Chaque consultation et chaque invitation sont enregistrées (qui, quand, quoi).</Tip>
          </p>
          <h1 className="title-sm">Suivre et inviter</h1>
        </div>
        <div className="dash-who">
          <span className="text-[14px] text-ink/70">{email}</span>
          <div className="who-actions">
            <button
              type="button"
              className="link"
              onClick={() => (tab === 'logs' ? void loadLogs() : tab === 'balance' ? void loadBalance() : tab === 'school' && sch ? void openSchool(sch.school.id) : void loadOverview())}
              disabled={busy}
            >
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
            ['balance', 'Équilibrage'],
            ['logs', 'Journal'],
            ['invites', 'Invitations'],
          ] as [Tab, string][]
        ).map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} className="seg-b" onClick={() => setTab(id)} disabled={id === 'school' && !sch && tab !== 'school'}>
            {label}
          </button>
        ))}
      </div>

      {err && <Notice kind="error">{err}</Notice>}
      <ServerNotice mode="admin" />

      {tab === 'invites' && <AdminInvitations onSignOut={onSignOut} />}

      {tab === 'overview' && (!ov ? <p className="mt-4 text-[15px]">{busy ? 'Chargement…' : ''}</p> : <OverviewPanel ov={ov} query={q} onQuery={setQ} onOpenSchool={(id) => void openSchool(id)} />)}

      {tab === 'school' &&
        (!sch ? <p className="mt-4 text-[15px]">{busy ? 'Chargement…' : 'Choisis une école dans la vue d’ensemble.'}</p> : <SchoolPanel sch={sch} busy={busy} onObserve={(w) => void observe(w)} />)}

      {tab === 'balance' &&
        (!bal ? (
          <p className="mt-4 text-[15px]">{busy ? 'Chargement…' : ''}</p>
        ) : (
          <AdminBalance
            levels={bal.levels}
            stats={bal.stats}
            detail={bal.detail}
            spread={bal.spread}
            days={days}
            onDays={(d) => {
              setDays(d);
              setBal(null);
            }}
          />
        ))}

      {tab === 'logs' && (!logs ? <p className="mt-4 text-[15px]">{busy ? 'Chargement…' : ''}</p> : <LogsPanel logs={logs} onExport={exportRuns} />)}
    </Frame>
  );
}
