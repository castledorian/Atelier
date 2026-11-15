import type { ReactNode } from 'react';

/** Cadre commun des pages hors jeu (accueil, connexion, espace école) : la même feuille sur le même bureau. */
export function Frame({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return (
    <div className="desk">
      <main className="sheet">
        <div className="page">
          <div className={wide ? 'page-in page-wide' : 'page-in'}>{children}</div>
        </div>
      </main>
    </div>
  );
}

export function Notice({ kind = 'info', children }: { kind?: 'info' | 'error' | 'ok'; children: ReactNode }) {
  return (
    <p className={`notice notice-${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
      {children}
    </p>
  );
}
