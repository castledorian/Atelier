import type { ReactNode } from 'react';
import { BackButton } from '../components/BackButton';
import { LEGAL } from '../legal';
import { Frame } from './Frame';
import { SiteFooter } from './Info';
import type { InfoView } from './Info';

/** À compléter par l'éditeur : affiché en évidence tant que l'information manque (voir src/legal.ts). */
function Todo({ value, what }: { value: string; what: string }) {
  if (value.trim()) return <strong>{value}</strong>;
  return <mark className="rounded bg-[#ffe9a8] px-1 font-bold text-ink">[à compléter : {what}]</mark>;
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section className="sec" aria-labelledby={id}>
      <h2 id={id} className="subhead mb-2">
        {title}
      </h2>
      <div className="space-y-2 text-[15px] leading-snug">{children}</div>
    </section>
  );
}

const ul = 'list-disc space-y-1 pl-5';

/** Page de confidentialité : ce que le site enregistre, où, pendant combien de temps, et les droits de chacun. */
export default function Privacy({ onBack, onNav }: { onBack: () => void; onNav: (v: InfoView) => void }) {
  return (
    <Frame wide>
      <div className="card-top no-print">
        <BackButton onClick={onBack} label="Retour" autoFocus />
      </div>
      <p className="eyebrow">Données personnelles</p>
      <h1 className="title-sm">Confidentialité</h1>
      <div className="rule" aria-hidden="true" />
      <p className="text-[14px] text-ink/70">Mise à jour le {LEGAL.updated}</p>

      <Section id="p-bref" title="En bref">
        <ul className={ul}>
          <li>
            <strong>Aucune publicité, aucun cookie, aucun traceur</strong>, aucune statistique d’audience, aucun outil d’un autre site.
          </li>
          <li>
            <strong>Sans connexion</strong>, rien ne quitte l’appareil : les scores restent dans le navigateur.
          </li>
          <li>
            <strong>Avec un code d’élève</strong> : un prénom (ou pseudo), une classe et des résultats de jeux. Ni e-mail, ni photo, ni localisation.
          </li>
          <li>
            Données <strong>utilisées uniquement pour l’école</strong>, jamais vendues.
          </li>
          <li>L’enseignant peut <strong>supprimer</strong> un élève, une classe ou l’école à tout moment.</li>
        </ul>
      </Section>

      <Section id="p-qui" title="Qui est responsable ?">
        <p>
          L’école, par l’enseignant qui crée la classe. Le site est édité par <Todo value={LEGAL.editor} what="nom de l’éditeur" />, qui héberge les données pour le compte de l’école et ne
          s’en sert pour rien d’autre.
        </p>
        <p>
          Une question ou une demande&nbsp;: <Todo value={LEGAL.contact} what="adresse e-mail de contact" />. Pour un élève, le plus simple est d’en parler à son enseignant.
        </p>
      </Section>

      <Section id="p-donnees" title="Ce qui est enregistré">
        <h3 className="font-bold">Élève sans connexion</h3>
        <p>
          Scores, progression, réglages et dernier niveau restent <strong>dans le navigateur</strong> (« stockage local ») et ne sont envoyés à personne.
        </p>
        <h3 className="font-bold">Élève avec un code</h3>
        <ul className={ul}>
          <li>Prénom ou pseudo (24 caractères au plus), classe et école, choisis par l’enseignant.</li>
          <li>Un code de 8 caractères tirés au hasard. Le serveur n’en garde qu’une empreinte : même l’éditeur ne peut pas le relire.</li>
          <li>Pour chaque partie : jeu, mode, score, niveau, vitesse et précision, durée, date.</li>
          <li>Pour une séance de classe : le nombre d’essais et le résultat de chacun. Seul le meilleur compte ; l’enseignant les voit tous.</li>
          <li>Un jeton de connexion, gardé sur l’appareil (empreinte seule sur le serveur), valable 30 jours et prolongé tant que l’élève joue.</li>
        </ul>
        <h3 className="font-bold">Statistiques anonymes</h3>
        <p>
          Après une partie libre d’un élève connecté, un résumé <strong>sans aucun identifiant</strong> (jeu, niveau, score, réussites et erreurs, durée) sert à régler la difficulté.
          Des compteurs par exercice (« posé tant de fois, raté tant de fois », et pour Le facteur les mots confondus) servent à repérer les exercices trop durs ; ils ne gardent jamais ce
          qu’un élève écrit et ne sont lisibles que par l’administrateur. Celui-ci voit aussi des moyennes par niveau et par classe (jamais pour moins de 3 élèves).
        </p>
        <h3 className="font-bold">Enseignant</h3>
        <p>Adresse e-mail et mot de passe (protégé par le service d’identification, lisible par personne), nom de l’école et des classes.</p>
        <h3 className="font-bold">Administrateur du site</h3>
        <p>
          Il consulte en <strong>lecture seule</strong> les écoles, classes, prénoms, parties, e-mails d’enseignants et parties refusées par la vérification des scores. Il ne voit{' '}
          <strong>jamais les codes</strong> et ne peut rien modifier chez un élève. Chaque consultation est notée (qui, quand, quoi) pendant un an et ne sert qu’à l’assistance, la sécurité et
          le bon fonctionnement.
        </p>
        <h3 className="font-bold">Données techniques</h3>
        <p>
          À la connexion par code, l’adresse IP est gardée <strong>24 heures au plus</strong>, pour bloquer les essais répétés. Les hébergeurs tiennent les journaux habituels.
        </p>
      </Section>

      <Section id="p-classements" title="Qui voit quoi ?">
        <ul className={ul}>
          <li>
            <strong>L’enseignant</strong> : prénoms et résultats de ses classes (tableau de bord, export CSV). Il ne voit un code qu’à sa création ou son renouvellement.
          </li>
          <li>
            <strong>Un élève connecté</strong> : prénoms (ou pseudos) et scores de sa classe, et de son école s’il ouvre ce classement. Rien d’autre.
          </li>
          <li>Les autres écoles et le public ne voient rien.</li>
        </ul>
      </Section>

      <Section id="p-local" title="Sur l’appareil">
        <p>
          Le navigateur garde les scores, les réglages, la progression, les parties en attente d’envoi (sans réseau) et la connexion. Ce ne sont pas des cookies et rien ne suit les
          personnes. Le site garde aussi ses fichiers pour marcher sans connexion.
        </p>
        <p>
          «&nbsp;Mes progrès&nbsp;» reste <strong>sur l’appareil, et uniquement là</strong> (30 dernières parties de chaque jeu, règles à revoir, lettres ratées), avec un bouton pour tout effacer.
          Les voix du jeu « Le facteur » sont des fichiers du site : aucun enregistrement n’est fait ni envoyé.
        </p>
        <p>
          «&nbsp;La grotte&nbsp;» (élèves et enseignants connectés) est celle de <strong>la classe</strong> : seuls les nombres de fautes et de réussites sont ajoutés aux parties, et le serveur n’en
          montre que la <strong>somme par classe</strong>. L’enseignant peut la remettre à zéro.
        </p>
        <p>
          Sur un ordinateur partagé, l’élève utilise <strong>« Changer d’élève »</strong>. On efface tout avec les réglages du navigateur (« effacer les données du site »).
        </p>
      </Section>

      <Section id="p-tiers" title="Hébergement et services">
        <ul className={ul}>
          <li>
            <strong>Supabase</strong> (base de données, Union européenne&nbsp;: <Todo value={LEGAL.region} what="région choisie, ex. Paris ou Francfort" />) : comptes, élèves, résultats.
          </li>
          <li>
            <strong>GitHub Pages</strong> : seulement les fichiers du site, aucune donnée d’élève. Il voit l’adresse IP des visiteurs dans ses journaux.
          </li>
          <li>
            <strong>Brevo</strong> : e-mails aux enseignants (confirmation, mot de passe oublié). Aucun e-mail aux élèves.
          </li>
          <li>Polices et fichiers viennent du site lui-même : aucun service externe de polices, statistiques ou publicité.</li>
        </ul>
      </Section>

      <Section id="p-duree" title="Combien de temps ?">
        <p>
          <strong>Parties et élèves sont effacés automatiquement au bout de 13 mois</strong> (élèves sans partie compris). <strong>À partir du 15 juin, l’espace enseignant propose d’exporter
          puis d’effacer les résultats de la classe.</strong> L’enseignant peut supprimer une classe, l’école ou son compte à tout moment : c’est définitif.
        </p>
      </Section>

      <Section id="p-droits" title="Vos droits">
        <p>
          Élèves et parents peuvent demander à l’enseignant, ou à <Todo value={LEGAL.contact} what="adresse e-mail de contact" />, de voir, corriger ou supprimer les données, et s’opposer à
          leur utilisation. En cas de difficulté, on peut saisir la CNIL (<span className="font-bold">cnil.fr</span>).
        </p>
      </Section>

      <Section id="p-securite" title="Sécurité">
        <p>
          Échanges chiffrés (HTTPS). Chaque enseignant n’accède qu’aux classes de son école, chaque élève qu’à ses résultats et aux classements. Les essais répétés de codes sont bloqués.
        </p>
      </Section>

      <Section id="p-familles" title="Note pour les familles">
        <p>
          Votre enfant joue pour s’entraîner (clavier, calcul, lecture, mémoire). Pour que l’enseignant suive la classe, il se connecte avec un code : le site enregistre son prénom (ou
          pseudo) et ses résultats. Pas de publicité, pas de cookie, pas de suivi, rien n’est vendu. Vous pouvez demander à l’enseignant de voir ou supprimer ces données.
        </p>
        <p className="no-print">
          <button type="button" className="btn btn-ghost" onClick={() => window.print()}>
            Imprimer cette page
          </button>
        </p>
      </Section>

      <SiteFooter current="privacy" onNav={onNav} />
    </Frame>
  );
}
