import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { ApiError, explain } from '../server/api';
import { adminCreateInvitation, adminInvitations, adminRevokeInvitation, adminSetInviteOnly } from '../server/admin';
import type { AdminInvitations as Data } from '../server/admin';
import { Notice } from './Frame';

const day = (ms: number) => new Date(ms).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' });
const nice = (c: string) => `${c.slice(0, 4)} ${c.slice(4)}`;

/** Inviter des enseignants : un code par personne (ou par groupe) ; sans code, un compte ne peut pas créer d'école. */
export default function AdminInvitations({ onSignOut }: { onSignOut: () => void }) {
  const [data, setData] = useState<Data | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [label, setLabel] = useState('');
  const [uses, setUses] = useState(1);
  const [days, setDays] = useState(30);
  const [fresh, setFresh] = useState<string | null>(null);

  const act = useCallback(
    async <R,>(f: () => Promise<R>): Promise<R | undefined> => {
      setErr('');
      setBusy(true);
      try {
        return await f();
      } catch (e) {
        if (e instanceof ApiError && e.code === 'not_authenticated') onSignOut();
        else if (e instanceof ApiError && e.status === 404) setErr('La mise à jour « fiabilité » n’a pas encore été exécutée sur le serveur : collez serveur/mise-a-jour-fiabilite.sql dans Supabase.');
        else setErr(explain(e));
        return undefined;
      } finally {
        setBusy(false);
      }
    },
    [onSignOut],
  );

  const load = useCallback(async () => {
    const d = await act(adminInvitations);
    if (d) setData(d);
  }, [act]);
  useEffect(() => {
    void load();
  }, [load]);

  const create = async (e: FormEvent) => {
    e.preventDefault();
    const code = await act(() => adminCreateInvitation(label.trim(), uses, days));
    if (code) {
      setFresh(code);
      setLabel('');
      await load();
    }
  };
  const revoke = async (code: string) => {
    if (!window.confirm('Révoquer ce code ? Il ne pourra plus être utilisé (les enseignants déjà inscrits ne sont pas touchés).')) return;
    await act(() => adminRevokeInvitation(code));
    await load();
  };
  const toggle = async (on: boolean) => {
    await act(() => adminSetInviteOnly(on));
    await load();
  };

  const now = Date.now();
  return (
    <section className="sec mt-3" aria-labelledby="inv-h">
      <h2 id="inv-h" className="subhead">
        Inviter des enseignants
      </h2>
      {err && <Notice kind="error">{err}</Notice>}
      {data && (
        <p className="mt-2 text-[14px] leading-snug">
          {data.invite_only ? (
            <>
              <strong>Inscription sur invitation : activée.</strong> Tout le monde peut créer un compte, mais seul un enseignant qui saisit un code peut créer une école.
            </>
          ) : (
            <>
              <strong>Inscription sur invitation : désactivée.</strong> Tout enseignant avec un compte confirmé peut créer une école.
            </>
          )}{' '}
          <button type="button" className="link" disabled={busy} onClick={() => void toggle(!data.invite_only)}>
            {data.invite_only ? 'Désactiver' : 'Activer'}
          </button>
        </p>
      )}

      <form className="form mt-3" onSubmit={create} aria-label="Nouvelle invitation">
        <label className="subhead" htmlFor="inv-label">
          Pour qui ? (facultatif)
        </label>
        <input id="inv-label" className="field" value={label} maxLength={60} placeholder="Collègues de l’école Jules Ferry" onChange={(e) => setLabel(e.target.value)} />
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-[14px]">
            Utilisable{' '}
            <input className="field" type="number" min={1} max={200} value={uses} onChange={(e) => setUses(Math.max(1, Math.min(200, Number(e.target.value) || 1)))} style={{ width: '5em' }} /> fois
          </label>
          <label className="text-[14px]">
            Valable{' '}
            <input className="field" type="number" min={1} max={365} value={days} onChange={(e) => setDays(Math.max(1, Math.min(365, Number(e.target.value) || 1)))} style={{ width: '5em' }} /> jours
          </label>
        </div>
        <div>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            Créer un code
          </button>
        </div>
      </form>

      {fresh && (
        <Notice kind="ok">
          Code créé : <strong className="mono">{nice(fresh)}</strong> — à transmettre à l’enseignant (il le saisit à sa première connexion).
        </Notice>
      )}

      {data && data.items.length > 0 && (
        <div className="tbl-wrap mt-3">
          <table className="adm-table">
            <thead>
              <tr>
                <th scope="col">Code</th>
                <th scope="col">Pour</th>
                <th scope="col">Utilisé</th>
                <th scope="col">Expire</th>
                <th scope="col">
                  <span className="sr-only">Action</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((i) => {
                const over = i.revoked ? 'révoqué' : i.expires <= now ? 'expiré' : i.uses >= i.max_uses ? 'épuisé' : '';
                return (
                  <tr key={i.code}>
                    <td className="mono">{nice(i.code)}</td>
                    <td>{i.label || '—'}</td>
                    <td>
                      {i.uses} / {i.max_uses}
                    </td>
                    <td>{over ? over : day(i.expires)}</td>
                    <td>
                      {!over && (
                        <button type="button" className="link" disabled={busy} onClick={() => void revoke(i.code)}>
                          Révoquer
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {data && data.items.length === 0 && <p className="mt-3 text-[14px]">Aucune invitation pour l’instant.</p>}
    </section>
  );
}
