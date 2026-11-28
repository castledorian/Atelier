import { BUILD, RUNTIME, SERVICES } from '../../content/credits';
import { LEGAL } from '../../legal';
import type { Credit } from '../../content/credits';
import { Fold, Page, Section, ul } from './shared';
import type { PageProps } from './shared';

function CreditTable({ rows, caption }: { rows: Credit[]; caption: string }) {
  return (
    <div className="tbl-wrap">
      <table className="tbl credits-tbl">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            <th scope="col">Élément</th>
            <th scope="col">Rôle</th>
            <th scope="col">Licence</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.name}>
              <th scope="row">
                {c.name}
                {c.holder && <span className="credits-holder"> © {c.holder}</span>}
              </th>
              <td>{c.role}</td>
              <td>{c.license}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Credits({ onBack, onNav }: PageProps) {
  return (
    <Page id="credits" eyebrow="Merci" title="Crédits et licences" intro="Logiciels et polices libres, avec leurs licences." onBack={onBack} onNav={onNav}>
      <Section id="c-creation" title="Création">
        <ul className={ul}>
          <li>Conception, programmation et contenus : {LEGAL.editor}.</li>
          <li>Taches d’encre, créatures et décors : dessinés pour le site, en SVG.</li>
          <li>Sons et musique d’accueil : produits par le navigateur. Voix du « Facteur » : voix de synthèse du navigateur ou enregistrements ajoutés au site.</li>
          <li>Programmes des cycles 2 et 3 : référence pour les contenus par classe.</li>
        </ul>
      </Section>

      <Fold id="c-site" title={`Dans les pages du site (${RUNTIME.length})`}>
        <CreditTable rows={RUNTIME} caption="Bibliothèques et polices utilisées dans les pages du site" />
      </Fold>

      <Fold id="c-outils" title={`Outils de fabrication (${BUILD.length})`}>
        <p>Jamais envoyés aux élèves.</p>
        <CreditTable rows={BUILD} caption="Outils utilisés pour fabriquer le site" />
      </Fold>

      <Fold id="c-services" title={`Services utilisés (${SERVICES.length})`}>
        <CreditTable rows={SERVICES} caption="Services d’hébergement et d’envoi d’e-mails" />
        <p>
          Données concernées :{' '}
          <button type="button" className="link inline-link" onClick={() => onNav('privacy')}>
            Confidentialité
          </button>
          .
        </p>
      </Fold>

      <Section id="c-droits" title="Droits">
        <p>
          © 2026 {LEGAL.editor}. Textes, illustrations et code propres à Atelier : pas de copie ni de republication sans accord. Les logiciels et polices cités gardent leur licence d’origine.
        </p>
      </Section>
    </Page>
  );
}
