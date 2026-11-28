import { GOUTTE_ON } from '../game/goutte/store';
import GoutteNook from '../components/GoutteNook';
import { useEffect, useState } from 'react';
import { Frame } from './Frame';
import { SiteFooter } from './Info';
import type { InfoView } from './Info';
import { InfoButton } from '../components/Preview';
import { Tip } from '../components/Tip';
import type { PreviewGame } from '../components/Preview';
import PreviewWindow from '../components/PreviewWindow';
import type { InstallInfo } from '../components/Screens';
import { GAMES } from '../content/games';
import { serverEnabled } from '../server/api';
import { fetchSessionsInfo } from '../server/student';
import type { StudentAccount } from '../server/types';
import { loadCourseStamps } from '../game/course/scores';
import { isAvailable, loadClassGrade, loadClassGrades, loadGrade, loadPracticeGrade, saveClassGrade, saveGrade, savePracticeGrade } from '../game/grade';
import GradePicker from '../components/GradePicker';
import type { Grade } from '../game/grade';
import { loadSettings, loadTypingStamps } from '../game/storage';
import { Ambiance } from '../game/ambiance';
import { CAVE_ON, loadBoss, phaseOf } from '../game/boss/state';
import { formAt, formName, sceneStageOf } from '../game/boss/forms';
import type { TeacherSession } from '../server/teacher';

interface HomeProps {
  student: StudentAccount | null;
  teacher: TeacherSession | null;
  onPlay: (game: 'typing' | 'math' | 'memory' | 'spelling' | 'lexique' | 'facteur') => void;
  onSessions: () => void;
  onLogin: (tab: 'student' | 'teacher') => void;
  onDashboard: () => void;
  /** présent seulement pour l'administrateur du site */
  onAdmin?: () => void;
  onCave: () => void;
  /** ouvre « Ma goutte » */
  onGoutte: () => void;
  onInfo: (v: InfoView) => void;
  onLogout: () => void;
  install: InstallInfo;
}

type GameId = HomeProps['onPlay'] extends (g: infer G) => void ? G : never;

/** Les cartes de l'accueil, dans l'ordre d'affichage (seuls les jeux du niveau choisi apparaissent). */
const CARDS: { id: GameId & PreviewGame; tag: string; name: string; text: string; stamps?: () => number }[] = [
  { id: 'typing', tag: 'Clavier', name: 'Frappe\u00a0!', text: 'Tape les mots avant que l’encre n’atteigne la marge.', stamps: loadTypingStamps },
  { id: 'math', tag: 'Maths', name: 'Course à l’encre', text: 'Choisis la bonne réponse et fuis la tache d’encre !', stamps: loadCourseStamps },
  { id: 'spelling', tag: 'Orthographe', name: 'Chasse aux fautes', text: 'Trouve la faute dans la phrase, puis corrige-la.' },
  { id: 'facteur', tag: 'Lecture', name: 'Le facteur', text: 'Range chaque colis dans la boîte qui porte son mot.' },
  { id: 'lexique', tag: 'Vocabulaire', name: 'Mots en orbite', text: 'Relie le mot du centre à son synonyme, son contraire ou sa famille.' },
  { id: 'memory', tag: 'Mémoire', name: 'Mémoire d’encre', text: 'Retiens les taches qui s’allument, puis refais la suite.' },
];

export default function Home({ student, teacher, onPlay, onSessions, onLogin, onDashboard, onAdmin, onCave, onGoutte, onInfo, onLogout, install }: HomeProps) {
  const boss = loadBoss();
  const bossPhase = phaseOf(boss);
  const online = serverEnabled();
  /** jeu dont l'extrait est ouvert (le « i » d'une carte) */
  const [preview, setPreview] = useState<PreviewGame | null>(null);
  /** ambiance musicale de l'accueil : sans bouton, seulement sur cette page (jamais pendant un jeu) */
  useEffect(() => {
    if (preview) return; // la fenêtre d'extrait a ses propres sons : on laisse la place
    if (!loadSettings().sound) return; // le réglage « Son » coupé dans un jeu vaut aussi pour l'accueil
    const m = new Ambiance();
    if (!m.start()) return;
    const wake = () => m.resume(); // le navigateur n'autorise le son qu'après un premier toucher
    const vis = () => (document.hidden ? m.suspend() : m.resume());
    window.addEventListener('pointerdown', wake);
    window.addEventListener('keydown', wake);
    document.addEventListener('visibilitychange', vis);
    return () => {
      window.removeEventListener('pointerdown', wake);
      window.removeEventListener('keydown', wake);
      document.removeEventListener('visibilitychange', vis);
      m.stop();
    };
  }, [preview]);
  const [ownGrade, setGrade] = useState<Grade | null>(loadGrade);
  const studentId = student?.student.id ?? null;
  /** niveau fixé par l'enseignant pour la classe de l'élève connecté */
  const [classGrade, setClassGradeState] = useState<Grade | null>(() => loadClassGrade(studentId));
  /** tous les niveaux de sa classe (plusieurs si la classe est mixte) */
  const [classGrades, setClassGradesState] = useState<Grade[]>(() => loadClassGrades(studentId));
  /** niveau d'entraînement choisi par l'élève (révision ou avance) ; null = celui de sa classe */
  const [practice, setPractice] = useState<Grade | null>(() => loadPracticeGrade(studentId));
  const grade = (classGrade ? practice : null) ?? classGrade ?? ownGrade;
  useEffect(() => {
    setClassGradeState(loadClassGrade(studentId));
    setClassGradesState(loadClassGrades(studentId));
    setPractice(loadPracticeGrade(studentId));
  }, [studentId]);
  const pick = (g: Grade | null) => {
    if (classGrade && studentId) {
      // classe mixte : le choix est toujours gardé (même le niveau par défaut), pour ne pas redemander
      const kept = classGrades.length > 1 ? (g ?? classGrade) : g;
      savePracticeGrade(studentId, kept);
      setPractice(kept);
      return;
    }
    if (!g) return;
    saveGrade(g);
    setGrade(g);
  };
  const [todo, setTodo] = useState<number | null>(null);
  const token = student?.token ?? null;
  useEffect(() => {
    if (!token) return;
    let alive = true;
    fetchSessionsInfo(token)
      .then((r) => {
        if (!alive) return;
        setTodo(r.sessions.filter((s) => s.active && s.attempts_used < s.max_attempts).length);
        if (studentId) saveClassGrade(studentId, r.grade, r.grades);
        setClassGradeState(r.grade);
        setClassGradesState(r.grades);
      })
      .catch(() => alive && setTodo(null));
    return () => {
      alive = false;
    };
  }, [token, studentId]);
  return (
    <Frame wide>
      <header className="hm-head">
        <div className="hm-brand">
          <img className="hm-logo" src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" width={56} height={56} />
          <div>
          <p className="eyebrow">Jeux pour apprendre</p>
          <h1 className="title" aria-label="L’atelier">
            {'ATELIER'.split('').map((ch, i) => (
              <span key={i} aria-hidden="true" style={{ animationDelay: `${80 + i * 70}ms` }}>
                {ch}
              </span>
            ))}
          </h1>
          </div>
        </div>
        {student ? (
          <div className="acct acct-in" role="group" aria-label="Compte élève">
            <p className="acct-who">
              <strong>{student.student.name}</strong> · {student.class.name}
            </p>
            <p className="acct-sub">{student.school.name}</p>
            <button type="button" className="acct-link" onClick={onLogout}>
              Changer d’élève
            </button>
          </div>
        ) : teacher ? (
          <div className="acct acct-in" role="group" aria-label="Compte enseignant">
            <p className="acct-who">
              Enseignant&nbsp;: <strong>{teacher.email || 'connecté'}</strong>
            </p>
            <button type="button" className="acct-link" onClick={onLogout}>
              Se déconnecter
            </button>
          </div>
        ) : (
          online && (
            <nav className="acct" aria-label="Connexion">
              <button type="button" className="acct-btn" aria-label="Connexion élève" onClick={() => onLogin('student')}>
                Élève
              </button>
              <button type="button" className="acct-btn" aria-label="Connexion enseignant" onClick={() => onLogin('teacher')}>
                Enseignant
              </button>
            </nav>
          )
        )}
      </header>
      <div className="hm-rule" aria-hidden="true" />

      <div className="hm-bar">
        {student && (
          <button type="button" className="btn btn-primary" onClick={onSessions}>
            Mes séances{todo ? ` (${todo} à faire)` : ''}
          </button>
        )}
        {teacher && (
          <>
            <button type="button" className="btn btn-primary" onClick={onDashboard}>
              Mon espace école
            </button>
            {onAdmin && (
              <button type="button" className="btn btn-ghost" onClick={onAdmin}>
                Administration
              </button>
            )}
          </>
        )}
        {!student && !teacher && !online && <p className="hm-note">Tes scores restent sur cet appareil.</p>}
        <GradePicker grade={grade} homes={classGrades} ask={classGrades.length > 1 && practice === null} onPick={pick} />
      </div>
      {grade === null && (
        <>
          <p className="mt-2 text-[15px] leading-snug">Choisis ton niveau pour voir tes jeux.</p>
          <h2 className="subhead hm-sub">Les jeux</h2>
          <ul className="intro-games" aria-label="Les jeux d’Atelier">
            {GAMES.map((g) => (
              <li key={g.name}>
                <strong>{g.name}</strong> <span className="about-tag">{g.tag} · {g.grades}</span>
                <span className="intro-text">{g.short}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      {grade !== null && <h2 className="subhead hm-sub">Choisis un jeu</h2>}
      {grade !== null && <ul className="hm-games" aria-label="Les jeux">
        {CARDS.filter((c) => isAvailable(c.id, grade)).map((c) => {
          const stamps = c.stamps?.() ?? 0;
          return (
            <li key={c.id} className="hm-item">
              <button type="button" className="hm-card" onClick={() => onPlay(c.id)}>
                <span className="hm-tag">{c.tag}</span>
                <span className="hm-name">{c.name}</span>
                <span className="hm-text">{c.text}</span>
                {stamps > 0 && (
                  <span className="hm-stamps" role="img" aria-label={`Tampons : ${stamps} sur 6`}>
                    {Array.from({ length: 6 }, (_, k) => (k < stamps ? '●' : '○')).join(' ')}
                  </span>
                )}
                <span className="hm-go">
                  Jouer <span aria-hidden="true">→</span>
                </span>
              </button>
              <InfoButton small onClick={() => setPreview(c.id)} label={`Voir un extrait : ${c.name}`} />
            </li>
          );
        })}
      </ul>}

      {grade !== null && ((CAVE_ON && (student || teacher)) || (GOUTTE_ON && student)) && (
        <div className="lair" data-solo={CAVE_ON && GOUTTE_ON && student ? 'no' : 'yes'}>
          {CAVE_ON && (student || teacher) && (
            <button type="button" className="cave-door" onClick={onCave}>
              <span className="cave-door-art" aria-hidden="true">
                <span className="cave-door-drop" data-size={sceneStageOf(formAt().form)} />
              </span>
              <span className="cave-door-txt">
                <span className="cave-door-tag">Fin d’année</span>
                <span className="cave-door-name">La grotte</span>
                <span className="cave-door-text">
                  {bossPhase === 'won'
                    ? 'L’encre a été vaincue. Revoir l’exploit de la classe.'
                    : bossPhase === 'final'
                      ? `${formName(formAt().form)} vous attend : le grand combat est ouvert.`
                      : bossPhase === 'growing'
                        ? `Quelque chose grossit au fond : on l’appelle déjà ${formName(formAt().form)}.`
                        : 'Quelque chose dort au fond. Mieux vaut ne pas s’approcher… pour l’instant.'}
                </span>
              </span>
              <span className="cave-door-go" aria-hidden="true">
                →
              </span>
            </button>
          )}
          {GOUTTE_ON && student && <GoutteNook token={token} onOpen={onGoutte} />}
        </div>
      )}

      {(install.mode === 'prompt' || install.mode === 'ios') && (
        <section className="sec" aria-label="Installer l’application">
          {install.mode === 'prompt' ? (
            <>
            <button type="button" className="btn btn-ghost" onClick={install.onInstall}>
              Installer l’application
            </button>
            <Tip label="À propos de l’installation">Les jeux s’ouvrent ensuite comme une application, même sans internet.</Tip>
            </>
          ) : (
            <p className="text-[14px] leading-snug">
              Pour installer sur iPhone / iPad&nbsp;: touche <strong>Partager</strong> puis <strong>Sur l’écran d’accueil</strong>.
            </p>
          )}
        </section>
      )}
      <SiteFooter onNav={onInfo} />
      {preview && (
        <PreviewWindow
          game={preview}
          grade={grade}
          onClose={() => setPreview(null)}
          onPlay={() => {
            const g = preview;
            setPreview(null);
            onPlay(g);
          }}
        />
      )}
    </Frame>
  );
}
