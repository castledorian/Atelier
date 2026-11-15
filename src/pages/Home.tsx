import { Frame } from './Frame';
import type { InstallInfo } from '../components/Screens';
import { serverEnabled } from '../server/api';
import type { StudentAccount } from '../server/types';
import type { TeacherSession } from '../server/teacher';

interface HomeProps {
  student: StudentAccount | null;
  teacher: TeacherSession | null;
  onPlay: (game: 'typing' | 'math') => void;
  onLogin: (tab: 'student' | 'teacher') => void;
  onDashboard: () => void;
  onLogout: () => void;
  install: InstallInfo;
}

export default function Home({ student, teacher, onPlay, onLogin, onDashboard, onLogout, install }: HomeProps) {
  const online = serverEnabled();
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
            <button type="button" className="link" onClick={onLogout}>
              Changer d’élève
            </button>
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

      <h2 className="subhead mt-[var(--sp)]">Choisis un jeu</h2>
      <div className="games">
        <button type="button" className="gcard" onClick={() => onPlay('typing')}>
          <span className="gcard-tag">Clavier</span>
          <span className="gcard-name">Frappe&nbsp;!</span>
          <span className="gcard-text">Défends la marge : tape les mots avant que les taches d’encre n’arrivent.</span>
          <span className="gcard-go">Jouer →</span>
        </button>
        <button type="button" className="gcard" onClick={() => onPlay('math')}>
          <span className="gcard-tag">Maths</span>
          <span className="gcard-name">Course à l’encre</span>
          <span className="gcard-text">Place la plume sur la bonne réponse et fuis la tache d’encre !</span>
          <span className="gcard-go">Jouer →</span>
        </button>
        <div className="gcard gcard-soon" aria-label="Autres jeux à venir">
          <span className="gcard-tag">Bientôt</span>
          <span className="gcard-name">Autres jeux</span>
          <span className="gcard-text">Conjugaison, orthographe, géométrie… d’autres jeux arrivent.</span>
        </div>
      </div>

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
          <p className="mt-2 text-[13px] leading-snug text-ink/75">Les jeux s’ouvrent ensuite comme une application, même sans connexion internet.</p>
        </section>
      )}
    </Frame>
  );
}
