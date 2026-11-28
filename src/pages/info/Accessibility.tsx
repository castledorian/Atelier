import { LEGAL } from '../../legal';
import { Facts, Page, Section, ul } from './shared';
import type { PageProps } from './shared';

export function Accessibility({ onBack, onNav }: PageProps) {
  return (
    <Page
      id="a11y"
      eyebrow="Pour tous les élèves"
      title="Accessibilité"
      intro="Atelier s’inspire du référentiel RGAA. Aucun audit externe : le site n’est pas déclaré conforme."
      onBack={onBack}
      onNav={onNav}
    >
      <Facts
        items={[
          { big: '14 px', small: 'texte minimal' },
          { big: '44 px', small: 'boutons minimaux' },
          { big: 'Clavier', small: 'menus et boutons' },
        ]}
      />

      <Section id="x-ok" title="Ce qui est en place">
        <ul className={ul}>
          <li>Page en français, titres structurés, contrastes renforcés.</li>
          <li>Contour visible sur l’élément actif ; erreurs et confirmations annoncées aux lecteurs d’écran.</li>
          <li>Animations réduites si l’appareil le demande.</li>
          <li>Sons coupables dans chaque jeu ; musique d’accueil coupée avec le même réglage.</li>
          <li>Tableau interactif, tablette, téléphone. Difficulté « Apprenti » : plus de temps et d’erreurs permises.</li>
          <li>Ni CAPTCHA, ni publicité, ni contenu d’un autre site.</li>
        </ul>
      </Section>

      <Section id="x-limites" title="Limites connues">
        <ul className={ul}>
          <li>
            Les jeux sont <strong>visuels et chronométrés</strong> : difficilement utilisables avec un lecteur d’écran. Dans « Le facteur », les images n’ont pas de description : elle
            donnerait la réponse.
          </li>
          <li>Mémoire d’encre repose sur des éléments visuels, sans équivalent sonore.</li>
          <li>Pas de réglage de police (dyslexie) ni de contraste maximal ; la taille du texte se règle dans chaque jeu.</li>
          <li>Glisser la plume (Course à l’encre) est plus simple au doigt ou à la souris ; des touches existent aussi.</li>
        </ul>
      </Section>

      <Section id="x-aide" title="Une difficulté&nbsp;?">
        <p>
          <button type="button" className="link inline-link" onClick={() => onNav('contact')}>
            Écrivez-nous
          </button>{' '}
          en précisant l’appareil, le navigateur et l’aide technique utilisée.
        </p>
        <p className="text-[14px] text-ink/70">Déclaration établie le {LEGAL.updated}.</p>
      </Section>
    </Page>
  );
}
