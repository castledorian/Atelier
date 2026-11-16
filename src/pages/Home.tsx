import { useEffect, useState } from 'react';
import { Frame } from './Frame';
import type { InstallInfo } from '../components/Screens';
import { serverEnabled } from '../server/api';
import { fetchSessions } from '../server/student';
import type { StudentAccount } from '../server/types';
import { loadCourseStamps } from '../game/course/scores';
import { GRADES, isAvailable, loadGrade, saveGrade } from '../game/grade';
import type { Grade } from '../game/grade';
import { loadTypingStamps } from '../game/storage';
import type { TeacherSession } from '../server/teacher';

interface HomeProps {
  student: StudentAccount | null;
  teacher: TeacherSession | null;
  onPlay: (game: 'typing' | 'math' | 'memory' | 'spelling') => void;
  onSessions: () => void;
  onLogin: (tab: 'student' | 'teacher') => void;
  onDashboard: () => void;
  onPrivacy: () => void;
  onLogout: () => void;
  install: InstallInfo;
}

export default function Home({ student, teacher, onPlay, onSessions, onLogin, onDashboard, onPrivacy, onLogout, install }: HomeProps) {
  const online = serverEnabled();
  const [grade, setGrade] = useState<Grade | null>(loadGrade);
  const pick = (g: Grade) => {
    saveGrade(g);
    setGrade(g);
  };
  const [todo, setTodo] = useState<number | null>(null);
  const token = student?.token ?? null;
  useEffect(() => {
    if (!token) return;
    let alive = true;
    fetchSessions(token)
      .then((r) => alive && setTodo(r.filter((s) => s.active && s.attempts_used < s.max_attempts).length))
      .catch(() => alive && setTodo(null));
    return () => {
      alive = false;
    };
  }, [token]);
  return (
    <Frame>
      <p className="eyebrow">Jeux pour apprendre</p>
      <h1 className="title" aria-label="L’atelier">
        {'ATELIER'.split('').map((ch, i) => (
          <span key={i} aria-hidden="true" style={{ animationDelay: `${80 + i * 70}ms` }}>
            {ch}
          </span>
        ))}
      </h1>
      <div className="rule" aria-hidden="true" />

      <section className="who" aria-label="Connexion">
        {student ? (
          <>
            <p>
              Connecté&nbsp;: <strong>{student.student.name}</strong>
              <span className="text-ink/70">
                {' '}
                · {student.class.name} · {student.school.name}
              </span>
            </p>
            <div className="who-actions">
              <button type="button" className="btn btn-primary" onClick={onSessions}>
                Mes séances{todo ? ` (${todo} à faire)` : ''}
              </button>
              <button type="button" className="link" onClick={onLogout}>
                Changer d’élève
              </button>
            </div>
          </>
        ) : teacher ? (
          <>
            <p>
              Enseignant&nbsp;: <strong>{teacher.email || 'connecté'}</strong>
            </p>
            <div className="who-actions">
              <button type="button" className="btn btn-primary" onClick={onDashboard}>
                Mon espace école
              </button>
              <button type="button" className="link" onClick={onLogout}>
                Se déconnecter
              </button>
            </div>
          </>
        ) : online ? (
          <>
            <p className="text-[15px] leading-snug">
              Connecte-toi pour retrouver tes scores, te comparer à ta classe et à ton école.
            </p>
            <div className="who-actions">
              <button type="button" className="btn btn-primary" onClick={() => onLogin('student')}>
                Je suis élève
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => onLogin('teacher')}>
                Je suis enseignant
              </button>
            </div>
          </>
        ) : (
          <p className="text-[14px] leading-snug text-ink/75">Tes scores restent sur cet appareil.</p>
        )}
      </section>

      <h2 className="subhead mt-[var(--sp)]" id="grade-h">
        Ma classe
      </h2>
      <div className="seg mt-1" role="radiogroup" aria-labelledby="grade-h">
        {GRADES.map((g) => (
          <button key={g.id} type="button" role="radio" aria-checked={grade === g.id} className="seg-b" onClick={() => pick(g.id)}>
            {g.label}
          </button>
        ))}
      </div>
      {grade === null && <p className="mt-2 text-[15px] leading-snug">Choisis ta classe pour voir les jeux qui te conviennent.</p>}

      {grade !== null && <h2 className="subhead mt-[var(--sp)]">Choisis un jeu</h2>}
      {grade !== null && <div className="games">
        {isAvailable('typing', grade) && (
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
        )}
        {isAvailable('math', grade) && (
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
        )}
        {isAvailable('spelling', grade) && (
          <button type="button" className="gcard" onClick={() => onPlay('spelling')}>
            <span className="gcard-tag">Orthographe</span>
            <span className="gcard-name">Chasse aux fautes</span>
            <span className="gcard-text">Une faute s’est glissée dans la phrase : trouve-la, puis corrige-la.</span>
            <span className="gcard-go">Jouer →</span>
          </button>
        )}
        {isAvailable('memory', grade) && (
          <button type="button" className="gcard" onClick={() => onPlay('memory')}>
            <span className="gcard-tag">Mémoire</span>
            <span className="gcard-name">Mémoire d’encre</span>
            <span className="gcard-text">Retiens les taches qui s’allument, puis refais la suite ou retrouve leurs places.</span>
            <span className="gcard-go">Jouer →</span>
          </button>
        )}
        <div className="gcard gcard-soon" aria-label="Autres jeux à venir">
          <span className="gcard-tag">Bientôt</span>
          <span className="gcard-name">Autres jeux</span>
          <span className="gcard-text">Conjugaison, géométrie… d’autres jeux arrivent.</span>
        </div>
      </div>}

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
      <p className="mt-4 text-[14px] text-ink/75">
        Pas de pub, pas de cookie.{' '}
        <button type="button" className="link" onClick={onPrivacy}>
          Confidentialité et données
        </button>
      </p>
    </Frame>
  );
}
