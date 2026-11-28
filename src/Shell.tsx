import { useCallback, useEffect, useRef, useState } from 'react';
import { useRovingArrows } from './components/roving';
import { isFramed } from './server/framed';
import FramedNotice from './pages/FramedNotice';
import App from './App';
import BreakNotice from './components/BreakNotice';
import CheatNotice from './components/CheatNotice';
import { useInstall } from './install';
import Course from './games/Course';
import Facteur from './games/Facteur';
import Lexique from './games/Lexique';
import Memory from './games/Memory';
import Spelling from './games/Spelling';
import Admin from './pages/Admin';
import Cave from './pages/Cave';
import MaGoutte from './pages/MaGoutte';
import GainToast from './components/GainToast';
import { GOUTTE_ON, setGoutteOwner } from './game/goutte/store';
import { CAVE_ON } from './game/boss/state';
import Dashboard from './pages/Dashboard';
import Home from './pages/Home';
import Login from './pages/Login';
import Sessions from './pages/Sessions';
import { About, Accessibility, Contact, Credits, News, isInfoView } from './pages/Info';
import type { InfoView } from './pages/Info';
import Privacy from './pages/Privacy';
import { armPageSound, turnPage } from './game/pageTurn';
import { isAdmin } from './server/admin';
import { serverEnabled } from './server/api';
import { loadStudent, saveStudent, studentLogout } from './server/student';
import { loadTeacher, saveTeacher, signOut, takeAuthHash } from './server/teacher';
import type { TeacherSession } from './server/teacher';
import type { SessionInfo, StudentAccount } from './server/types';

type View = 'home' | 'login' | 'dashboard' | 'admin' | 'cave' | 'goutte' | InfoView | 'sessions' | 'typing' | 'math' | 'memory' | 'spelling' | 'lexique' | 'facteur';

// Lien reçu par email (confirmation d'inscription / mot de passe oublié) : lu une seule fois, au chargement de la page.
const ARRIVAL = serverEnabled() ? takeAuthHash() : null;

/** Racine : accueil, connexion, espace enseignant et jeux. */
export default function Shell() {
  useRovingArrows();
  return (
    <>
      <Pages />
      <CheatNotice />
      {GOUTTE_ON && <GainToast />}
    </>
  );
}

function Pages() {
  const [student, setStudent] = useState<StudentAccount | null>(() => (serverEnabled() ? loadStudent() : null));
  // chaque élève a sa goutte, même sur une tablette partagée
  setGoutteOwner(student?.student.id ?? null);
  const [teacher, setTeacher] = useState<TeacherSession | null>(() => (serverEnabled() ? loadTeacher() : null));
  const [recovery, setRecovery] = useState(ARRIVAL?.type === 'recovery');
  const [tab, setTab] = useState<'student' | 'teacher'>('student');
  const [view, setView] = useState<View>(ARRIVAL ? (ARRIVAL.type === 'recovery' ? 'login' : 'dashboard') : 'home');

  /** le compte enseignant est aussi administrateur du site (réponse du serveur) */
  const [admin, setAdmin] = useState(false);
  const teacherId = teacher?.email ?? '';
  useEffect(() => {
    let live = true;
    if (!teacherId) setAdmin(false);
    else void isAdmin().then((ok) => live && setAdmin(ok));
    return () => {
      live = false;
    };
  }, [teacherId]);

  /** séance de classe en cours de jeu (null = jeu libre) */
  const [active, setActive] = useState<SessionInfo | null>(null);

  // bruit de page à chaque changement d'écran (pas au premier affichage)
  const lastView = useRef(view);
  useEffect(() => {
    armPageSound();
    if (lastView.current === view) return;
    lastView.current = view;
    turnPage();
  }, [view]);

  const install = useInstall();
  const home = useCallback(() => {
    setActive(null);
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

  if (view === 'privacy') return <Privacy onBack={home} onNav={setView} />;
  if (isInfoView(view)) {
    const page = { onBack: home, onNav: setView };
    if (view === 'news') return <News {...page} />;
    if (view === 'about') return <About {...page} />;
    if (view === 'a11y') return <Accessibility {...page} />;
    if (view === 'credits') return <Credits {...page} />;
    if (view === 'contact') return <Contact {...page} />;
  }

  // les espaces connectés ne s'ouvrent pas dans une page intégrée (voir server/framed.ts)
  if ((view === 'login' || view === 'dashboard' || view === 'admin') && isFramed()) return <FramedNotice onBack={home} />;

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

  if (view === 'admin' && teacher && admin) {
    return <Admin email={teacher.email} onHome={home} onSignOut={teacherLost} />;
  }

  if (view === 'goutte' && GOUTTE_ON && student && !teacher) return <MaGoutte token={student?.token ?? null} onBack={home} />;
  if (view === 'cave' && CAVE_ON && (student || teacher)) return <Cave onBack={home} studentName={student?.student.name ?? null} isTeacher={teacher !== null} token={student?.token ?? null} />;

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

  if (view === 'typing' || view === 'math' || view === 'memory' || view === 'spelling' || view === 'lexique' || view === 'facteur') {
    const props = { key: active?.id ?? 'free', account: student, onHome: home, onSessionLost: sessionLost, session: active, onSessions: toSessions };
    const { key, ...rest } = props;
    return (
      <>
        {view === 'typing' && <App key={key} {...rest} install={install} />}
        {view === 'math' && <Course key={key} {...rest} />}
        {view === 'memory' && <Memory key={key} {...rest} />}
        {view === 'spelling' && <Spelling key={key} {...rest} />}
        {view === 'lexique' && <Lexique key={key} {...rest} />}
        {view === 'facteur' && <Facteur key={key} {...rest} />}
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
        setView(g);
      }}
      onSessions={() => setView('sessions')}
      onLogin={(t) => {
        setTab(t);
        setView('login');
      }}
      onDashboard={() => setView('dashboard')}
      onAdmin={admin ? () => setView('admin') : undefined}
      onCave={() => CAVE_ON && (student || teacher) && setView('cave')}
      onGoutte={() => GOUTTE_ON && student && setView('goutte')}
      onInfo={setView}
      onLogout={logout}
      install={install}
    />
  );
}
