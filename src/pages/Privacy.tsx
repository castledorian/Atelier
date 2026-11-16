import type { ReactNode } from 'react';
import { BackButton } from '../components/BackButton';
import { LEGAL } from '../legal';
import { Frame } from './Frame';

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
export default function Privacy({ onBack }: { onBack: () => void }) {
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
            <strong>Aucune publicité, aucun cookie, aucun traceur</strong>, aucune statistique d’audience, aucun outil d’un autre site chargé dans les jeux.
          </li>
          <li>
            <strong>Sans connexion</strong>, rien ne quitte l’appareil : les scores restent dans le navigateur.
          </li>
          <li>
            <strong>Avec un code d’élève</strong>, le site enregistre un prénom (ou un pseudo), une classe et des résultats de jeux. Rien d’autre : ni nom de famille exigé, ni
            adresse e-mail, ni photo, ni localisation.
          </li>
          <li>
            Les données sont <strong>utilisées uniquement pour l’école</strong> (classements, suivi de la classe), jamais vendues ni transmises à des fins commerciales.
          </li>
          <li>L’enseignant peut <strong>supprimer</strong> un élève, une classe ou toute l’école à tout moment.</li>
        </ul>
      </Section>

      <Section id="p-qui" title="Qui est responsable ?">
        <p>
          C’est l’école, par l’intermédiaire de l’enseignant qui crée la classe et ajoute ses élèves, qui décide d’utiliser le site dans un but pédagogique. Le site est édité par{' '}
          <Todo value={LEGAL.editor} what="nom de l’éditeur" />, qui héberge les données pour le compte de l’école et ne s’en sert pour rien d’autre.
        </p>
        <p>
          Contact pour toute question ou demande&nbsp;: <Todo value={LEGAL.contact} what="adresse e-mail de contact" />. Pour un élève, le plus simple est d’en parler à son
          enseignant, qui peut agir tout de suite.
        </p>
      </Section>

      <Section id="p-donnees" title="Ce qui est enregistré">
        <h3 className="font-bold">Élève, sans connexion</h3>
        <p>
          Les scores, la progression (par exemple les tampons de Mémoire d’encre), les réglages et le dernier niveau choisi restent <strong>dans le navigateur de l’appareil</strong>{' '}
          (« stockage local »). Ils ne sont envoyés à personne.
        </p>
        <h3 className="font-bold">Élève, avec un code</h3>
        <ul className={ul}>
          <li>Le prénom ou pseudo (24 caractères au maximum), choisi par l’enseignant, le nom de la classe et celui de l’école.</li>
          <li>Un code d’accès de 8 caractères, créé au hasard, qui sert de « clé » de connexion.</li>
          <li>Les résultats de chaque partie&nbsp;: jeu, mode, score, niveau atteint, vitesse et précision de frappe, durée, date.</li>
          <li>
            Pour les séances de classe (un jeu réglé par l’enseignant)&nbsp;: le nombre d’essais utilisés et le résultat de chaque essai. Seul le meilleur score compte pour l’évaluation&nbsp;;
            l’enseignant voit tous les essais.
          </li>
          <li>
            Un jeton de connexion, gardé sur l’appareil. Sur le serveur, seule son empreinte est conservée (le jeton lui-même n’y est jamais lu) et il expire au bout de 60 jours.
          </li>
        </ul>
        <h3 className="font-bold">Statistiques anonymes pour régler la difficulté</h3>
        <p>
          À la fin d’une partie libre d’un élève connecté, un résumé est enregistré à part&nbsp;: jeu, niveau, difficulté, score, nombre de réussites et d’erreurs par page, durée. Il ne
          contient <strong>aucun identifiant</strong> (ni élève, ni classe, ni école) et ne permet pas de retrouver la personne. Il sert uniquement à rendre les jeux plus justes pour
          tous. Les parties de séance et les réglages personnalisés n’y figurent pas.
        </p>
        <h3 className="font-bold">Enseignant</h3>
        <ul className={ul}>
          <li>L’adresse e-mail et le mot de passe du compte (le mot de passe est protégé par le service d’identification et n’est lisible par personne).</li>
          <li>Le nom de l’école et les noms des classes.</li>
        </ul>
        <h3 className="font-bold">Données techniques</h3>
        <p>
          Lors d’une connexion par code, l’adresse IP est gardée <strong>24 heures au plus</strong>, uniquement pour bloquer les essais répétés de codes. Les hébergeurs (voir
          plus bas) tiennent par ailleurs les journaux techniques habituels de tout site web.
        </p>
      </Section>

      <Section id="p-classements" title="Qui voit quoi ?">
        <ul className={ul}>
          <li>
            <strong>L’enseignant</strong> voit, pour ses classes, les prénoms, les codes et les résultats de ses élèves (tableau de bord, export CSV).
          </li>
          <li>
            <strong>Un élève connecté</strong> voit le prénom (ou le pseudo) et le score des élèves de sa classe, et de son école s’il ouvre le classement de l’école. Il ne voit ni
            les codes, ni les autres données. Les prénoms ou pseudos choisis par l’enseignant sont donc visibles des camarades de classe.
          </li>
          <li>Les autres écoles et le public ne voient rien.</li>
        </ul>
      </Section>

      <Section id="p-local" title="Sur l’appareil (stockage local)">
        <p>
          Le site garde dans le navigateur&nbsp;: les scores et réglages, la progression, les parties en attente d’envoi quand il n’y a pas de réseau, et la connexion de l’élève ou de
          l’enseignant. Ce ne sont pas des cookies et ils ne servent pas à suivre les personnes. Le site garde aussi ses propres fichiers en mémoire pour fonctionner sans
          connexion.
        </p>
        <p>
          Sur un ordinateur partagé, l’élève utilise <strong>« Changer d’élève »</strong> en fin de séance. On peut tout effacer avec les réglages du navigateur (« effacer les données du
          site »).
        </p>
      </Section>

      <Section id="p-tiers" title="Hébergement et services utilisés">
        <ul className={ul}>
          <li>
            <strong>Base de données&nbsp;: Supabase</strong>, hébergée dans l’Union européenne (<Todo value={LEGAL.region} what="région choisie, ex. Paris ou Francfort" />). C’est là que
            sont les comptes, les élèves et les résultats.
          </li>
          <li>
            <strong>Site web&nbsp;: GitHub Pages.</strong> Il ne distribue que les fichiers du site ; aucune donnée d’élève n’y passe. Comme tout site, il voit l’adresse IP des visiteurs
            dans ses journaux techniques.
          </li>
          <li>
            <strong>E-mails des enseignants&nbsp;: Brevo</strong> (confirmation d’inscription, mot de passe oublié). Aucun e-mail n’est envoyé aux élèves.
          </li>
          <li>Polices et fichiers du site sont fournis par le site lui-même : aucun service externe de polices, de statistiques ou de publicité.</li>
        </ul>
      </Section>

      <Section id="p-duree" title="Combien de temps ?">
        <p>
          Les données restent tant que l’enseignant ne les supprime pas. <strong>Nous recommandons de supprimer les classes en fin d’année scolaire</strong> (bouton « Supprimer » dans
          l’espace enseignant) ; la suppression est définitive et efface aussi les résultats. L’enseignant peut aussi supprimer lui-même son compte (espace enseignant → « Mon compte ») : son adresse e-mail et son mot de passe sont alors effacés, ainsi que les écoles dont il est le seul enseignant.
        </p>
      </Section>

      <Section id="p-droits" title="Vos droits">
        <p>
          Les élèves et leurs parents peuvent demander à l’enseignant, ou à <Todo value={LEGAL.contact} what="adresse e-mail de contact" />, de voir, corriger ou supprimer les données
          de l’élève, et peuvent s’opposer à leur utilisation. L’enseignant peut renommer un élève, lui donner un nouveau code ou le supprimer lui-même. En cas de difficulté, il est
          possible de saisir la CNIL (<span className="font-bold">cnil.fr</span>).
        </p>
      </Section>

      <Section id="p-securite" title="Sécurité">
        <p>
          Les échanges sont chiffrés (HTTPS). Chaque enseignant n’accède qu’aux classes de son école, et chaque élève qu’à ses propres résultats et aux classements. Le code de connexion
          est difficile à deviner et les essais répétés sont bloqués.
        </p>
      </Section>

      <Section id="p-familles" title="Note pour les familles">
        <p>
          Votre enfant joue à des jeux pour s’entraîner (frappe au clavier, calcul, mémoire). Pour que l’enseignant suive la classe, l’enfant se connecte avec un code&nbsp;: le site
          enregistre alors son prénom (ou un pseudo) et ses résultats. Pas de publicité, pas de cookie, pas de suivi, aucune donnée vendue. Vous pouvez demander à l’enseignant
          de voir ou de supprimer ces données quand vous le souhaitez.
        </p>
        <p className="no-print">
          <button type="button" className="btn btn-ghost" onClick={() => window.print()}>
            Imprimer cette page
          </button>
        </p>
      </Section>
    </Frame>
  );
}
