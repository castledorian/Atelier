import { useEffect, useState } from 'react';
import { GAIN_EVENT } from '../game/goutte/store';
import type { Gain } from '../game/goutte/rules';

/**
 * Petite annonce après une partie : « +25 points · +3 friandises », et les grandes nouvelles (niveau, étape, succès, objet).
 * Lue par les lecteurs d'écran (aria-live), se ferme seule, ou d'un toucher. Rien n'est annoncé pour une partie qui ne rapporte rien.
 */
export default function GainToast() {
  const [gain, setGain] = useState<Gain | null>(null);

  useEffect(() => {
    const on = (e: Event) => {
      const g = (e as CustomEvent<Gain>).detail;
      if (g && g.xp > 0) setGain(g);
    };
    window.addEventListener(GAIN_EVENT, on);
    return () => window.removeEventListener(GAIN_EVENT, on);
  }, []);

  useEffect(() => {
    if (!gain) return;
    const big = gain.level !== null || gain.achievements.length > 0 || gain.items.length > 0;
    const id = window.setTimeout(() => setGain(null), big ? 9000 : 5000);
    return () => window.clearTimeout(id);
  }, [gain]);

  return (
    <div className="gain-live" aria-live="polite">
      {gain && (
        <button type="button" className="gain" onClick={() => setGain(null)} aria-label="Fermer l’annonce">
          <span className="gain-line">
            <strong>+{gain.xp} points</strong>
            {gain.treats > 0 && (
              <>
                {' · '}+{gain.treats} friandise{gain.treats > 1 ? 's' : ''}
              </>
            )}{' '}
            pour ta goutte
          </span>
          {gain.level !== null && <span className="gain-big">Niveau {gain.level} !{gain.stage ? ` Ta goutte devient ${gain.stage}.` : ''}</span>}
          {gain.achievements.map((a) => (
            <span key={a} className="gain-big">
              Succès : {a}
            </span>
          ))}
          {gain.items.map((i) => (
            <span key={i} className="gain-item">
              Cadeau à déballer : {i}
            </span>
          ))}
        </button>
      )}
    </div>
  );
}
