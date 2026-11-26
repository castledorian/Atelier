import { formName } from '../game/boss/forms';
import type { BossState } from '../game/boss/state';

const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const longDate = (t: number) => {
  const d = new Date(t);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
};

/** Après la victoire : la trace de l'exploit, imprimable comme un diplôme. */
export default function CaveVictory({ boss, form, names, onReplay }: { boss: BossState; form: number; names: string[]; onReplay: () => void }) {
  return (
    <section className="cave-win" aria-labelledby="win-h">
      <p className="cave-win-stamp" aria-hidden="true">
        ✓
      </p>
      <h2 id="win-h" className="title-sm">
        L’encre est vaincue&nbsp;!
      </h2>
      <p className="mt-2 text-[16px] leading-snug">
        Le {longDate(boss.wonAt ?? Date.now())}, la classe est descendue dans la grotte et a dissous{' '}
        <strong>{formName(form)}</strong>, nourri de {boss.ink.toLocaleString('fr-FR')} fautes. La page est blanche&nbsp;: elle est à vous.
      </p>
      {names.length > 0 && (
        <>
          <h3 className="subhead mt-[var(--sp)]">Les combattants</h3>
          <ul className="cave-names cave-names-win">
            {names.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </>
      )}
      <div className="mt-[var(--sp)] flex flex-wrap gap-2 no-print">
        <button type="button" className="btn btn-primary" onClick={() => window.print()}>
          Imprimer le diplôme
        </button>
        <button type="button" className="btn btn-ghost" onClick={onReplay}>
          Revoir le combat
        </button>
      </div>
    </section>
  );
}
