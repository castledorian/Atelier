import { useCallback, useState } from 'react';
import App from './App';
import { useInstall } from './install';
import MathGame from './games/MathGame';
import Dashboard from './pages/Dashboard';
import Home from './pages/Home';
import Login from './pages/Login';
import { serverEnabled } from './server/api';
import { loadStudent, saveStudent, studentLogout } from './server/student';
import { loadTeacher, signOut, takeAuthHash } from './server/teacher';
import type { TeacherSession } from './server/teacher';
import type { StudentAccount } from './server/types';

type View = 'home' | 'login' | 'dashboard' | 'typing' | 'math';

// Lien reçu par email (confirmation d'inscription / mot de passe oublié) : lu une seule fois, au chargement de la page.
const ARRIVAL = serverEnabled() ? takeAuthHash() : null;

/** Racine : accueil, connexion, espace enseignant et jeux. */
export default function Shell() {
  const [student, setStudent] = useState<StudentAccount | null>(() => (serverEnabled() ? loadStudent() : null));
  const [teacher, setTeacher] = useState<TeacherSession | null>(() => (serverEnabled() ? loadTeacher() : null));
  const [recovery, setRecovery] = useState(ARRIVAL?.type === 'recovery');
  const [tab, setTab] = useState<'student' | 'teacher'>('student');
  const [view, setView] = useState<View>(ARRIVAL ? (ARRIVAL.type === 'recovery' ? 'login' : 'dashboard') : 'home');

  const install = useInstall();
  const home = useCallback(() => setView('home'), []);

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
    setTab('student');
    setView('login');
  }, []);

  /** Déconnexion de l'enseignant quand sa session n'est plus valable. */
  const teacherLost = useCallback(() => {
    setTeacher(null);
    setTab('teacher');
    setView('login');
  }, []);

  if (view === 'login') {
    return (
      <Login
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
    return <Dashboard email={teacher.email} onHome={home} onSignOut={teacherLost} />;
  }

  if (view === 'typing') return <App account={student} onHome={home} onSessionLost={sessionLost} install={install} />;
  if (view === 'math') return <MathGame account={student} onHome={home} onSessionLost={sessionLost} />;

  return (
    <Home
      student={student}
      teacher={teacher}
      onPlay={setView}
      onLogin={(t) => {
        setTab(t);
        setView('login');
      }}
      onDashboard={() => setView('dashboard')}
      onLogout={logout}
      install={install}
    />
  );
}
