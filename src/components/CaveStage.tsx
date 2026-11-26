import { useCallback, useEffect, useState } from 'react';
import CaveScene from './CaveScene';
import { Monster } from './Monster';
import { Tip } from './Tip';
import type { BossMood } from './MonsterFace';
import { FORM_COUNT, LAST_FORM, formName, sceneStageOf, unlockDate } from '../game/boss/forms';
import type { BossPhase } from '../game/boss/state';

/**
 * Le cœur de la grotte, réduit à l'essentiel : le monstre, deux flèches pour revoir ses formes déjà apparues, ses points de vie.
 * Flèches ◀ ▶ (ou touches ← →). Le décor suit la forme montrée. L'enseignant peut prévisualiser les formes à venir.
 */

interface Props {
  /** forme du jour (0 à 9) et avancée vers la suivante (0 à 1) */
  today: number;
  grow: number;
  phase: BossPhase;
  /** enseignant : peut voir aussi les formes pas encore apparues */
  preview?: boolean;
  /** profondeur de la lanterne */
  depth: number;
  /** la grotte de la classe n'a pas encore répondu : pas de chiffre à montrer */
  waiting: boolean;
  hp: number;
}

const dateOf = (form: number) => unlockDate(form).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });

/** Les touches ← → ne doivent pas bouger le carrousel quand on tape dans un champ. */
const typing = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));

export default function CaveStage({ today, grow, phase, preview = false, depth, waiting, hp }: Props) {
  const max = preview ? LAST_FORM : today;
  const [picked, setPicked] = useState<number | null>(null);
  const [dir, setDir] = useState<'next' | 'prev'>('next');
  const cur = Math.max(0, Math.min(max, picked ?? today));
  const isNow = cur === today;

  const go = useCallback(
    (to: number) => {
      const n = Math.max(0, Math.min(max, to));
      setDir(n >= cur ? 'next' : 'prev');
      setPicked(n);
    },
    [cur, max],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey || typing(e.target)) return;
      if (e.key === 'ArrowLeft') go(cur - 1);
      else if (e.key === 'ArrowRight') go(cur + 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, cur]);

  const mood: BossMood = !isNow ? 'idle' : phase === 'early' ? 'sleep' : 'angry';

  return (
    <>
      <section className="cs" aria-roledescription="carrousel" aria-label="Les formes du monstre">
        <CaveScene depth={depth} stage={sceneStageOf(cur)}>
          <div className="cs-swap" key={cur} data-dir={dir}>
            <div className="cave-boss">
              <Monster form={cur} grow={isNow ? grow : 1} mood={mood} />
            </div>
          </div>
        </CaveScene>
        <button type="button" className="cs-arrow cs-prev" disabled={cur <= 0} aria-label="Forme précédente" onClick={() => go(cur - 1)}>
          <span aria-hidden="true">◀</span>
        </button>
        <button type="button" className="cs-arrow cs-next" disabled={cur >= max} aria-label="Forme suivante" onClick={() => go(cur + 1)}>
          <span aria-hidden="true">▶</span>
        </button>
      </section>

      <div className="cave-vitals">
        <p className="cave-name" role="status" aria-live="polite">
          {formName(cur)}
          <span className="sr-only">, forme {cur + 1} sur {FORM_COUNT}</span>
          {!isNow && (
            <button type="button" className="cs-back" onClick={() => go(today)}>
              {cur < today ? `apparue le ${dateOf(cur)}` : 'aperçu'} · revenir
            </button>
          )}
        </p>
        <p className="cave-hp">
          <span aria-hidden="true">♥</span>
          <span className="sr-only">Points de vie : </span>
          <b>{waiting ? '…' : hp.toLocaleString('fr-FR')}</b>
          <Tip label="Comment sont comptés les points de vie">Un point de vie par faute de la classe ; revoir une règle en retire.</Tip>
        </p>
      </div>
    </>
  );
}
