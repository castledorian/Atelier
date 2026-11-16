import { BackButton } from '../components/BackButton';
import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Frame, Notice } from './Frame';
import { SessionsPanel } from './SessionsTeacher';
import { downloadText, fmtDate, toCsv } from '../game/history';
import { ApiError, explain } from '../server/api';
import { GRADES } from '../game/grade';
import * as T from '../server/teacher';
import { Check } from '../components/Screens';
import type { ClassRow, NewStudent, Overview, School } from '../server/types';

const fmt = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
const nice = (code: string) => `${code.slice(0, 4)} ${code.slice(4)}`;
const dur = (s: number) => (s >= 3600 ? `${Math.floor(s / 3600)} h ${Math.round((s % 3600) / 60)} min` : `${Math.round(s / 60)} min`);

interface Props {
  email: string;
  onHome: () => void;
  onSignOut: () => void;
  onAccountDeleted: () => void;
}

export default function Dashboard({ email, onHome, onSignOut, onAccountDeleted }: Props) {
  const [schools, setSchools] = useState<School[] | null>(null);
  const [schoolId, setSchoolId] = useState<string | null>(null);
  const [classes, setClasses] = useState<ClassRow[] | null>(null);
  const [classId, setClassId] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

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
      const list = await act(T.listSchools);
      if (!list) return;
      setSchools(list);
      setSchoolId((cur) => select ?? (cur && list.some((s) => s.id === cur) ? cur : (list[0]?.id ?? null)));
    },
    [act],
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

  const school = schools?.find((s) => s.id === schoolId) ?? null;
  const cls = classes?.find((c) => c.id === classId) ?? null;

  const createSchool = async (name: string) => {
    setBusy(true);
    const id = await act(() => T.createSchool(name));
    if (id) await loadSchools(String(id));
    setBusy(false);
  };

  return (
    <Frame wide fill>
      <div className="card-top">
        <BackButton onClick={onHome} />
      </div>
      <div className="dash-head">
        <div>
          <p className="eyebrow">Espace enseignant</p>
          <h1 className="title-sm">{school ? school.name : 'Mon école'}</h1>
        </div>
        <div className="dash-who">
          <span className="text-[14px] text-ink/70">{email}</span>
          <div className="who-actions">
            <button type="button" className="link" onClick={onSignOut}>
              Se déconnecter
            </button>
          </div>
        </div>
      </div>
      <div className="rule" aria-hidden="true" />

      {err && <Notice kind="error">{err}</Notice>}

      {schools === null ? (
        <p className="mt-4 text-[15px]">Chargement…</p>
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

      <AccountPanel email={email} act={act} onDeleted={onAccountDeleted} />
    </Frame>
  );
}

// ───────────────────────── Formulaires simples ─────────────────────────

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
      <h2 className="subhead">{title}</h2>
      <p className="text-[15px] leading-snug">{text}</p>
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
  const [rows, setRows] = useState<Overview[] | null>(null);
  const [names, setNames] = useState('');
  const [fresh, setFresh] = useState<NewStudent[] | null>(null);
  const [msg, setMsg] = useState('');
  const [confirm, setConfirm] = useState<string | null>(null);
  /** une seule partie de la classe à la fois : la page reste courte */
  const [part, setPart] = useState<'results' | 'add' | 'session' | 'danger'>('results');
  const [boardHidden, setBoardHidden] = useState(cls.hide_board === true);
  const [grade, setGrade] = useState<string | null>(cls.grade ?? null);

  const reload = useCallback(async () => {
    const r = await act(() => T.classOverview(cls.id));
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
      setNames('');
      setMsg(`${created.length} élève${created.length > 1 ? 's' : ''} ajouté${created.length > 1 ? 's' : ''}.`);
      const r = await act(() => T.classOverview(cls.id));
      if (r) setRows(r);
    }
  };

  const exportRuns = async () => {
    const runs = await act(() => T.classRuns(cls.id));
    if (!runs) return;
    const GAME: Record<string, string> = { typing: 'Frappe !', math: 'Course à l’encre', memory: 'Mémoire d’encre', spelling: 'Chasse aux fautes' };
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

  const PARTS: Array<[typeof part, string]> = [
    ['results', 'Résultats'],
    ['add', 'Ajouter des élèves'],
    ['session', 'Séances'],
    ['danger', 'Supprimer'],
  ];

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
              <button type="button" className="btn btn-ghost" disabled={!rows?.length} onClick={() => window.print()}>
                Imprimer les codes
              </button>
            </div>
          </div>
          {cls.grade !== undefined && (
            <div className="mb-2">
              <span className="subhead" id={`grade-${cls.id}`}>
                Niveau de la classe
              </span>
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
              <p className="mt-1 text-[14px] leading-snug text-ink/75">
                Tes élèves ne voient que les jeux de leur niveau, sans rien avoir à choisir.
                {grade === null && ' Niveau non fixé : chaque élève choisit sa classe.'}
              </p>
            </div>
          )}
          {cls.hide_board !== undefined && (
            <div className="mb-2">
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
            </div>
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
            <div className="tbl-wrap">
              <table className="scores tbl">
                <caption className="sr-only">Résultats des élèves de la classe</caption>
                <thead>
                  <tr>
                    <th scope="col">Élève</th>
                    <th scope="col">Code</th>
                    <th scope="col" className="num c-mid">
                      Parties
                    </th>
                    <th scope="col" className="num">
                      Record frappe
                    </th>
                    <th scope="col" className="num c-mid">
                      Record calcul
                    </th>
                    <th scope="col" className="num c-mid">
                      Record mémoire
                    </th>
                    <th scope="col" className="num c-sm">
                      Mots/min
                    </th>
                    <th scope="col" className="num c-lo">
                      Précision
                    </th>
                    <th scope="col" className="num c-lo">
                      Temps
                    </th>
                    <th scope="col" className="c-lo">
                      Dernière partie
                    </th>
                    <th scope="col">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td>{r.name}</td>
                      <td className="mono">{nice(r.access_code)}</td>
                      <td className="num c-mid">{r.games}</td>
                      <td className="num">{r.best_typing != null ? fmt(r.best_typing) : '–'}</td>
                      <td className="num c-mid">{r.best_math != null ? fmt(r.best_math) : '–'}</td>
                      <td className="num c-mid">{r.best_memory != null ? fmt(r.best_memory) : '–'}</td>
                      <td className="num c-sm">{r.avg_wpm != null ? Math.round(r.avg_wpm) : '–'}</td>
                      <td className="num c-lo">{r.avg_acc != null ? `${Math.round(r.avg_acc)} %` : '–'}</td>
                      <td className="num c-lo">{r.seconds ? dur(r.seconds) : '–'}</td>
                      <td className="c-lo">{r.last_played ? fmtDate(r.last_played) : '–'}</td>
                      <td className="row-actions">
                        <button
                          type="button"
                          className="link"
                          onClick={async () => {
                            const code = await act(() => T.resetCode(r.id));
                            if (code) {
                              setMsg(`Nouveau code de ${r.name} : ${nice(String(code))} (l’ancien ne fonctionne plus).`);
                              await reload();
                            }
                          }}
                        >
                          Nouveau code
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
                          {confirm === r.id ? 'Confirmer' : 'Supprimer'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-2 text-[14px] leading-snug text-ink/75">
            Les parties « Perso » et les entraînements ne comptent pas dans les records. Toutes les colonnes sont dans l’export CSV.
          </p>
        </section>
      )}

      {part === 'add' && (
        <section className="sec" aria-labelledby="add-h">
          <h2 id="add-h" className="subhead mb-2">
            Ajouter des élèves
          </h2>
          <form onSubmit={add} className="form">
            <label className="text-[14px] leading-snug" htmlFor="add-names">
              Un prénom par ligne (tu peux coller une liste). Chaque élève reçoit un code personnel de 8 caractères. Utilise des prénoms ou
              des pseudos, jamais de noms complets.
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
              <p className="mt-1 text-[14px] text-ink/75">
                Retrouve-les à tout moment dans l’onglet « Résultats ». « Imprimer les codes » sort une fiche à découper.
              </p>
            </div>
          )}
        </section>
      )}

      {part === 'session' && <SessionsPanel cls={cls} act={act} />}

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
          {(rows ?? []).map((r) => (
            <div key={r.id} className="print-card">
              <strong>{r.name}</strong>
              <span className="mono">{nice(r.access_code)}</span>
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
            <p className="text-[14px] leading-snug">
              Tu peux supprimer ton compte enseignant. Rien n’est supprimé avant les étapes de confirmation qui suivent.
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
