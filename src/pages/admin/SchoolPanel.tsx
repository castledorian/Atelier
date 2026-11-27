import type { AdminSchool } from '../../server/admin';
import type { Watch } from './types';
import { dur, when } from './format';
import { RunsTable } from './RunsTable';

/** Détail d'une école : enseignants, classes, élèves (avec accès à l'observation en lecture seule) et dernières parties. */
export function SchoolPanel({ sch, busy, onObserve }: { sch: AdminSchool; busy: boolean; onObserve: (w: Watch) => void }) {
  return (
    <>
      <h2 className="subhead mt-3">{sch.school.name}</h2>
      <p className="adm-note">Créée le {when(sch.school.created)}</p>
      <p className="observe-row">
        <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => onObserve({ kind: 'teacher', schoolId: sch.school.id, schoolName: sch.school.name })}>
          Voir l’espace enseignant (lecture seule)
        </button>
      </p>
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
          <h3 className="font-bold observe-row">
            <span>
              {c.name} {c.grade ? <small>({c.grade.toUpperCase()})</small> : null}{' '}
              <small>
                · {c.students.length} élève{c.students.length > 1 ? 's' : ''}
              </small>
            </span>
            <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => onObserve({ kind: 'class', classId: c.id, label: `grotte de la classe ${c.name} (${sch.school.name})` })}>
              Voir la grotte de la classe
            </button>
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
                  <th>Observer</th>
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
                    <td>
                      <button
                        type="button"
                        className="link"
                        disabled={busy}
                        onClick={() => onObserve({ kind: 'student', studentId: s.id, name: s.name, label: `écran de l’élève ${s.name} — ${c.name}, ${sch.school.name}` })}
                      >
                        Voir son écran
                      </button>
                    </td>
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
  );
}
