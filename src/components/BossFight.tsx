import { useEffect, useMemo, useRef, useState } from 'react';
import { Monster } from './Monster';
import { GoutteArt } from './GoutteArt';
import type { Fighter } from './CaveParts';
import { stageOf } from '../game/goutte/rules';
import { Sfx } from '../game/audio';
import { buildFight, stateAt } from '../game/boss/fight';

/**
 * Le grand combat de fin d'année : la classe attaque la créature d'encre. Avec un compte, chaque élève combat avec sa goutte
 * guerrière (`fighters`) ; sinon, avec les prénoms saisis sur l'appareil.
 * La scène suit le scénario écrit dans `src/game/boss/fight.ts` ; elle ne fait que l'afficher.
 * Accessibilité : le récit est annoncé (aria-live), un bouton « Passer » saute à la fin,
 * et tout fonctionne sans animation si l'appareil demande à les réduire.
 */
export default function BossFight({
  names,
  fighters = [],
  form,
  grow = 0,
  power,
  sound,
  onDone,
}: {
  names: string[];
  fighters?: Fighter[];
  /** forme du monstre (0 à 9) */
  form: number;
  grow?: number;
  power: number;
  sound: boolean;
  onDone: () => void;
}) {
  const roster = useMemo(() => (fighters.length ? fighters.map((f) => f.name) : names), [fighters, names]);
  const fight = useMemo(() => buildFight(roster, form, power), [roster, form, power]);
  const [ms, setMs] = useState(0);
  const [hit, setHit] = useState<number | null>(null);
  const [all, setAll] = useState(false);
  const [shake, setShake] = useState(false);
  const [done, setDone] = useState(false);
  const played = useRef(-1);
  const sfx = useMemo(() => new Sfx(), []);

  useEffect(() => {
    sfx.enabled = sound;
    if (sound) sfx.unlock();
  }, [sfx, sound]);

  // Horloge du combat : un seul fil, l'écran lit le scénario à l'instant voulu
  useEffect(() => {
    if (done) return;
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const at = now - t0;
      setMs(at);
      if (at >= fight.total) {
        setDone(true);
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [fight, done]);

  const view = stateAt(fight, done ? fight.total : ms);

  // Sons, frappes et secousses : joués une seule fois, au passage de chaque temps fort
  useEffect(() => {
    if (view.index <= played.current) return;
    for (let i = played.current + 1; i <= view.index; i++) {
      const b = fight.beats[i];
      if (b.sound) sfx.play(b.sound);
      setHit(b.strike ?? null);
      if (b.all) setAll(true);
      if (b.shake) {
        setShake(true);
        window.setTimeout(() => setShake(false), 420);
      }
    }
    played.current = view.index;
  }, [view.index, fight, sfx]);

  const skip = () => {
    played.current = fight.beats.length - 1;
    setAll(true);
    setHit(null);
    setDone(true);
  };

  const over = done || view.hp <= 0;
  const size = 1; // la taille de chaque forme est déjà donnée par le monstre lui-même

  return (
    <div className={`bf${shake ? ' bf-shake' : ''}`} data-low={view.classHp <= 20 ? 'yes' : 'no'}>
      <div className="bf-stage">
        <div className="bf-boss" style={{ ['--bsize' as string]: String(size) }} data-dead={over ? 'yes' : 'no'}>
          <Monster form={form} grow={grow} mood={view.mood} />
        </div>
        <ul className="bf-names" data-low={view.classHp <= 20 ? 'yes' : 'no'} aria-hidden="true">
          {fighters.length
            ? fighters.map((f, i) => (
                <li key={`${f.name}-${i}`} className={`bf-name bf-fighter${f.me ? ' is-me' : ''}${hit === i ? ' bf-hit' : ''}${all ? ' bf-all' : ''}`}>
                  <GoutteArt look={f.look} stage={stageOf(f.level)} mood={hit === i || all ? 'cheer' : 'happy'} />
                  <span>{f.name}</span>
                </li>
              ))
            : (names.length ? names : ['La classe']).map((n, i) => (
                <li key={`${n}-${i}`} className={`bf-name${hit === i ? ' bf-hit' : ''}${all ? ' bf-all' : ''}`}>
                  {n}
                </li>
              ))}
        </ul>
      </div>

      <div className="bf-bars">
        <p className="bf-bar" data-kind="ink">
          <span className="bf-bar-label">{fight.name}</span>
          <span className="bf-bar-track">
            <i style={{ width: `${Math.max(0, view.hp)}%` }} />
          </span>
          <span className="bf-bar-val">{Math.max(0, Math.round(view.hp))}&nbsp;%</span>
        </p>
        <p className="bf-bar" data-kind="class" data-low={view.classHp <= 20 ? 'yes' : 'no'}>
          <span className="bf-bar-label">La classe</span>
          <span className="bf-bar-track">
            <i style={{ width: `${Math.max(0, view.classHp)}%` }} />
          </span>
          <span className="bf-bar-val">{Math.max(0, Math.round(view.classHp))}&nbsp;%</span>
        </p>
      </div>

      <p className="bf-text" role="status" aria-live="polite">
        {view.text}
      </p>

      <div className="bf-foot">
        {done ? (
          <button type="button" className="btn btn-primary" autoFocus onClick={onDone}>
            Continuer
          </button>
        ) : (
          <button type="button" className="btn btn-ghost" onClick={skip}>
            Passer l’animation
          </button>
        )}
      </div>
    </div>
  );
}
