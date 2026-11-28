import { useState } from 'react';
import { APP_VERSION } from '../../content/changelog';
import { LEGAL } from '../../legal';
import { Fold, Page, Section } from './shared';
import type { PageProps } from './shared';

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
      intro="Une erreur, un bug, une question&nbsp;: écrivez-nous."
      onBack={onBack}
      onNav={onNav}
    >
      <Section id="k-adresse" title="Par e-mail">
        <p>
          <a className="inline-link" href={`mailto:${LEGAL.contact}`}>
            {LEGAL.contact}
          </a>
        </p>
        <p className="notice notice-info">
          N’écrivez <strong>jamais le nom d’un élève, son code ou une information personnelle</strong>.
        </p>
      </Section>

      <Section id="k-form" title="Préparer mon message">
        <p>Prépare un e-mail que vous relisez puis envoyez vous-même : rien n’est envoyé d’ici.</p>
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

      <Fold id="k-secu" title="Problème de sécurité">
        <p>Choisissez le sujet « Problème de sécurité » et décrivez la faille sans la publier avant qu’elle soit corrigée.</p>
      </Fold>

      <Fold id="k-donnees" title="Données des élèves">
        <p>
          Voir, corriger ou supprimer : demandez d’abord à l’enseignant, qui peut le faire lui-même. À défaut, écrivez ici ; détails dans{' '}
          <button type="button" className="link inline-link" onClick={() => onNav('privacy')}>
            Confidentialité
          </button>
          .
        </p>
      </Fold>
    </Page>
  );
}
