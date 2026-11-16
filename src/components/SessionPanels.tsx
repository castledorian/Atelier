import { useCallback, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { GAME_NAMES, describeConfig } from '../game/sessionConfig';
import { enqueue } from '../server/outbox';
import { submitRun } from '../server/student';
import type { RunPayload, SessionInfo, StudentAccount } from '../server/types';
import { BackButton } from './BackButton';

/** Séances de classe : un jeu réglé par l'enseignant, avec un nombre d'essais limité ; seul le meilleur score compte. */

export type SessionState = 'idle' | 'sending' | 'saved' | 'queued' | 'refused';

const fmt = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

/** Suit les essais de l'élève dans une séance et envoie chaque partie terminée. */
export function useSessionRun(account: StudentAccount | null, initial: SessionInfo | null | undefined) {
  const [sess, setSess] = useState<SessionInfo | null>(initial ?? null);
  const [state, setState] = useState<SessionState>('idle');
  const [last, setLast] = useState<number | null>(null);
  const ref = useRef(sess);
  ref.current = sess;
  const accRef = useRef(account);
  accRef.current = account;

  const submit = useCallback((payload: Omit<RunPayload, 'sessionId' | 'balance'>, onLost: () => void) => {
    const s = ref.current;
    const acct = accRef.current;
    if (!s || !acct) return;
    const run: RunPayload = { ...payload, sessionId: s.id };
    const used = s.attempts_used + 1;
    const best = Math.max(s.best_score ?? 0, payload.score);
    setSess({ ...s, attempts_used: used, best_score: best });
    setLast(payload.score);
    setState('sending');
    submitRun(acct.token, run)
      .then((r) => {
        if (r.status === 'ok') {
          setState('saved');
          if (r.attemptsUsed) setSess((x) => (x ? { ...x, attempts_used: r.attemptsUsed as number } : x));
        } else if (r.status === 'invalid_session') {
          enqueue(acct.student.id, run);
          setState('queued');
          onLost();
        } else {
          setState('refused');
          setSess((x) => (x ? { ...x, attempts_used: Math.max(x.attempts_used - 1, 0) } : x));
        }
      })
      .catch(() => {
        enqueue(acct.student.id, run);
        setState('queued');
      });
  }, []);

  const left = sess ? Math.max(0, sess.max_attempts - sess.attempts_used) : 0;
  return { sess, state, last, submit, left };
}

function Summary({ session }: { session: SessionInfo }) {
  const lines = describeConfig(session.game, session.config);
  return (
    <p className="text-[15px] leading-snug">
      <strong>{GAME_NAMES[session.game]}</strong> · {lines.join(' · ')}
    </p>
  );
}

/** Écran de départ d'une séance : titre, réglages, essais restants. */
export function SessionIntro({ session, left, onStart, onBack }: { session: SessionInfo; left: number; onStart: () => void; onBack: () => void }) {
  return (
    <div className="overlay">
      <section className="card card-game card-menu w-full max-w-[560px]" aria-labelledby="ses-title">
        <div className="card-top">
          <BackButton label="Mes séances" onClick={onBack} />
        </div>
        <p className="eyebrow">Séance de la classe</p>
        <h1 id="ses-title" className="title-sm">
          {session.title}
        </h1>
        <div className="rule" aria-hidden="true" />
        <div className="mt-[var(--sp)] flex flex-col gap-3">
          <Summary session={session} />
          <p className="text-[15px] leading-snug">
            {left > 0 ? (
              <>
                Essai <strong>{session.attempts_used + 1}</strong> sur {session.max_attempts}. Seul ton <strong>meilleur score</strong> compte.
              </>
            ) : (
              <>Tu as utilisé tes {session.max_attempts} essais. Ton meilleur score est enregistré.</>
            )}
            {session.best_score !== null && (
              <>
                {' '}
                Meilleur score pour l’instant&nbsp;: <strong>{fmt(session.best_score)}</strong>.
              </>
            )}
          </p>
          {!session.active && <p className="text-[15px] font-bold">Cette séance est fermée.</p>}
          <div>
            <button type="button" className="btn btn-primary" autoFocus disabled={left <= 0 || !session.active} onClick={onStart}>
              {session.attempts_used === 0 ? 'Commencer' : 'Nouvel essai'}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

/** Fin d'un essai de séance. */
export function SessionOver({
  session,
  state,
  score,
  left,
  details,
  onRetry,
  onBack,
}: {
  session: SessionInfo;
  state: SessionState;
  score: number;
  left: number;
  details?: ReactNode;
  onRetry: () => void;
  onBack: () => void;
}) {
  const best = session.best_score ?? score;
  return (
    <div className="overlay">
      <section className="card card-game card-cover w-full max-w-[560px]" role="dialog" aria-modal="true" aria-labelledby="sover-title">
        <div className="card-top">
          <BackButton label="Mes séances" onClick={onBack} />
          <span className="subhead">{session.title}</span>
        </div>
        <h2 id="sover-title" className="title-sm">
          Essai {Math.min(session.attempts_used, session.max_attempts)} sur {session.max_attempts}
        </h2>
        <div className="rule" aria-hidden="true" />
        <div className="mt-2 flex items-end gap-3">
          <div className="font-display text-[44px] leading-none">{fmt(score)}</div>
          <div className="pb-2 text-[14px] uppercase tracking-[0.12em] text-ink/65">points</div>
        </div>
        <p className="mt-2 text-[16px] leading-snug">
          Ton meilleur score&nbsp;: <strong>{fmt(best)}</strong>
          {best === score && score > 0 && session.attempts_used > 1 ? ' — c’est cet essai !' : ''}
        </p>
        {details}
        <p className="mt-2 text-[14px] leading-snug text-ink/75" role="status" aria-live="polite">
          {state === 'sending' && 'Enregistrement…'}
          {state === 'saved' && 'Enregistré ✓'}
          {state === 'queued' && 'Pas de réseau : ton essai est gardé sur cet appareil et sera envoyé dès que possible.'}
          {state === 'refused' && 'Le serveur a refusé cet essai (séance fermée ou essais épuisés).'}
        </p>
        <div className="mt-[var(--sp)] flex flex-wrap gap-3">
          {left > 0 && session.active && state !== 'refused' ? (
            <button type="button" className="btn btn-primary" autoFocus onClick={onRetry}>
              Nouvel essai ({left} restant{left > 1 ? 's' : ''})
            </button>
          ) : (
            <p className="text-[15px] font-bold">Tous tes essais sont utilisés{score > 0 ? '. Bravo\u00a0!' : '.'}</p>
          )}
          <button type="button" className={left > 0 ? 'btn btn-ghost' : 'btn btn-primary'} onClick={onBack}>
            Retour aux séances
          </button>
        </div>
      </section>
    </div>
  );
}
