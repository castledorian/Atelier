import type { AdminRun } from '../../server/admin';
import { dur, fmtN as fmt, game, when } from './format';

/** Tableau des dernières parties (une ligne par partie). */
export function RunsTable({ runs, showSchool }: { runs: AdminRun[]; showSchool: boolean }) {
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
