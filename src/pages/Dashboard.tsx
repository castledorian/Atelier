import { BackButton } from '../components/BackButton';
import { Fragment, useCallback, useEffect, useState } from 'react';
import { Frame, Notice } from './Frame';
import { ApiError, explain } from '../server/api';
import * as T from '../server/teacher';
import { ObserveBar, ReadOnlyZone } from '../components/ObserveBar';
import { ServerNotice } from '../components/ServerNotice';
import type { ClassRow, School } from '../server/types';
import { ClassBar, InviteForm, NameForm, SchoolBar } from './teacher/Forms';
import { ClassPanel } from './teacher/ClassPanel';
import { AccountPanel } from './teacher/AccountPanel';

interface Props {
  email: string;
  onHome: () => void;
  onSignOut: () => void;
  onAccountDeleted: () => void;
  /** administrateur du site : on regarde l'espace d'une école, sans rien pouvoir modifier */
  observe?: { schoolId: string; schoolName: string; onQuit: () => void; /** ouvrir l'écran d'un élève (lecture seule) */ onStudent?: (id: string, name: string, label: string) => void };
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
                  onStudentScreen={observe?.onStudent ? (id, name) => observe.onStudent?.(id, name, `${name} · ${cls.name} · ${school.name}`) : undefined}
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
