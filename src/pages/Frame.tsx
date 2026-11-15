import type { ReactNode } from 'react';

/** Cadre commun des pages hors jeu (accueil, connexion, espace école) : la même feuille sur le même bureau. */
export function Frame({ children, wide = false, fill = false }: { children: ReactNode; wide?: boolean; fill?: boolean }) {
  return (
    <div className="desk">
      <main className="sheet">
        <div className="page">
          <div className={`page-in${wide ? ' page-wide' : ''}${fill ? ' page-fill' : ''}`}>{children}</div>
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
