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
              <button type="button" className="foot-link" aria-current={current === l.id ? 'page' : undefined} onClick={() => onNav(l.id)}>
                {l.label}
                {l.id === 'news' && unread && (
                  <>
                    <span className="new-dot" aria-hidden="true" />
                    <span className="sr-only"> (nouveau)</span>
                  </>
                )}
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

// ───────────────────────────── Accessibilité ─────────────────────────────

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
