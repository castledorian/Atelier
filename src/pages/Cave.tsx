import { useCallback, useEffect, useMemo, useState } from 'react';
import { BackButton } from '../components/BackButton';
import BossFight from '../components/BossFight';
import CaveClasses from '../components/CaveClasses';
import CaveScene from '../components/CaveScene';
import { InkEnemy } from '../components/InkEnemy';
import { ObserveBar } from '../components/ObserveBar';
import { Frame } from './Frame';
import {
  BOSS_NAMES,
  INK_STEPS,
  POWER_STEPS,
  addName,
  bossHp,
  bossKind,
  bossName,
  fillOf,
  inkLevel,
  loadBoss,
  loadNames,
  markSeen,
  monthsToFinal,
  phaseOf,
  powerLevel,
  resetBoss,
  saveNames,
  schoolYear,
  winBoss,
} from '../game/boss/state';
import type { BossPhase } from '../game/boss/state';
import { CaveSound } from '../game/caveSound';
import { loadSettings } from '../game/storage';
import { fetchCave, sendCaveReset, sendCaveWin } from '../server/cave';
import type { CaveServer, CaveSource } from '../server/cave';
import type { BossState } from '../game/boss/state';

/**
 * « La grotte » : la créature d'encre de l'année, et le grand combat de fin d'année.
 *
 * La créature est celle de la CLASSE : le serveur additionne les fautes et les réussites des parties libres (compteurs anonymes,
 * jamais reliés à un élève en particulier) et la page se met à jour toute seule. Sans serveur (ou si la mise à jour SQL « grotte » manque),
 * elle retombe sur les compteurs gardés sur l'appareil. Les prénoms du combat final restent sur l'appareil.
 * En mode observation (administrateur), la page est en lecture seule : ni combat, ni réglage, ni son.
 */

const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const longDate = (t: number) => {
  const d = new Date(t);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
};

interface Props {
  onBack: () => void;
  studentName?: string | null;
  isTeacher?: boolean;
  /** jeton de l'élève connecté (pour lire la grotte de sa classe) */
  token?: string | null;
  /** administrateur : on regarde la grotte de quelqu'un d'autre, en lecture seule */
  observe?: { source: CaveSource; label: string; onQuit: () => void };
}

/** Rafraîchissement de la grotte : plus vite quand on observe en direct. */
const POLL_MS = 10000;
const POLL_OBSERVE_MS = 4000;

export default function Cave({ onBack, studentName, isTeacher = false, token = null, observe }: Props) {
  const readOnly = observe !== undefined;
  const [localBoss, setBoss] = useState(() => (readOnly ? loadBoss() : markSeen()));
  const [names, setNames] = useState<string[]>(() => (readOnly ? [] : studentName ? addName(studentName) : loadNames()));
  /** classes cochées par l'enseignant (vide = toutes les siennes) */
  const [picked, setPicked] = useState<string[]>([]);
  /** undefined = pas encore su ; null = le serveur n'a pas de grotte (ancienne base) : on retombe sur l'appareil */
  const [remote, setRemote] = useState<CaveServer | null | undefined>(undefined);

  const source: CaveSource | null = observe ? observe.source : isTeacher ? { kind: 'teacher', classes: picked } : token ? { kind: 'student', token } : null;
  const sourceKey = JSON.stringify(source);

  const refresh = useCallback(async () => {
    if (!source) return;
    try {
      const r = await fetchCave(source);
      setRemote((prev) => r ?? prev ?? null);
    } catch {
      /* session perdue : la page garde ce qu'elle montre */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceKey]);

  useEffect(() => {
    if (!source) return;
    void refresh();
    const id = window.setInterval(() => {
      if (!document.hidden) void refresh();
    }, readOnly ? POLL_OBSERVE_MS : POLL_MS);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refresh, readOnly]);

  const boss: BossState = remote
    ? { year: schoolYear(), ink: remote.ink, power: remote.power, games: remote.games, wonAt: remote.won_at, seen: true }
    : readOnly
      ? { year: schoolYear(), ink: 0, power: 0, games: 0, wonAt: null, seen: true }
      : localBoss;
  const [fight, setFight] = useState<null | { real: boolean }>(null);
  const sound = useMemo(() => loadSettings().sound, []);
  const fighting = fight !== null;

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

  // Ambiance sonore : grondement lointain et gouttes d'eau qui résonnent, sauf pendant le combat (qui a ses propres sons)
  useEffect(() => {
    if (!sound || fighting || readOnly) return;
    const cave = new CaveSound();
    cave.start();
    return () => cave.stop();
  }, [sound, fighting, readOnly]);

  if (fight) {
    return (
      <Frame dark>
        <div className="card-top">
          <BackButton label="Quitter la grotte" onClick={() => setFight(null)} />
        </div>
        <BossFight
          names={names}
          ink={ink}
          power={power}
          sound={sound}
          onDone={() => {
            if (fight.real) {
              setBoss(winBoss());
              if (source && !readOnly && (source.kind === 'student' || source.kind === 'teacher')) void sendCaveWin(source).then(refresh);
            }
            setFight(null);
          }}
        />
      </Frame>
    );
  }

  const hp = bossHp(boss);
  const depth = phase === 'early' ? 0.3 : phase === 'growing' ? 0.65 : 1;

  return (
    <Frame dark>
      {observe && <ObserveBar label={observe.label} onQuit={observe.onQuit} />}
      <div className="card-top">
        <BackButton label={readOnly ? 'Retour à l’administration' : undefined} onClick={onBack} />
      </div>
      <h1 className="sr-only">La grotte</h1>
      {readOnly && remote === null && (
        <p className="notice notice-error" role="alert">
          La grotte n’est pas disponible sur le serveur : la mise à jour « grotte » n’a pas encore été exécutée, ou le réseau est coupé.
        </p>
      )}

      {phase === 'won' ? (
        <Victory boss={boss} names={names} onReplay={() => setFight({ real: false })} />
      ) : (
        <>
          <CaveScene depth={depth}>
            <div className="cave-boss" style={{ ['--bsize' as string]: String(ink / 6) }}>
              <InkEnemy kind={bossKind(ink)} mood={phase === 'early' ? 'idle' : 'angry'} name={bossName(boss)} />
            </div>
          </CaveScene>

          <div className="cave-vitals">
            <p className="cave-name">{bossName(boss)}</p>
            <p className="cave-hp" role="status">
              <span aria-hidden="true">♥</span>
              <span className="sr-only">Points de vie de {bossName(boss)} : </span>
              <b>{hp.toLocaleString('fr-FR')}</b>
              <span className="cave-hp-unit" aria-hidden="true">
                points de vie
              </span>
            </p>
          </div>

          {phase === 'final' && !readOnly && (
            <div className="mt-[var(--sp)] flex justify-center">
              <button type="button" className="btn btn-primary" onClick={() => setFight({ real: true })}>
                Descendre dans la grotte
              </button>
            </div>
          )}

          {/* Réservé au compte enseignant : les élèves ne doivent pas voir qu'un combat d'essai existe, ni qu'il est écrit d'avance */}
          {isTeacher && !readOnly && (
            <details className="fold sec">
              <summary>Pour l’enseignant</summary>
              <div className="fold-in">
                <p className="text-[15px] leading-snug">
                  {remote
                    ? 'La créature est celle de la classe : elle grossit avec les fautes de toutes les parties libres jouées par les élèves, sur tous leurs appareils (ses points de vie montent d’un point par faute), et faiblit quand ils retravaillent une règle. '
                    : 'La créature grossit avec les fautes de toutes les parties jouées sur cet appareil (ses points de vie montent d’un point par faute) et faiblit quand les élèves retravaillent une règle. '}
                  {phase === 'final' ? '' : `Le grand combat s’ouvre en juin (dans ${left} mois). `}Le combat final est écrit d’avance&nbsp;:{' '}
                  <strong>la classe gagne toujours</strong>, après un moment où tout semble perdu. Les compteurs ne sont reliés à aucun élève en particulier.
                </p>
                <Gauges boss={boss} ink={ink} power={power} />
                <CaveClasses count={names.length} onNames={(list) => setNames(saveNames(list))} onPick={setPicked} />
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="btn btn-ghost" onClick={() => setFight({ real: false })}>
                    Essayer le combat (sans le compter)
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => {
                      if (window.confirm('Remettre la grotte à zéro ? La créature redevient une goutte et le combat sera à refaire.')) {
                        setBoss(resetBoss());
                        void sendCaveReset(picked).then(() => refresh());
                      }
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
