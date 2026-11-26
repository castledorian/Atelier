import { useState } from 'react';
import * as T from '../../server/teacher';
import { Tip } from '../../components/Tip';

// ───────────────────────── Mon compte ─────────────────────────

/** Suppression du compte enseignant, en plusieurs étapes pour qu'on ne puisse pas la déclencher par erreur. */
export function AccountPanel({ email, act, onDeleted }: { email: string; act: <R>(f: () => Promise<R>) => Promise<R | undefined>; onDeleted: () => void }) {
  const [preview, setPreview] = useState<T.DeletionPreview[] | null>(null);
  const [typed, setTyped] = useState('');
  const [sure, setSure] = useState(false);
  const [busy, setBusy] = useState(false);
  const ready = typed.trim().toLowerCase() === email.trim().toLowerCase() && sure && !busy;
  const cancel = () => {
    setPreview(null);
    setTyped('');
    setSure(false);
  };
  return (
    <details className="fold sec">
      <summary>Mon compte</summary>
      <div className="mt-2 flex flex-col gap-3">
        {preview === null ? (
          <div className="danger">
            <p className="text-[15px] leading-snug">
              Supprimer mon compte enseignant
              <Tip label="Est-ce immédiat ?">Non : rien n’est supprimé avant les étapes de confirmation.</Tip>
            </p>
            <div className="mt-2">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={async () => {
                  const p = await act(() => T.accountDeletionPreview());
                  if (p) setPreview(p);
                }}
              >
                Supprimer mon compte…
              </button>
            </div>
          </div>
        ) : (
          <div className="danger" role="group" aria-label="Suppression du compte">
            <p className="text-[14px] font-bold">Ce qui va se passer</p>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-[14px] leading-snug">
              <li>
                Ton compte (<em>{email}</em>) et ton mot de passe sont supprimés <strong>définitivement</strong>.
              </li>
              {preview.length === 0 && <li>Tu n’as aucune école : rien d’autre n’est supprimé.</li>}
              {preview.map((s) =>
                s.members <= 1 ? (
                  <li key={s.name}>
                    L’école <strong>{s.name}</strong> est <strong>supprimée avec toi</strong> : {s.classes} classe{s.classes > 1 ? 's' : ''}, {s.students} élève
                    {s.students > 1 ? 's' : ''} et tous leurs scores (tu es le seul enseignant).
                  </li>
                ) : (
                  <li key={s.name}>
                    L’école <strong>{s.name}</strong> reste accessible aux {s.members - 1} autre{s.members > 2 ? 's' : ''} enseignant{s.members > 2 ? 's' : ''}.
                  </li>
                ),
              )}
            </ul>
            <p className="mt-2 text-[14px] leading-snug">
              Pour garder une trace, exporte d’abord les résultats de tes classes (bouton « Exporter » de chaque classe).
            </p>
            <label className="mt-2 flex flex-col gap-1 text-[14px]">
              Pour confirmer, recopie ton adresse e-mail&nbsp;: <em>{email}</em>
              <input className="field" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" spellCheck={false} />
            </label>
            <label className="mt-2 flex items-start gap-2 text-[14px]">
              <input type="checkbox" className="mt-1" checked={sure} onChange={(e) => setSure(e.target.checked)} />
              <span>Je comprends que la suppression est définitive et qu’on ne pourra rien récupérer.</span>
            </label>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" className="btn btn-primary" onClick={cancel}>
                Annuler
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                disabled={!ready}
                onClick={async () => {
                  setBusy(true);
                  const ok = await act(async () => {
                    await T.deleteMyAccount(typed.trim());
                    return true;
                  });
                  setBusy(false);
                  if (ok) onDeleted();
                }}
              >
                Supprimer définitivement mon compte
              </button>
            </div>
          </div>
        )}
      </div>
    </details>
  );
}
