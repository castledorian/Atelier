import { useCallback, useState } from 'react';
import App from './App';
import BreakNotice from './components/BreakNotice';
import { useInstall } from './install';
import Course from './games/Course';
import Memory from './games/Memory';
import Spelling from './games/Spelling';
import Dashboard from './pages/Dashboard';
import Home from './pages/Home';
import Login from './pages/Login';
import Sessions from './pages/Sessions';
import Privacy from './pages/Privacy';
import { serverEnabled } from './server/api';
import { loadStudent, saveStudent, studentLogout } from './server/student';
import { loadTeacher, saveTeacher, signOut, takeAuthHash } from './server/teacher';
import type { TeacherSession } from './server/teacher';
import type { SessionInfo, StudentAccount } from './server/types';

type View = 'home' | 'login' | 'dashboard' | 'privacy' | 'sessions' | 'typing' | 'math' | 'memory' | 'spelling';

// Lien reçu par email (confirmation d'inscription / mot de passe oublié) : lu une seule fois, au chargement de la page.
const ARRIVAL = serverEnabled() ? takeAuthHash() : null;

/** Racine : accueil, connexion, espace enseignant et jeux. */
export default function Shell() {
  const [student, setStudent] = useState<StudentAccount | null>(() => (serverEnabled() ? loadStudent() : null));
  const [teacher, setTeacher] = useState<TeacherSession | null>(() => (serverEnabled() ? loadTeacher() : null));
  const [recovery, setRecovery] = useState(ARRIVAL?.type === 'recovery');
  const [tab, setTab] = useState<'student' | 'teacher'>('student');
  const [view, setView] = useState<View>(ARRIVAL ? (ARRIVAL.type === 'recovery' ? 'login' : 'dashboard') : 'home');

  /** séance de classe en cours de jeu (null = jeu libre) */
  const [active, setActive] = useState<SessionInfo | null>(null);
  /** jeu ouvert depuis le « i » de l'accueil : on commence par l'extrait */
  const [preview, setPreview] = useState(false);

  const install = useInstall();
  const home = useCallback(() => {
    setActive(null);
    setPreview(false);
    setView('home');
  }, []);
  const toSessions = useCallback(() => {
    setActive(null);
    setView('sessions');
  }, []);

  const logout = useCallback(() => {
    if (student) {
      void studentLogout(student.token);
      saveStudent(null);
      setStudent(null);
    }
    if (teacher) {
      void signOut(teacher);
      setTeacher(null);
    }
    setView('home');
  }, [student, teacher]);

  /** Session d'élève expirée : on repasse par la connexion. */
  const sessionLost = useCallback(() => {
    saveStudent(null);
    setStudent(null);
    setActive(null);
    setTab('student');
    setView('login');
  }, []);

  /** Déconnexion de l'enseignant quand sa session n'est plus valable. */
  const teacherLost = useCallback(() => {
    setTeacher(null);
    setTab('teacher');
    setView('login');
  }, []);

  if (view === 'privacy') return <Privacy onBack={home} />;

  if (view === 'login') {
    return (
      <Login
        onPrivacy={() => setView('privacy')}
        initialTab={tab}
        recovery={recovery}
        onBack={() => {
          setRecovery(false);
          home();
        }}
        onStudent={(a) => {
          saveStudent(a);
          setStudent(a);
          setTeacher(null);
          setView('home');
        }}
        onTeacher={(s) => {
          setRecovery(false);
          setTeacher(s ?? loadTeacher());
          saveStudent(null);
          setStudent(null);
          setView('dashboard');
        }}
      />
    );
  }

  if (view === 'dashboard' && teacher) {
    return (
      <Dashboard
        email={teacher.email}
        onHome={home}
        onSignOut={teacherLost}
        onAccountDeleted={() => {
          saveTeacher(null);
          setTeacher(null);
          setView('home');
        }}
      />
    );
  }

  if (view === 'sessions' && student) {
    return (
      <Sessions
        account={student}
        onBack={home}
        onSessionLost={sessionLost}
        onPlay={(s) => {
          setActive(s);
          setView(s.game);
        }}
      />
    );
  }

  if (view === 'typing' || view === 'math' || view === 'memory' || view === 'spelling') {
    const props = { key: `${active?.id ?? 'free'}${preview ? '-preview' : ''}`, account: student, onHome: home, onSessionLost: sessionLost, session: active, onSessions: toSessions, startPreview: preview };
    const { key, ...rest } = props;
    return (
      <>
        {view === 'typing' && <App key={key} {...rest} install={install} />}
        {view === 'math' && <Course key={key} {...rest} />}
        {view === 'memory' && <Memory key={key} {...rest} />}
        {view === 'spelling' && <Spelling key={key} {...rest} />}
        {active === null && <BreakNotice key={view} />}
      </>
    );
  }

  return (
    <Home
      student={student}
      teacher={teacher}
      onPlay={(g) => {
        setActive(null);
        setPreview(false);
        setView(g);
      }}
      onPreview={(g) => {
        setActive(null);
        setPreview(true);
        setView(g);
      }}
      onSessions={() => setView('sessions')}
      onLogin={(t) => {
        setTab(t);
        setView('login');
      }}
      onDashboard={() => setView('dashboard')}
      onPrivacy={() => setView('privacy')}
      onLogout={logout}
      install={install}
    />
  );
}
