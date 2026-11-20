import { BackButton } from '../components/BackButton';
import { Frame } from './Frame';

/** Affiché à la place des espaces connectés quand le site est intégré dans une autre page. */
export default function FramedNotice({ onBack }: { onBack: () => void }) {
  return (
    <Frame>
      <div className="card-top">
        <BackButton onClick={onBack} />
      </div>
      <p className="eyebrow">Espace protégé</p>
      <h1 className="title-sm">À ouvrir dans sa propre page</h1>
      <div className="rule" aria-hidden="true" />
      <p className="mt-3 text-[15px] leading-snug">
        Pour ta sécurité, la connexion ne s’ouvre pas dans une autre page. Ouvre le site directement dans un nouvel onglet.
      </p>
      <p className="mt-3">
        <a className="btn btn-primary" href={window.location.href} target="_blank" rel="noopener">
          Ouvrir le site
        </a>
      </p>
    </Frame>
  );
}
