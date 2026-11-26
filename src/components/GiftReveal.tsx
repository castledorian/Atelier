import { useState } from 'react';
import { Dialog } from './Dialog';
import { GoutteArt } from './GoutteArt';
import { itemById } from '../game/goutte/rules';
import type { Slot } from '../game/goutte/rules';

const NEW: Record<Slot, string> = { color: 'Nouvelle couleur', hat: 'Nouveau chapeau', weapon: 'Nouvelle arme', shield: 'Nouveau bouclier', acc: 'Nouvel accessoire' };
import type { Look } from '../game/goutte/rules';

/**
 * Le déballage d'un objet débloqué : une boîte qui frémit, qu'on ouvre soi-même, puis l'objet sur sa goutte.
 * Ouvrir le cadeau de ses propres mains (au lieu de le recevoir tout fait) rend le moment plus fort : c'est l'élève qui le provoque.
 * Rien n'est payant ni tiré au sort : l'objet est déjà gagné, la boîte ne fait que le révéler.
 */
export default function GiftReveal({ itemId, look, stage, left, onClose }: { itemId: string; look: Look; stage: number; left: number; onClose: (wear: boolean) => void }) {
  const [open, setOpen] = useState(false);
  const item = itemById(itemId);
  if (!item) return null;
  return (
    <Dialog as="div" className="gift-layer" labelledBy="gift-title" onEscape={() => onClose(false)}>
      <div className="gift-card">
        <h2 id="gift-title" className="gift-title">
          {open ? item.name : 'Un cadeau pour ta goutte !'}
        </h2>
        {open ? (
          <>
            <div className="gift-show" aria-hidden="true">
              <span className="gift-rays" />
              <GoutteArt look={{ ...look, [item.slot]: item.id }} stage={stage} mood="cheer" />
            </div>
            <p className="gift-sub">{NEW[item.slot]}{left > 0 ? ` · encore ${left} cadeau${left > 1 ? 'x' : ''}` : ''}</p>
            <div className="gift-actions">
              <button type="button" className="btn btn-primary" autoFocus onClick={() => onClose(true)}>
                {item.slot === 'color' ? 'Prendre cette couleur' : 'Le porter'}
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => onClose(false)}>
                Plus tard
              </button>
            </div>
          </>
        ) : (
          <>
            <button type="button" className="gift-box" autoFocus onClick={() => setOpen(true)} aria-label="Ouvrir le cadeau">
              <svg viewBox="0 0 120 120" aria-hidden="true" focusable="false">
                <g stroke="#1b1915" strokeWidth="4" strokeLinejoin="round">
                  <rect x="18" y="52" width="84" height="56" fill="#efe6d2" />
                  <rect x="54" y="52" width="12" height="56" fill="#b02a18" />
                  <g className="gift-lid">
                    <rect x="12" y="36" width="96" height="18" fill="#faf5e8" />
                    <rect x="54" y="36" width="12" height="18" fill="#b02a18" />
                    <path d="M60 36 C46 18 30 24 40 34 Z M60 36 C74 18 90 24 80 34 Z" fill="#b02a18" />
                  </g>
                </g>
              </svg>
            </button>
            <p className="gift-sub">Touche la boîte pour l’ouvrir.</p>
          </>
        )}
      </div>
    </Dialog>
  );
}
