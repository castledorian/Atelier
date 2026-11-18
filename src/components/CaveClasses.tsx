import { useEffect, useRef, useState } from 'react';
import * as T from '../server/teacher';
import type { ClassRow, School } from '../server/types';

/**
 * Espace enseignant de la grotte : la liste complète des classes de ses écoles. On coche celles qui descendent
 * dans la grotte ; leurs élèves deviennent les combattants (plus besoin d'ajouter ou de retirer les prénoms un à un).
 * Les prénoms sont gardés sur cet appareil uniquement, comme avant.
 */
export default function CaveClasses({ onNames, count, onPick }: { onNames: (names: string[]) => void; count: number; onPick?: (ids: string[]) => void }) {
  const [groups, setGroups] = useState<Array<{ school: School; classes: ClassRow[] }> | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const names = useRef<Record<string, string[]>>({});

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const schools = await T.listSchools();
        const all = await Promise.all(schools.map(async (school) => ({ school, classes: await T.listClasses(school.id) })));
        if (alive) setGroups(all);
      } catch {
        if (alive) setError('Impossible de charger tes classes pour l’instant.');
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const toggle = async (id: string) => {
    const next = picked.includes(id) ? picked.filter((c) => c !== id) : [...picked, id];
    setPicked(next);
    onPick?.(next);
    setBusy(true);
    setError('');
    try {
      for (const c of next) {
        if (!names.current[c]) names.current[c] = (await T.classOverview(c)).map((r) => r.name);
      }
      const order = (groups ?? []).flatMap((g) => g.classes.map((c) => c.id)).filter((c) => next.includes(c));
      onNames(order.flatMap((c) => names.current[c] ?? []));
    } catch {
      setError('Impossible de charger les élèves de cette classe.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <fieldset className="cave-classes" aria-busy={busy}>
      <legend className="subhead">Classes qui descendent dans la grotte</legend>
      {groups === null && !error && <p className="text-[15px]">Chargement…</p>}
      {groups?.every((g) => g.classes.length === 0) && <p className="text-[15px]">Aucune classe pour l’instant.</p>}
      {groups?.map(({ school, classes }) =>
        classes.length === 0 ? null : (
          <div key={school.id} className="cave-school">
            {groups.length > 1 && <p className="cave-school-name">{school.name}</p>}
            <ul>
              {classes.map((c) => (
                <li key={c.id}>
                  <label className="check">
                    <input type="checkbox" checked={picked.includes(c.id)} onChange={() => void toggle(c.id)} />
                    <span>{c.name}</span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        ),
      )}
      {error && (
        <p className="notice notice-error" role="alert">
          {error}
        </p>
      )}
      <p className="sec-note" role="status">
        {count > 0 ? `${count} combattant${count > 1 ? 's' : ''} enregistré${count > 1 ? 's' : ''} sur cet appareil.` : 'Aucun combattant : la classe combattra d’un seul bloc.'} Les prénoms restent sur cet
        appareil et ne servent qu’au combat final.
      </p>
    </fieldset>
  );
}
