import { BUILD, RUNTIME, SERVICES } from '../../content/credits';
import { LEGAL } from '../../legal';
import type { Credit } from '../../content/credits';
import { Page, Section, ul } from './shared';
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
    <Page
      id="credits"
      eyebrow="Merci"
      title="Crédits et licences"
      intro="Atelier utilise des logiciels et des polices libres. Voici lesquels, avec leurs licences."
      onBack={onBack}
      onNav={onNav}
    >
      <Section id="c-creation" title="Création">
        <ul className={ul}>
          <li>Conception, programmation et contenus (calculs, phrases, mots, consignes) : {LEGAL.editor}.</li>
          <li>Taches d’encre, créatures, décors : dessinés pour le site, en SVG.</li>
          <li>
            <strong>Images du jeu « Le facteur » : générées par une intelligence artificielle</strong> (style encre), à partir des listes de mots d’une enseignante. Elles servent d’illustrations
            de mots ; aucune photo ni œuvre existante n’est reproduite.
          </li>
          <li>Effets sonores et musique d’accueil : produits par le navigateur, sans fichier audio. Voix du « Facteur » : voix de synthèse du navigateur, ou enregistrements ajoutés au site.</li>
          <li>Programmes des cycles 2 et 3 : référence pour choisir les contenus par classe.</li>
        </ul>
      </Section>

      <Section id="c-site" title="Dans les pages du site">
        <CreditTable rows={RUNTIME} caption="Bibliothèques et polices utilisées dans les pages du site" />
      </Section>

      <Section id="c-outils" title="Outils de fabrication">
        <p>Pour fabriquer le site, jamais envoyés aux élèves.</p>
        <CreditTable rows={BUILD} caption="Outils utilisés pour fabriquer le site" />
      </Section>

      <Section id="c-services" title="Services utilisés">
        <CreditTable rows={SERVICES} caption="Services d’hébergement et d’envoi d’e-mails" />
        <p>
          Les rôles de ces services et les données qui y passent sont décrits dans la page{' '}
          <button type="button" className="link inline-link" onClick={() => onNav('privacy')}>
            Confidentialité
          </button>
          .
        </p>
      </Section>

      <Section id="c-droits" title="Droits sur le site">
        <p>
          © 2026 {LEGAL.editor}. Textes, illustrations et code propres à Atelier : pas de copie ni de republication sans accord. Les logiciels et polices cités gardent leur licence
          d’origine (textes complets sur les sites indiqués).
        </p>
      </Section>
    </Page>
  );
}
