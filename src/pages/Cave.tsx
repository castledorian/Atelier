import { useEffect, useMemo, useState } from 'react';
import { BackButton } from '../components/BackButton';
import BossFight from '../components/BossFight';
import { InkEnemy } from '../components/InkEnemy';
import { Frame } from './Frame';
import {
  BOSS_NAMES,
  INK_STEPS,
  POWER_STEPS,
  addName,
  bossKind,
  bossName,
  fillOf,
  inkLevel,
  loadBoss,
  loadNames,
  markSeen,
  monthsToFinal,
  parseNames,
  phaseOf,
  powerLevel,
  resetBoss,
  saveNames,
  winBoss,
} from '../game/boss/state';
import type { BossPhase } from '../game/boss/state';
import { loadSettings } from '../game/storage';

/**
 * « La grotte » : la créature d'encre de l'année, et le grand combat de fin d'année.
 *
 * Ce qu'elle montre vient uniquement de cet appareil : les fautes et les réussites comptées pendant les parties,
 * et les prénoms saisis par la classe. Rien n'est envoyé, rien n'est relié à un élève en particulier.
 */

const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const longDate = (t: number) => {
  const d = new Date(t);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
};

export default function Cave({ onBack, studentName, isTeacher = false }: { onBack: () => void; studentName?: string | null; isTeacher?: boolean }) {
  const [boss, setBoss] = useState(() => markSeen());
  const [names, setNames] = useState<string[]>(() => (studentName ? addName(studentName) : loadNames()));
  const [fight, setFight] = useState<null | { real: boolean }>(null);
  const [edit, setEdit] = useState(false);
  const sound = useMemo(() => loadSettings().sound, []);

  const phase: BossPhase = phaseOf(boss);
  const ink = inkLevel(boss);
  const power = powerLevel(boss);
  const left = monthsToFinal();

  // Le titre de la page suit la créature : utile quand plusieurs onglets sont ouverts en classe
  useEffect(() => {
    document.title = phase === 'won' ? 'La grotte — l’encre est vaincue' : 'La grotte';
    return () => {
      document.title = 'Atelier';
    };
  }, [phase]);

  if (fight) {
    return (
      <Frame>
        <div className="card-top">
          <BackButton label="Quitter la grotte" onClick={() => setFight(null)} />
        </div>
        <BossFight
          names={names}
          ink={ink}
          power={power}
          sound={sound}
          onDone={() => {
            if (fight.real) setBoss(winBoss());
            setFight(null);
          }}
        />
      </Frame>
    );
  }

  return (
    <Frame>
      <div className="card-top">
        <BackButton onClick={onBack} />
      </div>
      <p className="eyebrow">Fin d’année</p>
      <h1 className="title-sm">La grotte</h1>
      <div className="rule" aria-hidden="true" />

      {phase === 'won' ? (
        <Victory boss={boss} names={names} onReplay={() => setFight({ real: false })} />
      ) : (
        <>
          <div className={`cave cave-${phase}`}>
            <div className="cave-dark" aria-hidden="true">
              <span className="cave-drop" />
              <span className="cave-drop cave-drop-2" />
            </div>
            <div className="cave-boss" style={{ ['--bsize' as string]: String(ink / 6) }}>
              <InkEnemy kind={bossKind(ink)} mood={phase === 'early' ? 'idle' : 'angry'} name={bossName(boss)} />
            </div>
            <p className="cave-speech">
              {phase === 'early'
                ? '« Ne t’approche pas… Je ne suis qu’une goutte. Reviens me voir en fin d’année. »'
                : phase === 'final'
                  ? `« Vous voilà. Toute une année de fautes m’a nourri : je suis ${bossName(boss)}. »`
                  : `« Je grossis à chaque faute oubliée. On m’appelle déjà ${bossName(boss)}. »`}
            </p>
          </div>

          {phase === 'early' ? (
            <p className="mt-3 text-[16px] leading-snug">
              Quelque chose dort au fond de la grotte. Chaque faute laissée derrière vous le nourrit&nbsp;; chaque règle revue lui en reprend un
              peu. Rendez-vous en <strong>juin</strong> pour le grand combat — dans {left} mois.
            </p>
          ) : (
            <>
              <Gauges boss={boss} ink={ink} power={power} />
              <p className="mt-2 text-[15px] leading-snug">
                Les fautes de vos parties nourrissent la créature. Vos réponses justes, et surtout les règles que vous retravaillez dans
                «&nbsp;Mes progrès&nbsp;», rendent vos attaques plus fortes.
              </p>
            </>
          )}

          <section className="sec" aria-labelledby="cave-who">
            <h2 id="cave-who" className="subhead">
              Qui descendra dans la grotte&nbsp;?
            </h2>
            {names.length === 0 ? (
              <p className="mt-1 text-[15px] leading-snug">Aucun prénom pour l’instant : la classe combattra d’un seul bloc.</p>
            ) : (
              <ul className="cave-names" aria-label={`${names.length} combattants`}>
                {names.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            )}
            {edit ? (
              <NameForm
                names={names}
                onSave={(list) => {
                  setNames(saveNames(list));
                  setEdit(false);
                }}
                onCancel={() => setEdit(false)}
              />
            ) : (
              <button type="button" className="btn btn-ghost mt-2" onClick={() => setEdit(true)}>
                {names.length ? 'Modifier la liste' : 'Écrire les prénoms'}
              </button>
            )}
            <p className="sec-note">Les prénoms restent sur cet appareil : ils ne sont jamais envoyés et servent uniquement au combat final.</p>
          </section>

          <div className="mt-[var(--sp)] flex flex-wrap items-center gap-3">
            {phase === 'final' ? (
              <button type="button" className="btn btn-primary" onClick={() => setFight({ real: true })}>
                Descendre dans la grotte
              </button>
            ) : (
              <p className="text-[15px] leading-snug">
                <strong>Le grand combat s’ouvre en juin.</strong> D’ici là, la créature grossit… et vous aussi.
              </p>
            )}
          </div>

          {/* Réservé au compte enseignant : les élèves ne doivent pas voir qu'un combat d'essai existe, ni qu'il est écrit d'avance */}
          {isTeacher && (
            <details className="fold sec">
              <summary>Pour l’enseignant</summary>
              <div className="fold-in">
                <p className="text-[15px] leading-snug">
                  La créature grossit avec les fautes de toutes les parties jouées sur cet appareil, et faiblit quand les élèves retravaillent une
                  règle. Le combat final est écrit d’avance&nbsp;: <strong>la classe gagne toujours</strong>, après un moment où tout semble perdu.
                  Rien n’est envoyé au serveur, rien n’est relié à un élève.
                </p>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="btn btn-ghost" onClick={() => setFight({ real: false })}>
                    Essayer le combat (sans le compter)
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => {
                      if (window.confirm('Remettre la grotte à zéro ? La créature redevient une goutte et le combat sera à refaire.')) setBoss(resetBoss());
                    }}
                  >
                    Remettre la grotte à zéro
                  </button>
                </div>
              </div>
            </details>
          )}
        </>
      )}
    </Frame>
  );
}

/** Les deux jauges : ce qu'a avalé la créature, et la force de la classe. */
function Gauges({ boss, ink, power }: { boss: ReturnType<typeof loadBoss>; ink: number; power: number }) {
  return (
    <dl className="cave-gauges">
      <div>
        <dt>Encre avalée</dt>
        <dd>
          <span className="cave-step">
            {bossName(boss)} · taille {ink + 1}/{BOSS_NAMES.length}
          </span>
          <span className="cave-track" aria-hidden="true">
            <i data-kind="ink" style={{ width: `${Math.round(fillOf(boss.ink, INK_STEPS) * 100)}%` }} />
          </span>
          <span className="cave-num">{boss.ink.toLocaleString('fr-FR')} fautes</span>
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
          <span className="cave-num">{boss.power.toLocaleString('fr-FR')} réussites · {boss.games} parties</span>
        </dd>
      </div>
    </dl>
  );
}

function NameForm({ names, onSave, onCancel }: { names: string[]; onSave: (list: string[]) => void; onCancel: () => void }) {
  const [text, setText] = useState(names.join('\n'));
  return (
    <form
      className="form mt-2"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(parseNames(text));
      }}
    >
      <label className="subhead" htmlFor="cave-names">
        Un prénom par ligne
      </label>
      <textarea
        id="cave-names"
        className="field cave-area"
        rows={6}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={'Léa\nTom\nSam'}
        autoFocus
      />
      <div className="flex flex-wrap gap-2">
        <button type="submit" className="btn btn-primary">
          Enregistrer
        </button>
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          Annuler
        </button>
      </div>
    </form>
  );
}

/** Après la victoire : la trace de l'exploit, imprimable comme un diplôme. */
function Victory({ boss, names, onReplay }: { boss: ReturnType<typeof loadBoss>; names: string[]; onReplay: () => void }) {
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
        <strong>{bossName(boss)}</strong>, nourri de {boss.ink.toLocaleString('fr-FR')} fautes. La page est blanche&nbsp;: elle est à vous.
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
