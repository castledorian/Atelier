import { Tip } from '../../components/Tip';
import type { AdminLogs, AdminRun } from '../../server/admin';
import { game, when } from './format';
import { RunsTable } from './RunsTable';

/** Journal : dernières parties, inscriptions, parties refusées (anti-triche) et consultations de l'espace. */
export function LogsPanel({ logs, onExport }: { logs: AdminLogs; onExport: (runs: AdminRun[]) => void }) {
  return (
    <>
      <h2 className="subhead mt-3">Dernières parties (toutes écoles)</h2>
      <p className="adm-note">
        <button type="button" className="link" onClick={() => onExport(logs.runs)}>
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

      <h2 className="subhead mt-4">
        Parties refusées (anti-triche)
        <Tip label="Parties refusées">Parties impossibles à réaliser normalement, non enregistrées. Effacées après 90 jours.</Tip>
      </h2>
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
  );
}
