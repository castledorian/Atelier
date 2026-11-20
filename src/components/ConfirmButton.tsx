import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';

/**
 * Bouton qui demande une seconde touche avant d'effacer : « Effacer » → « Confirmer ».
 * Remplace la boîte du navigateur (`window.confirm`), peu lisible sur tablette : ici, tout reste dans la page, au même endroit.
 * La demande se referme seule après 6 secondes ou quand le bouton perd le focus.
 */
export function ConfirmButton({
  children,
  confirm = 'Confirmer',
  onConfirm,
  className = 'btn btn-ghost',
}: {
  children: ReactNode;
  confirm?: string;
  onConfirm: () => void;
  className?: string;
}) {
  const [asked, setAsked] = useState(false);
  useEffect(() => {
    if (!asked) return;
    const t = window.setTimeout(() => setAsked(false), 6000);
    return () => window.clearTimeout(t);
  }, [asked]);
  return (
    <button
      type="button"
      className={className}
      aria-live="polite"
      onClick={() => {
        if (asked) {
          setAsked(false);
          onConfirm();
        } else setAsked(true);
      }}
      onBlur={() => setAsked(false)}
    >
      {asked ? confirm : children}
    </button>
  );
}
