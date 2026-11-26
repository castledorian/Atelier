import { useCallback, useEffect, useMemo, useState } from 'react';
import { BackButton } from '../components/BackButton';
import BossFight from '../components/BossFight';
import CaveChart from '../components/CaveChart';
import CaveStage from '../components/CaveStage';
import CaveTeacher from '../components/CaveTeacher';
import CaveVictory from '../components/CaveVictory';
import { CaveTeam, fightersOf } from '../components/CaveParts';
import { fetchCaveHistory, fetchTeam } from '../server/goutte';
import type { CaveDay, Team } from '../server/goutte';
import { ObserveBar } from '../components/ObserveBar';
import { Frame } from './Frame';
import { formAt } from '../game/boss/forms';
import { addName, bossHp, loadBoss, loadNames, markSeen, monthsToFinal, phaseOf, powerLevel, resetBoss, saveNames, schoolYear, winBoss } from '../game/boss/state';
import type { BossPhase, BossState } from '../game/boss/state';
import { CaveSound } from '../game/caveSound';
import { loadSettings } from '../game/storage';
import { fetchCave, sendCaveReset, sendCaveWin } from '../server/cave';
import type { CaveServer, CaveSource } from '../server/cave';

/**
 * « La grotte » : la créature d'encre de l'année, et le grand combat de fin d'année.
 *
 * Le monstre change de FORME avec le calendrier (10 formes, de la rentrée au 1er juin) ; ses points de vie suivent les fautes de la classe.
 * La créature est celle de la CLASSE : le serveur additionne les fautes et les réussites des parties libres (compteurs anonymes,
 * jamais reliés à un élève en particulier) et la page se met à jour toute seule. Sans serveur (ou si la mise à jour SQL « grotte » manque),
 * elle retombe sur les compteurs gardés sur l'appareil. Les prénoms du combat final restent sur l'appareil.
 * En mode observation (administrateur), la page est en lecture seule : ni combat, ni réglage, ni son.
 */

interface Props {
  onBack: () => void;
  studentName?: string | null;
  isTeacher?: boolean;
  /** jeton de l'élève connecté (pour lire la grotte de sa classe) */
  token?: string | null;
  /** administrateur : on regarde la grotte de quelqu'un d'autre, en lecture seule */
  observe?: { source: CaveSource; label: string; onQuit: () => void; /** le bandeau est déjà affiché par la page qui contient celle-ci */ embedded?: boolean };
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

  /** équipe de la classe et courbe : facultatives (mise à jour SQL « goutte ») */
  const [team, setTeam] = useState<Team | null>(null);
  const [history, setHistory] = useState<CaveDay[] | null>(null);

  const refresh = useCallback(async () => {
    if (!source) return;
    try {
      const r = await fetchCave(source);
      setRemote((prev) => r ?? prev ?? null);
    } catch {
      /* session perdue : la page garde ce qu'elle montre */
    }
    const [t, h] = await Promise.all([fetchTeam(source).catch(() => null), fetchCaveHistory(source)]);
    if (t) setTeam(t);
    if (h) setHistory(h);
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

  /** une grotte de classe existe : on attend sa réponse avant d'afficher un chiffre (sinon le nombre de l'appareil clignote puis change) */
  const waiting = source !== null && remote === undefined;
  const boss: BossState = remote
    ? { year: schoolYear(), ink: remote.ink, power: remote.power, games: remote.games, wonAt: remote.won_at, seen: true, log: [] }
    : readOnly || waiting
      ? { year: schoolYear(), ink: 0, power: 0, games: 0, wonAt: null, seen: true, log: [] }
      : localBoss;
  const [fight, setFight] = useState<null | { real: boolean }>(null);
  const sound = useMemo(() => loadSettings().sound, []);
  const fighting = fight !== null;

  const phase: BossPhase = phaseOf(boss);
  const { form, grow } = formAt();
  const power = powerLevel(boss);
  /** aperçu des formes à venir (enseignant) */
  const [preview, setPreview] = useState(false);
  const fighters = useMemo(() => fightersOf(team), [team]);
  const days: CaveDay[] = remote && history ? history : remote || readOnly || waiting ? [] : localBoss.log.map(([d, i, p]) => ({ d, ink: i, power: p }));
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });

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
          fighters={fighters}
          form={form}
          grow={grow}
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

  const depth = phase === 'early' ? 0.3 : phase === 'growing' ? 0.65 : 1;

  return (
    <Frame dark>
      {observe && !observe.embedded && <ObserveBar label={observe.label} onQuit={observe.onQuit} />}
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
        <CaveVictory boss={boss} form={form} names={names} onReplay={() => setFight({ real: false })} />
      ) : (
        <>
          <CaveStage today={form} grow={grow} phase={phase} preview={preview && (isTeacher || readOnly)} depth={depth} waiting={waiting} hp={bossHp(boss)} />

          {!waiting && (
            <details className="fold sec cave-more">
              <summary>Plus d’informations</summary>
              <div className="fold-in">
                <CaveChart days={days} today={today} ink={boss.ink} power={boss.power} />
                <CaveTeam fighters={fighters} />
              </div>
            </details>
          )}

          {phase === 'final' && !readOnly && (
            <div className="mt-[var(--sp)] flex justify-center">
              <button type="button" className="btn btn-primary" onClick={() => setFight({ real: true })}>
                Descendre dans la grotte
              </button>
            </div>
          )}

          {/* Réservé au compte enseignant : les élèves ne doivent pas voir qu'un combat d'essai existe, ni qu'il est écrit d'avance */}
          {isTeacher && !readOnly && (
            <CaveTeacher
              boss={boss}
              form={form}
              grow={grow}
              power={power}
              phase={phase}
              shared={remote !== null && remote !== undefined}
              monthsLeft={monthsToFinal()}
              namesCount={names.length}
              preview={preview}
              onPreview={setPreview}
              onNames={(list) => setNames(saveNames(list))}
              onPick={setPicked}
              onTry={() => setFight({ real: false })}
              onReset={() => {
                setBoss(resetBoss());
                void sendCaveReset(picked).then(() => refresh());
              }}
            />
          )}
        </>
      )}
    </Frame>
  );
}
