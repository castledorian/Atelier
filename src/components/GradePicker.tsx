import { GRADES, gradeLabel, gradeShift } from '../game/grade';
import type { Grade } from '../game/grade';

/**
 * Le niveau des jeux, dans un volet repliable (l'accueil reste dégagé).
 * Élève connecté : le niveau de sa classe (fixé par l'enseignant) est la valeur par défaut, marqué d'un point ;
 * il peut descendre pour réviser ou monter pour prendre de l'avance, puis revenir à sa classe d'un geste.
 * Les séances de l'enseignant ne sont pas touchées : elles gardent leur propre réglage.
 */
export default function GradePicker({ grade, home, onPick }: { grade: Grade | null; home: Grade | null; onPick: (g: Grade | null) => void }) {
  const shift = grade && home ? gradeShift(grade, home) : 0;
  const note = shift < 0 ? 'révision' : shift > 0 ? 'en avance' : home ? 'ma classe' : '';
  return (
    <details className="fold grade-fold mt-[var(--sp)]" open={grade === null}>
      <summary>
        Niveau{grade ? <strong className="grade-now">{gradeLabel(grade)}</strong> : null}
        {note && <span className="grade-note" data-shift={shift < 0 ? 'down' : shift > 0 ? 'up' : 'home'}>{note}</span>}
      </summary>
      <div className="grade-in">
        <div className="seg" role="radiogroup" aria-label="Niveau des jeux">
          {GRADES.map((g) => (
            <button key={g.id} type="button" role="radio" aria-checked={grade === g.id} className="seg-b grade-b" onClick={() => onPick(g.id === home ? null : g.id)}>
              {g.label}
              {g.id === home && (
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
        {home && shift !== 0 && (
          <button type="button" className="acct-link grade-back" onClick={() => onPick(null)}>
            Revenir à ma classe ({gradeLabel(home)})
          </button>
        )}
      </div>
    </details>
  );
}
