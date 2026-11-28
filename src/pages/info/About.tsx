import { GAMES } from '../../content/games';
import { LEGAL } from '../../legal';
import { Facts, Fold, Page, Section, ul } from './shared';
import type { PageProps } from './shared';

export function About({ onBack, onNav }: PageProps) {
  return (
    <Page id="about" eyebrow="Le site" title="À propos" intro="Des petits jeux pour s’entraîner en classe ou à la maison." onBack={onBack} onNav={onNav}>
      <Facts
        items={[
          { big: String(GAMES.length), small: 'jeux' },
          { big: 'CP → CM2', small: 'programmes des cycles 2 et 3' },
          { big: '0', small: 'publicité, cookie ou traceur' },
        ]}
      />

      <Section id="a-jeux" title="Les jeux">
        <dl className="about-games">
          {GAMES.map((g) => (
            <div key={g.name} className="about-game">
              <dt>
                {g.name}{' '}
                <span className="about-tag">
                  {g.tag} · {g.grades}
                </span>
              </dt>
              <dd>{g.short}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section id="a-classe" title="En classe">
        <ul className={ul}>
          <li>L’enseignant crée ses classes ; chaque élève reçoit un code, sans e-mail.</li>
          <li>Il propose des séances (un jeu, une difficulté, un nombre d’essais) et suit les résultats.</li>
          <li>
            Sans compte, les jeux restent accessibles : les scores restent sur l’appareil. Voir{' '}
            <button type="button" className="link inline-link" onClick={() => onNav('privacy')}>
              Confidentialité
            </button>
            .
          </li>
        </ul>
      </Section>

      <Fold id="a-diff" title="Trois difficultés">
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
        <p>Le contenu change avec la classe, pas avec la taille de l’écran.</p>
      </Fold>

      <Fold id="a-materiel" title="Matériel">
        <ul className={ul}>
          <li>Navigateur récent : ordinateur, tablette, téléphone ou tableau interactif.</li>
          <li>Léger, pour les postes et réseaux d’école anciens ou lents.</li>
          <li>Installable ; fonctionne ensuite sans connexion (les résultats partent au retour du réseau).</li>
        </ul>
      </Fold>

      <Fold id="a-limites" title="Ce que le site n’est pas">
        <ul className={ul}>
          <li>Une évaluation officielle : c’est un entraînement ludique.</li>
          <li>
            Un site du ministère : il est <strong>indépendant</strong>, mais suit les programmes.
          </li>
        </ul>
      </Fold>

      <Section id="a-editeur" title="Éditeur">
        <p>
          <strong>{LEGAL.editor}</strong>. Une remarque, une erreur, une idée de jeu&nbsp;?{' '}
          <button type="button" className="link inline-link" onClick={() => onNav('contact')}>
            Écrire
          </button>
          .
        </p>
      </Section>
    </Page>
  );
}
