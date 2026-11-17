import { useEffect, useLayoutEffect, useRef } from 'react';
import type { ReactNode } from 'react';

/**
 * Une carte (menu de jeu, « Comment jouer », « Scores »…) qui tient toujours dans l'écran.
 * Si le contenu dépasse, la carte est réduite d'un cran (zoom) jusqu'à rentrer, au lieu de faire défiler :
 * en classe, un écran qui défile fait perdre des élèves, et le bas de la carte (les boutons) passe inaperçu.
 * Réduction limitée à 65 % du zoom de départ pour que le texte reste lisible ; en dessous, la carte défile comme avant.
 * Le zoom de départ est celui de la feuille de style (grand écran / TBI : 1,3 ; texte agrandi : 1,08 ou 1,16) :
 * on réduit À PARTIR de lui, jamais depuis 1 — sinon la carte rétrécirait bien plus que les autres écrans.
 * Navigateurs anciens sans `zoom` : rien ne change, la carte défile (comportement d'origine).
 */

const MIN = 0.65;

export function useFit<T extends HTMLElement>(key?: unknown) {
  const ref = useRef<T | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;

    const apply = () => {
      el.style.zoom = '';
      const base = Number(getComputedStyle(el).zoom) || 1;
      const floor = MIN * base;
      // plusieurs passes : après réduction, le texte se replie autrement et libère parfois assez de place
      for (let i = 0; i < 4; i++) {
        const over = el.scrollHeight - el.clientHeight;
        if (over <= 1) break;
        const cur = Number(el.style.zoom) || base;
        const next = Math.max(floor, Math.floor(cur * (el.clientHeight / el.scrollHeight) * 100) / 100);
        if (next >= cur) break;
        el.style.zoom = String(next);
      }
    };
    const run = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(apply);
    };

    run();
    // la police d'écriture arrive parfois après le premier calcul
    const later = window.setTimeout(run, 350);
    // on observe le parent (et non la carte) : mesurer la carte pendant qu'on la réduit tournerait en boucle
    const ro = el.parentElement ? new ResizeObserver(run) : null;
    if (ro && el.parentElement) ro.observe(el.parentElement);
    window.addEventListener('resize', run);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(later);
      ro?.disconnect();
      window.removeEventListener('resize', run);
      el.style.zoom = '';
    };
  }, [key]);

  return ref;
}

/** Carte d'écran de jeu qui s'ajuste à la hauteur disponible. `fitKey` : change quand le contenu change. */
export function FitCard({
  className,
  children,
  fitKey,
  labelledBy,
  role,
  modal,
}: {
  className: string;
  children: ReactNode;
  fitKey?: unknown;
  labelledBy?: string;
  role?: 'dialog';
  modal?: boolean;
}) {
  const ref = useFit<HTMLElement>(fitKey);
  return (
    <section ref={ref} className={className} aria-labelledby={labelledBy} role={role} aria-modal={modal || undefined}>
      {children}
    </section>
  );
}

/**
 * Empêche la page du dessous de défiler pendant qu'une fenêtre (extrait, dialogue) est ouverte :
 * sinon un doigt ou une molette fait glisser l'accueil derrière la fenêtre.
 */
export function useLockScroll(on = true) {
  useEffect(() => {
    if (!on) return;
    const body = document.body;
    const before = body.style.overflow;
    body.style.overflow = 'hidden';
    return () => {
      body.style.overflow = before;
    };
  }, [on]);
}
