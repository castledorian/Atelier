import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

/**
 * Bulle d'information : un petit « i » à côté d'un titre ou d'un chiffre. Le détail n'encombre pas la page :
 * il s'affiche au survol de la souris, au clavier (Tab) et d'un toucher sur tablette ; Échap ou un toucher ailleurs le ferme.
 * La bulle est placée en position fixe et gardée dans l'écran (jamais rognée par un tableau qui défile).
 */
export function Tip({ children, label = 'Plus d’informations' }: { children: ReactNode; label?: string }) {
  const id = useId();
  const btn = useRef<HTMLButtonElement>(null);
  const box = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number; below: boolean } | null>(null);

  const close = useCallback(() => {
    setOpen(false);
    setPinned(false);
  }, []);

  useLayoutEffect(() => {
    if (!open || !btn.current || !box.current) return;
    const b = btn.current.getBoundingClientRect();
    const w = box.current.offsetWidth;
    const h = box.current.offsetHeight;
    const vw = document.documentElement.clientWidth;
    const left = Math.max(8, Math.min(vw - w - 8, b.left + b.width / 2 - w / 2));
    const below = b.top - h - 10 < 8;
    setPos({ left, top: below ? b.bottom + 8 : b.top - h - 8, below });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => e.key === 'Escape' && close();
    const away = (e: PointerEvent) => {
      if (btn.current?.contains(e.target as Node) || box.current?.contains(e.target as Node)) return;
      close();
    };
    window.addEventListener('keydown', key);
    window.addEventListener('pointerdown', away);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('keydown', key);
      window.removeEventListener('pointerdown', away);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [open, close]);

  return (
    <>
      <button
        ref={btn}
        type="button"
        className="tip-i"
        aria-label={label}
        aria-describedby={open ? id : undefined}
        aria-expanded={open}
        onPointerEnter={(e) => e.pointerType === 'mouse' && setOpen(true)}
        onPointerLeave={(e) => e.pointerType === 'mouse' && !pinned && setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => !pinned && setOpen(false)}
        onClick={() => {
          setPinned((p) => !p || !open);
          setOpen((o) => !(o && pinned));
        }}
      >
        <span aria-hidden="true">i</span>
      </button>
      {open && (
        <span
          ref={box}
          id={id}
          role="tooltip"
          className={`tip-box${pos?.below ? ' tip-below' : ''}`}
          style={pos ? { left: pos.left, top: pos.top } : { left: -9999, top: 0 }}
        >
          {children}
        </span>
      )}
    </>
  );
}
