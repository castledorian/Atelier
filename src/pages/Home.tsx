import { useEffect, useState } from 'react';
import { Frame } from './Frame';
import { SiteFooter } from './Info';
import type { InfoView } from './Info';
import { InfoButton } from '../components/Preview';
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
import { loadTypingStamps } from '../game/storage';
import { CAVE_ON, bossName, inkLevel, loadBoss, phaseOf } from '../game/boss/state';
import type { TeacherSession } from '../server/teacher';

interface HomeProps {
  student: StudentAccount | null;
  teacher: TeacherSession | null;
  onPlay: (game: 'typing' | 'math' | 'memory' | 'spelling' | 'lexique') => void;
  onSessions: () => void;
  onLogin: (tab: 'student' | 'teacher') => void;
  onDashboard: () => void;
  /** présent seulement pour l'administrateur du site */
  onAdmin?: () => void;
  onCave: () => void;
  onInfo: (v: InfoView) => void;
  onLogout: () => void;
  install: InstallInfo;
}

export default function Home({ student, teacher, onPlay, onSessions, onLogin, onDashboard, onAdmin, onCave, onInfo, onLogout, install }: HomeProps) {
  const boss = loadBoss();
  const bossPhase = phaseOf(boss);
  const online = serverEnabled();
  /** jeu dont l'extrait est ouvert (le « i » d'une carte) */
  const [preview, setPreview] = useState<PreviewGame | null>(null);
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
          <strong>{gradeLabel(classGrade)}</strong> <span className="text-ink/75">(choisi par ton enseignant)</span>
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
          <p className="mt-2 text-[15px] leading-snug">Choisis ta classe pour voir les jeux qui te conviennent.</p>
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
        {isAvailable('typing', grade) && (
          <div className="gwrap">
            <button type="button" className="gcard" onClick={() => onPlay('typing')}>
            <span className="gcard-tag">Clavier</span>
            <span className="gcard-name">Frappe&nbsp;!</span>
            <span className="gcard-text">Défends la marge : tape les mots avant que les taches d’encre n’arrivent.</span>
            {loadTypingStamps() > 0 && (
            <span className="gcard-stamps" role="img" aria-label={`Tampons : ${loadTypingStamps()} sur 6`}>
              {Array.from({ length: 6 }, (_, k) => (k < loadTypingStamps() ? '●' : '○')).join(' ')}
            </span>
          )}
            <span className="gcard-go">Jouer →</span>
          </button>
            <InfoButton onClick={() => setPreview('typing')} label="Voir un extrait : Frappe !" />
          </div>
        )}
        {isAvailable('math', grade) && (
          <div className="gwrap">
            <button type="button" className="gcard" onClick={() => onPlay('math')}>
            <span className="gcard-tag">Maths</span>
            <span className="gcard-name">Course à l’encre</span>
            <span className="gcard-text">Place la plume sur la bonne réponse et fuis la tache d’encre !</span>
            {loadCourseStamps() > 0 && (
            <span className="gcard-stamps" role="img" aria-label={`Tampons : ${loadCourseStamps()} sur 6`}>
              {Array.from({ length: 6 }, (_, k) => (k < loadCourseStamps() ? '●' : '○')).join(' ')}
            </span>
          )}
            <span className="gcard-go">Jouer →</span>
          </button>
            <InfoButton onClick={() => setPreview('math')} label="Voir un extrait : Course à l’encre" />
          </div>
        )}
        {isAvailable('spelling', grade) && (
          <div className="gwrap">
            <button type="button" className="gcard" onClick={() => onPlay('spelling')}>
            <span className="gcard-tag">Orthographe</span>
            <span className="gcard-name">Chasse aux fautes</span>
            <span className="gcard-text">Une faute s’est glissée dans la phrase : trouve-la, puis corrige-la.</span>
            <span className="gcard-go">Jouer →</span>
          </button>
            <InfoButton onClick={() => setPreview('spelling')} label="Voir un extrait : Chasse aux fautes" />
          </div>
        )}
        {isAvailable('lexique', grade) && (
          <div className="gwrap">
            <button type="button" className="gcard" onClick={() => onPlay('lexique')}>
              <span className="gcard-tag">Vocabulaire</span>
              <span className="gcard-name">Mots en orbite</span>
              <span className="gcard-text">Des mots arrivent de partout : relie le mot du centre à son synonyme, son contraire ou sa famille.</span>
              <span className="gcard-go">Jouer →</span>
            </button>
          </div>
        )}
        {isAvailable('memory', grade) && (
          <div className="gwrap">
            <button type="button" className="gcard" onClick={() => onPlay('memory')}>
            <span className="gcard-tag">Mémoire</span>
            <span className="gcard-name">Mémoire d’encre</span>
            <span className="gcard-text">Retiens les taches qui s’allument, puis refais la suite ou retrouve leurs places.</span>
            <span className="gcard-go">Jouer →</span>
          </button>
            <InfoButton onClick={() => setPreview('memory')} label="Voir un extrait : Mémoire d’encre" />
          </div>
        )}
        <div className="gcard gcard-soon" aria-label="Autres jeux à venir">
          <span className="gcard-tag">Bientôt</span>
          <span className="gcard-name">Autres jeux</span>
          <span className="gcard-text">Conjugaison, géométrie… d’autres jeux arrivent.</span>
        </div>
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
            <button type="button" className="btn btn-ghost" onClick={install.onInstall}>
              Installer l’application sur cet appareil
            </button>
          ) : (
            <p className="text-[14px] leading-snug">
              Pour installer sur iPhone / iPad&nbsp;: touche <strong>Partager</strong> puis <strong>Sur l’écran d’accueil</strong>.
            </p>
          )}
          <p className="mt-2 text-[14px] leading-snug text-ink/75">Les jeux s’ouvrent ensuite comme une application, même sans connexion internet.</p>
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
