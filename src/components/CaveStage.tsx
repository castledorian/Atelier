import { useCallback, useEffect, useState } from 'react';
import CaveScene from './CaveScene';
import { Monster } from './Monster';
import { Tip } from './Tip';
import type { BossMood } from './MonsterFace';
import { FORM_COUNT, FORM_NAMES, LAST_FORM, daysToNextForm, formName, sceneStageOf, unlockDate } from '../game/boss/forms';
import type { BossPhase } from '../game/boss/state';

/**
 * Le cœur de la grotte : le monstre dans sa salle, et un carrousel pour revoir toutes ses formes déjà apparues.
 * Flèches ◀ ▶ (ou touches ← →), pastilles numérotées ; les formes à venir restent des « ? » (seul l'enseignant peut les prévisualiser).
 * Le décor suit la forme montrée : on revoit la grotte s'encrer au fil de l'année. Les points de vie ne s'affichent que pour la forme du jour.
 */

interface Props {
  /** forme du jour (0 à 9) et avancée vers la suivante (0 à 1) */
  today: number;
  grow: number;
  phase: BossPhase;
  /** enseignant : peut voir aussi les formes pas encore apparues */
  preview?: boolean;
  /** profondeur de la lanterne et lanternes allumées (force de la classe) */
  depth: number;
  lanterns: number;
  /** la grotte de la classe n'a pas encore répondu : pas de chiffre à montrer */
  waiting: boolean;
  speech: string;
  hp: number;
}

const dateOf = (form: number) => unlockDate(form).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });

/** Les touches ← → ne doivent pas bouger le carrousel quand on tape dans un champ. */
const typing = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));

export default function CaveStage({ today, grow, phase, preview = false, depth, lanterns, waiting, speech, hp }: Props) {
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
  const left = daysToNextForm();

  return (
    <>
      <section className="cs" aria-roledescription="carrousel" aria-label="Les formes du monstre">
        <CaveScene depth={depth} stage={sceneStageOf(cur)} lanterns={lanterns}>
          <div className="cs-swap" key={cur} data-dir={dir}>
            <div className="cave-boss" style={{ ['--bsize' as string]: String(0.2 + (0.8 * cur) / LAST_FORM) }}>
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
      <p className="sr-only" role="status" aria-live="polite">
        Forme {cur + 1} sur {FORM_COUNT} : {formName(cur)}
      </p>

      <div className="cave-vitals">
        {isNow ? (
          <>
            <p className="cave-say">
              <span className="sr-only">{formName(cur)} dit : </span>« {speech} »
            </p>
            <p className="cave-name">
              {formName(cur)} <span aria-hidden="true">· forme {cur + 1}/{FORM_COUNT}</span>
            </p>
            <p className="cave-hp" role="status">
              <span aria-hidden="true">♥</span>
              <span className="sr-only">Points de vie de {formName(cur)} : </span>
              <b>{waiting ? '…' : hp.toLocaleString('fr-FR')}</b>
              <span className="cave-hp-unit" aria-hidden="true">
                points de vie
              </span>
              <Tip label="Comment sont comptés les points de vie">Chaque faute des élèves ajoute un point de vie ; revoir une règle en retire.</Tip>
            </p>
          </>
        ) : (
          <>
            <p className="cave-name">
              {formName(cur)} <span aria-hidden="true">· forme {cur + 1}/{FORM_COUNT}</span>
            </p>
            <p className="cs-note">
              {cur < today ? `Apparue le ${dateOf(cur)}` : 'Aperçu : cette forme n’est pas encore apparue'}
              <button type="button" onClick={() => go(today)}>
                Revenir à aujourd’hui
              </button>
            </p>
          </>
        )}
      </div>

      <ol className="cs-dots" aria-label="Choisir une forme">
        {FORM_NAMES.map((n, i) => (
          <li key={n}>
            <button
              type="button"
              className="cs-dot"
              disabled={i > max}
              aria-current={i === cur ? 'true' : undefined}
              aria-label={i > max ? `Forme ${i + 1} : pas encore apparue` : `Forme ${i + 1} : ${n}`}
              onClick={() => go(i)}
            >
              {i > max ? '?' : i + 1}
            </button>
          </li>
        ))}
      </ol>
      {isNow && left !== null && !waiting && <p className="cs-note">Prochaine forme {left <= 1 ? 'demain' : `dans ${left} jours`}</p>}
    </>
  );
}
