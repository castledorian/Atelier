import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { BackButton } from '../components/BackButton';
import { APP_VERSION, KIND_LABEL, RELEASES, hasUnreadNews, markNewsRead } from '../content/changelog';
import type { Credit } from '../content/credits';
import { BUILD, RUNTIME, SERVICES } from '../content/credits';
import { GAMES } from '../content/games';
import { LEGAL } from '../legal';
import { Frame } from './Frame';

/** Pages d'information du site (hors jeux) : on passe de l'une à l'autre par le pied de page. */
export type InfoView = 'news' | 'about' | 'a11y' | 'privacy' | 'credits' | 'contact';

const LINKS: Array<{ id: InfoView; label: string }> = [
  { id: 'news', label: 'Nouveautés' },
  { id: 'about', label: 'À propos' },
  { id: 'a11y', label: 'Accessibilité' },
  { id: 'privacy', label: 'Confidentialité' },
  { id: 'credits', label: 'Crédits' },
  { id: 'contact', label: 'Contact' },
];

export const isInfoView = (v: string): v is InfoView => LINKS.some((l) => l.id === v);

/** Pied de page commun : accueil et pages d'information. */
export function SiteFooter({ current, onNav }: { current?: InfoView; onNav: (v: InfoView) => void }) {
  const unread = current !== 'news' && hasUnreadNews();
  return (
    <footer className="site-foot no-print">
      <nav aria-label="Informations sur le site">
        <ul className="site-foot-links">
          {LINKS.map((l) => (
            <li key={l.id}>
              <button type="button" className="link" aria-current={current === l.id ? 'page' : undefined} onClick={() => onNav(l.id)}>
                {l.label}
                {l.id === 'news' && unread && <span className="new-dot"> · nouveau</span>}
              </button>
            </li>
          ))}
        </ul>
      </nav>
      <p className="site-foot-line">
        Atelier · version {APP_VERSION} · Pas de pub, pas de cookie.
      </p>
    </footer>
  );
}

function Page({ id, eyebrow, title, intro, onBack, onNav, children }: { id: InfoView; eyebrow: string; title: string; intro?: string; onBack: () => void; onNav: (v: InfoView) => void; children: ReactNode }) {
  return (
    <Frame wide>
      <div className="card-top no-print">
        <BackButton onClick={onBack} label="Accueil" autoFocus />
      </div>
      <p className="eyebrow">{eyebrow}</p>
      <h1 className="title-sm">{title}</h1>
      <div className="rule" aria-hidden="true" />
      {intro && <p className="mt-3 text-[15px] leading-snug">{intro}</p>}
      {children}
      <SiteFooter current={id} onNav={onNav} />
    </Frame>
  );
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

interface PageProps {
  onBack: () => void;
  onNav: (v: InfoView) => void;
}

// ───────────────────────────── Nouveautés ─────────────────────────────

export function News({ onBack, onNav }: PageProps) {
  useEffect(() => {
    markNewsRead();
  }, []);
  return (
    <Page id="news" eyebrow="Journal des versions" title="Nouveautés" intro="Ce qui change sur le site, de la version la plus récente à la plus ancienne." onBack={onBack} onNav={onNav}>
      {RELEASES.map((r, i) => (
        <section key={r.version} className="sec" aria-labelledby={`v-${r.version}`}>
          <h2 id={`v-${r.version}`} className="subhead mb-1">
            Version {r.version}
            {i === 0 && <span className="news-current"> · actuelle</span>}
          </h2>
          <p className="text-[14px] text-ink/70">
            <time dateTime={r.iso}>{r.date}</time> · {r.title}
          </p>
          <ul className="news-list">
            {r.changes.map((c, k) => (
              <li key={k}>
                <span className={`news-tag news-${c.kind}`}>{KIND_LABEL[c.kind]}</span>
                <span>{c.text}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </Page>
  );
}

// ───────────────────────────── À propos ─────────────────────────────

export function About({ onBack, onNav }: PageProps) {
  return (
    <Page
      id="about"
      eyebrow="Le site"
      title="À propos"
      intro="Atelier est un site de petits jeux pour s’entraîner en classe ou à la maison, du CP au CM2. Il est gratuit, sans publicité et sans cookie."
      onBack={onBack}
      onNav={onNav}
    >
      <Section id="a-jeux" title="Les quatre jeux">
        <p>Chaque partie dure quelques minutes. Seuls les jeux adaptés à la classe choisie s’affichent à l’accueil.</p>
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

      <Section id="a-diff" title="Trois difficultés, dans chaque classe">
        <ul className={ul}>
          <li>
            <strong>Apprenti</strong> : pour découvrir le jeu, avec plus de temps et plus de droit à l’erreur.
          </li>
          <li>
            <strong>Standard</strong> : le rythme attendu pour la classe.
          </li>
          <li>
            <strong>Expert</strong> : pour se mesurer à un vrai défi.
          </li>
        </ul>
        <p>Un élève de CP et un élève de CM2 qui jouent en « Standard » ne voient pas le même contenu : calculs, mots et phrases changent avec la classe. La difficulté ne dépend pas de la taille de l’écran.</p>
      </Section>

      <Section id="a-classe" title="En classe">
        <ul className={ul}>
          <li>L’enseignant crée un compte, puis son école, ses classes et ses élèves. Chaque élève reçoit un code : aucune adresse e-mail d’élève n’est demandée.</li>
          <li>Il peut proposer des <strong>séances</strong> (un jeu, une difficulté, un nombre d’essais limité), fixer le niveau de la classe et suivre les résultats.</li>
          <li>Les élèves retrouvent leurs séances à faire dès qu’ils se connectent avec leur code.</li>
          <li>Les jeux restent accessibles <strong>sans compte</strong> : les scores sont alors gardés uniquement sur l’appareil.</li>
        </ul>
        <p>
          Les règles de conservation des données sont détaillées dans la page{' '}
          <button type="button" className="link inline-link" onClick={() => onNav('privacy')}>
            Confidentialité
          </button>
          , avec une note prête à remettre aux familles.
        </p>
      </Section>

      <Section id="a-materiel" title="Matériel">
        <ul className={ul}>
          <li>Fonctionne dans un navigateur récent, sur ordinateur, tablette ou téléphone, et s’affiche sur un tableau ou un vidéoprojecteur interactif.</li>
          <li>Léger : conçu pour rester fluide sur les ordinateurs et les réseaux d’école parfois anciens ou lents.</li>
          <li>Installable comme une application ; il fonctionne ensuite sans connexion (les résultats sont envoyés au retour du réseau).</li>
          <li>Le son peut être coupé dans chaque jeu.</li>
        </ul>
      </Section>

      <Section id="a-limites" title="Ce que le site n’est pas">
        <ul className={ul}>
          <li>Un entraînement ludique, pas une évaluation officielle : les scores servent au jeu et au suivi de classe.</li>
          <li>Un site <strong>indépendant</strong> : il n’est ni édité, ni validé, ni labellisé par le ministère de l’Éducation nationale. Les contenus s’appuient sur les programmes des cycles 2 et 3.</li>
        </ul>
      </Section>

      <Section id="a-editeur" title="Qui est derrière Atelier ?">
        <p>
          Le site est édité par <strong>{LEGAL.editor}</strong>. Une remarque, une erreur, une idée de jeu&nbsp;? La page{' '}
          <button type="button" className="link inline-link" onClick={() => onNav('contact')}>
            Contact
          </button>{' '}
          est faite pour ça.
        </p>
      </Section>
    </Page>
  );
}

// ───────────────────────────── Accessibilité ─────────────────────────────

export function Accessibility({ onBack, onNav }: PageProps) {
  return (
    <Page
      id="a11y"
      eyebrow="Pour tous les élèves"
      title="Accessibilité"
      intro="Atelier s’efforce d’être utilisable par le plus grand nombre, en s’inspirant du référentiel général d’amélioration de l’accessibilité (RGAA). Cette déclaration est une démarche volontaire."
      onBack={onBack}
      onNav={onNav}
    >
      <Section id="x-etat" title="État de conformité">
        <p>
          <strong>Le site n’a pas encore fait l’objet d’un audit d’accessibilité complet</strong> par un tiers : il n’est donc pas déclaré conforme au RGAA. Les points ci-dessous sont des
          vérifications menées par l’éditeur, pas une certification.
        </p>
      </Section>

      <Section id="x-ok" title="Ce qui est en place">
        <ul className={ul}>
          <li>Langue de la page déclarée en français ; pages d’information structurées par titres.</li>
          <li>Textes d’au moins 14 px, boutons et zones à toucher d’au moins 44 px, contrastes renforcés.</li>
          <li>Menus, formulaires et boutons utilisables au clavier, avec un contour visible sur l’élément actif. Frappe ! se joue au clavier.</li>
          <li>Messages d’erreur et de confirmation annoncés aux lecteurs d’écran.</li>
          <li>Animations réduites quand l’appareil le demande (réglage « réduire les animations »).</li>
          <li>Sons facultatifs : ils peuvent être coupés dans chaque jeu.</li>
          <li>Pages adaptées au tableau interactif, à la tablette et au téléphone ; sur téléphone en paysage, les jeux concernés se mettent en pause.</li>
          <li>Aucun CAPTCHA, aucun contenu chargé depuis un autre site, aucune publicité.</li>
          <li>Difficulté « Apprenti » : plus de temps et plus de droit à l’erreur, pour les élèves qui ont besoin d’aller moins vite.</li>
        </ul>
      </Section>

      <Section id="x-limites" title="Limites connues">
        <ul className={ul}>
          <li>
            <strong>Les jeux sont des jeux d’action visuels et chronométrés</strong> (Frappe !, Course à l’encre, Chasse aux fautes). Le déroulement de la partie n’est pas décrit en
            texte : ils sont difficilement utilisables avec un lecteur d’écran.
          </li>
          <li>Mémoire d’encre repose sur la mémorisation d’éléments visuels, sans équivalent sonore ou tactile complet.</li>
          <li>Les polices, de style machine à écrire, ne sont pas modifiables ; il n’existe pas encore de réglage dédié (police adaptée à la dyslexie, taille du texte, contraste maximal).</li>
          <li>Certains gestes (glisser la plume dans la Course à l’encre) sont plus aisés au doigt ou à la souris ; des touches du clavier existent aussi.</li>
          <li>Les extraits animés des jeux (bouton « i ») sont accompagnés d’un texte, mais n’ont pas de transcription complète.</li>
        </ul>
      </Section>

      <Section id="x-aide" title="Une difficulté&nbsp;? Dites-le-nous">
        <p>
          Si un élève ne peut pas utiliser une partie du site, ou si vous voyez un défaut qui n’est pas listé ici, écrivez-nous via la page{' '}
          <button type="button" className="link inline-link" onClick={() => onNav('contact')}>
            Contact
          </button>{' '}
          en précisant l’appareil, le navigateur et l’aide technique utilisée. L’éditeur étudie chaque retour.
        </p>
        <p>En cas de difficulté persistante, vous pouvez aussi saisir le Défenseur des droits (defenseurdesdroits.fr).</p>
        <p className="text-[14px] text-ink/70">Déclaration établie le {LEGAL.updated}.</p>
      </Section>
    </Page>
  );
}

// ───────────────────────────── Crédits ─────────────────────────────

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
      intro="Atelier est construit avec des logiciels libres et des polices libres de droits. Voici ce qu’il utilise, avec leurs licences."
      onBack={onBack}
      onNav={onNav}
    >
      <Section id="c-creation" title="Création">
        <ul className={ul}>
          <li>Conception, programmation et rédaction des contenus pédagogiques (calculs, phrases, consignes) : {LEGAL.editor}.</li>
          <li>Illustrations (taches d’encre, créatures, décors) : dessinées pour le site en SVG, sans image extérieure.</li>
          <li>Effets sonores : produits par le navigateur au moment de jouer, sans fichier audio ni enregistrement extérieur.</li>
          <li>Les programmes de l’école primaire (cycles 2 et 3) ont servi de référence pour choisir les contenus par classe.</li>
        </ul>
      </Section>

      <Section id="c-site" title="Ce qui est envoyé à l’élève">
        <CreditTable rows={RUNTIME} caption="Bibliothèques et polices utilisées dans les pages du site" />
      </Section>

      <Section id="c-outils" title="Outils de fabrication">
        <p>Ils servent à construire le site, mais ne sont pas envoyés aux élèves.</p>
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
          © 2026 {LEGAL.editor}. Les textes, illustrations et le code propres à Atelier ne peuvent pas être copiés ni republiés sans accord. Les logiciels et polices cités ci-dessus restent
          soumis à leurs licences d’origine, dont les textes complets sont disponibles sur les sites indiqués.
        </p>
      </Section>
    </Page>
  );
}

// ───────────────────────────── Contact ─────────────────────────────

const TOPICS = [
  { id: 'error', label: 'Erreur dans un jeu (phrase, calcul, consigne)' },
  { id: 'bug', label: 'Problème d’affichage ou de fonctionnement' },
  { id: 'a11y', label: 'Difficulté d’accessibilité' },
  { id: 'data', label: 'Données personnelles (accès, correction, suppression)' },
  { id: 'security', label: 'Problème de sécurité' },
  { id: 'idea', label: 'Question ou suggestion' },
] as const;

const GAME_CHOICES = ['Aucun jeu en particulier', 'Frappe !', 'Course à l’encre', 'Chasse aux fautes', 'Mémoire d’encre'];

export function Contact({ onBack, onNav }: PageProps) {
  const [topic, setTopic] = useState<(typeof TOPICS)[number]['id']>('error');
  const [game, setGame] = useState(GAME_CHOICES[0]);
  const [grade, setGrade] = useState('');
  const [message, setMessage] = useState('');
  const [tech, setTech] = useState(false);
  const [copied, setCopied] = useState<'ok' | 'ko' | null>(null);

  const label = TOPICS.find((t) => t.id === topic)?.label ?? '';
  const subject = `[Atelier ${APP_VERSION}] ${label}`;
  const lines = [message.trim(), '', '—', `Jeu : ${game}`];
  if (grade.trim()) lines.push(`Classe : ${grade.trim()}`);
  lines.push(`Version du site : ${APP_VERSION}`);
  if (tech && typeof window !== 'undefined') {
    lines.push(`Navigateur : ${window.navigator.userAgent}`, `Écran : ${window.innerWidth} × ${window.innerHeight} px`);
  }
  const body = lines.join('\n');
  const ready = message.trim().length > 0 && LEGAL.contact.trim().length > 0;
  const mailto = `mailto:${LEGAL.contact}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`À : ${LEGAL.contact}\nObjet : ${subject}\n\n${body}`);
      setCopied('ok');
    } catch {
      setCopied('ko');
    }
  };

  return (
    <Page
      id="contact"
      eyebrow="Écrire à l’éditeur"
      title="Contact"
      intro="Une erreur dans une phrase, un calcul qui ne tombe pas juste, un bouton qui ne répond pas, une question&nbsp;: écrivez-nous."
      onBack={onBack}
      onNav={onNav}
    >
      <Section id="k-adresse" title="Par e-mail">
        <p>
          Adresse&nbsp;: <a className="inline-link" href={`mailto:${LEGAL.contact}`}>{LEGAL.contact}</a>
        </p>
        <p className="notice notice-info">
          N’écrivez <strong>jamais le nom d’un élève, son code ou une information personnelle</strong> : décrivez la situation sans l’identifier.
        </p>
      </Section>

      <Section id="k-form" title="Préparer mon message">
        <p>
          Ce formulaire n’envoie rien par lui-même : il prépare un e-mail que vous relisez, puis envoyez depuis votre messagerie.
        </p>
        <div className="contact-form">
          <label htmlFor="k-topic">Sujet</label>
          <select id="k-topic" className="field" value={topic} onChange={(e) => setTopic(e.target.value as typeof topic)}>
            {TOPICS.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>

          <label htmlFor="k-game">Jeu concerné</label>
          <select id="k-game" className="field" value={game} onChange={(e) => setGame(e.target.value)}>
            {GAME_CHOICES.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>

          <label htmlFor="k-grade">Classe (facultatif)</label>
          <input id="k-grade" className="field" type="text" maxLength={20} value={grade} onChange={(e) => setGrade(e.target.value)} placeholder="ex. CE2, difficulté Standard" />

          <label htmlFor="k-msg">Votre message</label>
          <textarea
            id="k-msg"
            className="field contact-msg"
            rows={6}
            maxLength={1500}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={topic === 'error' ? 'Citez la phrase ou le calcul, puis dites ce qui n’est pas correct.' : 'Décrivez ce qui s’est passé.'}
          />

          <label className="contact-check">
            <input type="checkbox" checked={tech} onChange={(e) => setTech(e.target.checked)} />
            <span>Ajouter le navigateur et la taille de l’écran (utile pour un problème d’affichage)</span>
          </label>
        </div>

        <div className="who-actions">
          {ready ? (
            <a className="btn btn-primary" href={mailto}>
              Ouvrir mon e-mail
            </a>
          ) : (
            <button type="button" className="btn btn-primary" disabled>
              Ouvrir mon e-mail
            </button>
          )}
          <button type="button" className="btn btn-ghost" disabled={!ready} onClick={copy}>
            Copier le message
          </button>
        </div>
        <p className="text-[14px] leading-snug text-ink/75" role="status">
          {copied === 'ok' && 'Message copié : collez-le dans votre messagerie.'}
          {copied === 'ko' && 'La copie n’a pas fonctionné : sélectionnez le texte à la main.'}
          {copied === null && 'Si rien ne s’ouvre (messagerie en ligne), utilisez « Copier le message ».'}
        </p>
      </Section>

      <Section id="k-secu" title="Problème de sécurité">
        <p>
          Si vous pensez avoir trouvé une faille, choisissez le sujet « Problème de sécurité » et décrivez-la sans la publier ailleurs avant que l’éditeur ait pu la corriger.
        </p>
      </Section>

      <Section id="k-donnees" title="Données des élèves">
        <p>
          Pour voir, corriger ou supprimer les données d’un élève, adressez-vous d’abord à son enseignant, qui peut le faire lui-même. À défaut, écrivez à l’adresse ci-dessus ; les droits sont
          détaillés dans la page{' '}
          <button type="button" className="link inline-link" onClick={() => onNav('privacy')}>
            Confidentialité
          </button>
          .
        </p>
      </Section>
    </Page>
  );
}
