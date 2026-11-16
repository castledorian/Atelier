import { useEffect, useState } from 'react';
import { BackButton } from '../components/BackButton';
import { GAME_NAMES, describeConfig } from '../game/sessionConfig';
import { ApiError, explain } from '../server/api';
import { fetchSessions } from '../server/student';
import type { SessionInfo, StudentAccount } from '../server/types';
import { Frame, Notice } from './Frame';

const fmt = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

/** Espace de l'élève : les séances de sa classe, avec ses essais restants. */
export default function Sessions({ account, onBack, onPlay, onSessionLost }: { account: StudentAccount; onBack: () => void; onPlay: (s: SessionInfo) => void; onSessionLost: () => void }) {
  const [list, setList] = useState<SessionInfo[] | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    let alive = true;
    fetchSessions(account.token)
      .then((r) => alive && setList(r))
      .catch((e) => {
        if (!alive) return;
        if (e instanceof ApiError && e.code === 'invalid_session') onSessionLost();
        else setErr(explain(e));
      });
    return () => {
      alive = false;
    };
  }, [account.token, onSessionLost]);

  const todo = (list ?? []).filter((s) => s.active && s.attempts_used < s.max_attempts);
  const other = (list ?? []).filter((s) => !todo.includes(s));

  const card = (s: SessionInfo) => {
    const left = Math.max(0, s.max_attempts - s.attempts_used);
    const playable = s.active && left > 0;
    return (
      <li key={s.id} className="sess-card">
        <div className="sess-main">
          <strong className="sess-title">{s.title}</strong>
          <span className="text-[14px] text-ink/80">
            {GAME_NAMES[s.game]} · {describeConfig(s.game, s.config).join(' · ')}
          </span>
          <span className="text-[14px]">
            {!s.active
              ? 'Séance fermée'
              : left > 0
                ? `${left} essai${left > 1 ? 's' : ''} restant${left > 1 ? 's' : ''} sur ${s.max_attempts}`
                : `Terminée (${s.max_attempts} essais)`}
            {s.best_score !== null && (
              <>
                {' '}
                · meilleur score <strong>{fmt(s.best_score)}</strong>
              </>
            )}
          </span>
        </div>
        <button type="button" className={playable ? 'btn btn-primary' : 'btn btn-ghost'} disabled={!playable} onClick={() => onPlay(s)}>
          {s.attempts_used === 0 ? 'Commencer' : 'Rejouer'}
        </button>
      </li>
    );
  };

  return (
    <Frame wide>
      <div className="card-top">
        <BackButton onClick={onBack} />
      </div>
      <p className="eyebrow">
        {account.student.name} · {account.class.name}
      </p>
      <h1 className="title-sm">Mes séances</h1>
      <div className="rule" aria-hidden="true" />
      <p className="mt-2 text-[15px] leading-snug">
        Ce sont les séances préparées par ton enseignant. Tu peux t’essayer plusieurs fois&nbsp;: seul ton <strong>meilleur score</strong> compte.
      </p>
      {err && <Notice kind="error">{err}</Notice>}
      {list === null && !err && <p className="mt-3 text-[15px]">Chargement…</p>}
      {list !== null && list.length === 0 && <p className="mt-3 text-[15px]">Aucune séance pour l’instant. Tu peux jouer librement depuis l’accueil.</p>}
      {todo.length > 0 && (
        <>
          <h2 className="subhead mt-[var(--sp)]">À faire</h2>
          <ul className="sess-list">{todo.map(card)}</ul>
        </>
      )}
      {other.length > 0 && (
        <>
          <h2 className="subhead mt-[var(--sp)]">Terminées ou fermées</h2>
          <ul className="sess-list">{other.map(card)}</ul>
        </>
      )}
    </Frame>
  );
}
