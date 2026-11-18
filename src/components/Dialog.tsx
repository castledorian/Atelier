import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';

/** Référence vers un élément (compatible avec useRef et useFit, quelle que soit la version de React). */
type ElRef = { current: HTMLElement | null };

/**
 * Fenêtre modale accessible (modèle WAI-ARIA « dialog ») :
 *  - le focus entre dans la fenêtre à l'ouverture et y reste (Tab / Maj+Tab bouclent) ;
 *  - le reste de la page devient inerte (ni clavier, ni lecteur d'écran, ni clic) tant qu'elle est ouverte ;
 *  - Échap la ferme quand on lui donne `onEscape` ;
 *  - à la fermeture, le focus retourne là où il était.
 * Plusieurs fenêtres peuvent s'empiler : seule la dernière ouverte réagit au clavier.
 * Navigateurs sans `inert` : le piège à focus par clavier continue de fonctionner.
 */

const FOCUSABLE = 'a[href], button, input, select, textarea, summary, [tabindex]';

/** Éléments qu'on peut atteindre au clavier dans une fenêtre (visibles, non désactivés, hors tabindex=-1). */
export function focusablesIn(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => {
    if ((el as HTMLButtonElement).disabled || el.getAttribute('tabindex') === '-1' || el.closest('[inert]')) return false;
    if (el instanceof HTMLInputElement && el.type === 'hidden') return false;
    return el.getClientRects().length > 0;
  });
}

/** Fenêtres ouvertes, la plus récente en dernier. */
const stack: HTMLElement[] = [];
/** Éléments rendus inertes par nos fenêtres, avec le nombre de fenêtres qui les tiennent. */
const held = new Map<Element, number>();

/** Rend inerte tout ce qui entoure la fenêtre (les frères de chacun de ses ancêtres). Renvoie la fonction qui annule. */
function isolate(dialog: HTMLElement): () => void {
  const mine: Element[] = [];
  for (let node: HTMLElement | null = dialog; node && node !== document.body; node = node.parentElement) {
    const parent: HTMLElement | null = node.parentElement;
    if (!parent) break;
    for (const sib of Array.from(parent.children)) {
      if (sib === node || sib instanceof HTMLScriptElement || sib instanceof HTMLStyleElement) continue;
      if (!held.has(sib) && sib.hasAttribute('inert')) continue; // déjà inerte pour une autre raison : on n'y touche pas
      held.set(sib, (held.get(sib) ?? 0) + 1);
      sib.setAttribute('inert', '');
      mine.push(sib);
    }
  }
  return () => {
    for (const el of mine) {
      const n = (held.get(el) ?? 1) - 1;
      if (n <= 0) {
        held.delete(el);
        el.removeAttribute('inert');
      } else held.set(el, n);
    }
  };
}

/** À appeler dans le composant de la fenêtre ; `ref` désigne l'élément de la fenêtre. */
export function useDialog(ref: ElRef, onEscape?: () => void) {
  const esc = useRef(onEscape);
  esc.current = onEscape;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    stack.push(el);
    const release = isolate(el);

    // le focus entre dans la fenêtre (sans surligner un bouton si rien n'a été prévu)
    if (!el.contains(document.activeElement)) {
      if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1');
      el.focus({ preventScroll: true });
    }

    const onKey = (e: KeyboardEvent) => {
      if (stack[stack.length - 1] !== el) return; // une fenêtre plus récente est ouverte au-dessus
      if (e.key === 'Escape' && esc.current) {
        e.preventDefault();
        e.stopPropagation(); // le jeu qui se trouve derrière ne doit pas réagir à la même touche
        esc.current();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = focusablesIn(el);
      if (items.length === 0) {
        e.preventDefault();
        el.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === el || !el.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !el.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKey, true);

    return () => {
      window.removeEventListener('keydown', onKey, true);
      const i = stack.lastIndexOf(el);
      if (i >= 0) stack.splice(i, 1);
      release();
      if (opener && opener !== document.body && opener.isConnected) opener.focus({ preventScroll: true });
    };
  }, [ref]);
}

interface DialogProps {
  className?: string;
  /** id du titre de la fenêtre */
  labelledBy: string;
  /** id du texte qui décrit la fenêtre (pour une alerte) */
  describedBy?: string;
  role?: 'dialog' | 'alertdialog';
  as?: 'section' | 'div';
  onEscape?: () => void;
  /** pour partager l'élément avec un autre hook (par exemple useFit) */
  innerRef?: ElRef;
  children: ReactNode;
}

export function Dialog({ className, labelledBy, describedBy, role = 'dialog', as = 'section', onEscape, innerRef, children }: DialogProps) {
  const own = useRef<HTMLElement | null>(null);
  const ref = innerRef ?? own;
  useDialog(ref, onEscape);
  const props = { ref: ref as never, className, role, 'aria-modal': true as const, 'aria-labelledby': labelledBy, 'aria-describedby': describedBy };
  return as === 'div' ? <div {...props}>{children}</div> : <section {...props}>{children}</section>;
}
