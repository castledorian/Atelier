import { BackButton } from '../../components/BackButton';
import { APP_VERSION, hasUnreadNews } from '../../content/changelog';
import { Frame } from '../Frame';
import type { ReactNode } from 'react';

/** Pages d'information du site (hors jeux) : on passe de l'une à l'autre par le pied de page. */
export type InfoView = 'news' | 'about' | 'a11y' | 'privacy' | 'credits' | 'contact';

const LINKS: Array<{ id: InfoView; label: string }> = [
  { id: 'news', label: 'Nouveautés' },
  { id: 'about', label: 'À propos' },
  { id: 'a11y', label: 'Accessibilité' },
  { id: 'privacy', label: 'Confidentialité' },
  { id: 'credits', label: 'Crédits' },
  { id: 'contact', label: 'Contact' },
];

export const isInfoView = (v: string): v is InfoView => LINKS.some((l) => l.id === v);

/** Pied de page commun : accueil et pages d'information. */
export function SiteFooter({ current, onNav }: { current?: InfoView; onNav: (v: InfoView) => void }) {
  const unread = current !== 'news' && hasUnreadNews();
  return (
    <footer className="site-foot no-print">
      <nav aria-label="Informations sur le site">
        <ul className="site-foot-links">
          {LINKS.map((l) => (
            <li key={l.id}>
              <button type="button" className="foot-link" aria-current={current === l.id ? 'page' : undefined} onClick={() => onNav(l.id)}>
                {l.label}
                {l.id === 'news' && unread && (
                  <>
                    <span className="new-dot" aria-hidden="true" />
                    <span className="sr-only"> (nouveau)</span>
                  </>
                )}
              </button>
            </li>
          ))}
        </ul>
      </nav>
      <p className="site-foot-line">
        Atelier · version {APP_VERSION} · Pas de pub, pas de cookie.
      </p>
    </footer>
  );
}

export function Page({ id, eyebrow, title, intro, onBack, onNav, children }: { id: InfoView; eyebrow: string; title: string; intro?: string; onBack: () => void; onNav: (v: InfoView) => void; children: ReactNode }) {
  return (
    <Frame wide>
      <div className="card-top no-print">
        <BackButton onClick={onBack} label="Accueil" autoFocus />
      </div>
      <p className="eyebrow">{eyebrow}</p>
      <h1 className="title-sm">{title}</h1>
      <div className="rule" aria-hidden="true" />
      {intro && <p className="mt-3 text-[15px] leading-snug">{intro}</p>}
      {children}
      <SiteFooter current={id} onNav={onNav} />
    </Frame>
  );
}

export function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section className="sec" aria-labelledby={id}>
      <h2 id={id} className="subhead mb-2">
        {title}
      </h2>
      <div className="space-y-2 text-[15px] leading-snug">{children}</div>
    </section>
  );
}

/** Section repliable : le titre reste un vrai titre (h2) pour les lecteurs d'écran, le contenu s'ouvre au clic ou à la touche Entrée. */
export function Fold({ id, title, open, children }: { id: string; title: string; open?: boolean; children: ReactNode }) {
  return (
    <details className="fold sec info-fold" open={open}>
      <summary>
        <h2 id={id} className="info-h">
          {title}
        </h2>
      </summary>
      <div className="info-in">{children}</div>
    </details>
  );
}

/** Trois repères chiffrés en tête de page : l'essentiel d'un coup d'œil. */
export function Facts({ items }: { items: Array<{ big: string; small: string }> }) {
  return (
    <ul className="facts">
      {items.map((f) => (
        <li key={f.small}>
          <span className="fact-big">{f.big}</span>
          <span className="fact-small">{f.small}</span>
        </li>
      ))}
    </ul>
  );
}

/** Ouvre ou ferme toutes les sections repliables de la page (impression, lecture d'un bloc). */
export function setAllFolds(open: boolean) {
  document.querySelectorAll<HTMLDetailsElement>('details.info-fold').forEach((d) => {
    d.open = open;
  });
}

export const ul = 'list-disc space-y-1 pl-5';

export interface PageProps {
  onBack: () => void;
  onNav: (v: InfoView) => void;
}
