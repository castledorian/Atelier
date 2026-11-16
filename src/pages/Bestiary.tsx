import { useState } from 'react';
import { BackButton } from '../components/BackButton';
import { CreatureArt } from '../components/Creatures';
import { CREATURES, FAMILIES } from '../game/encre/bestiary';
import { loadStore, stateOf } from '../game/encre/tracker';
import type { CreatureState } from '../game/encre/tracker';
import { loadSettings, saveSettings } from '../game/storage';
import { Frame } from './Frame';

const STATE_TEXT: Record<CreatureState, string> = {
  inconnue: 'Pas encore rencontrée',
  silhouette: 'Une ombre est passée',
  encree: 'À apprivoiser : joue un duel',
  palie: 'Pâlie : elle recule !',
  crayon: 'Dessinée au crayon : bien joué !',
};

/** Le bestiaire : une carte par créature, rangée sur cet appareil uniquement. */
export default function Bestiary({ onBack }: { onBack: () => void }) {
  const [store] = useState(loadStore);
  const [calm, setCalm] = useState(() => loadSettings().calm);
  const toggle = () => {
    const s = loadSettings();
    saveSettings({ ...s, calm: !calm });
    setCalm(!calm);
  };
  return (
    <Frame>
      <BackButton onClick={onBack} />
      <h1 className="title">Le bestiaire</h1>
      <p className="mt-2 text-[15px] leading-snug">
        Les taches d’encre sont des fautes courantes. Chacune a une parade : la connaître, c’est déjà la faire reculer. Ce carnet reste sur cet
        appareil.
      </p>
      <label className="mt-3 flex min-h-[44px] items-center gap-2 text-[15px]">
        <input type="checkbox" checked={calm} onChange={toggle} className="h-5 w-5" />
        Version calme (sans visages)
      </label>
      {(Object.keys(FAMILIES) as (keyof typeof FAMILIES)[]).map((fam) => (
        <section key={fam} className="mt-[var(--sp)]" aria-labelledby={`fam-${fam}`}>
          <h2 id={`fam-${fam}`} className="subhead">
            {FAMILIES[fam]}
          </h2>
          <ul className="bestiary">
            {CREATURES.filter((c) => c.family === fam).map((c) => {
              const st = stateOf(store[c.id]);
              const known = st !== 'inconnue';
              return (
                <li key={c.id} className="bcard">
                  <CreatureArt id={c.id} state={st} calm={calm} size={72} label={known ? c.name : undefined} />
                  <div>
                    <strong className="bcard-name">{known ? c.name : '???'}</strong>
                    <span className="bcard-state">{STATE_TEXT[st]}</span>
                    {known && (
                      <>
                        <span className="bcard-line">{c.fault}</span>
                        <span className="bcard-line">
                          <strong>Parade :</strong> {c.parade}
                        </span>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </Frame>
  );
}
