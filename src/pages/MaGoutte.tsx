import { useState } from 'react';
import { BackButton } from '../components/BackButton';
import { GoutteArt } from '../components/GoutteArt';
import { useGoutte } from '../components/useGoutte';
import { Frame } from './Frame';
import {
  ACHIEVEMENTS,
  GAME_IDS,
  ITEMS,
  NAME_FIRST,
  NAME_SECOND,
  SLOT_NAME,
  STAGES,
  XP,
  achieved,
  levelProgress,
  moodOf,
  stageOf,
  totalRuns,
  unlockText,
  unlocked,
  xpOf,
} from '../game/goutte/rules';
import type { Look, Slot } from '../game/goutte/rules';
import { GAME_NAMES } from '../game/sessionConfig';

/**
 * « Ma goutte » : la goutte guerrière de l'élève, à la façon d'un Tamagotchi bienveillant.
 * On lui donne des friandises gagnées en jouant, on l'habille avec les objets débloqués, on suit ses succès et ses étapes.
 * Elle ne tombe jamais malade et ne disparaît jamais : au pire, elle dort, et se réveille à la prochaine partie.
 */

type Tab = 'wardrobe' | 'success' | 'growth' | 'how';
const TABS: [Tab, string][] = [
  ['wardrobe', 'Garde-robe'],
  ['success', 'Succès'],
  ['growth', 'Évolution'],
  ['how', 'Comment gagner'],
];
const SLOTS: Slot[] = ['color', 'hat', 'weapon', 'shield', 'acc'];

const SAY = {
  sleep: 'Zzz… Joue une partie pour me réveiller !',
  hungry: (n: number) => `J’ai un petit creux ! Tu as ${n} friandise${n > 1 ? 's' : ''} pour moi.`,
  happy: 'On s’entraîne ensemble ? Chaque partie me rend plus fort.',
  cheer: 'Miam ! Merci, c’est délicieux !',
};

export default function MaGoutte({ token, onBack, readOnly = false }: { token: string | null; onBack: () => void; readOnly?: boolean }) {
  const { view, feed, setLook } = useGoutte(token, readOnly);
  const [tab, setTab] = useState<Tab>('wardrobe');
  const [slot, setSlot] = useState<Slot>('color');
  const [cheer, setCheer] = useState(0);
  const { counters, look, progress, treatsLeft } = view;
  const xp = xpOf(counters);
  const lp = levelProgress(xp);
  const stage = stageOf(lp.level);
  const mood = moodOf(counters, treatsLeft);
  const showMood = cheer > 0 ? 'cheer' : mood;
  const say = cheer > 0 ? SAY.cheer : mood === 'hungry' ? SAY.hungry(treatsLeft) : SAY[mood];
  const done = ACHIEVEMENTS.filter((a) => achieved(a, progress)).length;

  const give = () => {
    if (!feed()) return;
    setCheer((n) => n + 1);
    window.setTimeout(() => setCheer((n) => Math.max(0, n - 1)), 1600);
  };
  const wear = (patch: Partial<Look>) => setLook({ ...look, ...patch });
  const [first, ...rest] = look.name.split(' ');
  const second = rest.join(' ');

  return (
    <Frame>
      <div className="card-top">
        <BackButton onClick={onBack} />
      </div>
      <h1 className="sr-only">Ma goutte</h1>

      <section className="mg-hero" aria-label="Ta goutte">
        <div className="mg-stage" data-stage={stage}>
          <GoutteArt look={look} stage={stage} mood={showMood} className={cheer > 0 ? 'gt-jump' : undefined} />
          {cheer > 0 && (
            <span key={cheer} className="mg-hearts" aria-hidden="true">
              ♥ ♥ ♥
            </span>
          )}
        </div>
        <div className="mg-card">
          <p className="mg-say">« {say} »</p>
          <h2 className="mg-name">{look.name}</h2>
          <p className="mg-stage-name">
            {STAGES[stage].name} · <strong>niveau {lp.level}</strong>
          </p>
          <div className="mg-xp" role="progressbar" aria-label="Expérience" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(lp.fill * 100)}>
            <i style={{ width: `${Math.round(lp.fill * 100)}%` }} />
          </div>
          <p className="mg-xp-txt">{lp.toNext > 0 ? `Encore ${lp.toNext} points pour le niveau ${lp.level + 1}.` : 'Niveau maximum atteint !'}</p>
          <div className="mg-actions">
            <button type="button" className="btn btn-primary" onClick={give} disabled={readOnly || treatsLeft <= 0}>
              Donner une friandise ({treatsLeft})
            </button>
            <span className="mg-meta">
              {done}/{ACHIEVEMENTS.length} succès · {view.fed} friandise{view.fed > 1 ? 's' : ''} données
            </span>
          </div>
        </div>
      </section>

      <div className="seg mg-seg mt-[var(--sp)]" role="tablist" aria-label="Rubriques">
        {TABS.map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} className="seg-b" onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'wardrobe' && (
        <section className="mg-sec" aria-label="Garde-robe">
          <div className="mg-name-pick">
            <label>
              Nom
              <select className="field" value={first} disabled={readOnly} onChange={(e) => wear({ name: `${e.target.value} ${second}` })}>
                {NAME_FIRST.map((n) => (
                  <option key={n}>{n}</option>
                ))}
              </select>
            </label>
            <label>
              <span className="sr-only">Suite du nom</span>
              <select className="field" value={second} disabled={readOnly} onChange={(e) => wear({ name: `${first} ${e.target.value}` })}>
                {NAME_SECOND.map((n) => (
                  <option key={n}>{n}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="seg mg-seg mt-2" role="radiogroup" aria-label="Emplacement">
            {SLOTS.map((s) => (
              <button key={s} type="button" role="radio" aria-checked={slot === s} className="seg-b" onClick={() => setSlot(s)}>
                {SLOT_NAME[s]}
              </button>
            ))}
          </div>
          <ul className="mg-items">
            {slot !== 'color' && (
              <li>
                <button type="button" className="mg-item" aria-pressed={look[slot] === null} disabled={readOnly} onClick={() => wear({ [slot]: null })}>
                  <span className="mg-item-art mg-none" aria-hidden="true">
                    ∅
                  </span>
                  <span className="mg-item-name">Rien</span>
                </button>
              </li>
            )}
            {ITEMS.filter((i) => i.slot === slot).map((i) => {
              const open = unlocked(i, progress);
              const on = look[slot] === i.id;
              return (
                <li key={i.id}>
                  <button type="button" className="mg-item" aria-pressed={on} disabled={!open || readOnly} onClick={() => wear({ [slot]: i.id })}>
                    <span className="mg-item-art" aria-hidden="true">
                      <GoutteArt look={{ ...look, [slot]: i.id }} stage={stage} />
                    </span>
                    <span className="mg-item-name">{i.name}</span>
                    {!open && <span className="mg-lock">🔒 {unlockText(i)}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {tab === 'success' && (
        <section className="mg-sec" aria-label="Succès">
          <ul className="mg-ach">
            {ACHIEVEMENTS.map((a) => {
              const [v, goal] = a.goal(progress);
              const ok = v >= goal;
              return (
                <li key={a.id} data-ok={ok ? 'yes' : 'no'}>
                  <span className="mg-ach-badge" aria-hidden="true">
                    {ok ? '★' : '☆'}
                  </span>
                  <span className="mg-ach-txt">
                    <strong>{a.name}</strong>
                    <span>{a.how}</span>
                    {!ok && (
                      <span className="mg-ach-bar" aria-label={`${Math.min(v, goal)} sur ${goal}`}>
                        <i style={{ width: `${Math.round((Math.min(v, goal) / goal) * 100)}%` }} />
                      </span>
                    )}
                  </span>
                  <span className="sr-only">{ok ? 'obtenu' : `pas encore : ${Math.min(v, goal)} sur ${goal}`}</span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {tab === 'growth' && (
        <section className="mg-sec" aria-label="Évolution">
          <ol className="mg-stages">
            {STAGES.map((st, i) => (
              <li key={st.name} data-state={i < stage ? 'past' : i === stage ? 'now' : 'next'}>
                <span className="mg-stage-art" aria-hidden="true">
                  <GoutteArt look={i <= stage ? look : { ...look, hat: null, weapon: null, shield: null, acc: null }} stage={i} mood={i <= stage ? 'happy' : 'sleep'} />
                </span>
                <span>
                  <strong>{i <= stage ? st.name : '???'}</strong>
                  <span className="mg-stage-lv">niveau {st.from}</span>
                </span>
              </li>
            ))}
          </ol>
          <h3 className="subhead mt-3">Ce que tu as fait</h3>
          <ul className="mg-facts">
            <li>
              <strong>{totalRuns(counters)}</strong> parties
            </li>
            <li>
              <strong>{counters.days}</strong> jours de jeu
            </li>
            <li>
              <strong>{counters.records}</strong> records battus
            </li>
            <li>
              <strong>{counters.sessions}</strong> séances de classe
            </li>
            <li>
              <strong>{counters.minutes}</strong> minutes
            </li>
          </ul>
          <ul className="mg-games">
            {GAME_IDS.filter((g) => (counters.runs[g] ?? 0) > 0).map((g) => (
              <li key={g}>
                {GAME_NAMES[g]} : {counters.runs[g]} partie{(counters.runs[g] ?? 0) > 1 ? 's' : ''}
              </li>
            ))}
          </ul>
        </section>
      )}

      {tab === 'how' && (
        <section className="mg-sec" aria-label="Comment gagner">
          <p className="text-[16px] leading-snug">Ta goutte grandit quand tu t’entraînes, pas seulement quand tu gagnes :</p>
          <ul className="mg-how">
            <li>
              <strong>+{XP.run}</strong> par partie terminée (au moins 20 secondes)
            </li>
            <li>
              <strong>+{XP.day}</strong> chaque nouveau jour où tu joues
            </li>
            <li>
              <strong>+{XP.record}</strong> quand tu bats ton propre record
            </li>
            <li>
              <strong>+{XP.session}</strong> pour chaque séance de ta classe
            </li>
          </ul>
          <p className="text-[16px] leading-snug mt-2">Friandises : une par partie, une par nouveau jour, deux par record battu.</p>
          <p className="text-[15px] leading-snug mt-2 text-ink/75">
            {token ? 'Ta goutte est gardée sur ton compte : tu la retrouves sur tous les appareils.' : 'Sans code élève, ta goutte reste sur cet appareil.'} Elle ne disparaît jamais.
          </p>
        </section>
      )}
    </Frame>
  );
}
