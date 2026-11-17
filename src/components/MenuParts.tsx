import { Fragment } from 'react';
import { Check } from './Screens';
import type { Settings, TextSize } from '../game/storage';

/** Éléments communs aux menus des jeux. */

const TEXT_LABEL: Record<TextSize, string> = { normal: 'normal', large: 'grand', xlarge: 'très grand' };
const NEXT_SIZE: Record<TextSize, TextSize> = { normal: 'large', large: 'xlarge', xlarge: 'normal' };

/** Rubrique « Réglages » : son, lecture confortable, taille du texte (et secousses quand le jeu en a). */
export function SettingsRow({ settings, onChange, shake = false }: { settings: Settings; onChange: (p: Partial<Settings>) => void; shake?: boolean }) {
  return (
    <div className="flex flex-wrap gap-x-2 gap-y-1" role="group" aria-label="Options">
      <Check on={settings.sound} onClick={() => onChange({ sound: !settings.sound })}>
        Son
      </Check>
      {shake && (
        <Check on={settings.shake} onClick={() => onChange({ shake: !settings.shake })}>
          Secousses
        </Check>
      )}
      <Check on={settings.comfort} onClick={() => onChange({ comfort: !settings.comfort })}>
        Lecture confortable
      </Check>
      <button
        type="button"
        className="opt"
        aria-label={`Taille du texte : ${TEXT_LABEL[settings.textSize]}. Changer.`}
        onClick={() => onChange({ textSize: NEXT_SIZE[settings.textSize] })}
      >
        Texte&nbsp;: <strong className="text-ribbon">{TEXT_LABEL[settings.textSize]}</strong>
      </button>
    </div>
  );
}

/** Un titre animé : chaque lettre est « tamponnée » l'une après l'autre (les lettres sont cachées aux lecteurs d'écran, `label` les remplace). */
export function StampTitle({ id, label, lines }: { id: string; label: string; lines: Array<{ text: string; ribbon?: string }> }) {
  let at = 80;
  return (
    <h1 id={id} className="title title-2l" aria-label={label}>
      {lines.map((line, li) => (
        <Fragment key={li}>
          <span className="tl" aria-hidden="true">
            {line.ribbon && (
              <>
                <span className="text-ribbon" style={{ animationDelay: `${(at += 70)}ms` }}>
                  {line.ribbon}
                </span>
                {' '}
              </>
            )}
            {line.text.split('').map((ch, i) => (
              <span key={i} style={{ animationDelay: `${(at += 70)}ms` }}>
                {ch}
              </span>
            ))}
          </span>{' '}
        </Fragment>
      ))}
    </h1>
  );
}
