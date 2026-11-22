import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ObserveBar, ReadOnlyZone } from '../components/ObserveBar';
import { GAME_NAMES } from '../game/sessionConfig';
import { setObserverAuth } from '../server/api';
import { freshToken } from '../server/teacher';
import { fetchMyRuns } from '../server/student';
import type { ServerRun, StudentAccount } from '../server/types';
import Cave from './Cave';
import MaGoutte from './MaGoutte';
import Home from './Home';
import { Frame } from './Frame';
import Sessions from './Sessions';

type Tab = 'home' | 'sessions' | 'goutte' | 'cave' | 'runs';

const TABS: Array<[Tab, string]> = [
  ['home', 'Accueil'],
  ['sessions', 'Séances'],
  ['goutte', 'Goutte'],
  ['cave', 'Grotte'],
  ['runs', 'Parties'],
];

const noop = () => undefined;

/**
 * L'écran d'un élève vu par l'administrateur, en lecture seule : son accueil et ses séances tels qu'il les voit, sa grotte en direct,
 * et la liste de ses parties. Les lectures passent par un jeton d'observation que le serveur n'accepte que pour des fonctions de lecture ;
 * la zone en lecture seule bloque en plus tout clic ou saisie qui ne sert pas à naviguer.
 */
export default function ObserveStudent({ account, label, onQuit }: { account: StudentAccount; label: string; onQuit: () => void }) {
  const [tab, setTab] = useState<Tab>('home');
  // Posé dès le premier rendu : les écrans enfants lancent leurs lectures avant les effets de cette page
  useState(() => setObserverAuth(freshToken));
  const top = useRef<HTMLDivElement>(null);
  const [pad, setPad] = useState(120);

  // Les lectures « au nom de l'élève » portent l'identité de l'administrateur, le temps de l'observation seulement
  useEffect(() => {
    setObserverAuth(freshToken);
    return () => setObserverAuth(null);
  }, []);

  // Le bandeau reste visible en haut : le contenu commence juste dessous, quelle que soit sa hauteur
  useLayoutEffect(() => {
    const el = top.current;
    if (!el) return;
    const measure = () => setPad(el.offsetHeight);
    measure();
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    ro?.observe(el);
    window.addEventListener('resize', measure);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);

  return (
    <>
      <div ref={top} className="observe-top">
        <ObserveBar label={label} onQuit={onQuit} />
        <div className="seg seg-wide" role="tablist" aria-label="Écrans de l’élève">
          {TABS.map(([id, text]) => (
            <button key={id} type="button" role="tab" aria-selected={tab === id} className="seg-b" onClick={() => setTab(id)}>
              {text}
            </button>
          ))}
        </div>
      </div>
      <div style={{ paddingTop: pad }}>
        {tab === 'home' && (
          <ReadOnlyZone>
            <Home
              student={account}
              teacher={null}
              onPlay={noop}
              onSessions={noop}
              onLogin={noop}
              onDashboard={noop}
              onCave={noop}
              onGoutte={noop}
              onInfo={noop}
              onLogout={noop}
              install={{ mode: null, onInstall: noop }}
            />
          </ReadOnlyZone>
        )}
        {tab === 'sessions' && (
          <ReadOnlyZone>
            <Sessions account={account} onBack={noop} onPlay={noop} onSessionLost={noop} />
          </ReadOnlyZone>
        )}
        {tab === 'goutte' && <ObservedGoutte account={account} onBack={() => setTab('home')} />}
        {tab === 'cave' && <Cave onBack={() => setTab('home')} studentName={account.student.name} observe={{ source: { kind: 'observe-student', studentId: account.student.id }, label, onQuit, embedded: true }} />}
        {tab === 'runs' && <Runs account={account} />}
      </div>
    </>
  );
}

const when = (ms: number) => new Date(ms).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
const dur = (s: number) => (s >= 60 ? `${Math.round(s / 60)} min` : `${s} s`);

/** Toutes les parties envoyées par l'élève (les 200 dernières), tous jeux confondus. */
function Runs({ account }: { account: StudentAccount }) {
  const [runs, setRuns] = useState<ServerRun[] | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    let alive = true;
    fetchMyRuns(account.token, null)
      .then((r) => alive && setRuns(r))
      .catch(() => alive && setErr(true));
    return () => {
      alive = false;
    };
  }, [account.token]);

  return (
    <Frame wide>
      <h1 className="title-sm">Parties de {account.student.name}</h1>
      <p className="adm-note">
        {account.class.name} · {account.school.name}
      </p>
      {err && (
        <p className="notice notice-error" role="alert">
          Impossible de charger les parties pour l’instant.
        </p>
      )}
      {!runs && !err && <p className="mt-4 text-[15px]">Chargement…</p>}
      {runs && runs.length === 0 && <p className="mt-4 text-[15px]">Aucune partie envoyée pour l’instant.</p>}
      {runs && runs.length > 0 && (
        <div className="adm-wrap">
          <table className="adm-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Jeu</th>
                <th>Mode</th>
                <th>Type</th>
                <th>Score</th>
                <th>Précision</th>
                <th>Durée</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id}>
                  <td>{when(r.date)}</td>
                  <td>{GAME_NAMES[r.game as keyof typeof GAME_NAMES] ?? r.game}</td>
                  <td>{r.mode}</td>
                  <td>{r.kind === 'drill' ? 'Entraînement' : 'Partie'}</td>
                  <td>{r.score}</td>
                  <td>{Math.round(r.acc)} %</td>
                  <td>{dur(r.duration)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Frame>
  );
}

/** La goutte de l'élève observé : seulement ce que dit le serveur (rien de l'appareil de l'administrateur). */
function ObservedGoutte({ account, onBack }: { account: StudentAccount; onBack: () => void }) {
  return (
    <ReadOnlyZone>
      <MaGoutte token={account.token} onBack={onBack} readOnly />
    </ReadOnlyZone>
  );
}
