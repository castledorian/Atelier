import { useEffect, useRef, useState } from 'react';
import { FALLBACK_STAGE, FORM_ART, artUrl } from '../game/boss/art';
import { LAST_FORM } from '../game/boss/forms';
import { InkBoss } from './InkBoss';
import { MonsterFace } from './MonsterFace';
import type { BossMood } from './MonsterFace';

/**
 * Le monstre de la grotte : l'illustration de sa forme (corps sans visage) + un visage et des animations dessinés en code.
 *  - il respire, cligne des yeux, regarde de côté ; il dort (paupières closes, « z ») ou s'agite selon `mood` ;
 *  - un toucher ou un clic le fait rebondir ;
 *  - entre deux formes il enfle doucement (`grow`) ; les grandes formes ont une aura qui pulse ;
 *  - sans illustration pour cette forme, le dessin vectoriel de secours prend le relais (voir art.ts).
 * Décor seulement (aria-hidden) : le nom et les points de vie sont écrits à côté.
 * Toutes les animations sont coupées si l'appareil demande moins de mouvement (monster.css).
 */
export function Monster({ form, grow = 0, mood = 'idle', title }: { form: number; grow?: number; mood?: BossMood; title?: string }) {
  const f = Math.max(0, Math.min(LAST_FORM, Math.round(form)));
  const art = FORM_ART[f];
  const [boing, setBoing] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  if (!art) return <InkBoss stage={FALLBACK_STAGE[f]} grow={grow} mood={mood} title={title} />;

  const poke = () => {
    window.clearTimeout(timer.current);
    setBoing(true);
    timer.current = window.setTimeout(() => setBoing(false), 650);
  };
  const g = Math.max(0, Math.min(1, grow));
  return (
    <div className={`mn${boing ? ' mn-boing' : ''}`} data-form={f} data-mood={mood} aria-hidden="true" onPointerDown={poke}>
      {title && <span className="sr-only">{title}</span>}
      {art.aura && <span className="mn-aura" />}
      <div className="mn-all" style={{ transform: `scale(${1 + 0.06 * g})` }}>
        <div className="mn-pop">
          <div className="mn-breathe">
            <img className="mn-img" src={artUrl(f)} alt="" width={512} height={512} decoding="async" draggable={false} />
            <svg className="mn-face" viewBox="0 0 240 240" focusable="false">
              <MonsterFace g={art.face} mood={mood} />
            </svg>
          </div>
        </div>
      </div>
      {mood === 'sleep' && (
        <span className="mn-zzz" aria-hidden="true">
          z<b>Z</b>
        </span>
      )}
    </div>
  );
}
