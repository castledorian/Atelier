import { memo } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { LAYOUTS, fingerOf } from '../game/layouts';
import type { Layout } from '../game/storage';

interface Props {
  layout: Layout;
  hint: string | null;
  chargeReady: boolean;
  /** colore les touches selon le doigt qui doit les frapper (aide à l'apprentissage) */
  fingers?: boolean;
  onKey: (ch: string) => void;
  onRelease: () => void;
  /** absent : la touche « retour chariot » n'est pas affichée (jeux sans charge) */
  onChariot?: () => void;
}

/**
 * Clavier tactile : réagit dès `pointerdown` (aucun délai de clic),
 * gère le multi-touch et ne prend jamais le focus.
 */
export const Keyboard = memo(function Keyboard({
  layout,
  hint,
  chargeReady,
  fingers = false,
  onKey,
  onRelease,
  onChariot,
}: Props) {
  const rows = LAYOUTS[layout];
  const press = (e: ReactPointerEvent<HTMLButtonElement>, fn: () => void) => {
    e.preventDefault();
    e.currentTarget.classList.add('is-down');
    fn();
  };
  const lift = (e: ReactPointerEvent<HTMLButtonElement>) => {
    e.currentTarget.classList.remove('is-down');
  };
  const common = {
    type: 'button' as const,
    tabIndex: -1,
    onPointerUp: lift,
    onPointerCancel: lift,
    onPointerLeave: lift,
  };

  return (
    <div
      className="kb"
      role="group"
      aria-label="Clavier à l’écran"
      onContextMenu={(e) => e.preventDefault()}
    >
      {rows.map((row, i) => (
        <div key={row} className={`kb-row${row.length === 9 ? ' kb-row-inset' : ''}`}>
          {i === 2 && onChariot && (
            <button
              {...common}
              className={`kb-key kb-wide${chargeReady ? ' is-ready' : ''}`}
              aria-label={chargeReady ? 'Retour chariot (prêt)' : 'Retour chariot (en charge)'}
              onPointerDown={(e) => press(e, onChariot)}
            >
              ↵
            </button>
          )}
          {row.split('').map((ch) => (
            <button
              {...common}
              key={ch}
              className={`kb-key${hint === ch ? ' is-hint' : ''}`}
              data-f={fingers ? fingerOf(ch, layout) : undefined}
              onPointerDown={(e) => press(e, () => onKey(ch))}
            >
              {ch.toUpperCase()}
            </button>
          ))}
          {i === 2 && (
            <button
              {...common}
              className="kb-key kb-wide"
              aria-label="Lâcher la cible"
              onPointerDown={(e) => press(e, onRelease)}
            >
              ⌫
            </button>
          )}
        </div>
      ))}
    </div>
  );
});
