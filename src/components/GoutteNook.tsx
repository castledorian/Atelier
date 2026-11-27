import { GoutteArt } from './GoutteArt';
import { useGoutte } from './useGoutte';
import { levelProgress, stageOf, xpOf } from '../game/goutte/rules';

/**
 * Le coin de la goutte sur l'accueil, juste à côté de la porte de la grotte : elle garde l'entrée.
 * Cadre de taille fixe : ni le texte ni l'humeur ne le font grandir ou bouger (une seule ligne d'état, coupée si trop longue).
 */
export default function GoutteNook({ token, onOpen }: { token: string | null; onOpen: () => void }) {
  const { view } = useGoutte(token, false);
  const lp = levelProgress(xpOf(view.counters));
  const stage = stageOf(lp.level);
  const { mood, treatsLeft } = view;
  const state =
    mood === 'sleep'
      ? 'Elle dort'
      : mood === 'hungry'
        ? 'Elle a faim !'
        : treatsLeft > 0
          ? `${treatsLeft > 99 ? '99+' : treatsLeft} friandise${treatsLeft > 1 ? 's' : ''}`
          : 'En pleine forme';
  return (
    <button type="button" className="nook" onClick={onOpen} aria-label={`Ma goutte, niveau ${lp.level} : ${state}. Ouvrir.`}>
      <span className="nook-art" aria-hidden="true">
        <GoutteArt look={view.look} stage={stage} mood={mood} />
      </span>
      <span className="nook-txt" aria-hidden="true">
        <span className="nook-name">Ma goutte</span>
        <span className="nook-lv">Niveau {lp.level}</span>
        <span className="nook-xp">
          <i style={{ width: `${Math.round(lp.fill * 100)}%` }} />
        </span>
        <span className="nook-state" data-alert={mood === 'hungry' ? 'yes' : 'no'}>
          {state}
        </span>
      </span>
    </button>
  );
}
