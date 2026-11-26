import { GOUTTE_ON } from '../game/goutte/store';
import PlayerBar from '../components/PlayerBar';
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
import { GRADES, gradeLabel, isAvailable, loadClassGrade, loadGrade, saveClassGrade, saveGrade } from '../game/grade';
import type { Grade } from '../game/grade';
import { loadSettings, loadTypingStamps } from '../game/storage';
import { Ambiance } from '../game/ambiance';
import { CAVE_ON, bossName, inkLevel, loadBoss, phaseOf } from '../game/boss/state';
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
  const grade = classGrade ?? ownGrade;
  useEffect(() => {
    setClassGradeState(loadClassGrade(studentId));
  }, [studentId]);
  const pick = (g: Grade) => {
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
        if (studentId) saveClassGrade(studentId, r.grade);
        setClassGradeState(r.grade);
      })
      .catch(() => alive && setTodo(null));
    return () => {
      alive = false;
    };
  }, [token, studentId]);
  return (
    <Frame>
      <div className="home-head">
        <div className="home-brand">
          <p className="eyebrow">Jeux pour apprendre</p>
          <h1 className="title" aria-label="L’atelier">
            {'ATELIER'.split('').map((ch, i) => (
              <span key={i} aria-hidden="true" style={{ animationDelay: `${80 + i * 70}ms` }}>
                {ch}
              </span>
            ))}
          </h1>
        </div>
        {student ? (
          <div className="acct acct-in" role="group" aria-label="Compte élève">
            <p className="acct-who">
              Connecté&nbsp;: <strong>{student.student.name}</strong>
            </p>
            <p className="acct-sub">
              {student.class.name} · {student.school.name}
            </p>
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
      </div>
      <div className="rule" aria-hidden="true" />

      {GOUTTE_ON && !teacher && <PlayerBar token={token} onOpen={onGoutte} />}

      {student && (
        <div className="home-cta">
          <button type="button" className="btn btn-primary" onClick={onSessions}>
            Mes séances{todo ? ` (${todo} à faire)` : ''}
          </button>
        </div>
      )}
      {teacher && (
        <div className="home-cta">
          <button type="button" className="btn btn-primary" onClick={onDashboard}>
            Mon espace école
          </button>
          {onAdmin && (
            <button type="button" className="btn btn-ghost" onClick={onAdmin}>
              Administration
            </button>
          )}
        </div>
      )}
      {!student && !teacher && !online && <p className="mt-3 text-[14px] leading-snug text-ink/75">Tes scores restent sur cet appareil.</p>}

      <h2 className="subhead mt-[var(--sp)]" id="grade-h">
        Ma classe
      </h2>
      {classGrade ? (
        <p className="mt-1 text-[16px]">
          <strong>{gradeLabel(classGrade)}</strong>
          <Tip label="Pourquoi je ne peux pas changer ?">Ta classe est choisie par ton enseignant.</Tip>
        </p>
      ) : (
        <div className="seg mt-1" role="radiogroup" aria-labelledby="grade-h">
          {GRADES.map((g) => (
            <button key={g.id} type="button" role="radio" aria-checked={grade === g.id} className="seg-b" onClick={() => pick(g.id)}>
              {g.label}
            </button>
          ))}
        </div>
      )}
      {grade === null && (
        <>
          <p className="mt-2 text-[15px] leading-snug">Choisis ta classe pour voir tes jeux.</p>
          <h2 className="subhead mt-[var(--sp)]">Les jeux</h2>
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

      {grade !== null && <h2 className="subhead mt-[var(--sp)]">Choisis un jeu</h2>}
      {grade !== null && <div className="games">
        {CARDS.filter((c) => isAvailable(c.id, grade)).map((c) => {
          const stamps = c.stamps?.() ?? 0;
          return (
            <div key={c.id} className="gwrap">
              <button type="button" className="gcard" onClick={() => onPlay(c.id)}>
                <span className="gcard-tag">{c.tag}</span>
                <span className="gcard-name">{c.name}</span>
                <span className="gcard-text">{c.text}</span>
                {stamps > 0 && (
                  <span className="gcard-stamps" role="img" aria-label={`Tampons : ${stamps} sur 6`}>
                    {Array.from({ length: 6 }, (_, k) => (k < stamps ? '●' : '○')).join(' ')}
                  </span>
                )}
                <span className="gcard-go">Jouer →</span>
              </button>
              <InfoButton onClick={() => setPreview(c.id)} label={`Voir un extrait : ${c.name}`} />
            </div>
          );
        })}
      </div>}

      {CAVE_ON && (student || teacher) && grade !== null && (
        <button type="button" className="cave-door" onClick={onCave}>
          <span className="cave-door-art" aria-hidden="true">
            <span className="cave-door-drop" data-size={inkLevel(boss)} />
          </span>
          <span className="cave-door-txt">
            <span className="cave-door-tag">Fin d’année</span>
            <span className="cave-door-name">La grotte</span>
            <span className="cave-door-text">
              {bossPhase === 'won'
                ? 'L’encre a été vaincue. Revoir l’exploit de la classe.'
                : bossPhase === 'final'
                  ? `${bossName(boss)} vous attend : le grand combat est ouvert.`
                  : bossPhase === 'growing'
                    ? `Quelque chose grossit au fond : on l’appelle déjà ${bossName(boss)}.`
                    : 'Quelque chose dort au fond. Mieux vaut ne pas s’approcher… pour l’instant.'}
            </span>
          </span>
          <span className="cave-door-go" aria-hidden="true">
            →
          </span>
        </button>
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
