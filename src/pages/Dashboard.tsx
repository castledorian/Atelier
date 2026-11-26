import { GAME_NAMES } from '../game/sessionConfig';
import { BackButton } from '../components/BackButton';
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { Frame, Notice } from './Frame';
import { SessionsPanel } from './SessionsTeacher';
import { downloadText, fmtDate, toCsv } from '../game/history';
import { ApiError, explain } from '../server/api';
import { GRADES } from '../game/grade';
import * as T from '../server/teacher';
import { Check } from '../components/Screens';
import StudentProfile from './StudentProfile';
import { Tip } from '../components/Tip';
import { Card, Pill, Stat } from '../components/ui';
import type { Tone } from '../components/ui';
import { flagOf } from '../game/studentView';
import type { Flag } from '../game/studentView';
import { ObserveBar, ReadOnlyZone } from '../components/ObserveBar';
import { ServerNotice } from '../components/ServerNotice';
import { endOfYearReminder, RETENTION_MONTHS } from '../server/retention';
import { SortTh, useSort, useSorted } from '../components/SortTable';
import type { SortValue } from '../components/SortTable';
import type { ClassRow, NewStudent, Overview, School } from '../server/types';

const nice = (code: string) => `${code.slice(0, 4)} ${code.slice(4)}`;

interface Props {
  email: string;
  onHome: () => void;
  onSignOut: () => void;
  onAccountDeleted: () => void;
  /** administrateur du site : on regarde l'espace d'une école, sans rien pouvoir modifier */
  observe?: { schoolId: string; schoolName: string; onQuit: () => void };
}

export default function Dashboard({ email, onHome, onSignOut, onAccountDeleted, observe }: Props) {
  const [schools, setSchools] = useState<School[] | null>(null);
  const [schoolId, setSchoolId] = useState<string | null>(null);
  const [classes, setClasses] = useState<ClassRow[] | null>(null);
  const [classId, setClassId] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  /** droit de créer une école (code d'invitation) : demandé seulement tant qu'aucune école n'existe */
  const [mayCreate, setMayCreate] = useState<boolean | null>(null);

  /** Exécute une action serveur ; les erreurs s'affichent, une session perdue renvoie à la connexion. */
  const act = useCallback(
    async <R,>(f: () => Promise<R>): Promise<R | undefined> => {
      setErr('');
      try {
        return await f();
      } catch (e) {
        if (e instanceof ApiError && e.code === 'not_authenticated') onSignOut();
        else setErr(explain(e));
        return undefined;
      }
    },
    [onSignOut],
  );

  const loadSchools = useCallback(
    async (select?: string) => {
      const list = observe
        ? await act(async () => {
            const s = await T.getSchool(observe.schoolId);
            return s ? [s] : [];
          })
        : await act(T.listSchools);
      if (!list) return;
      setSchools(list);
      setSchoolId((cur) => select ?? (cur && list.some((s) => s.id === cur) ? cur : (list[0]?.id ?? null)));
    },
    [act, observe],
  );
  useEffect(() => {
    void loadSchools();
  }, [loadSchools]);

  const loadClasses = useCallback(
    async (school: string, select?: string) => {
      const list = await act(() => T.listClasses(school));
      if (!list) return;
      setClasses(list);
      setClassId((cur) => select ?? (cur && list.some((c) => c.id === cur) ? cur : (list[0]?.id ?? null)));
    },
    [act],
  );
  useEffect(() => {
    setClasses(null);
    setClassId(null);
    if (schoolId) void loadClasses(schoolId);
  }, [schoolId, loadClasses]);

  const noSchool = schools !== null && schools.length === 0;
  useEffect(() => {
    if (!noSchool) return;
    let live = true;
    void T.teacherAccess()
      .then((a) => live && setMayCreate(a.allowed))
      .catch(() => live && setMayCreate(true)); // on ne sait pas : le serveur refusera lui-même si besoin
    return () => {
      live = false;
    };
  }, [noSchool]);

  const school = schools?.find((s) => s.id === schoolId) ?? null;
  const cls = classes?.find((c) => c.id === classId) ?? null;

  const createSchool = async (name: string) => {
    setBusy(true);
    const id = await act(() => T.createSchool(name));
    if (id) await loadSchools(String(id));
    setBusy(false);
  };

  const Zone = observe ? ReadOnlyZone : Fragment;

  return (
    <Frame wide fill>
      <div className="card-top">
        <BackButton label={observe ? 'Retour à l’administration' : undefined} onClick={observe ? observe.onQuit : onHome} />
      </div>
      {observe && <ObserveBar label={`espace enseignant de « ${observe.schoolName} »`} onQuit={observe.onQuit} />}
      <div className="dash-head">
        <div>
          <p className="eyebrow">Espace enseignant</p>
          <h1 className="title-sm">{school ? school.name : 'Mon école'}</h1>
        </div>
        {!observe && (
          <div className="dash-who">
            <span className="text-[14px] text-ink/70">{email}</span>
            <div className="who-actions">
              <button type="button" className="link" onClick={onSignOut}>
                Se déconnecter
              </button>
            </div>
          </div>
        )}
      </div>
      <div className="rule" aria-hidden="true" />

      <Zone>
      {err && <Notice kind="error">{err}</Notice>}
      <ServerNotice mode="teacher" />

      {schools === null ? (
        <p className="mt-4 text-[15px]">Chargement…</p>
      ) : schools.length === 0 && mayCreate === false ? (
        <InviteForm onAccepted={() => setMayCreate(true)} act={act} />
      ) : schools.length === 0 ? (
        <NameForm
          title="Crée ton école"
          text="Donne le nom de ton école. Tes classes et tes élèves seront rangés dedans. Les autres enseignants de l’école auront leur propre compte."
          label="Nom de l’école"
          placeholder="École Jules Ferry, Lyon"
          button="Créer mon école"
          busy={busy}
          onSubmit={createSchool}
        />
      ) : (
        <>
          <SchoolBar
            schools={schools}
            schoolId={schoolId}
            onPick={setSchoolId}
            onCreate={createSchool}
            onDelete={async () => {
              if (!schoolId) return;
              const ok = await act(async () => {
                await T.deleteSchool(schoolId);
                return true;
              });
              if (ok) {
                setSchoolId(null);
                await loadSchools();
              }
            }}
            schoolName={school?.name ?? ''}
          />

          {classes === null ? (
            <p className="mt-4 text-[15px]">Chargement des classes…</p>
          ) : classes.length === 0 ? (
            <NameForm
              title="Crée ta première classe"
              text="Par exemple « CM2 A ». Tu pourras ensuite y ajouter tes élèves."
              label="Nom de la classe"
              placeholder="CM2 A"
              button="Créer la classe"
              busy={busy}
              onSubmit={async (name) => {
                if (!schoolId) return;
                setBusy(true);
                const c = await act(() => T.createClass(schoolId, name));
                if (c) await loadClasses(schoolId, c.id);
                setBusy(false);
              }}
            />
          ) : (
            <>
              <ClassBar
                classes={classes}
                classId={classId}
                onPick={setClassId}
                onCreate={async (name) => {
                  if (!schoolId) return;
                  const c = await act(() => T.createClass(schoolId, name));
                  if (c) await loadClasses(schoolId, c.id);
                }}
              />
              {cls && school && (
                <ClassPanel
                  key={cls.id}
                  cls={cls}
                  schoolName={school.name}
                  act={act}
                  onDeleted={() => schoolId && void loadClasses(schoolId)}
                />
              )}
            </>
          )}
        </>
      )}

      {!observe && <AccountPanel email={email} act={act} onDeleted={onAccountDeleted} />}
      </Zone>
    </Frame>
  );
}

/** Colonnes triables du tableau des élèves. */
type OverKey = 'name' | 'flag' | 'games' | 'acc' | 'weak' | 'last';
type Row = Overview & { ins: T.Insight | null };

const FLAG_ORDER: Record<Flag, number> = { struggling: 0, inactive: 1, never: 2, steady: 3, rising: 4 };
const FLAG_TONE: Record<Flag, Tone> = { struggling: 'bad', inactive: 'warn', never: 'mute', steady: 'good', rising: 'good' };
const NOW = () => Date.now();

function rowFlag(r: Row) {
  return flagOf(r.ins ?? { last_played: r.last_played, runs_30d: 0, acc_recent: null, acc_prev: null }, NOW());
}

function overValue(r: Row, key: OverKey): SortValue {
  switch (key) {
    case 'name':
      return r.name;
    case 'flag':
      return FLAG_ORDER[rowFlag(r).flag];
    case 'games':
      return r.games;
    case 'acc':
      return r.ins?.acc_recent ?? null;
    case 'weak':
      return r.ins?.weak?.err ?? null;
    case 'last':
      return r.last_played;
  }
}

// ───────────────────────── Formulaires simples ─────────────────────────

/** Première connexion d'un enseignant : le site est ouvert sur invitation, il faut le code donné par l'administrateur. */
function InviteForm({ onAccepted, act }: { onAccepted: () => void; act: Act }) {
  const [code, setCode] = useState('');
  const [bad, setBad] = useState(false);
  const [busy, setBusy] = useState(false);
  const go = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setBad(false);
    const ok = await act(() => T.redeemInvitation(code));
    setBusy(false);
    if (ok === true) onAccepted();
    else if (ok === false) setBad(true);
  };
  return (
    <form className="form mt-4" onSubmit={go} aria-label="Code d’invitation">
      <h2 className="subhead">
        Code d’invitation
        <Tip label="D’où vient ce code ?">Créer une école demande un code donné par l’administrateur du site.</Tip>
      </h2>
      <label className="subhead" htmlFor="inv-code">
        Ton code
      </label>
      <input
        id="inv-code"
        className="field"
        value={code}
        maxLength={12}
        size={12}
        placeholder="XXXX XXXX"
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        aria-describedby={bad ? 'inv-bad' : undefined}
        autoFocus
      />
      {bad && (
        <p id="inv-bad" className="text-[14px]" role="alert">
          Ce code n’est pas valable : il est faux, expiré ou déjà utilisé. Vérifie-le ou demande-en un nouveau.
        </p>
      )}
      <div>
        <button type="submit" className="btn btn-primary" disabled={busy || code.replace(/[^A-Z0-9]/gi, '').length < 8}>
          Valider le code
        </button>
      </div>
    </form>
  );
}

function NameForm({
  title,
  text,
  label,
  placeholder,
  button,
  busy,
  onSubmit,
}: {
  title: string;
  text: string;
  label: string;
  placeholder: string;
  button: string;
  busy: boolean;
  onSubmit: (name: string) => void;
}) {
  const [name, setName] = useState('');
  const go = (e: FormEvent) => {
    e.preventDefault();
    if (name.trim().length >= 1) onSubmit(name.trim());
  };
  return (
    <form className="form mt-4" onSubmit={go} aria-label={title}>
      <h2 className="subhead">
        {title}
        <Tip label={`À propos : ${title}`}>{text}</Tip>
      </h2>
      <label className="subhead" htmlFor="nf-name">
        {label}
      </label>
      <input
        id="nf-name"
        className="field"
        value={name}
        maxLength={80}
        placeholder={placeholder}
        onChange={(e) => setName(e.target.value)}
        autoFocus
      />
      <div>
        <button type="submit" className="btn btn-primary" disabled={busy || name.trim().length < 2}>
          {button}
        </button>
      </div>
    </form>
  );
}

function SchoolBar({
  schools,
  schoolId,
  onPick,
  onCreate,
  onDelete,
  schoolName,
}: {
  schools: School[];
  schoolId: string | null;
  onPick: (id: string) => void;
  onCreate: (name: string) => void;
  onDelete: () => void;
  schoolName: string;
}) {
  const [adding, setAdding] = useState('');
  const [typed, setTyped] = useState('');
  return (
    <details className="fold sec">
      <summary>École{schools.length > 1 ? 's' : ''} · gérer</summary>
      <div className="mt-2 flex flex-col gap-3">
        {schools.length > 1 && (
          <label className="flex items-center gap-2 text-[14px]">
            École
            <select className="field" value={schoolId ?? ''} onChange={(e) => onPick(e.target.value)}>
              {schools.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {schools.length < 3 && (
          <form
            className="flex flex-wrap items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (adding.trim().length >= 2) {
                onCreate(adding.trim());
                setAdding('');
              }
            }}
          >
            <input
              className="field"
              placeholder="Nom d’une autre école"
              aria-label="Nom d’une autre école"
              value={adding}
              maxLength={80}
              onChange={(e) => setAdding(e.target.value)}
            />
            <button type="submit" className="btn btn-ghost" disabled={adding.trim().length < 2}>
              Ajouter une école
            </button>
          </form>
        )}
        <div className="danger">
          <p className="text-[14px] leading-snug">
            <strong>Supprimer l’école</strong> efface définitivement ses classes, ses élèves et tous leurs scores. Pour confirmer, recopie
            son nom&nbsp;: <em>{schoolName}</em>
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <input className="field" aria-label="Recopier le nom de l’école" value={typed} onChange={(e) => setTyped(e.target.value)} />
            <button type="button" className="btn btn-ghost" disabled={typed.trim() !== schoolName} onClick={onDelete}>
              Supprimer définitivement
            </button>
          </div>
        </div>
      </div>
    </details>
  );
}

function ClassBar({
  classes,
  classId,
  onPick,
  onCreate,
}: {
  classes: ClassRow[];
  classId: string | null;
  onPick: (id: string) => void;
  onCreate: (name: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  return (
    <div className="class-bar" role="tablist" aria-label="Classes">
      {classes.map((c) => (
        <button key={c.id} type="button" role="tab" aria-selected={c.id === classId} className="class-tab" onClick={() => onPick(c.id)}>
          {c.name}
        </button>
      ))}
      {adding ? (
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) {
              onCreate(name.trim());
              setName('');
              setAdding(false);
            }
          }}
        >
          <input
            className="field"
            autoFocus
            aria-label="Nom de la nouvelle classe"
            placeholder="CM1 B"
            value={name}
            maxLength={40}
            onChange={(e) => setName(e.target.value)}
          />
          <button type="submit" className="btn btn-ghost" disabled={!name.trim()}>
            Créer
          </button>
        </form>
      ) : (
        <button type="button" className="class-tab class-add" onClick={() => setAdding(true)}>
          + Nouvelle classe
        </button>
      )}
    </div>
  );
}

// ───────────────────────── Une classe ─────────────────────────

type Act = <R>(f: () => Promise<R>) => Promise<R | undefined>;

function ClassPanel({
  cls,
  schoolName,
  act,
  onDeleted,
}: {
  cls: ClassRow;
  schoolName: string;
  act: Act;
  onDeleted: () => void;
}) {
  const [rawRows, setRows] = useState<Overview[] | null>(null);
  const [insights, setInsights] = useState<T.Insight[] | null>(null);
  const [openStudent, setOpenStudent] = useState<{ id: string; name: string } | null>(null);
  const rows = useMemo<Row[] | null>(() => {
    if (!rawRows) return null;
    const byId = new Map((insights ?? []).map((i) => [i.id, i]));
    return rawRows.map((r) => ({ ...r, ins: byId.get(r.id) ?? null }));
  }, [rawRows, insights]);
  const { sort, toggle } = useSort<OverKey>('name', 'asc');
  const shown = useSorted(rows, sort, overValue);
  const [names, setNames] = useState('');
  const [fresh, setFresh] = useState<NewStudent[] | null>(null);
  /** Codes connus uniquement dans cette page (jamais conservés ailleurs) : le serveur ne garde que leur empreinte. */
  const [cards, setCards] = useState<Record<string, string>>({});
  const codeOf = (r: Row): string | null => cards[r.id] ?? r.access_code ?? null;
  const remember = (list: NewStudent[]) => setCards((c) => ({ ...c, ...Object.fromEntries(list.map((s) => [s.id, s.access_code])) }));
  const [msg, setMsg] = useState('');
  const [confirm, setConfirm] = useState<string | null>(null);
  /** une seule partie de la classe à la fois : la page reste courte */
  const [part, setPart] = useState<'results' | 'add' | 'session' | 'danger'>('results');
  const [boardHidden, setBoardHidden] = useState(cls.hide_board === true);
  const [grade, setGrade] = useState<string | null>(cls.grade ?? null);

  const reload = useCallback(async () => {
    const [r, ins] = await Promise.all([act(() => T.classOverview(cls.id)), act(() => T.classInsights(cls.id))]);
    if (ins !== undefined) setInsights(ins);
    if (r) {
      setRows(r);
      if (r.length === 0) setPart('add');
    }
  }, [act, cls.id]);
  useEffect(() => {
    void reload();
  }, [reload]);

  const add = async (e: FormEvent) => {
    e.preventDefault();
    const list = names
      .split(/\r?\n/)
      .map((n) => n.trim())
      .filter(Boolean);
    if (list.length === 0) return;
    const created = await act(() => T.addStudents(cls.id, list));
    if (created) {
      setFresh(created);
      remember(created);
      setNames('');
      setMsg(`${created.length} élève${created.length > 1 ? 's' : ''} ajouté${created.length > 1 ? 's' : ''}.`);
      const r = await act(() => T.classOverview(cls.id));
      if (r) setRows(r);
    }
  };

  const exportRuns = async () => {
    const runs = await act(() => T.classRuns(cls.id));
    if (!runs) return;
    const GAME: Record<string, string> = GAME_NAMES;
    downloadText(
      `resultats-${cls.name.replace(/[^\w-]+/g, '_')}.csv`,
      toCsv(
        ['Date', 'Élève', 'Jeu', 'Mode', 'Type', 'Score', 'Vague / série', 'Mots/min', 'Précision %', 'Bonnes réponses', 'Durée (s)'],
        runs.map((r) => [
          fmtDate(new Date(r.played_at).getTime()),
          r.students?.name ?? '',
          GAME[r.game] ?? r.game,
          r.mode,
          r.kind === 'drill' ? 'Entraînement' : 'Partie',
          r.score,
          r.wave,
          r.wpm,
          r.acc,
          r.correct,
          r.duration,
        ]),
      ),
    );
    setMsg(
      `${runs.length} partie${runs.length > 1 ? 's' : ''} exportée${runs.length > 1 ? 's' : ''}${runs.length >= 5000 ? ' (les 5 000 plus récentes)' : ''}.`,
    );
  };

  const clearRuns = async () => {
    if (
      !window.confirm(
        `Effacer tous les résultats de la classe « ${cls.name} » ?\nLes élèves et leurs codes sont gardés. Pense à exporter d’abord : l’effacement est définitif.`,
      )
    )
      return;
    const ok = await act(async () => {
      await T.clearClassRuns(cls.id);
      return true;
    });
    if (ok) {
      setMsg('Résultats effacés. Les élèves gardent leur code.');
      await reload();
    }
  };

  const PARTS: Array<[typeof part, string]> = [
    ['results', 'Résultats'],
    ['add', 'Ajouter des élèves'],
    ['session', 'Séances'],
    ['danger', 'Supprimer'],
  ];

  if (openStudent) return <StudentProfile id={openStudent.id} name={openStudent.name} act={act} onBack={() => setOpenStudent(null)} />;

  const now = NOW();
  const weekAgo = now - 7 * 86_400_000;
  const active7 = (rows ?? []).filter((r) => r.last_played !== null && r.last_played >= weekAgo).length;
  const runs30 = (insights ?? []).reduce((n, i) => n + i.runs_30d, 0);
  const accs = (insights ?? []).flatMap((i) => (i.acc_recent === null ? [] : [i.acc_recent]));
  const accAvg = accs.length ? Math.round(accs.reduce((a, b) => a + b, 0) / accs.length) : null;
  const toWatch = (rows ?? [])
    .map((r) => ({ r, f: rowFlag(r) }))
    .filter((x) => x.f.flag === 'struggling' || x.f.flag === 'inactive')
    .sort((a, b) => FLAG_ORDER[a.f.flag] - FLAG_ORDER[b.f.flag])
    .slice(0, 6);

  return (
    <>
      <div className="part-bar" role="tablist" aria-label={`Classe ${cls.name}`}>
        {PARTS.map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={part === k} className="part-tab" onClick={() => setPart(k)}>
            {label}
          </button>
        ))}
      </div>

      {msg && <Notice kind="ok">{msg}</Notice>}

      {part === 'results' && endOfYearReminder(new Date()) && (
        <div className="notice notice-info" role="status">
          <p>
            <strong>Fin d’année : exporte puis efface les résultats.</strong>
            <Tip label="Pourquoi ?">
              Les élèves gardent leur code et repartent de zéro. Sinon, le serveur efface lui-même les parties de plus de {RETENTION_MONTHS} mois.
            </Tip>
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" className="btn btn-ghost" onClick={exportRuns}>
              Exporter (CSV)
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => void clearRuns()}>
              Effacer les résultats…
            </button>
          </div>
        </div>
      )}

      {part === 'results' && (
        <section className="sec sec-fill" aria-labelledby="res-h">
          <div className="sec-head">
            <h2 id="res-h" className="subhead">
              Élèves et résultats · {cls.name}
            </h2>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn btn-ghost" onClick={() => void reload()}>
                Actualiser
              </button>
              <button type="button" className="btn btn-ghost" onClick={exportRuns}>
                Exporter (CSV)
              </button>
              <button type="button" className="btn btn-ghost" disabled={!(rows ?? []).some((r) => codeOf(r))} onClick={() => window.print()}>
                Imprimer les codes
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                disabled={!rows?.length}
                onClick={async () => {
                  if (confirm !== 'class-codes') {
                    setConfirm('class-codes');
                    setMsg('Cela change le code de TOUS les élèves de la classe : les anciennes fiches ne marcheront plus. Clique encore pour confirmer.');
                    return;
                  }
                  setConfirm(null);
                  const all = await act(() => T.resetClassCodes(cls.id));
                  if (all) {
                    remember(all);
                    setMsg('Nouveaux codes créés. Clique sur « Imprimer les codes » maintenant : ils ne seront plus affichés ensuite.');
                    await reload();
                  }
                }}
              >
                {confirm === 'class-codes' ? 'Confirmer : nouveaux codes' : 'Nouveaux codes pour la classe'}
              </button>
            </div>
          </div>
          {(cls.grade !== undefined || cls.hide_board !== undefined) && (
            <details className="fold fold-flat">
              <summary>Réglages de la classe</summary>
              <div className="fold-in">
                {cls.grade !== undefined && (
                  <div>
                    <span className="subhead" id={`grade-${cls.id}`}>
                      Niveau de la classe
                    </span>
                    <Tip label="À propos du niveau">Tes élèves ne voient que les jeux de leur niveau, sans rien avoir à choisir.</Tip>
                    <div className="seg mt-1" role="radiogroup" aria-labelledby={`grade-${cls.id}`}>
                      {GRADES.map((g) => (
                        <button
                          key={g.id}
                          type="button"
                          role="radio"
                          aria-checked={grade === g.id}
                          className="seg-b"
                          onClick={async () => {
                            const ok = await act(async () => {
                              await T.setClassGrade(cls.id, g.id);
                              return true;
                            });
                            if (ok) setGrade(g.id);
                          }}
                        >
                          {g.label}
                        </button>
                      ))}
                    </div>
                    {grade === null && <p className="mt-1 text-[14px]">Non fixé : chaque élève choisit.</p>}
                  </div>
                )}
                {cls.hide_board !== undefined && (
                  <Check
                    on={boardHidden}
                    onClick={async () => {
                      const next = !boardHidden;
                      const ok = await act(async () => {
                        await T.setBoardHidden(cls.id, next);
                        return true;
                      });
                      if (ok) setBoardHidden(next);
                    }}
                  >
                    Masquer les classements aux élèves
                  </Check>
                )}
              </div>
            </details>
          )}
          {rows === null ? (
            <p className="text-[15px]">Chargement…</p>
          ) : rows.length === 0 ? (
            <p className="text-[15px] leading-snug">
              Aucun élève pour l’instant.{' '}
              <button type="button" className="link" onClick={() => setPart('add')}>
                Ajouter des élèves
              </button>
            </p>
          ) : (
            <>
              <div className="u-grid-stats">
                <Stat label="Élèves" value={rows.length} />
                <Stat label="Actifs cette semaine" value={`${active7} / ${rows.length}`} />
                <Stat label="Parties en 30 jours" value={insights ? runs30 : '—'} />
                <Stat label="Réussite" value={accAvg === null ? '—' : `${accAvg} %`} hint="Moyenne de la classe sur les 5 dernières parties de chaque élève." />
              </div>
              {insights === null && (
                <p className="u-info">Fiches élèves indisponibles : mise à jour du serveur à faire.</p>
              )}
              {toWatch.length > 0 && (
                <Card title="À suivre" note="Élèves qui ont peut-être besoin d’un coup de pouce : réussite basse en ce moment, ou pas de partie depuis 2 semaines.">
                  <ul className="u-watch">
                    {toWatch.map(({ r, f }) => (
                      <li key={r.id}>
                        <button type="button" className="u-name" onClick={() => setOpenStudent({ id: r.id, name: r.name })}>
                          {r.name}
                        </button>
                        <Pill tone={FLAG_TONE[f.flag]}>{f.label}</Pill>
                      </li>
                    ))}
                  </ul>
                </Card>
              )}
              <p className="text-[15px]">
                Clique sur un prénom pour ouvrir sa fiche.
                <Tip label="Lire le tableau">« Réussite » : moyenne des 5 dernières parties (flèche : hausse ou baisse par rapport aux 5 d’avant). Clique sur un titre pour trier. L’export CSV contient tout.</Tip>
              </p>
              <div className="tbl-wrap">
                <table className="scores tbl">
                  <caption className="sr-only">Élèves de la classe : repère, parties, réussite récente, point à revoir, dernière partie. Cliquez sur un prénom pour ouvrir sa fiche.</caption>
                  <thead>
                    <tr>
                      <SortTh col="name" sort={sort} onSort={toggle}>
                        Élève
                      </SortTh>
                      <SortTh col="flag" sort={sort} onSort={toggle}>
                        Repère
                      </SortTh>
                      <SortTh col="games" sort={sort} onSort={toggle} numeric className="num c-mid">
                        Parties
                      </SortTh>
                      <SortTh col="acc" sort={sort} onSort={toggle} numeric className="num c-sm">
                        Réussite
                      </SortTh>
                      <SortTh col="weak" sort={sort} onSort={toggle} className="c-mid">
                        À revoir
                      </SortTh>
                      <SortTh col="last" sort={sort} onSort={toggle} numeric className="c-lo">
                        Dernière<span className="sr-only"> partie</span>
                      </SortTh>
                      <th scope="col" className="c-lo">
                        Code
                      </th>
                      <th scope="col">
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {(shown ?? []).map((r) => {
                      const f = rowFlag(r);
                      const trend = r.ins && r.ins.acc_recent !== null && r.ins.acc_prev !== null ? r.ins.acc_recent - r.ins.acc_prev : null;
                      return (
                        <tr key={r.id}>
                          <td>
                            <button type="button" className="u-name" onClick={() => setOpenStudent({ id: r.id, name: r.name })}>
                              {r.name}
                            </button>
                          </td>
                          <td>
                            <Pill tone={FLAG_TONE[f.flag]}>{f.label}</Pill>
                          </td>
                          <td className="num c-mid">{r.games}</td>
                          <td className="num c-sm">
                            {r.ins?.acc_recent != null ? `${Math.round(r.ins.acc_recent)} %` : '–'}
                            {trend !== null && Math.abs(trend) >= 5 && (
                              <span className={trend > 0 ? 'u-up' : 'u-down'} aria-label={trend > 0 ? 'en hausse' : 'en baisse'}>
                                {trend > 0 ? ' ↑' : ' ↓'}
                              </span>
                            )}
                          </td>
                          <td className="c-mid">{r.ins?.weak ? `${r.ins.weak.label} (${r.ins.weak.err} %)` : '–'}</td>
                          <td className="c-lo">{r.last_played ? fmtDate(r.last_played) : '–'}</td>
                          <td className="mono c-lo">{codeOf(r) ? nice(codeOf(r) as string) : <span className="text-ink/60">Masqué</span>}</td>
                          <td className="row-actions">
                            <button
                              type="button"
                              className="link"
                              onClick={async () => {
                                const code = await act(() => T.resetCode(r.id));
                                if (code) {
                                  remember([{ id: r.id, name: r.name, access_code: String(code) }]);
                                  setMsg(`Nouveau code de ${r.name} : ${nice(String(code))} (l’ancien ne fonctionne plus). Note-le : il ne sera plus affiché.`);
                                  await reload();
                                }
                              }}
                            >
                              <span aria-hidden="true">Nouveau code</span>
                              <span className="sr-only">Nouveau code pour {r.name}</span>
                            </button>
                            <button
                              type="button"
                              className="link"
                              onClick={async () => {
                                if (confirm !== r.id) {
                                  setConfirm(r.id);
                                  return;
                                }
                                setConfirm(null);
                                const ok = await act(async () => {
                                  await T.deleteStudent(r.id);
                                  return true;
                                });
                                if (ok) {
                                  setMsg(`${r.name} et ses scores ont été supprimés.`);
                                  await reload();
                                }
                              }}
                              onBlur={() => setConfirm(null)}
                            >
                              <span aria-hidden="true">{confirm === r.id ? 'Confirmer' : 'Retirer'}</span>
                              <span className="sr-only">{confirm === r.id ? `Confirmer la suppression de ${r.name}` : `Supprimer ${r.name}`}</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      )}

      {part === 'add' && (
        <section className="sec" aria-labelledby="add-h">
          <h2 id="add-h" className="subhead mb-2">
            Ajouter des élèves
          </h2>
          <form onSubmit={add} className="form">
            <label className="text-[15px]" htmlFor="add-names">
              Un prénom par ligne
              <Tip label="Conseils">Prénom ou pseudo, jamais de nom complet. Tu peux coller une liste. Chaque élève reçoit un code.</Tip>
            </label>
            <textarea
              id="add-names"
              className="field names-area"
              rows={5}
              value={names}
              placeholder={'Léa\nHugo\nInès M.'}
              onChange={(e) => setNames(e.target.value)}
            />
            <div>
              <button type="submit" className="btn btn-primary" disabled={!names.trim()}>
                Ajouter à {cls.name}
              </button>
            </div>
          </form>
          {fresh && (
            <div className="mt-3">
              <h3 className="subhead mb-1">Codes créés</h3>
              <ul className="code-list">
                {fresh.map((s) => (
                  <li key={s.id}>
                    <span>{s.name}</span>
                    <span className="mono">{nice(s.access_code)}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-[15px]">
                <strong>Imprime-les maintenant :</strong> ils ne s’afficheront plus.
              </p>
              <p className="mt-1">
                <button type="button" className="btn btn-ghost" onClick={() => window.print()}>
                  Imprimer les codes
                </button>
              </p>
            </div>
          )}
        </section>
      )}

      {part === 'session' && <SessionsPanel cls={cls} act={act} />}

      {part === 'danger' && (
        <section className="sec danger-sec" aria-labelledby="clr-h">
          <h2 id="clr-h" className="subhead">
            Effacer les résultats de {cls.name}
          </h2>
          <p className="mt-2 text-[15px] leading-snug">
            Efface les scores ; garde les élèves et leurs codes. Exporte d’abord.
            <Tip label="Bon à savoir">Idéal pour repartir de zéro à la rentrée. Les parties de plus de {RETENTION_MONTHS} mois sont de toute façon effacées par le serveur.</Tip>
          </p>
          <button type="button" className="btn btn-ghost mt-2" onClick={() => void clearRuns()}>
            Effacer les résultats
          </button>
        </section>
      )}

      {part === 'danger' && (
        <section className="sec danger-sec" aria-labelledby="del-h">
          <h2 id="del-h" className="subhead">
            Supprimer la classe {cls.name}
          </h2>
          <p className="mt-2 text-[14px] leading-snug">Efface la classe, ses élèves et tous leurs scores. Cette action est définitive.</p>
          <button
            type="button"
            className="btn btn-ghost mt-2"
            onClick={async () => {
              if (!window.confirm(`Supprimer définitivement la classe « ${cls.name} » et tous ses élèves ?`)) return;
              const ok = await act(async () => {
                await T.deleteClass(cls.id);
                return true;
              });
              if (ok) onDeleted();
            }}
          >
            Supprimer {cls.name}
          </button>
        </section>
      )}

      {/* Fiche imprimable : visible uniquement à l'impression */}
      <section className="print-only" aria-hidden="true">
        <h2>
          {schoolName} — {cls.name}
        </h2>
        <p>Pour jouer : ouvre le site, choisis « Je suis élève » et tape ton code.</p>
        <div className="print-cards">
          {(rows ?? [])
            .filter((r) => codeOf(r))
            .map((r) => (
              <div key={r.id} className="print-card">
                <strong>{r.name}</strong>
                <span className="mono">{nice(codeOf(r) as string)}</span>
              </div>
            ))}
        </div>
      </section>
    </>
  );
}

// ───────────────────────── Mon compte ─────────────────────────

/** Suppression du compte enseignant, en plusieurs étapes pour qu'on ne puisse pas la déclencher par erreur. */
function AccountPanel({ email, act, onDeleted }: { email: string; act: <R>(f: () => Promise<R>) => Promise<R | undefined>; onDeleted: () => void }) {
  const [preview, setPreview] = useState<T.DeletionPreview[] | null>(null);
  const [typed, setTyped] = useState('');
  const [sure, setSure] = useState(false);
  const [busy, setBusy] = useState(false);
  const ready = typed.trim().toLowerCase() === email.trim().toLowerCase() && sure && !busy;
  const cancel = () => {
    setPreview(null);
    setTyped('');
    setSure(false);
  };
  return (
    <details className="fold sec">
      <summary>Mon compte</summary>
      <div className="mt-2 flex flex-col gap-3">
        {preview === null ? (
          <div className="danger">
            <p className="text-[15px] leading-snug">
              Supprimer mon compte enseignant
              <Tip label="Est-ce immédiat ?">Non : rien n’est supprimé avant les étapes de confirmation.</Tip>
            </p>
            <div className="mt-2">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={async () => {
                  const p = await act(() => T.accountDeletionPreview());
                  if (p) setPreview(p);
                }}
              >
                Supprimer mon compte…
              </button>
            </div>
          </div>
        ) : (
          <div className="danger" role="group" aria-label="Suppression du compte">
            <p className="text-[14px] font-bold">Ce qui va se passer</p>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-[14px] leading-snug">
              <li>
                Ton compte (<em>{email}</em>) et ton mot de passe sont supprimés <strong>définitivement</strong>.
              </li>
              {preview.length === 0 && <li>Tu n’as aucune école : rien d’autre n’est supprimé.</li>}
              {preview.map((s) =>
                s.members <= 1 ? (
                  <li key={s.name}>
                    L’école <strong>{s.name}</strong> est <strong>supprimée avec toi</strong> : {s.classes} classe{s.classes > 1 ? 's' : ''}, {s.students} élève
                    {s.students > 1 ? 's' : ''} et tous leurs scores (tu es le seul enseignant).
                  </li>
                ) : (
                  <li key={s.name}>
                    L’école <strong>{s.name}</strong> reste accessible aux {s.members - 1} autre{s.members > 2 ? 's' : ''} enseignant{s.members > 2 ? 's' : ''}.
                  </li>
                ),
              )}
            </ul>
            <p className="mt-2 text-[14px] leading-snug">
              Pour garder une trace, exporte d’abord les résultats de tes classes (bouton « Exporter » de chaque classe).
            </p>
            <label className="mt-2 flex flex-col gap-1 text-[14px]">
              Pour confirmer, recopie ton adresse e-mail&nbsp;: <em>{email}</em>
              <input className="field" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" spellCheck={false} />
            </label>
            <label className="mt-2 flex items-start gap-2 text-[14px]">
              <input type="checkbox" className="mt-1" checked={sure} onChange={(e) => setSure(e.target.checked)} />
              <span>Je comprends que la suppression est définitive et qu’on ne pourra rien récupérer.</span>
            </label>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" className="btn btn-primary" onClick={cancel}>
                Annuler
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                disabled={!ready}
                onClick={async () => {
                  setBusy(true);
                  const ok = await act(async () => {
                    await T.deleteMyAccount(typed.trim());
                    return true;
                  });
                  setBusy(false);
                  if (ok) onDeleted();
                }}
              >
                Supprimer définitivement mon compte
              </button>
            </div>
          </div>
        )}
      </div>
    </details>
  );
}
