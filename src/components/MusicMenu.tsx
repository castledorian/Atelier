import { useEffect, useRef, useState } from 'react';
import type { VolumeLevel } from '../game/ambiance';

/**
 * Réglage discret de l'ambiance musicale de l'accueil : une petite note ♪ dans le coin ; elle ouvre un minuscule panneau
 * (musique oui/non, volume). Rien n'est mis en avant : la musique reste un détail, jamais une consigne.
 */
export function MusicMenu({ on, volume, onToggle, onVolume }: { on: boolean; volume: VolumeLevel; onToggle: () => void; onVolume: (v: VolumeLevel) => void }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        root.current?.querySelector('button')?.focus();
      }
    };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('keydown', key);
    };
  }, [open]);

  return (
    <div className="mm" ref={root}>
      <button
        type="button"
        className={`mm-btn${on ? ' on' : ''}`}
        aria-expanded={open}
        aria-controls="mm-panel"
        aria-label={`Réglages de la musique d’ambiance (${on ? 'activée' : 'désactivée'})`}
        title="Musique d’ambiance"
        onClick={() => setOpen((v) => !v)}
      >
        <span aria-hidden="true">{on ? '♪' : '♪̸'}</span>
      </button>
      {open && (
        <div className="mm-panel" id="mm-panel" role="group" aria-label="Musique d’ambiance">
          <label className="mm-row">
            <input type="checkbox" checked={on} onChange={onToggle} />
            <span>Musique douce sur cette page</span>
          </label>
          <div className="mm-row mm-vol" role="radiogroup" aria-label="Volume de la musique">
            <span aria-hidden="true">Volume</span>
            {(['Bas', 'Moyen', 'Haut'] as const).map((l, i) => (
              <button key={l} type="button" role="radio" aria-checked={volume === i} disabled={!on} onClick={() => onVolume(i as VolumeLevel)}>
                {l}
              </button>
            ))}
          </div>
          <p className="mm-note">S’arrête dès qu’un jeu commence.</p>
        </div>
      )}
    </div>
  );
}
