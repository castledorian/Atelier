import { useCallback, useEffect, useRef, useState } from 'react';
import { BackButton } from '../components/BackButton';
import { FoodArt } from '../components/FoodArt';
import GiftReveal from '../components/GiftReveal';
import { GoutteArt } from '../components/GoutteArt';
import type { ArtMood } from '../components/GoutteArt';
import { Tip } from '../components/Tip';
import { useGoutte } from '../components/useGoutte';
import { Frame } from './Frame';
import { FOODS, FOOD_COUNT, RARITY_NAME, lunchbox, tastedIds } from '../game/goutte/foods';
import type { Food } from '../game/goutte/foods';
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
  itemById,
  levelProgress,
  nextUnlock,
  stageOf,
  totalRuns,
  unlockFill,
  unlockText,
  unlocked,
  xpOf,
} from '../game/goutte/rules';
import type { Look, Slot } from '../game/goutte/rules';
import { feedBlock, markSeen, unseenItems } from '../game/goutte/store';
import { GAME_NAMES } from '../game/sessionConfig';

/**
 * « Ma goutte » : un Tamagotchi bienveillant.
 *
 * La boucle, reprise des jeux de compagnon qui fidélisent sans culpabiliser :
 *   jouer → gagner des friandises (saveur surprise) → la nourrir (animation, réaction) → débloquer et « déballer » des objets → l'habiller.
 * Elle a deux besoins visibles (ventre, bonheur) qui baissent doucement : on revient la voir. Ventre plein = on garde
 * le reste pour un autre jour. Jamais malade, jamais perdue : au pire elle dort, et se réveille à la prochaine partie.
 *
 * Couleurs (règle 60-30-10) : papier (fond, 60 %), encre (texte, traits, jauges, 30 %), ruban rouge pour la seule action
 * principale et les nouveautés (10 %). La couleur de la goutte, choisie par l'élève, n'habille que sa petite scène.
 */

type Tab = 'wardrobe' | 'food' | 'success' | 'growth';
const TABS: [Tab, string][] = [
  ['wardrobe', 'Garde-robe'],
  ['food', 'Goûters'],
  ['success', 'Succès'],
  ['growth', 'Évolution'],
];
const SLOTS: Slot[] = ['color', 'hat', 'weapon', 'shield', 'acc'];

/** Petits gestes spontanés de la goutte quand on la regarde (elle est vivante). */
const IDLE = ['hop', 'wiggle', 'look'] as const;
type Idle = (typeof IDLE)[number];
const GIGGLES = ['Hi hi ! Ça chatouille !', 'Encore !', 'Tu es mon meilleur ami !', 'Hé, doucement !'];

/** Un moment en cours : manger (la friandise vole, elle mâche, elle se régale) ou être caressée. */
type Moment = { kind: 'eat'; step: 'fly' | 'chew' | 'joy'; food: Food; first: boolean } | { kind: 'pet'; line: string; counted: boolean };

const stars = (r: number) => '★'.repeat(r) + '☆'.repeat(4 - r);
const word = (v: number, words: [string, string, string, string]) => words[v < 25 ? 0 : v < 50 ? 1 : v < 80 ? 2 : 3];

function Need({ label, value, words }: { label: string; value: number; words: [string, string, string, string] }) {
  const pct = Math.round(value);
  return (
    <div className="mg-need" data-low={pct < 30 ? 'yes' : 'no'}>
      <span className="mg-need-label">{label}</span>
      <span className="mg-need-bar" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-valuetext={word(value, words)}>
        <i style={{ width: `${pct}%` }} />
      </span>
      <span className="mg-need-word">{word(value, words)}</span>
    </div>
  );
}

export default function MaGoutte({ token, onBack, readOnly = false }: { token: string | null; onBack: () => void; readOnly?: boolean }) {
  const { view, feed, pet, setLook } = useGoutte(token, readOnly);
  const [tab, setTab] = useState<Tab>('wardrobe');
  const [slot, setSlot] = useState<Slot>('color');
  const [moment, setMoment] = useState<Moment | null>(null);
  const [idle, setIdle] = useState<Idle | null>(null);
  const [gifts, setGifts] = useState<string[]>([]);
  const timers = useRef<number[]>([]);
  const { counters, look, progress, treatsLeft, mood } = view;
  const xp = xpOf(counters);
  const lp = levelProgress(xp);
  const stage = stageOf(lp.level);
  const block = feedBlock(view);
  const next = nextUnlock(progress);
  const tasted = tastedIds(view.seed, view.fed);
  const box = lunchbox(view.seed, view.fed, treatsLeft);
  const done = ACHIEVEMENTS.filter((a) => achieved(a, progress)).length;
  const color = itemById(look.color)?.hex ?? '#2f3a8f';

  const later = useCallback((ms: number, fn: () => void) => {
    timers.current.push(window.setTimeout(fn, ms));
  }, []);
  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  // les objets débloqués depuis la dernière visite attendent d'être déballés
  useEffect(() => {
    if (readOnly) return;
    setGifts((g) => (g.length ? g : unseenItems(view)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readOnly, view.progress.level, view.fed, view.counters]);

  // gestes spontanés : un petit saut, un dandinement, un regard, de temps en temps
  useEffect(() => {
    if (mood === 'sleep' || moment) return;
    const id = window.setTimeout(
      () => {
        setIdle(IDLE[Math.floor(Math.random() * IDLE.length)]);
        later(900, () => setIdle(null));
      },
      6000 + Math.random() * 5000,
    );
    return () => window.clearTimeout(id);
  }, [mood, moment, idle, later]);

  const give = () => {
    if (moment) return;
    const meal = feed();
    if (!meal) return;
    setMoment({ kind: 'eat', step: 'fly', food: meal.food, first: meal.first });
    later(600, () => setMoment((m) => (m && m.kind === 'eat' ? { ...m, step: 'chew' } : m)));
    later(1500, () => setMoment((m) => (m && m.kind === 'eat' ? { ...m, step: 'joy' } : m)));
    later(meal.first ? 4200 : 3000, () => setMoment(null));
  };

  const touch = () => {
    if (readOnly || (moment && moment.kind === 'eat')) return;
    const counted = pet();
    setMoment({ kind: 'pet', line: mood === 'sleep' ? 'Mmh… encore cinq minutes…' : GIGGLES[Math.floor(Math.random() * GIGGLES.length)], counted });
    later(1300, () => setMoment(null));
  };

  const wear = (patch: Partial<Look>) => setLook({ ...look, ...patch });
  const [first, ...rest] = look.name.split(' ');
  const second = rest.join(' ');

  const artMood: ArtMood =
    moment?.kind === 'eat' ? (moment.step === 'fly' ? 'hungry' : moment.step === 'chew' ? 'eat' : 'cheer') : moment?.kind === 'pet' ? (mood === 'sleep' ? 'sleep' : 'giggle') : mood;

  const say = (() => {
    if (moment?.kind === 'eat') return moment.step === 'joy' ? moment.food.say : 'Miam…';
    if (moment?.kind === 'pet') return moment.line;
    if (mood === 'sleep') return 'Zzz… Joue une partie pour me réveiller !';
    if (block === 'full') return 'Je n’ai plus faim ! Garde mes friandises pour plus tard.';
    if (mood === 'hungry') return treatsLeft > 0 ? 'J’ai faim ! Tu as quelque chose pour moi ?' : 'J’ai faim… Joue une partie pour gagner des friandises !';
    if (mood === 'radiant') return 'Je me sens super bien ! On s’entraîne ?';
    return treatsLeft > 0 ? 'Il reste des friandises dans la boîte…' : 'Chaque partie me rend plus fort.';
  })();

  return (
    <Frame>
      <div className="card-top">
        <BackButton onClick={onBack} />
      </div>
      <h1 className="sr-only">Ma goutte</h1>

      <section className="mg-hero" aria-label="Ta goutte">
        <div className="mg-habitat" data-stage={stage} style={{ ['--gc' as string]: color }}>
          <p className="mg-say" aria-live="polite">
            {say}
          </p>
          <button type="button" className={`mg-pet${idle ? ` mg-idle-${idle}` : ''}${moment?.kind === 'pet' ? ' mg-squish' : ''}${moment?.kind === 'eat' && moment.step === 'chew' ? ' mg-chew' : ''}${moment?.kind === 'eat' && moment.step === 'joy' ? ' mg-joy' : ''}`} onClick={touch} disabled={readOnly} aria-label={`Caresser ${look.name}`}>
            <GoutteArt look={look} stage={stage} mood={artMood} />
          </button>
          {moment?.kind === 'eat' && moment.step === 'fly' && (
            <span className="mg-fly" aria-hidden="true">
              <FoodArt id={moment.food.id} />
            </span>
          )}
          {moment?.kind === 'eat' && moment.step === 'chew' && (
            <span className="mg-crumbs" aria-hidden="true">
              <i />
              <i />
              <i />
              <i />
            </span>
          )}
          {((moment?.kind === 'eat' && moment.step === 'joy') || (moment?.kind === 'pet' && moment.counted)) && (
            <span className="mg-hearts" aria-hidden="true">
              <i>♥</i>
              <i>♥</i>
              <i>♥</i>
            </span>
          )}
          {moment?.kind === 'eat' && moment.step === 'joy' && moment.first && (
            <p className="mg-new-taste" role="status">
              <span className="mg-new-tag">Nouvelle saveur</span> {moment.food.name} · <span aria-label={RARITY_NAME[moment.food.rarity]}>{stars(moment.food.rarity)}</span>
            </p>
          )}
        </div>

        <div className="mg-card">
          <h2 className="mg-name">{look.name}</h2>
          <p className="mg-stage-name">
            {STAGES[stage].name} · <strong>niveau {lp.level}</strong>
            <Tip label="Comment gagner des points">
              +{XP.run} par partie (20 s au moins), +{XP.day} par nouveau jour de jeu, +{XP.record} par record personnel battu, +{XP.session} par séance de classe. Friandises : une par
              partie, une par jour, deux par record.
            </Tip>
          </p>
          <div className="mg-xp" role="progressbar" aria-label="Expérience" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(lp.fill * 100)}>
            <i style={{ width: `${Math.round(lp.fill * 100)}%` }} />
          </div>
          <p className="mg-xp-txt">{lp.toNext > 0 ? `Encore ${lp.toNext} points pour le niveau ${lp.level + 1}` : 'Niveau maximum !'}</p>

          {view.sat !== null && view.joy !== null && (
            <div className="mg-needs">
              <Need label="Ventre" value={view.sat} words={['vide', 'un creux', 'bien', 'plein']} />
              <Need label="Bonheur" value={view.joy} words={['s’ennuie', 'calme', 'contente', 'ravie']} />
            </div>
          )}

          {!readOnly && (
            <div className="mg-actions">
              <button type="button" className="btn btn-primary mg-feed" onClick={give} disabled={block !== null || moment !== null}>
                {box[0] && block !== 'none-left' && (
                  <span className="mg-feed-art" aria-hidden="true">
                    <FoodArt id={box[0].id} />
                  </span>
                )}
                Nourrir
              </button>
              <span className="mg-meta">
                {treatsLeft > 0 ? `${treatsLeft} friandise${treatsLeft > 1 ? 's' : ''} dans la boîte` : 'Boîte vide : joue pour la remplir'}
              </span>
            </div>
          )}

          {next && (
            <div className="mg-next">
              <span className="mg-next-art" aria-hidden="true">
                <GoutteArt look={{ ...look, [next.item.slot]: next.item.id }} stage={stage} />
              </span>
              <span className="mg-next-txt">
                <span className="mg-next-k">Prochain cadeau</span>
                <strong>{next.item.name}</strong>
                <span className="mg-next-bar" aria-hidden="true">
                  <i style={{ width: `${Math.round(next.fill * 100)}%` }} />
                </span>
                <span className="mg-next-how">{unlockText(next.item)}</span>
              </span>
            </div>
          )}
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
                    {!open && (
                      <span className="mg-lock">
                        <span className="mg-lock-bar" aria-hidden="true">
                          <i style={{ width: `${Math.round(unlockFill(i, progress) * 100)}%` }} />
                        </span>
                        {unlockText(i)}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {tab === 'food' && (
        <section className="mg-sec" aria-label="Goûters">
          <h3 className="subhead">Dans la boîte à goûter</h3>
          {box.length ? (
            <ol className="mg-box">
              {box.map((f, i) => (
                <li key={i} data-next={i === 0 ? 'yes' : 'no'}>
                  <FoodArt id={f.id} />
                  <span className="sr-only">
                    {f.name}
                    {i === 0 ? ' (la prochaine)' : ''}
                  </span>
                </li>
              ))}
              {treatsLeft > box.length && <li className="mg-box-more">+{treatsLeft - box.length}</li>}
            </ol>
          ) : (
            <p className="mg-empty">Vide pour l’instant : chaque partie y ajoute une friandise surprise.</p>
          )}
          <h3 className="subhead mt-3">
            Saveurs découvertes{' '}
            <span className="mg-count">
              {tasted.size}/{FOOD_COUNT}
            </span>
          </h3>
          <ul className="mg-foods">
            {FOODS.map((f) => {
              const ok = tasted.has(f.id);
              return (
                <li key={f.id} data-ok={ok ? 'yes' : 'no'}>
                  <FoodArt id={f.id} hidden={!ok} />
                  <span className="mg-food-name">{ok ? f.name : '?'}</span>
                  <span className="mg-food-stars" aria-label={RARITY_NAME[f.rarity]}>
                    {stars(f.rarity)}
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="mg-empty">Les saveurs rares arrivent au hasard… mais jamais plus de 8 friandises sans une surprise.</p>
        </section>
      )}

      {tab === 'success' && (
        <section className="mg-sec" aria-label="Succès">
          <p className="mg-empty">
            {done}/{ACHIEVEMENTS.length} succès obtenus
          </p>
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
                      <span className="mg-ach-bar" aria-hidden="true">
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
          <ul className="mg-facts">
            <li>
              <strong>{totalRuns(counters)}</strong> parties
            </li>
            <li>
              <strong>{counters.days}</strong> jours
            </li>
            <li>
              <strong>{counters.records}</strong> records
            </li>
            <li>
              <strong>{counters.sessions}</strong> séances
            </li>
            <li>
              <strong>{view.fed}</strong> friandises données
            </li>
          </ul>
          <ul className="mg-games">
            {GAME_IDS.filter((g) => (counters.runs[g] ?? 0) > 0).map((g) => (
              <li key={g}>
                {GAME_NAMES[g]} : {counters.runs[g]}
              </li>
            ))}
          </ul>
          <p className="mg-empty">{token ? 'Ta goutte est gardée sur ton compte : tu la retrouves sur tous les appareils.' : 'Sans code élève, ta goutte reste sur cet appareil.'}</p>
        </section>
      )}

      {!readOnly && gifts.length > 0 && (
        <GiftReveal
          key={gifts[0]}
          itemId={gifts[0]}
          look={look}
          stage={stage}
          left={gifts.length - 1}
          onClose={(wearIt) => {
            const it = itemById(gifts[0]);
            if (wearIt && it) wear({ [it.slot]: it.id });
            markSeen([gifts[0]]);
            setGifts((g) => g.slice(1));
          }}
        />
      )}
    </Frame>
  );
}
