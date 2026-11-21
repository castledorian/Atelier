import { useState } from 'react';
import { pictureOf } from '../game/facteur/pictures';
import { parts, plain } from '../game/facteur/words';
import type { FWord } from '../game/facteur/words';

/** Pièces visuelles du « Facteur », partagées par le jeu et son extrait animé de l'accueil. */

export type MailboxState = 'idle' | 'off' | 'hint' | 'no' | 'ok';

/** Les lettres d'un mot ; les lettres muettes sont grisées. */
export function Mark({ mark }: { mark: string }) {
  return (
    <>
      {parts(mark).map((p, i) => (
        <span key={i} className={p.mute ? 'fct-mute' : undefined}>
          {p.text}
        </span>
      ))}
    </>
  );
}

export function PictureView({ word }: { word: FWord }) {
  const pic = pictureOf(word);
  const [broken, setBroken] = useState(false);
  if (!pic) return null;
  if (pic.src && !broken) return <img className="fct-img" src={pic.src} alt="" draggable={false} onError={() => setBroken(true)} />;
  return (
    <span className="fct-emoji" aria-hidden="true">
      {pic.emoji}
    </span>
  );
}

export function Mailbox({ i, word, state, onTap }: { i: number; word: FWord; state: MailboxState; onTap?: (i: number) => void }) {
  return (
    <button
      type="button"
      className="fct-box"
      data-state={state}
      aria-disabled={state === 'off' ? true : undefined}
      aria-label={`Boîte ${i + 1} : ${plain(word.mark)}`}
      onClick={onTap ? () => onTap(i) : undefined}
      tabIndex={onTap ? undefined : -1}
    >
      <svg className="fct-box-art" viewBox="0 0 120 80" aria-hidden="true" focusable="false">
        <path className="fct-box-body" d="M8 78 V32 a52 30 0 0 1 104 0 V78 Z" />
        <rect className="fct-box-slot" x="30" y="30" width="60" height="7" rx="3.5" />
        <g className="fct-box-flag">
          <rect x="104" y="12" width="4" height="30" />
          <rect x="94" y="12" width="14" height="10" rx="2" />
        </g>
      </svg>
      <span className="fct-word" style={{ fontSize: `clamp(20px, min(${(46 / Math.max(5, plain(word.mark).length)).toFixed(2)}cqw, 8cqh), 54px)` }}>
        <Mark mark={word.mark} />
      </span>
    </button>
  );
}
