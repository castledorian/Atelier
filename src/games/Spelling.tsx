import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { BackButton } from '../components/BackButton';
import { DuelResult, ReviewNote } from '../components/EncreNotes';
import type { DuelInfo } from '../components/EncreNotes';
import { BOSS_NAME, ENEMY_KINDS, ENEMY_NAMES, InkEnemy, PATE_NAMES, PenIcon, ROLE_LABEL, SPLASH_NAMES, kindFor } from '../components/InkEnemy';
import { Check } from '../components/Screens';
import { SessionIntro, SessionOver, useSessionRun } from '../components/SessionPanels';
import { COURSE_DIFFS, boardKey } from '../game/course/questions';
import type { CourseDiff, Level } from '../game/course/questions';
import { ruleInfo, rulesOf } from '../game/encre/rules';
import type { RuleId } from '../game/encre/rules';
import { DUEL_SIZE, activeRules, dayKey, loadStore, recordDuel, recordGame, saveStore, stateOf } from '../game/encre/tracker';
import { effectiveGrade, gradeLabel, levelOf } from '../game/grade';
import { Sfx } from '../game/audio';
import { newRunId } from '../game/history';
import { parseSpelling } from '../game/sessionConfig';
import { loadSettings, saveSettings } from '../game/storage';
import type { Settings } from '../game/storage';
import { BOON_AFTER, HINT, HP, ROUNDS, choicesFor, duelItems, isFault, isPerfect, nextItem, offerBoons, pointsFor, roleOf, shuffle } from '../game/spelling/engine';
import type { Boon, Item, RoundOutcome } from '../game/spelling/engine';
import { addSpellingScore, loadSpellingPrefs, loadSpellingScores, saveSpellingPrefs } from '../game/spelling/scores';
import { enqueue, flush } from '../server/outbox';
import { sendRun } from '../server/student';
import type { RunPayload, SessionInfo, StudentAccount } from '../server/types';
import { Frame } from '../pages/Frame';

/**
 * « Chasse aux fautes » — jeu d'orthographe (CM1 / CM2), en petit « rogue-lite » : des ennemis d'encre arrivent un par un
 * et disent une phrase où se cache une faute. On touche le mot faux, puis on choisit la bonne écriture pour les vaincre ;
 * chaque erreur coûte une vie. Un bonus au choix après le 3e et le 6e ennemi, un boss en dernier.
 * Chaque faute se range dans une règle (l'Encre).
 */

type Phase = 'menu' | 'play' | 'over';
type Cloud = 'off' | 'sending' | 'sent' | 'queued';

interface Props {
  account: StudentAccount | null;
  onHome: () => void;
  onSessionLost: () => void;
  session?: SessionInfo | null;
  onSessions?: () => void;
}

interface GameState {
  level: Level;
  diff: CourseDiff;
  duel: { rule: RuleId; items: Item[] } | null;
  active: RuleId[];
  asked: number;
  used: Set<string>;
  lastOk: boolean[];
  score: number;
  streak: number;
  best: number;
  okRounds: number;
  faults: Partial<Record<RuleId, number>>;
  /** phrases ratées, pour le récapitulatif */
  missed: Item[];
  /** phrases des parties précédentes */
  avoid: Set<string>;
  t0: number;
  /** vies (le duel de l'Encre n'en a pas : maxHp = 0) */
  hp: number;
  maxHp: number;
  shield: number;
  loupe: number;
  /** dessin de chaque ennemi, dans l'ordre */
  order: number[];
}

interface Round {
  item: Item;
  choices: string[];
  step: 'tap' | 'fix' | 'done';
  tapFirst: boolean;
  tries: number;
  hintUsed: boolean;
  tipShown: boolean;
  wrongPicks: string[];
  msg: string;
  revealed: boolean;
  gained: number;
  badTaps: number[];
  hits: number;
  loupeOn: boolean;
  lost: boolean;
  /** un pâté vaincu sans erreur redonne une vie */
  healed: boolean;
}

interface Over {
  score: number;
  okRounds: number;
  total: number;
  bestStreak: number;
  rank: number;
  record: boolean;
  duel?: DuelInfo;
  top: RuleId | null;
  promoted: RuleId[];
  missed: Item[];
  level: Level;
  diff: CourseDiff;
  /** partie perdue : plus de vie avant la fin */
  dead: boolean;
  /** ennemis vaincus */
  defeated: number;
  hpLeft: number;
  maxHp: number;
}

const SEEN_KEY = 'atelier.spelling.seen.v1';
const loadSeen = (): string[] => {
  try {
    const v = JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
};
/** On retient les dernières phrases jouées : la partie suivante en propose d'autres. */
const rememberSeen = (ids: string[]) => {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify([...loadSeen(), ...ids].slice(-30)));
  } catch {
    /* ignoré */
  }
};

const isWord = (w: string) => /[\p{L}\p{N}]/u.test(w);
const fmt = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

export default function Spelling({ account, onHome, onSessionLost, session, onSessions }: Props) {
  const [phase, setPhase] = useState<Phase>('menu');
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const prefs = useRef(loadSpellingPrefs());
  const [level] = useState<Level>(() => (session ? parseSpelling(session.config).level : levelOf(effectiveGrade(account?.student.id ?? null))));
  const [diff, setDiff] = useState<CourseDiff>(() => (session ? parseSpelling(session.config).diff : prefs.current.diff));
  const ses = useSessionRun(account, session);
  const sesRef = useRef(ses);
  sesRef.current = ses;
  const g = useRef<GameState | null>(null);
  const [round, setRound] = useState<Round | null>(null);
  const rr = useRef<Round | null>(null);
  const upd = (r: Round | null) => {
    rr.current = r;
    setRound(r);
  };
  const [sfx] = useState(() => new Sfx());
  const [boon, setBoon] = useState<Boon[] | null>(null);
  const [hurtKey, setHurtKey] = useState(0);
  const [counter, setCounter] = useState({ n: 0, score: 0 });
  const [summon, setSummon] = useState<RuleId | null>(null);
  const [over, setOver] = useState<Over | null>(null);
  const [cloud, setCloud] = useState<Cloud>('off');
  const lost = useRef(false);

  useEffect(() => {
    sfx.enabled = settings.sound;
  }, [settings.sound, sfx]);

  useEffect(() => {
    saveSettings(settings);
    document.documentElement.dataset.text = settings.textSize;
    document.documentElement.dataset.comfort = settings.comfort ? 'on' : 'off';
  }, [settings]);

  // Parties envoyées sans réseau : on réessaie au démarrage et au retour du réseau
  const studentId = account?.student.id ?? null;
  const token = account?.token ?? null;
  useEffect(() => {
    if (!studentId || !token) return;
    const go = () => void flush(studentId, token);
    go();
    window.addEventListener('online', go);
    return () => window.removeEventListener('online', go);
  }, [studentId, token]);

  const openRound = useCallback(() => {
    const s = g.current;
    if (!s) return;
    const total = s.duel ? s.duel.items.length : ROUNDS;
    if (s.asked >= total) return;
    let item: Item;
    let summoned: RuleId | null = null;
    if (s.duel) item = s.duel.items[s.asked];
    else {
      const n = nextItem(s.level, s.asked, s.lastOk, s.active, s.used, Math.random, s.avoid);
      item = n.item;
      summoned = n.summoned;
    }
    s.used.add(item.id);
    setSummon(summoned);
    setBoon(null);
    setCounter({ n: s.asked + 1, score: s.score });
    const loupeOn = s.loupe > 0;
    if (loupeOn) s.loupe--;
    upd({
      item,
      choices: choicesFor(item, s.diff),
      step: 'tap',
      tapFirst: true,
      tries: 0,
      hintUsed: false,
      tipShown: false,
      wrongPicks: [],
      msg: '',
      revealed: false,
      gained: 0,
      badTaps: [],
      hits: 0,
      loupeOn,
      lost: false,
      healed: false,
    });
    sfx.play('wave');
  }, [sfx]);

  const finish = useCallback((dead = false) => {
    const s = g.current;
    if (!s) return;
    const total = s.duel ? s.duel.items.length : ROUNDS;
    const id = newRunId();
    let encre: Pick<Over, 'duel' | 'top' | 'promoted'> = { top: null, promoted: [] };
    if (s.duel) {
      const won = s.okRounds >= 0; // un duel se rejoue jusqu'à la bonne réponse : il est toujours terminé
      const d = recordDuel(loadStore(), s.duel.rule, won, dayKey());
      saveStore(d.store);
      encre = { top: null, promoted: [], duel: { rule: s.duel.rule, before: d.before, after: d.after, won } };
      setOver({ score: 0, okRounds: s.okRounds, total, bestStreak: 0, rank: -1, record: false, level: s.level, diff: s.diff, missed: [], dead: false, defeated: total, hpLeft: 0, maxHp: 0, ...encre });
      setPhase('over');
      return;
    }
    const secs = Math.min(7200, Math.max(0, Math.round((Date.now() - s.t0) / 1000)));
    const payload: Omit<RunPayload, 'sessionId' | 'balance'> = {
      clientId: id,
      game: 'spelling',
      mode: boardKey(s.level, s.diff),
      kind: 'game',
      score: s.score,
      wave: s.best,
      wpm: 0,
      acc: Math.round((s.okRounds / total) * 100),
      correct: s.okRounds,
      duration: secs,
      playedMs: Date.now(),
    };
    let rank = -1;
    let record = false;
    if (sesRef.current.sess) {
      // séance de classe : l'essai compte pour l'évaluation, pas pour les scores de l'appareil
      sesRef.current.submit(payload, () => {
        lost.current = true;
      });
    } else {
      const board = boardKey(s.level, s.diff);
      const before = loadSpellingScores(board);
      record = s.score > 0 && (before.length === 0 || s.score > before[0].score);
      rank = s.score > 0 ? addSpellingScore(board, { id, score: s.score, streak: s.best, date: Date.now() }) : -1;
      const acct = account;
      if (acct && s.score > 0) {
        setCloud('sending');
        sendRun(acct.token, payload)
          .then((r) => {
            if (r === 'invalid_session') {
              enqueue(acct.student.id, payload);
              lost.current = true;
            }
            setCloud(r === 'ok' ? 'sent' : 'queued');
          })
          .catch(() => {
            enqueue(acct.student.id, payload);
            setCloud('queued');
          });
      } else setCloud('off');
      // L'Encre : les fautes de la partie, rangées par règle, sur cet appareil seulement
      const r = recordGame(loadStore(), rulesOf('orthographe'), s.faults);
      saveStore(r.store);
      const seen = (Object.keys(s.faults) as RuleId[])
        .filter((k) => ['a-revoir', 'progres'].includes(stateOf(r.store[k])))
        .sort((a, b) => (s.faults[b] ?? 0) - (s.faults[a] ?? 0));
      encre = { top: seen[0] ?? null, promoted: r.promoted };
    }
    rememberSeen([...s.used]);
    setOver({ score: s.score, okRounds: s.okRounds, total, bestStreak: s.best, rank, record, level: s.level, diff: s.diff, missed: s.missed, dead, defeated: dead ? s.asked : total, hpLeft: s.hp, maxHp: s.maxHp, ...encre });
    sfx.play(dead ? 'over' : 'clear');
    setPhase('over');
  }, [account, sfx]);

  const begin = useCallback(
    (duel?: RuleId) => {
      const sx = sesRef.current;
      if (sx.sess && (sx.left <= 0 || !sx.sess.active)) return;
      if (!sx.sess) saveSpellingPrefs({ level, diff });
      g.current = {
        level,
        diff,
        duel: duel ? { rule: duel, items: duelItems(level, duel, DUEL_SIZE) } : null,
        // en séance de classe, l'évaluation est la même pour tous : l'Encre n'y revient pas
        active: sx.sess || duel ? [] : activeRules(loadStore(), 'orthographe'),
        asked: 0,
        used: new Set(),
        lastOk: [],
        score: 0,
        streak: 0,
        best: 0,
        okRounds: 0,
        faults: {},
        missed: [],
        avoid: new Set(loadSeen()),
        t0: Date.now(),
        hp: duel ? 0 : HP[diff],
        maxHp: duel ? 0 : HP[diff],
        shield: 0,
        loupe: 0,
        order: shuffle([...Array(ENEMY_KINDS).keys()]),
      };
      sfx.unlock();
      sfx.play('start');
      setOver(null);
      setBoon(null);
      setHurtKey(0);
      setCloud('off');
      setPhase('play');
      openRound();
    },
    [level, diff, openRound, sfx],
  );

  /** Une erreur : le bouclier l'absorbe, sinon l'ennemi nous prend une vie. Renvoie la manche à jour. */
  const hurt = (r: Round, why: string): Round => {
    const s = g.current as GameState;
    const nr = { ...r, hits: r.hits + 1 };
    setHurtKey((k) => k + 1);
    if (s.duel) {
      sfx.play('error');
      return { ...nr, msg: why };
    }
    if (s.shield > 0) {
      s.shield--;
      sfx.play('ding');
      return { ...nr, msg: 'Ton bouclier de buvard a absorbé l’attaque : tu ne perds aucune vie.' };
    }
    s.hp = Math.max(0, s.hp - 1);
    sfx.play('breach');
    if (s.hp > 0) return { ...nr, msg: `${why} Tu perds une vie.` };
    // plus de vie : l'ennemi gagne cette manche
    s.faults[r.item.rule] = (s.faults[r.item.rule] ?? 0) + 1;
    s.missed.push(r.item);
    s.lastOk.push(false);
    s.streak = 0;
    return { ...nr, step: 'done', lost: true, revealed: true, gained: 0, msg: '' };
  };

  const tapWord = (i: number) => {
    const r = rr.current;
    if (!r || r.step !== 'tap' || r.badTaps.includes(i)) return;
    if (i === r.item.before.length) {
      sfx.play('hit');
      upd({ ...r, step: 'fix', msg: '', tipShown: HINT[diff] === 'free' || r.loupeOn });
      return;
    }
    upd(hurt({ ...r, tapFirst: false, badTaps: [...r.badTaps, i] }, 'Ce mot est bien écrit : l’encre t’éclabousse !'));
  };

  const settle = (r: Round, tries: number): Round => {
    const s = g.current as GameState;
    const out: RoundOutcome = { tapFirst: r.tapFirst, fixTries: tries, hint: r.hintUsed };
    const gained = pointsFor(out, s.streak);
    s.score += gained;
    s.streak = isPerfect(out) ? s.streak + 1 : 0;
    s.best = Math.max(s.best, s.streak);
    if (isFault(out)) {
      s.faults[r.item.rule] = (s.faults[r.item.rule] ?? 0) + 1;
      s.missed.push(r.item);
    } else s.okRounds++;
    s.lastOk.push(!isFault(out));
    if (tries < 3) sfx.play(s.asked === ROUNDS - 1 && !s.duel ? 'bigkill' : 'kill');
    // un pâté (ennemi costaud) vaincu sans aucune erreur : on récupère une vie
    const healed = !s.duel && s.hp < s.maxHp && isPerfect(out) && r.hits === 0 && roleOf(r.item, s.asked === ROUNDS - 1) === 'pate';
    if (healed) {
      s.hp++;
      sfx.play('ding');
    }
    return { ...r, step: 'done', gained, revealed: tries === 3, msg: '', healed };
  };

  const pick = (choice: string) => {
    const r = rr.current;
    if (!r || r.step !== 'fix') return;
    if (choice === r.item.right) {
      upd(settle({ ...r, tries: r.tries + 1 }, r.tries + 1));
      return;
    }
    const wrongPicks = [...r.wrongPicks, choice];
    const nr = hurt({ ...r, tries: r.tries + 1, wrongPicks, tipShown: true }, 'Pas la bonne écriture : relis l’astuce !');
    if (nr.lost) upd(nr);
    else if (r.tries + 1 >= 2) upd(settle({ ...nr, tries: 2 }, 3));
    else upd(nr);
  };

  const takeBoon = (b: Boon) => {
    const s = g.current;
    if (!s) return;
    if (b.id === 'vie') s.hp = Math.min(s.maxHp, s.hp + 2);
    if (b.id === 'bouclier') s.shield++;
    if (b.id === 'loupe') s.loupe += 3;
    sfx.play('ding');
    openRound();
  };

  const next = () => {
    const s = g.current;
    if (!s) return;
    if (rr.current?.lost) {
      finish(true);
      return;
    }
    s.asked++;
    const total = s.duel ? s.duel.items.length : ROUNDS;
    if (s.asked >= total) finish(false);
    else if (!s.duel && BOON_AFTER.includes(s.asked)) {
      setBoon(offerBoons());
      sfx.play('mult');
    } else openRound();
  };

  const toMenu = () => {
    setPhase('menu');
    upd(null);
    setBoon(null);
    if (lost.current) onSessionLost();
  };

  const inSession = !!ses.sess;
  const nextRef = useRef<HTMLButtonElement>(null);
  const fixRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (round?.step === 'done') nextRef.current?.focus();
    else if (round?.step === 'fix') fixRef.current?.focus();
  }, [round?.step, round?.item.id]);

  return (
    <Frame wide fill>
      <div className="sp-card">
      {phase !== 'play' && (
        <div className="card-top">
          <BackButton onClick={phase === 'menu' ? (onSessions ?? onHome) : toMenu} label={phase === 'menu' ? (inSession ? 'Mes séances' : 'Accueil') : 'Menu'} />
        </div>
      )}

      {phase === 'menu' && !inSession && (
        <section aria-labelledby="sp-title">
          <p className="eyebrow">Orthographe · {gradeLabel(level)}</p>
          <h1 id="sp-title" className="title title-wrap">
            Chasse aux fautes
          </h1>
          <div className="rule" aria-hidden="true" />
          <ol className="mt-3 list-decimal space-y-1 pl-6 text-[16px] leading-snug">
            <li>Des ennemis d’encre arrivent un par un. Chacun dit une phrase où se cache une faute.</li>
            <li>Touche le mot mal écrit, puis choisis la bonne écriture pour le vaincre.</li>
            <li>Chaque erreur te coûte une vie. Après le 3<sup>e</sup> et le 6<sup>e</sup> ennemi, tu choisis un bonus.</li>
            <li>Le 10<sup>e</sup> ennemi est un boss. Chaque phrase te donne une astuce pour retenir la règle.</li>
          </ol>
          <h2 className="subhead mt-[var(--sp)]">Ta difficulté</h2>
          <div className="seg mt-1" role="radiogroup" aria-label="Difficulté">
            {COURSE_DIFFS.map((d) => (
              <button key={d.id} type="button" role="radio" aria-checked={diff === d.id} className="seg-b" onClick={() => setDiff(d.id)}>
                {d.label}
              </button>
            ))}
          </div>
          <p className="mt-1 text-[14px] leading-snug text-ink/75">{HINT_TEXT[diff]}</p>
          <div className="mt-[var(--sp)] flex flex-wrap gap-2">
            <Check on={settings.comfort} onClick={() => setSettings((s) => ({ ...s, comfort: !s.comfort }))}>
              Lecture confortable
            </Check>
            <Check
              on={settings.sound}
              onClick={() => {
                sfx.unlock();
                setSettings((s) => ({ ...s, sound: !s.sound }));
              }}
            >
              Sons
            </Check>
          </div>
          <div className="mt-[var(--sp)]">
            <button type="button" className="btn btn-primary" autoFocus onClick={() => begin()}>
              Commencer
            </button>
          </div>
          <BestScores level={level} diff={diff} />
        </section>
      )}

      {phase === 'menu' && inSession && ses.sess && (
        <SessionIntro session={ses.sess} left={ses.left} onStart={() => begin()} onBack={() => (onSessions ?? onHome)()} />
      )}

      {phase === 'play' && round && g.current && (
        <PlayView
          s={g.current}
          round={round}
          counter={counter}
          summon={summon}
          boon={boon}
          hurtKey={hurtKey}
          diff={diff}
          onTap={tapWord}
          onPick={pick}
          onBoon={takeBoon}
          onNext={next}
          onBack={toMenu}
          onImpact={(big) => sfx.play(big ? 'bigkill' : 'kill')}
          onDash={() => sfx.play('sweep')}
          onTip={() => upd({ ...round, tipShown: true, hintUsed: true })}
          nextRef={nextRef}
          fixRef={fixRef}
        />
      )}

      {phase === 'over' && over && !ses.sess && (
        <OverPanel over={over} cloud={cloud} account={!!account} onRestart={() => begin()} onDuel={(r) => begin(r)} onMenu={toMenu} />
      )}
      {phase === 'over' && over && ses.sess && (
        <SessionOver
          session={ses.sess}
          state={ses.state}
          score={over.score}
          left={ses.left}
          details={
            <p className="mt-1 text-[15px]">
              Ennemis vaincus : <strong>{over.defeated}</strong> sur {over.total} · phrases réussies : <strong>{over.okRounds}</strong>
            </p>
          }
          onRetry={() => begin()}
          onBack={() => (onSessions ?? onHome)()}
        />
      )}
      </div>
    </Frame>
  );
}

const HINT_TEXT: Record<CourseDiff, string> = {
  apprenti: '6 vies. Deux propositions seulement, et l’astuce s’affiche toute seule.',
  standard: '5 vies. Trois propositions. Un indice est possible, mais il rapporte moins de points.',
  expert: '4 vies. Jusqu’à quatre propositions, sans indice : il faut connaître la règle.',
};

interface PlayProps {
  s: GameState;
  round: Round;
  counter: { n: number; score: number };
  summon: RuleId | null;
  boon: Boon[] | null;
  hurtKey: number;
  diff: CourseDiff;
  onTap: (i: number) => void;
  onPick: (c: string) => void;
  onBoon: (b: Boon) => void;
  onNext: () => void;
  onBack: () => void;
  /** le coup de plume touche l'ennemi (pour le son) */
  onImpact: (boss: boolean) => void;
  onDash: () => void;
  onTip: () => void;
  nextRef: React.RefObject<HTMLButtonElement | null>;
  fixRef: React.RefObject<HTMLButtonElement | null>;
}

/** L'écran de combat : toi (la plume et tes vies) en haut, l'ennemi d'encre et sa phrase au milieu, les réponses dessous. */
function PlayView({ s, round, counter, summon, boon, hurtKey, diff, onTap, onPick, onBoon, onNext, onBack, onImpact, onDash, onTip, nextRef, fixRef }: PlayProps) {
  const duel = !!s.duel;
  const total = duel ? (s.duel as { items: Item[] }).items.length : ROUNDS;
  const boss = !duel && s.asked === ROUNDS - 1;
  const role = roleOf(round.item, boss);
  const kind = kindFor(role, s.order[s.asked % ENEMY_KINDS]);
  const pick = (list: string[]) => list[s.order[s.asked % ENEMY_KINDS] % list.length];
  const name = boss ? BOSS_NAME : role === 'pate' ? pick(PATE_NAMES) : role === 'splash' ? pick(SPLASH_NAMES) : pick(ENEMY_NAMES);
  const done = round.step === 'done';
  /** bonne réponse : la plume fonce sur l'ennemi (sauf s'il a fallu lui donner la réponse) */
  const strike = done && !round.lost && !round.revealed;
  const [impact, setImpact] = useState(false);
  const battleRef = useRef<HTMLDivElement>(null);
  const penRef = useRef<HTMLDivElement>(null);
  const foeRef = useRef<HTMLDivElement>(null);
  // distance plume → ennemi, mesurée pour que le coup de plume et la charge de l'ennemi s'arrêtent au contact
  useLayoutEffect(() => {
    const b = battleRef.current;
    const p = penRef.current;
    const f = foeRef.current;
    if (!b || !p || !f) return;
    const pr = p.getBoundingClientRect();
    const fr = f.getBoundingClientRect();
    const gap = Math.max(0, fr.left + fr.width * 0.18 - pr.right);
    b.style.setProperty('--dx', `${Math.round(gap)}px`);
    b.style.setProperty('--ex', `${-Math.round(gap)}px`);
  }, [round.item.id, round.hits, done]);
  useEffect(() => {
    if (!strike) {
      setImpact(false);
      return;
    }
    onDash();
    const t = window.setTimeout(() => {
      setImpact(true);
      onImpact(boss);
    }, 260);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [strike, round.item.id]);
  const mood = done ? (round.lost ? 'attack' : round.revealed || impact ? 'dead' : 'angry') : round.hits > 0 ? 'angry' : 'idle';
  const shake = round.hits > 0 && !done ? (round.hits % 2 ? ' sh-a' : ' sh-b') : '';
  const closing = done;
  return (
    <section aria-label="Partie en cours" className="sp-play">
      <div className="sp-hud">
        <BackButton onClick={onBack} label="Menu" />
        {!duel && (
          <div className="sp-me">
            <div key={hurtKey} className={`sp-hp${hurtKey > 0 ? ' hit' : ''}`} role="img" aria-label={`Vie : ${s.hp} sur ${s.maxHp}`}>
              {Array.from({ length: s.maxHp }, (_, k) => (
                <span key={k} className={`${k < s.hp ? 'on' : ''}${hurtKey > 0 && k === s.hp ? ' lost' : ''}`} />
              ))}
            </div>
            {(s.shield > 0 || s.loupe > 0) && (
              <p className="sp-chips">
                {s.shield > 0 && <span title="Bouclier de buvard">Bouclier × {s.shield}</span>}
                {s.loupe > 0 && <span title="Loupe">Loupe × {s.loupe}</span>}
              </p>
            )}
          </div>
        )}
        <div className="sp-info">
          <span className="subhead">
            {duel ? `Duel · ${ruleInfo((s.duel as { rule: RuleId }).rule).name} · ${counter.n}/${total}` : `Ennemi ${counter.n}/${ROUNDS}`}
          </span>
          {!duel && <span className="num">{fmt(counter.score)} pts</span>}
        </div>
      </div>
      <div className="sp-bar" aria-hidden="true">
        {Array.from({ length: total }, (_, k) => (
          <span key={k} className={`${k < counter.n ? 'on' : ''}${!duel && k === ROUNDS - 1 ? ' boss' : ''}`} />
        ))}
      </div>

      {boon ? (
        <div className="sp-boon" role="group" aria-labelledby="sp-boon-t">
          <h2 id="sp-boon-t" className="subhead">
            Butin de la page : choisis un bonus
          </h2>
          <div className="sp-boon-list">
            {boon.map((b, i) => (
              <button key={b.id} type="button" className="btn btn-ghost sp-boon-btn" autoFocus={i === 0} onClick={() => onBoon(b)}>
                <strong>{b.name}</strong>
                <span>{b.text}</span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <>
          {summon && (
            <div className="summon-inline" role="status">
              <span>
                On revoit : <strong>{ruleInfo(summon).name}</strong>.
              </span>
            </div>
          )}
          <div className="sp-arena">
            <div className="sp-battle" ref={battleRef}>
              <div className="sp-pen" ref={penRef}>
                <div key={`${round.item.id}-${round.hits}-${strike}`} className={`pen-wrap${round.hits > 0 && !done ? ' pen-hurt' : ''}${strike ? ' pen-dash' : ''}${round.lost ? ' pen-down' : ''}`}>
                  <PenIcon />
                </div>
                <p className="sp-foe-name">Toi</p>
              </div>
              <div className="sp-foe" ref={foeRef}>
                <div key={round.item.id} className="foe-in">
                  <div key={round.hits} className={round.hits > 0 && !done ? 'foe-lunge' : round.lost ? 'foe-lunge foe-final' : ''}>
                    <InkEnemy kind={kind} mood={mood} name={name} />
                  </div>
                  {strike && <span className="sp-slash" aria-hidden="true" />}
                </div>
                <p className="sp-foe-name">
                  {name}
                  <span className="sp-role">{ROLE_LABEL[role]}</span>
                </p>
              </div>
            </div>
            <div className={`sp-bubble${shake}`}>
              <p className="sp-ask" aria-live="polite">
                {round.step === 'tap' && 'Touche le mot qui n’est pas bien écrit.'}
                {round.step === 'fix' && 'Choisis la bonne écriture.'}
                {done && (round.lost ? 'L’encre t’a submergé… Voici la bonne phrase.' : round.revealed ? 'Il s’enfuit… mais tu as perdu des vies. Voici la bonne écriture.' : 'Ennemi vaincu !')}
              </p>
              <div className="sp-sentence" role="group" aria-label="Phrase">
                {round.item.before.map((w, i) => (
                  <Word key={`b${i}`} text={w} onTap={() => onTap(i)} disabled={round.step !== 'tap' || round.badTaps.includes(i)} bad={round.badTaps.includes(i)} />
                ))}
                <span className={`sp-target sp-${round.step}`}>
                  {round.step === 'tap' ? (
                    <button type="button" className="sp-word" onClick={() => onTap(round.item.before.length)}>
                      {round.item.wrong}
                      {round.item.suffix}
                    </button>
                  ) : round.step === 'fix' ? (
                    <span className="sp-mark">
                      {round.item.wrong}
                      {round.item.suffix}
                    </span>
                  ) : (
                    <span className="sp-ok">
                      {round.item.right}
                      {round.item.suffix}
                    </span>
                  )}
                </span>
                {round.item.after.map((w, i) => {
                  const k = round.item.before.length + 1 + i;
                  return <Word key={`a${i}`} text={w} onTap={() => onTap(k)} disabled={round.step !== 'tap' || round.badTaps.includes(k)} bad={round.badTaps.includes(k)} />;
                })}
              </div>
            </div>
          </div>

          <p className="sp-msg" role="status">
            {round.msg}
          </p>

          {round.step === 'fix' && (
            <>
              <div className="sp-choices" role="group" aria-label="Propositions">
                {round.choices.map((c, i) => {
                  const tried = round.wrongPicks.includes(c);
                  return (
                    <button
                      key={c}
                      ref={i === 0 ? fixRef : undefined}
                      type="button"
                      className="btn btn-ghost sp-choice"
                      disabled={tried}
                      aria-label={tried ? `${c} : ce n’est pas la bonne écriture` : c}
                      onClick={() => onPick(c)}
                    >
                      {c}
                    </button>
                  );
                })}
              </div>
              {HINT[diff] === 'cost' && !round.tipShown && (
                <button type="button" className="btn btn-ghost mt-3" onClick={onTip}>
                  Un indice
                </button>
              )}
              {round.tipShown && (
                <p className="sp-tip">
                  <strong>Astuce :</strong> {round.item.tip}
                </p>
              )}
            </>
          )}

          {closing && (
            <div className="mt-3">
              <p className="text-[16px] leading-snug">
                <strong>{round.item.fixed}</strong>
              </p>
              <p className="sp-tip">
                <strong>Astuce :</strong> {round.item.tip}
              </p>
              {!duel && round.gained > 0 && <p className="sp-pop mt-1 text-[15px]">+ {round.gained} points</p>}
              {round.healed && <p className="sp-pop sp-heal">Pâté vaincu sans erreur : tu récupères une vie !</p>}
              <button ref={nextRef} type="button" className="btn btn-primary mt-3" onClick={onNext}>
                {round.lost ? 'Voir mon bilan' : s.asked + 1 >= total ? 'Terminer' : boss ? 'Terminer' : 'Ennemi suivant'}
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function Word({ text, onTap, disabled, bad }: { text: string; onTap: () => void; disabled: boolean; bad?: boolean }) {
  if (!isWord(text)) return <span className="sp-plain">{text}</span>;
  return (
    <button type="button" className={`sp-word${bad ? ' sp-bad' : ''}`} disabled={disabled} onClick={onTap}>
      {text}
    </button>
  );
}

function BestScores({ level, diff }: { level: Level; diff: CourseDiff }) {
  const list = loadSpellingScores(boardKey(level, diff));
  if (list.length === 0) return null;
  return (
    <section className="mt-[var(--sp)]" aria-labelledby="sp-best">
      <h2 id="sp-best" className="subhead">
        Mes meilleurs scores
      </h2>
      <ol className="mt-1 list-decimal pl-6 text-[15px]">
        {list.map((s) => (
          <li key={s.id} className="num">
            {fmt(s.score)} points
          </li>
        ))}
      </ol>
    </section>
  );
}

function OverPanel({ over, cloud, account, onRestart, onDuel, onMenu }: { over: Over; cloud: Cloud; account: boolean; onRestart: () => void; onDuel: (r: RuleId) => void; onMenu: () => void }) {
  const duel = !!over.duel;
  const title = duel ? 'Duel terminé' : over.dead ? 'L’encre a gagné, cette fois…' : over.record ? 'Nouveau record !' : over.okRounds === over.total ? 'Page nettoyée, sans faute !' : 'Page nettoyée !';
  return (
    <section aria-labelledby="sp-over">
      <h1 id="sp-over" className="title">
        {title}
      </h1>
      <div className="rule" aria-hidden="true" />
      {!duel && (
        <>
          <p className="mt-2 text-[16px]">
            <strong className="score-big">{fmt(over.score)}</strong> points{over.rank > 0 ? ` · n° ${over.rank} sur cet appareil` : ''}
          </p>
          <p className="mt-2 text-[16px] font-bold">
            {over.dead
              ? `Tu as vaincu ${over.defeated} ennemi${over.defeated > 1 ? 's' : ''} sur ${over.total}. Relis les astuces ci-dessous, puis retente : les phrases changent à chaque partie !`
              : `${over.okRounds} phrase${over.okRounds > 1 ? 's' : ''} réussie${over.okRounds > 1 ? 's' : ''} sur ${over.total}${over.bestStreak >= 3 ? `, dont ${over.bestStreak} parfaites d’affilée` : ''}. Il te restait ${over.hpLeft} vie${over.hpLeft > 1 ? 's' : ''}. Bien joué !`}
          </p>
        </>
      )}
      {over.duel && <DuelResult duel={over.duel} />}
      {over.top && !duel && <ReviewNote rule={over.top} onDuel={onDuel} />}
      {over.missed.length > 0 && !duel && (
        <section className="mt-3" aria-labelledby="sp-recap">
          <h2 id="sp-recap" className="subhead">
            À retenir
          </h2>
          <ul className="sp-recap">
            {over.missed.map((m) => (
              <li key={m.id}>
                <strong>{m.fixed}</strong>
                <span>{m.tip}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {account && !duel && (
        <p className="mt-2 text-[14px] text-ink/75" aria-live="polite">
          {cloud === 'sending' && 'Envoi du score à la classe…'}
          {cloud === 'sent' && 'Score envoyé à la classe ✓'}
          {cloud === 'queued' && 'Pas de réseau : ton score est gardé et sera envoyé plus tard.'}
        </p>
      )}
      <div className="mt-[var(--sp)] flex flex-wrap gap-3">
        <button type="button" className="btn btn-primary" autoFocus onClick={onRestart}>
          Rejouer
        </button>
        <button type="button" className="btn btn-ghost" onClick={onMenu}>
          Menu du jeu
        </button>
      </div>
    </section>
  );
}
