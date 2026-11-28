import { GRADES, gradeLabel, gradeSide } from '../game/grade';
import type { Grade } from '../game/grade';

/**
 * Le niveau des jeux, dans un volet repliable (l'accueil reste dégagé).
 * Élève connecté : le ou les niveaux de sa classe (fixés par l'enseignant) sont marqués d'un point ; une classe mixte (ex. CM1 et CM2)
 * en a plusieurs et l'élève choisit le sien. Il peut aussi descendre pour réviser ou monter pour prendre de l'avance,
 * puis revenir à sa classe d'un geste. Les séances de l'enseignant ne sont pas touchées : elles gardent leur propre réglage.
 * `ask` : classe mixte dont l'élève n'a pas encore choisi son niveau, le volet s'ouvre.
 */
export default function GradePicker({ grade, homes, ask = false, onPick }: { grade: Grade | null; homes: Grade[]; ask?: boolean; onPick: (g: Grade | null) => void }) {
  const side = grade ? gradeSide(grade, homes) : 0;
  const note = side < 0 ? 'révision' : side > 0 ? 'en avance' : homes.length > 0 && grade ? 'ma classe' : '';
  const single = homes.length === 1 ? homes[0] : null;
  return (
    <details className="fold grade-fold mt-[var(--sp)]" open={grade === null || ask}>
      <summary>
        Niveau{grade ? <strong className="grade-now">{gradeLabel(grade)}</strong> : null}
        {note && (
          <span className="grade-note" data-shift={side < 0 ? 'down' : side > 0 ? 'up' : 'home'}>
            {note}
          </span>
        )}
      </summary>
      <div className="grade-in">
        <div className="seg" role="radiogroup" aria-label="Niveau des jeux">
          {GRADES.map((g) => (
            <button key={g.id} type="button" role="radio" aria-checked={grade === g.id} className="seg-b grade-b" onClick={() => onPick(g.id === single ? null : g.id)}>
              {g.label}
              {homes.includes(g.id) && (
                <>
                  <span className="grade-dot" aria-hidden="true">
                    •
                  </span>
                  <span className="sr-only"> (ma classe)</span>
                </>
              )}
            </button>
          ))}
        </div>
        {homes.length > 0 && side !== 0 && (
          <button type="button" className="acct-link grade-back" onClick={() => onPick(null)}>
            Revenir à ma classe ({homes.map(gradeLabel).join(' ou ')})
          </button>
        )}
      </div>
    </details>
  );
}
