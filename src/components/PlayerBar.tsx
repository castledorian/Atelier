import { GoutteArt } from './GoutteArt';
import { useGoutte } from './useGoutte';
import { ACHIEVEMENTS, STAGES, achieved, levelProgress, stageOf, xpOf } from '../game/goutte/rules';

/**
 * La barre du joueur sur l'accueil : sa goutte, son niveau, sa barre d'expérience, ses friandises et ses succès.
 * Un seul bouton : ouvrir « Ma goutte ».
 */
export default function PlayerBar({ token, onOpen }: { token: string | null; onOpen: () => void }) {
  const { view } = useGoutte(token, token?.startsWith('obs:') ?? false);
  const xp = xpOf(view.counters);
  const lp = levelProgress(xp);
  const stage = stageOf(lp.level);
  const mood = view.mood;
  const done = ACHIEVEMENTS.filter((a) => achieved(a, view.progress)).length;
  return (
    <button type="button" className="pbar" onClick={onOpen} aria-label={`Ma goutte : ${view.look.name}, niveau ${lp.level}, ${view.treatsLeft} friandises à donner${mood === 'hungry' ? ', elle a faim' : ''}. Ouvrir.`}>
      <span className="pbar-art" aria-hidden="true">
        <GoutteArt look={view.look} stage={stage} mood={mood} />
        {view.treatsLeft > 0 && <span className="pbar-dot">{view.treatsLeft > 99 ? '99+' : view.treatsLeft}</span>}
      </span>
      <span className="pbar-main" aria-hidden="true">
        <span className="pbar-name">{view.look.name}</span>
        <span className="pbar-lv">
          {STAGES[stage].name} · niveau {lp.level}
        </span>
        <span className="pbar-xp">
          <i style={{ width: `${Math.round(lp.fill * 100)}%` }} />
        </span>
      </span>
      <span className="pbar-side" aria-hidden="true">
        <span>
          <b>{view.treatsLeft}</b> friandise{view.treatsLeft > 1 ? 's' : ''}
        </span>
        {mood === 'hungry' && <span className="pbar-hungry">a faim !</span>}
        <span>
          <b>{done}</b>/{ACHIEVEMENTS.length} succès
        </span>
      </span>
      <span className="pbar-go" aria-hidden="true">
        Ma goutte →
      </span>
    </button>
  );
}
