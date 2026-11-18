import { useEffect, useState } from 'react';
import { Notice } from '../pages/Frame';
import { fetchServerVersion } from '../server/version';
import { cronMissing, hasCritical, todoFor } from '../server/versionLogic';
import type { ServerVersion } from '../server/versionLogic';

/** Lit la version de la base une fois à l'ouverture de l'espace connecté (rien n'est affiché tant qu'on ne sait pas). */
function useServerVersion(): ServerVersion | null {
  const [v, setV] = useState<ServerVersion | null>(null);
  useEffect(() => {
    let live = true;
    void fetchServerVersion().then((r) => live && setV(r));
    return () => {
      live = false;
    };
  }, []);
  return v;
}

/**
 * Avertissement « la base du serveur n'est pas à jour ».
 *  - enseignant : une phrase, seulement si une mise à jour importante manque (il ne peut rien y faire lui-même) ;
 *  - administrateur : la liste des fichiers SQL à exécuter, dans l'ordre.
 */
export function ServerNotice({ mode }: { mode: 'teacher' | 'admin' }) {
  const v = useServerVersion();
  if (!v) return null;
  const todo = todoFor(v);
  const cron = cronMissing(v);

  if (mode === 'teacher') {
    if (!hasCritical(v)) return null;
    return (
      <Notice kind="error">
        Le serveur n’est pas complètement à jour : certaines fonctions peuvent manquer ou mal fonctionner. Préviens l’administrateur du site.
      </Notice>
    );
  }

  if (todo.length === 0 && !cron) return null;
  return (
    <div className={`notice ${hasCritical(v) ? 'notice-error' : 'notice-info'}`} role={hasCritical(v) ? 'alert' : 'status'}>
      <p>
        <strong>La base de données du serveur n’est pas à jour.</strong> Dans Supabase → SQL Editor, exécute dans cet ordre :
      </p>
      {todo.length > 0 && (
        <ol className="mt-1 list-decimal pl-5 text-[14px] leading-snug">
          {todo.map((t) => (
            <li key={t.file}>
              <code>serveur/{t.file}</code> — {t.why.join(', ')}
              {t.critical ? ' (important)' : ''}
            </li>
          ))}
        </ol>
      )}
      {cron && (
        <p className="mt-1 text-[14px] leading-snug">
          L’effacement automatique des anciennes données n’est pas programmé : active l’extension <code>pg_cron</code> (Database → Extensions), puis relance{' '}
          <code>mise-a-jour-fiabilite.sql</code>.
        </p>
      )}
    </div>
  );
}
