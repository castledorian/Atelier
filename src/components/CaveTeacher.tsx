import { ConfirmButton } from './ConfirmButton';
import CaveClasses from './CaveClasses';
import { FORM_COUNT, formName } from '../game/boss/forms';
import { POWER_STEPS, fillOf } from '../game/boss/state';
import type { BossPhase, BossState } from '../game/boss/state';

/** Le volet « Pour l'enseignant » de la grotte : jauges, classes, essai du combat, remise à zéro. */

/** Les deux jauges : où en est l'évolution du monstre (calendrier), et la force de la classe (réussites). */
function Gauges({ boss, form, grow, power }: { boss: BossState; form: number; grow: number; power: number }) {
  return (
    <dl className="cave-gauges">
      <div>
        <dt>Évolution du monstre</dt>
        <dd>
          <span className="cave-step">
            Forme {form + 1}/{FORM_COUNT} · {formName(form)}
          </span>
          <span className="cave-track" aria-hidden="true">
            <i data-kind="ink" style={{ width: `${Math.round(grow * 100)}%` }} />
          </span>
          <span className="cave-num">{boss.ink.toLocaleString('fr-FR')} fautes avalées</span>
        </dd>
      </div>
      <div>
        <dt>Force de la classe</dt>
        <dd>
          <span className="cave-step">
            Niveau {power + 1}/{POWER_STEPS.length}
          </span>
          <span className="cave-track" aria-hidden="true">
            <i data-kind="power" style={{ width: `${Math.round(fillOf(boss.power, POWER_STEPS) * 100)}%` }} />
          </span>
          <span className="cave-num">
            {boss.power.toLocaleString('fr-FR')} réussites · {boss.games} parties
          </span>
        </dd>
      </div>
    </dl>
  );
}

interface Props {
  boss: BossState;
  form: number;
  grow: number;
  power: number;
  phase: BossPhase;
  /** la créature est celle de la classe (serveur) ; sinon, celle de cet appareil */
  shared: boolean;
  monthsLeft: number;
  namesCount: number;
  /** aperçu de toutes les formes dans le carrousel */
  preview: boolean;
  onPreview: (on: boolean) => void;
  onNames: (list: string[]) => void;
  onPick: (ids: string[]) => void;
  onTry: () => void;
  onReset: () => void;
}

export default function CaveTeacher({ boss, form, grow, power, phase, shared, monthsLeft, namesCount, preview, onPreview, onNames, onPick, onTry, onReset }: Props) {
  return (
    <details className="fold sec">
      <summary>Pour l’enseignant</summary>
      <div className="fold-in">
        <p className="text-[15px] leading-snug">
          Le monstre change de forme avec le calendrier : une nouvelle forme environ chaque mois, la dernière le 1er juin. Ses points de vie montent d’un point par faute des parties libres{' '}
          {shared ? '(tous les appareils de la classe)' : '(cet appareil)'} et baissent quand on retravaille une règle.{' '}
          {phase === 'final' ? '' : `Grand combat en juin (dans ${monthsLeft} mois). `}La classe gagne toujours, après un moment où tout semble perdu. Les compteurs ne sont reliés à aucun élève.
        </p>
        <Gauges boss={boss} form={form} grow={grow} power={power} />
        <label className="check">
          <input type="checkbox" checked={preview} onChange={(e) => onPreview(e.target.checked)} />
          Aperçu de toutes les formes (même celles à venir)
        </label>
        <CaveClasses count={namesCount} onNames={onNames} onPick={onPick} />
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn-ghost" onClick={onTry}>
            Essayer le combat (sans le compter)
          </button>
          <ConfirmButton confirm="Sûr ? Le combat sera à refaire." onConfirm={onReset}>
            Remettre la grotte à zéro
          </ConfirmButton>
        </div>
      </div>
    </details>
  );
}
