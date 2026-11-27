import { GAMES } from '../../content/games';
import { LEGAL } from '../../legal';
import { Page, Section, ul } from './shared';
import type { PageProps } from './shared';

export function About({ onBack, onNav }: PageProps) {
  return (
    <Page
      id="about"
      eyebrow="Le site"
      title="À propos"
      intro="Des petits jeux pour s’entraîner en classe ou à la maison, du CP au CM2. Gratuit, sans publicité, sans cookie."
      onBack={onBack}
      onNav={onNav}
    >
      <Section id="a-jeux" title="Les jeux">
        <p>Quelques minutes par partie. L’accueil n’affiche que les jeux de la classe choisie.</p>
        <dl className="about-games">
          {GAMES.map((g) => (
            <div key={g.name} className="about-game">
              <dt>
                {g.name} <span className="about-tag">{g.tag} · {g.grades}</span>
              </dt>
              <dd>{g.text}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section id="a-diff" title="Trois difficultés">
        <ul className={ul}>
          <li>
            <strong>Apprenti</strong> : plus de temps, plus de droit à l’erreur.
          </li>
          <li>
            <strong>Standard</strong> : le rythme attendu pour la classe.
          </li>
          <li>
            <strong>Expert</strong> : un vrai défi.
          </li>
        </ul>
        <p>Le contenu (calculs, mots, phrases) change avec la classe, pas avec la taille de l’écran.</p>
      </Section>

      <Section id="a-classe" title="En classe">
        <ul className={ul}>
          <li>L’enseignant crée ses classes et ses élèves. Chaque élève reçoit un code : aucun e-mail d’élève.</li>
          <li>Il propose des <strong>séances</strong> (un jeu, une difficulté, un nombre d’essais) et suit les résultats.</li>
          <li>Les jeux restent accessibles <strong>sans compte</strong> : les scores restent alors sur l’appareil.</li>
        </ul>
        <p>
          Détails et note pour les familles :{' '}
          <button type="button" className="link inline-link" onClick={() => onNav('privacy')}>
            Confidentialité
          </button>
          .
        </p>
      </Section>

      <Section id="a-materiel" title="Matériel">
        <ul className={ul}>
          <li>Navigateur récent, sur ordinateur, tablette, téléphone ou tableau interactif.</li>
          <li>Léger, pour les postes et réseaux d’école anciens ou lents.</li>
          <li>Installable ; fonctionne ensuite sans connexion (les résultats partent au retour du réseau).</li>
        </ul>
      </Section>

      <Section id="a-limites" title="Ce que le site n’est pas">
        <ul className={ul}>
          <li>Une évaluation officielle : c’est un entraînement ludique.</li>
          <li>Un site du ministère : il est <strong>indépendant</strong>, mais suit les programmes des cycles 2 et 3.</li>
        </ul>
      </Section>

      <Section id="a-editeur" title="Qui est derrière Atelier ?">
        <p>
          <strong>{LEGAL.editor}</strong>. Une remarque, une erreur, une idée de jeu&nbsp;? Écrivez via{' '}
          <button type="button" className="link inline-link" onClick={() => onNav('contact')}>
            Contact
          </button>
          .
        </p>
      </Section>
    </Page>
  );
}
