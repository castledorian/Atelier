import { useState } from 'react';
import type { FormEvent } from 'react';
import * as T from '../../server/teacher';
import { Tip } from '../../components/Tip';
import type { ClassRow, School } from '../../server/types';
import type { Act } from './shared';

// ───────────────────────── Formulaires simples ─────────────────────────

/** Première connexion d'un enseignant : le site est ouvert sur invitation, il faut le code donné par l'administrateur. */
export function InviteForm({ onAccepted, act }: { onAccepted: () => void; act: Act }) {
  const [code, setCode] = useState('');
  const [bad, setBad] = useState(false);
  const [busy, setBusy] = useState(false);
  const go = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setBad(false);
    const ok = await act(() => T.redeemInvitation(code));
    setBusy(false);
    if (ok === true) onAccepted();
    else if (ok === false) setBad(true);
  };
  return (
    <form className="form mt-4" onSubmit={go} aria-label="Code d’invitation">
      <h2 className="subhead">
        Code d’invitation
        <Tip label="D’où vient ce code ?">Créer une école demande un code donné par l’administrateur du site.</Tip>
      </h2>
      <label className="subhead" htmlFor="inv-code">
        Ton code
      </label>
      <input
        id="inv-code"
        className="field"
        value={code}
        maxLength={12}
        size={12}
        placeholder="XXXX XXXX"
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        aria-describedby={bad ? 'inv-bad' : undefined}
        autoFocus
      />
      {bad && (
        <p id="inv-bad" className="text-[14px]" role="alert">
          Ce code n’est pas valable : il est faux, expiré ou déjà utilisé. Vérifie-le ou demande-en un nouveau.
        </p>
      )}
      <div>
        <button type="submit" className="btn btn-primary" disabled={busy || code.replace(/[^A-Z0-9]/gi, '').length < 8}>
          Valider le code
        </button>
      </div>
    </form>
  );
}

export function NameForm({
  title,
  text,
  label,
  placeholder,
  button,
  busy,
  onSubmit,
}: {
  title: string;
  text: string;
  label: string;
  placeholder: string;
  button: string;
  busy: boolean;
  onSubmit: (name: string) => void;
}) {
  const [name, setName] = useState('');
  const go = (e: FormEvent) => {
    e.preventDefault();
    if (name.trim().length >= 1) onSubmit(name.trim());
  };
  return (
    <form className="form mt-4" onSubmit={go} aria-label={title}>
      <h2 className="subhead">
        {title}
        <Tip label={`À propos : ${title}`}>{text}</Tip>
      </h2>
      <label className="subhead" htmlFor="nf-name">
        {label}
      </label>
      <input
        id="nf-name"
        className="field"
        value={name}
        maxLength={80}
        placeholder={placeholder}
        onChange={(e) => setName(e.target.value)}
        autoFocus
      />
      <div>
        <button type="submit" className="btn btn-primary" disabled={busy || name.trim().length < 2}>
          {button}
        </button>
      </div>
    </form>
  );
}

export function SchoolBar({
  schools,
  schoolId,
  onPick,
  onCreate,
  onDelete,
  schoolName,
}: {
  schools: School[];
  schoolId: string | null;
  onPick: (id: string) => void;
  onCreate: (name: string) => void;
  onDelete: () => void;
  schoolName: string;
}) {
  const [adding, setAdding] = useState('');
  const [typed, setTyped] = useState('');
  return (
    <details className="fold sec">
      <summary>École{schools.length > 1 ? 's' : ''} · gérer</summary>
      <div className="mt-2 flex flex-col gap-3">
        {schools.length > 1 && (
          <label className="flex items-center gap-2 text-[14px]">
            École
            <select className="field" value={schoolId ?? ''} onChange={(e) => onPick(e.target.value)}>
              {schools.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {schools.length < 3 && (
          <form
            className="flex flex-wrap items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (adding.trim().length >= 2) {
                onCreate(adding.trim());
                setAdding('');
              }
            }}
          >
            <input
              className="field"
              placeholder="Nom d’une autre école"
              aria-label="Nom d’une autre école"
              value={adding}
              maxLength={80}
              onChange={(e) => setAdding(e.target.value)}
            />
            <button type="submit" className="btn btn-ghost" disabled={adding.trim().length < 2}>
              Ajouter une école
            </button>
          </form>
        )}
        <div className="danger">
          <p className="text-[14px] leading-snug">
            <strong>Supprimer l’école</strong> efface définitivement ses classes, ses élèves et tous leurs scores. Pour confirmer, recopie
            son nom&nbsp;: <em>{schoolName}</em>
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <input className="field" aria-label="Recopier le nom de l’école" value={typed} onChange={(e) => setTyped(e.target.value)} />
            <button type="button" className="btn btn-ghost" disabled={typed.trim() !== schoolName} onClick={onDelete}>
              Supprimer définitivement
            </button>
          </div>
        </div>
      </div>
    </details>
  );
}

export function ClassBar({
  classes,
  classId,
  onPick,
  onCreate,
}: {
  classes: ClassRow[];
  classId: string | null;
  onPick: (id: string) => void;
  onCreate: (name: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  return (
    <div className="class-bar" role="tablist" aria-label="Classes">
      {classes.map((c) => (
        <button key={c.id} type="button" role="tab" aria-selected={c.id === classId} className="class-tab" onClick={() => onPick(c.id)}>
          {c.name}
        </button>
      ))}
      {adding ? (
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) {
              onCreate(name.trim());
              setName('');
              setAdding(false);
            }
          }}
        >
          <input
            className="field"
            autoFocus
            aria-label="Nom de la nouvelle classe"
            placeholder="CM1 B"
            value={name}
            maxLength={40}
            onChange={(e) => setName(e.target.value)}
          />
          <button type="submit" className="btn btn-ghost" disabled={!name.trim()}>
            Créer
          </button>
        </form>
      ) : (
        <button type="button" className="class-tab class-add" onClick={() => setAdding(true)}>
          + Nouvelle classe
        </button>
      )}
    </div>
  );
}
