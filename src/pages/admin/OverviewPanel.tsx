import type { AdminOverview } from '../../server/admin';
import { fmtN as fmt, game, when } from './format';

/** Vue d'ensemble : chiffres clés, parties par jour, liste des écoles (recherche comprise). */
export function OverviewPanel({ ov, query, onQuery, onOpenSchool }: { ov: AdminOverview; query: string; onQuery: (q: string) => void; onOpenSchool: (id: string) => void }) {
  const max = Math.max(1, ...ov.daily.map((d) => d.runs));
  const t = query.trim().toLowerCase();
  const schools = ov.schools.filter((s) => !t || s.name.toLowerCase().includes(t) || s.teachers.some((e) => e.toLowerCase().includes(t)));
  return (
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
      <p className="adm-games">{ov.games.length === 0 ? 'Aucune partie enregistrée.' : ov.games.map((g) => `${game(g.game)} : ${fmt(g.runs)}`).join(' · ')}</p>

      <h2 className="subhead mt-4">Écoles</h2>
      <label className="sr-only" htmlFor="adm-q">
        Chercher une école ou un enseignant
      </label>
      <input id="adm-q" className="adm-search" type="search" placeholder="Chercher une école ou un e-mail…" value={query} onChange={(e) => onQuery(e.target.value)} />
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
                  <button type="button" className="link" onClick={() => onOpenSchool(s.id)}>
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
  );
}
