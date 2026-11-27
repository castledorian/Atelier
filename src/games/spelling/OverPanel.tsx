import type { ReactNode } from 'react';
import { DuelResult, ReviewNote } from '../../components/EncreNotes';
import type { RuleId } from '../../game/encre/rules';
import type { Cloud, Over } from './types';
import { fmt } from './helpers';

export function OverPanel({ over, cloud, account, onRestart, onDuel, onMenu }: { over: Over; cloud: Cloud; account: boolean; onRestart: () => void; onDuel: (r: RuleId) => void; onMenu: () => void }) {
  const duel = !!over.duel;
  const title = duel ? 'Duel terminé' : over.dead ? 'L’encre a gagné, cette fois' : over.record ? 'Nouveau record !' : over.okRounds === over.total ? 'Page corrigée, sans faute !' : 'Page corrigée !';
  let line: ReactNode = null;
  if (!duel)
    line = over.dead
      ? `Tu as corrigé ${over.defeated} phrase${over.defeated > 1 ? 's' : ''} sur ${over.total}. Relis les astuces ci-dessous, puis retente : les phrases changent à chaque partie.`
      : `${over.okRounds} phrase${over.okRounds > 1 ? 's' : ''} réussie${over.okRounds > 1 ? 's' : ''} du premier coup sur ${over.total}. Il te restait ${over.hpLeft} vie${over.hpLeft > 1 ? 's' : ''} sur ${over.maxHp}.`;
  return (
    <section aria-labelledby="sp-over">
      <h1 id="sp-over" className="title title-wrap">
        {title}
      </h1>
      <div className="rule" aria-hidden="true" />
      {!duel && (
        <>
          <p className="mt-2 text-[16px]">
            <strong className="score-big">{fmt(over.score)}</strong> points{over.rank > 0 ? ` · n° ${over.rank} sur cet appareil` : ''}
          </p>
          <p className="mt-2 text-[16px] font-bold">{line}</p>
        </>
      )}
      {over.duel && <DuelResult duel={over.duel} />}
      {over.top && !duel && <ReviewNote rule={over.top} onDuel={onDuel} />}
      {over.missed.length > 0 && !duel && (
        <section className="mt-3" aria-labelledby="sp-recap">
          <h2 id="sp-recap" className="subhead">
            À retenir
          </h2>
          <ul className="sp-recap">
            {over.missed.map((m) => (
              <li key={m.id}>
                <strong>{m.fixed}</strong>
                <span>{m.tip}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {account && !duel && (
        <p className="mt-2 text-[14px] text-ink/75" aria-live="polite">
          {cloud === 'sending' && 'Envoi du score à la classe…'}
          {cloud === 'sent' && 'Score envoyé à la classe ✓'}
          {cloud === 'queued' && 'Pas de réseau : ton score est gardé et sera envoyé plus tard.'}
        </p>
      )}
      <div className="mt-[var(--sp)] flex flex-wrap gap-3">
        <button type="button" className="btn btn-primary" autoFocus onClick={onRestart}>
          Rejouer
        </button>
        <button type="button" className="btn btn-ghost" onClick={onMenu}>
          Menu du jeu
        </button>
      </div>
    </section>
  );
}
