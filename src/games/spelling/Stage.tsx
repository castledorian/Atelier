import { BOSS_NAME, CannonIcon, ENEMY_NAMES, InkEnemy, PATE_NAMES, SPLASH_NAMES } from '../../components/InkEnemy';
import type { EnemyMood } from '../../components/InkEnemy';
import type { EnemyRole } from '../../game/spelling/engine';
import type { Outcome } from './PlayView';

export const foeName = (role: EnemyRole, slot: number) =>
  role === 'boss' ? BOSS_NAME : role === 'pate' ? PATE_NAMES[slot % PATE_NAMES.length] : role === 'splash' ? SPLASH_NAMES[slot % SPLASH_NAMES.length] : ENEMY_NAMES[slot % ENEMY_NAMES.length];

/** Avancement : une goutte par phrase, la dernière (le Grand Pâté) plus grosse. */
export function Progress({ total, at, boss }: { total: number; at: number; boss: boolean }) {
  return (
    <span className="hx-prog" aria-hidden="true">
      {Array.from({ length: total }, (_, k) => (
        <i key={k} className={`${k < at - 1 ? 'past' : k === at - 1 ? 'now' : ''}${boss && k === total - 1 ? ' last' : ''}`} />
      ))}
    </span>
  );
}

export const HEART = 'M12 21s-7.5-4.6-9.6-9.3C.9 8.3 2.8 4.5 6.5 4.5c2.1 0 3.6 1.2 4.5 2.7.9-1.5 2.4-2.7 4.5-2.7 3.7 0 5.6 3.8 4.1 7.2C19.5 16.4 12 21 12 21z';

/** Les vies : la dernière perdue se brise au moment où l'encre touche le canon. */
export function Hearts({ hp, max, hits }: { hp: number; max: number; hits: number }) {
  return (
    <span className="hx-hearts" role="img" aria-label={`Vies : ${hp} sur ${max}`}>
      {Array.from({ length: max }, (_, k) => (
        <svg key={k === hp && hits > 0 ? `l${hits}` : k} viewBox="0 0 24 24" className={k < hp ? 'on' : k === hp && hits > 0 ? 'lost' : 'off'} aria-hidden="true">
          <path d={HEART} />
        </svg>
      ))}
    </span>
  );
}

export const SIZE: Record<EnemyRole, string> = { splash: '52%', tache: '64%', pate: '74%', boss: '82%' };

/**
 * La scène : le canon (toi) à gauche, la créature à droite, sur une ligne d'encre. Toutes les positions sont en pourcentage de
 * la scène, qui garde les mêmes proportions sur ordinateur et sur téléphone : le boulet et l'encre arrivent toujours au même
 * endroit, sans mesure ni calcul.
 */
export function Stage({ role, kind, name, mood, hits, outcome, impact }: { role: EnemyRole; kind: number; name: string; mood: EnemyMood; hits: number; outcome: Outcome; impact: boolean }) {
  const attacking = hits > 0 || outcome === 'win';
  const atkKey = outcome === 'win' ? `w${hits}` : `a${hits}`;
  return (
    <div className={`hx-stage hx-${role}${outcome === 'win' ? ' hx-lost' : ''}`} aria-hidden="true" style={{ ['--foe' as string]: SIZE[role] }}>
      <div className="hx-ground" />
      <div className="hx-me">
        <div key={`me-${atkKey}-${outcome}`} className={`hx-cannon${outcome === 'strike' ? ' fire' : ''}${attacking ? ' hurt' : ''}`}>
          <CannonIcon />
          {outcome === 'strike' && <span className="hx-flash" />}
        </div>
        {attacking && <span key={`sp-${atkKey}`} className="hx-splat" />}
        <span className="hx-tag">Toi</span>
      </div>
      <div className={`hx-foe${impact || outcome === 'flee' ? ' gone' : ''}`}>
        <span className="hx-tag hx-foe-tag">{name}</span>
        <div className={`hx-foe-in${outcome === 'flee' ? ' flee' : ''}`}>
          <div key={atkKey} className={attacking && outcome !== 'strike' ? 'hx-lunge' : ''}>
            <InkEnemy kind={kind} mood={mood} name={name} />
          </div>
        </div>
        {impact && <ImpactFx />}
      </div>
      {outcome === 'strike' && (
        <span className="hx-ball">
          <i />
        </span>
      )}
      {attacking && (
        <span key={`b-${atkKey}`} className="hx-blob">
          <i />
        </span>
      )}
    </div>
  );
}

/** Étoile d'impact, onde et gouttes, à l'endroit où le boulet touche la créature. Décor seulement. */
export const STAR = Array.from({ length: 16 }, (_, i) => {
  const a = (Math.PI * i) / 8;
  const r = i % 2 === 0 ? 48 : 24;
  return `${(50 + r * Math.cos(a)).toFixed(1)},${(50 + r * Math.sin(a)).toFixed(1)}`;
}).join(' ');
export function ImpactFx() {
  return (
    <span className="hx-impact">
      <svg viewBox="0 0 100 100">
        <polygon points={STAR} />
      </svg>
      <i />
    </span>
  );
}
