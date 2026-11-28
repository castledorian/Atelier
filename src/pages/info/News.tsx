import { useEffect } from 'react';
import { KIND_LABEL, RELEASES, markNewsRead } from '../../content/changelog';
import type { Release } from '../../content/changelog';
import { Fold, Page } from './shared';
import type { PageProps } from './shared';

/** Combien de versions restent visibles ; les plus anciennes sont repliées. */
const VISIBLE = 3;

function ReleaseBlock({ r, current, level }: { r: Release; current: boolean; level: 'h2' | 'h3' }) {
  const Heading = level;
  return (
    <section className="sec" aria-labelledby={`v-${r.version}`}>
      <Heading id={`v-${r.version}`} className="subhead mb-1">
        Version {r.version}
        {current && <span className="news-current"> · actuelle</span>}
      </Heading>
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
  );
}

export function News({ onBack, onNav }: PageProps) {
  useEffect(() => {
    markNewsRead();
  }, []);
  const recent = RELEASES.slice(0, VISIBLE);
  const older = RELEASES.slice(VISIBLE);
  return (
    <Page id="news" eyebrow="Journal des versions" title="Nouveautés" intro="Du plus récent au plus ancien." onBack={onBack} onNav={onNav}>
      {recent.map((r, i) => (
        <ReleaseBlock key={r.version} r={r} current={i === 0} level="h2" />
      ))}
      {older.length > 0 && (
        <Fold id="v-anciennes" title={`Versions précédentes (${older.length})`}>
          {older.map((r) => (
            <ReleaseBlock key={r.version} r={r} current={false} level="h3" />
          ))}
        </Fold>
      )}
    </Page>
  );
}
