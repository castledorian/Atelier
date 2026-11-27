import { useEffect } from 'react';
import { KIND_LABEL, RELEASES, markNewsRead } from '../../content/changelog';
import { Page } from './shared';
import type { PageProps } from './shared';

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
