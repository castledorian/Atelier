import { LEGAL } from '../../legal';
import { Page, Section, ul } from './shared';
import type { PageProps } from './shared';

export function Accessibility({ onBack, onNav }: PageProps) {
  return (
    <Page
      id="a11y"
      eyebrow="Pour tous les élèves"
      title="Accessibilité"
      intro="Atelier s’inspire du référentiel RGAA, sans en être certifié."
      onBack={onBack}
      onNav={onNav}
    >
      <Section id="x-etat" title="État de conformité">
        <p>
          Pas d’audit par un tiers : le site n’est <strong>pas déclaré conforme</strong>. Les points ci-dessous sont des vérifications de l’éditeur.
        </p>
      </Section>

      <Section id="x-ok" title="Ce qui est en place">
        <ul className={ul}>
          <li>Page en français, titres structurés.</li>
          <li>Texte d’au moins 14 px, boutons d’au moins 44 px, contrastes renforcés.</li>
          <li>Menus et boutons utilisables au clavier, contour visible sur l’élément actif.</li>
          <li>Messages d’erreur et de confirmation annoncés aux lecteurs d’écran.</li>
          <li>Animations réduites si l’appareil le demande.</li>
          <li>Sons : effets coupables dans chaque jeu ; musique d’accueil coupée avec le même réglage.</li>
          <li>Tableau interactif, tablette, téléphone ; en paysage sur téléphone, les jeux concernés se mettent en pause.</li>
          <li>Ni CAPTCHA, ni contenu d’un autre site, ni publicité.</li>
          <li>Difficulté « Apprenti » : plus de temps et d’erreurs permises.</li>
        </ul>
      </Section>

      <Section id="x-limites" title="Limites connues">
        <ul className={ul}>
          <li>
            Les jeux sont <strong>visuels et chronométrés</strong> : leur déroulement n’est pas décrit en texte, ils sont difficilement utilisables avec un lecteur d’écran. Dans « Le facteur »,
            les images n’ont pas de description : elle donnerait la réponse.
          </li>
          <li>Mémoire d’encre repose sur des éléments visuels, sans équivalent sonore.</li>
          <li>Pas de réglage de police (dyslexie) ni de contraste maximal ; la taille du texte se règle dans chaque jeu.</li>
          <li>Glisser la plume (Course à l’encre) est plus simple au doigt ou à la souris ; des touches existent aussi.</li>
        </ul>
      </Section>

      <Section id="x-aide" title="Une difficulté&nbsp;?">
        <p>
          Écrivez via{' '}
          <button type="button" className="link inline-link" onClick={() => onNav('contact')}>
            Contact
          </button>{' '}
          en précisant l’appareil, le navigateur et l’aide technique utilisée.
        </p>
        <p className="text-[14px] text-ink/70">Déclaration établie le {LEGAL.updated}.</p>
      </Section>
    </Page>
  );
}
