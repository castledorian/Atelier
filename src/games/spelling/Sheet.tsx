import { useCallback, useEffect, useRef, useState } from 'react';
import { Sfx } from '../../game/audio';
import type { Round } from './types';
import { isWord, reducedMotion, T } from './helpers';

/**
 * La feuille : la créature y écrit sa phrase lettre après lettre (une plume suit l'écriture). Les mots gardent leur place dès le
 * départ (les lettres pas encore écrites sont invisibles), si bien que rien ne bouge quand la phrase apparaît. Toucher la feuille
 * pendant l'écriture l'affiche d'un coup.
 */
export function Sheet({ round, sfx, tuto, corrected, onWritten, onTap }: { round: Round; sfx: Sfx; tuto: boolean; corrected: boolean; onWritten: () => void; onTap: (i: number) => void }) {
  const { item, step } = round;
  const tokens = [...item.before, item.wrong + item.suffix, ...item.after];
  const starts: number[] = [];
  let len = 0;
  for (const t of tokens) {
    starts.push(len);
    len += t.length + 1;
  }
  const target = item.before.length;
  const [shown, skip] = useWriter(item.id, len, step === 'write', starts, sfx, onWritten);
  const writing = step === 'write' && shown < len;
  const done = step === 'done';

  return (
    <div className={`hx-sheet${writing ? ' writing' : ''}`} onClick={writing ? skip : undefined}>
      <div className="hx-line" role="group" aria-label={writing ? 'Phrase en cours d’écriture' : 'Phrase'}>
        {tokens.map((t, i) => {
          const k = Math.max(0, Math.min(t.length, shown - starts[i]));
          // la plume se tient juste après la dernière lettre écrite
          const nib = writing && shown >= starts[i] && shown <= starts[i] + t.length;
          const text = (
            <>
              <span className="hx-ink">{t.slice(0, k)}</span>
              {nib && <span className="hx-nib" />}
              {k < t.length && <span className="hx-hide">{t.slice(k)}</span>}
            </>
          );
          if (i === target && done) {
            return (
              <span key={i} className={`hx-w hx-fixed${corrected ? ' on' : ''}`}>
                <span className="hx-was">{item.wrong}</span>
                <span className="hx-right">
                  {corrected ? item.right : item.wrong}
                  {item.suffix}
                </span>
              </span>
            );
          }
          if (i === target && step === 'fix') {
            return (
              <span key={i} className="hx-w hx-found">
                {t}
              </span>
            );
          }
          if (!isWord(t)) {
            return (
              <span key={i} className="hx-w hx-punct">
                {text}
              </span>
            );
          }
          const bad = round.badTaps.includes(i);
          return (
            <span key={i} className="hx-wrap">
              <button type="button" className={`hx-w${bad ? ' bad' : ''}`} disabled={step !== 'tap' || bad} onClick={() => onTap(i)}>
                {text}
              </button>
              {tuto && i === target && step === 'tap' && round.badTaps.length === 0 && <span className="hx-point">Touche ce mot !</span>}
            </span>
          );
        })}
      </div>
      {canSpeak && !writing && (
        <button
          type="button"
          className="hx-speak"
          aria-label="Lire la phrase à voix haute"
          title="Lire la phrase"
          onClick={(e) => {
            e.stopPropagation();
            speak(done ? item.fixed : tokens.join(' '));
          }}
        >
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <path d="M3 9v6h4l5 4V5L7 9H3z" fill="currentColor" />
            <path d="M15 8.5a5 5 0 0 1 0 7M17.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
      )}
    </div>
  );
}

/**
 * Écriture progressive : renvoie le nombre de caractères déjà écrits et une fonction pour tout afficher d'un coup.
 * Environ 1,4 s par phrase quelle que soit sa longueur (entre 18 et 34 ms par lettre), un grattement de plume à chaque mot.
 */
export function useWriter(id: string, len: number, active: boolean, starts: number[], sfx: Sfx, onDone: () => void): [number, () => void] {
  const [shown, setShown] = useState(active ? 0 : len);
  const raf = useRef(0);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  const startsRef = useRef(starts);
  startsRef.current = starts;
  const finish = useCallback(() => {
    cancelAnimationFrame(raf.current);
    setShown(len);
    doneRef.current();
  }, [len]);
  useEffect(() => {
    if (!active) {
      setShown(len);
      return;
    }
    if (reducedMotion()) {
      finish();
      return;
    }
    setShown(0);
    const per = Math.max(18, Math.min(34, 1400 / len));
    const t0 = performance.now() + T.enter;
    let word = -1;
    const tick = (t: number) => {
      const n = Math.floor((t - t0) / per);
      if (n >= len) {
        finish();
        return;
      }
      if (n >= 0) {
        setShown(n);
        let w = word;
        while (w + 1 < startsRef.current.length && startsRef.current[w + 1] <= n) w++;
        if (w !== word) {
          word = w;
          sfx.play('scribble');
        }
      }
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, active]);
  return [shown, finish];
}

/** Expert : on corrige le mot en l'écrivant (le mot faux est déjà dans la case). */
export function TypeBox({ word, active, onSend }: { word: string; active: boolean; onSend: (t: string) => void }) {
  const [text, setText] = useState(word);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (active) {
      ref.current?.focus({ preventScroll: true });
      ref.current?.select();
    }
  }, [active]);
  return (
    <form
      className="hx-type"
      onSubmit={(e) => {
        e.preventDefault();
        if (text.trim()) onSend(text);
      }}
    >
      <label className="sr-only" htmlFor="sp-type-in">
        Écris la bonne orthographe du mot
      </label>
      <input id="sp-type-in" ref={ref} value={text} onChange={(e) => setText(e.target.value)} lang="fr" autoCapitalize="off" autoComplete="off" autoCorrect="off" spellCheck={false} disabled={!active} />
      <button type="submit" className="btn btn-primary" disabled={!active || !text.trim()}>
        Valider
      </button>
    </form>
  );
}

/** Synthèse vocale du navigateur : tout reste sur l'appareil, rien n'est envoyé. */
export const canSpeak = typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';
export function speak(text: string) {
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'fr-FR';
    u.rate = 0.9;
    window.speechSynthesis.speak(u);
  } catch {
    /* pas de voix disponible */
  }
}
