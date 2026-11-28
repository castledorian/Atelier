import { useState } from 'react';
import { GRADES, classGrades } from '../../game/grade';
import type { Grade } from '../../game/grade';
import * as T from '../../server/teacher';
import { Tip } from '../../components/Tip';
import type { ClassRow } from '../../server/types';
import type { Act } from './shared';

/**
 * Niveaux de la classe. Plusieurs possibles (classe mixte, ex. CM1 et CM2) : chaque élève choisit alors le sien parmi ceux cochés.
 * Base pas encore mise à jour (colonne « grades » absente) : un seul niveau, comme avant.
 */
export function GradeSetting({ cls, act }: { cls: ClassRow; act: Act }) {
  const multi = cls.grades !== undefined;
  const [grades, setGrades] = useState<Grade[]>(() => classGrades(cls.grade, cls.grades));

  const toggle = async (g: Grade) => {
    const next = multi ? GRADES.map((x) => x.id).filter((id) => (id === g ? !grades.includes(id) : grades.includes(id))) : [g];
    const ok = await act(async () => {
      await T.setClassGrades(cls.id, next);
      return true;
    });
    if (ok) setGrades(next);
  };

  return (
    <div>
      <span className="subhead" id={`grade-${cls.id}`}>
        {multi ? 'Niveaux de la classe' : 'Niveau de la classe'}
      </span>
      <Tip label="À propos des niveaux">
        {multi ? 'Classe mixte : coche tous les niveaux. Chaque élève choisit le sien parmi ceux-là ; les séances gardent leur propre réglage.' : 'Tes élèves ne voient que les jeux de leur niveau, sans rien avoir à choisir.'}
      </Tip>
      <div className="seg mt-1" role={multi ? 'group' : 'radiogroup'} aria-labelledby={`grade-${cls.id}`}>
        {GRADES.map((g) => (
          <button key={g.id} type="button" {...(multi ? { 'aria-pressed': grades.includes(g.id) } : { role: 'radio', 'aria-checked': grades.includes(g.id) })} className="seg-b" onClick={() => toggle(g.id)}>
            {g.label}
          </button>
        ))}
      </div>
      {grades.length === 0 && <p className="mt-1 text-[14px]">Non fixé : chaque élève choisit.</p>}
    </div>
  );
}
