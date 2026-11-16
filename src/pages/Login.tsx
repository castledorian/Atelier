import { BackButton } from '../components/BackButton';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { Frame, Notice } from './Frame';
import { explain } from '../server/api';
import { studentLogin } from '../server/student';
import type { StudentAccount } from '../server/types';
import { recover, signIn, signUp, updatePassword, freshToken } from '../server/teacher';
import type { TeacherSession } from '../server/teacher';

interface LoginProps {
  initialTab: 'student' | 'teacher';
  /** arrivée par le lien « mot de passe oublié » reçu par email */
  recovery: boolean;
  onStudent: (a: StudentAccount) => void;
  onTeacher: (s: TeacherSession | null) => void;
  onBack: () => void;
  onPrivacy: () => void;
}

export default function Login({ initialTab, recovery, onStudent, onTeacher, onBack, onPrivacy }: LoginProps) {
  const [tab, setTab] = useState<'student' | 'teacher'>(recovery ? 'teacher' : initialTab);
  return (
    <Frame>
      <div className="card-top">
        <BackButton onClick={onBack} />
      </div>
      <p className="eyebrow">Connexion</p>
      <h1 className="title-sm">Qui joue&nbsp;?</h1>
      <div className="rule" aria-hidden="true" />

      {!recovery && (
        <div className="seg seg-big mt-[var(--sp)]" role="tablist" aria-label="Type de compte">
          <button type="button" role="tab" aria-selected={tab === 'student'} className="seg-b" onClick={() => setTab('student')}>
            Élève
          </button>
          <button type="button" role="tab" aria-selected={tab === 'teacher'} className="seg-b" onClick={() => setTab('teacher')}>
            Enseignant
          </button>
        </div>
      )}

      {tab === 'student' ? <StudentForm onDone={onStudent} /> : <TeacherForm recovery={recovery} onDone={onTeacher} />}
      <p className="mt-4 text-[13px] text-ink/75">
        {tab === 'student' ? 'Ton enseignant voit ton prénom et tes résultats. ' : ''}
        <button type="button" className="link" onClick={onPrivacy}>
          Confidentialité
        </button>
      </p>
    </Frame>
  );
}

function StudentForm({ onDone }: { onDone: (a: StudentAccount) => void }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const clean = code.toUpperCase().replace(/[^A-Z0-9]/g, '');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (clean.length !== 8 || busy) return;
    setBusy(true);
    setErr('');
    try {
      onDone(await studentLogin(clean));
    } catch (x) {
      setErr(explain(x));
      setBusy(false);
    }
  };

  return (
    <form className="form" onSubmit={submit} aria-label="Connexion élève">
      <p className="text-[15px] leading-snug">Tape le code personnel que ton enseignant t’a donné.</p>
      <label className="subhead" htmlFor="s-code">
        Ton code (8 caractères)
      </label>
      <input
        id="s-code"
        className="field code-input"
        value={code}
        maxLength={11}
        inputMode="text"
        autoComplete="off"
        autoCapitalize="characters"
        autoCorrect="off"
        spellCheck={false}
        autoFocus
        placeholder="ABCD 2345"
        onChange={(e) => setCode(e.target.value.toUpperCase())}
      />
      {err && <Notice kind="error">{err}</Notice>}
      <div>
        <button type="submit" className="btn btn-primary" disabled={clean.length !== 8 || busy}>
          {busy ? 'Connexion…' : 'Entrer'}
        </button>
      </div>
    </form>
  );
}

type Mode = 'login' | 'signup' | 'recover' | 'newpass';

function TeacherForm({ recovery, onDone }: { recovery: boolean; onDone: (s: TeacherSession | null) => void }) {
  const [mode, setMode] = useState<Mode>(recovery ? 'newpass' : 'login');
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [info, setInfo] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setErr('');
    setInfo('');
    if (mode !== 'recover' && pw.length < 8) {
      setErr('Le mot de passe doit faire au moins 8 caractères.');
      return;
    }
    setBusy(true);
    try {
      if (mode === 'login') {
        onDone(await signIn(email.trim(), pw));
        return;
      }
      if (mode === 'signup') {
        const s = await signUp(email.trim(), pw);
        if (s) {
          onDone(s);
          return;
        }
        setInfo('Compte créé. Un email de confirmation vient de t’être envoyé : clique sur le lien qu’il contient, puis reviens te connecter ici.');
        setMode('login');
      } else if (mode === 'recover') {
        await recover(email.trim());
        setInfo('Si cette adresse a un compte, un email vient de partir avec un lien pour choisir un nouveau mot de passe.');
        setMode('login');
      } else {
        await updatePassword(await freshToken(), pw);
        onDone(null); // la session issue du lien est déjà enregistrée
        return;
      }
    } catch (x) {
      setErr(explain(x));
    }
    setBusy(false);
  };

  const title = { login: 'Connexion enseignant', signup: 'Créer un compte enseignant', recover: 'Mot de passe oublié', newpass: 'Choisis un nouveau mot de passe' }[mode];

  return (
    <form className="form" onSubmit={submit} aria-label={title}>
      <h2 className="subhead">{title}</h2>
      {mode === 'signup' && (
        <p className="text-[14px] leading-snug text-ink/80">
          Le compte est gratuit. Tu pourras ensuite créer ton école, tes classes et les codes de tes élèves.
        </p>
      )}
      {mode !== 'newpass' && (
        <>
          <label className="subhead" htmlFor="t-mail">
            Email
          </label>
          <input id="t-mail" className="field" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </>
      )}
      {mode !== 'recover' && (
        <>
          <label className="subhead" htmlFor="t-pw">
            {mode === 'newpass' ? 'Nouveau mot de passe' : 'Mot de passe'} (8 caractères minimum)
          </label>
          <input
            id="t-pw"
            className="field"
            type="password"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            required
          />
        </>
      )}
      {info && <Notice kind="ok">{info}</Notice>}
      {err && <Notice kind="error">{err}</Notice>}
      <div>
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? 'Un instant…' : { login: 'Me connecter', signup: 'Créer mon compte', recover: 'Envoyer le lien', newpass: 'Enregistrer' }[mode]}
        </button>
      </div>
      {mode !== 'newpass' && (
        <div className="form-links">
          {mode !== 'login' && (
            <button type="button" className="link" onClick={() => setMode('login')}>
              J’ai déjà un compte
            </button>
          )}
          {mode !== 'signup' && (
            <button type="button" className="link" onClick={() => setMode('signup')}>
              Créer un compte
            </button>
          )}
          {mode === 'login' && (
            <button type="button" className="link" onClick={() => setMode('recover')}>
              Mot de passe oublié
            </button>
          )}
        </div>
      )}
    </form>
  );
}
