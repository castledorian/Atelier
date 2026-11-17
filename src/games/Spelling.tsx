import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { BackButton } from '../components/BackButton';
import { DuelResult, ReviewNote } from '../components/EncreNotes';
import type { DuelInfo } from '../components/EncreNotes';
import { BOSS_NAME, CannonIcon, ENEMY_KINDS, ENEMY_NAMES, InkEnemy, PATE_NAMES, SPLASH_NAMES, kindFor } from '../components/InkEnemy';
import type { EnemyMood } from '../components/InkEnemy';
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
import { spellingOutcome, summarize } from '../game/itemstats';
import type { ItemOutcome } from '../game/itemstats';
import { parseSpelling } from '../game/sessionConfig';
import { loadSettings, saveSettings } from '../game/storage';
import type { Settings } from '../game/storage';
import { BOSS_AT, HINT, RETRY_MAX, ROUNDS, choicesFor, duelItems, hpFor, isFault, isPerfect, isTyped, isTypedRight, nextItem, pickFeedback, pickRetry, pointsFor, roleOf, shuffle } from '../game/spelling/engine';
import type { EnemyRole, Item, RoundOutcome } from '../game/spelling/engine';
import { addSpellingScore, loadSpellingPrefs, loadSpellingScores, saveSpellingPrefs } from '../game/spelling/scores';
import { enqueue, flush } from '../server/outbox';
import { sendItemStats, sendRun } from '../server/student';
import type { RunPayload, SessionInfo, StudentAccount } from '../server/types';
import { Frame } from '../pages/Frame';

/**
 * « Chasse aux fautes » — jeu d'orthographe (CE1 → CM2).
 * Les créatures d'encre ont semé des ratures dans les phrases. Chaque créature apparaît et écrit sa phrase sous nos yeux ;
 * l'élève touche le mot fautif, puis choisit (ou écrit) la bonne orthographe. Bonne réponse : le canon tire et la phrase est
 * corrigée. Erreur : la créature attaque et l'élève perd une vie. Dix phrases par partie, la dernière écrite par le
 * Grand Pâté. Chaque faute se range dans une règle à revoir (l'Encre), sur l'appareil seulement.
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
  /** résultat de chaque phrase jouée, pour le suivi anonyme des exercices */
  outcomes: ItemOutcome[];
  /** phrases des parties précédentes */
  avoid: Set<string>;
  /** phrases ratées dans les parties précédentes, à revoir */
  retry: string[];
  t0: number;
  /** vies (le duel de l'Encre n'en a pas : maxHp = 0) */
  hp: number;
  maxHp: number;
  /** Apprenti : la première erreur sur un mot juste ne coûte rien */
  freeTap: boolean;
  /** premier combat jamais joué : une flèche montre le mot à toucher */
  tuto: boolean;
  /** dessin de chaque ennemi, dans l'ordre */
  order: number[];
}

/** Déroulé d'une phrase : la créature l'écrit, on touche le mot fautif, on le corrige, puis la manche se termine. */
type Step = 'write' | 'tap' | 'fix' | 'done';

interface Round {
  item: Item;
  choices: string[];
  step: Step;
  tapFirst: boolean;
  tries: number;
  hintUsed: boolean;
  tipShown: boolean;
  wrongPicks: string[];
  msg: string;
  /** la réponse a été donnée (deux corrections fausses) */
  revealed: boolean;
  gained: number;
  badTaps: number[];
  /** nombre d'attaques subies pendant la phrase */
  hits: number;
  /** plus de vie : la créature gagne */
  lost: boolean;
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
  /** créatures vaincues */
  defeated: number;
  hpLeft: number;
  maxHp: number;
}

const SEEN_KEY = 'atelier.spelling.seen.v2';
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

const RETRY_KEY = 'atelier.spelling.retry.v2';
const loadRetry = (): string[] => {
  try {
    const v = JSON.parse(localStorage.getItem(RETRY_KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string').slice(0, RETRY_MAX) : [];
  } catch {
    return [];
  }
};
/** Les phrases ratées reviendront la prochaine fois ; celles qu'on vient de revoir et réussies sortent de la liste. */
const saveRetry = (before: string[], used: ReadonlySet<string>, missed: readonly Item[]) => {
  try {
    const kept = before.filter((id) => !used.has(id));
    const again = missed.map((m) => m.id);
    localStorage.setItem(RETRY_KEY, JSON.stringify([...new Set([...again, ...kept])].slice(0, RETRY_MAX)));
  } catch {
    /* ignoré */
  }
};
const TUTO_KEY = 'atelier.spelling.tuto.v1';
const tutoSeen = (): boolean => {
  try {
    const seen = localStorage.getItem(TUTO_KEY) === '1';
    localStorage.setItem(TUTO_KEY, '1');
    return seen;
  } catch {
    return true;
  }
};

const isWord = (w: string) => /[\p{L}\p{N}]/u.test(w);
const fmt = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
const reducedMotion = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Durées des animations (ms), alignées sur la feuille de style. */
const T = {
  /** la créature apparaît avant d'écrire */
  enter: 520,
  /** départ du boulet → impact sur la créature */
  shot: 300,
  /** impact → la correction s'écrit */
  fix: 380,
};

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
      const back = pickRetry(s.level, s.asked, s.used, s.retry);
      if (back) item = back;
      else {
        const n = nextItem(s.level, s.asked, s.lastOk, s.active, s.used, Math.random, s.avoid);
        item = n.item;
        summoned = n.summoned;
      }
    }
    s.used.add(item.id);
    setSummon(summoned);
    setCounter({ n: s.asked + 1, score: s.score });
    upd({
      item,
      choices: choicesFor(item, s.diff),
      step: 'write',
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
      lost: false,
    });
    sfx.play('spawn');
  }, [sfx]);

  const finish = useCallback(
    (dead = false) => {
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
        sfx.play('victory');
        setPhase('over');
        return;
      }
      const secs = Math.min(7200, Math.max(0, Math.round((Date.now() - s.t0) / 1000)));
      const payload: RunPayload = {
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
        // résumé anonyme pour régler la difficulté (jamais lié à l'élève) : seulement les parties libres
        const rounds = s.outcomes.length;
        const okCount = s.outcomes.filter((o) => o.ok).length;
        if (rounds > 0) {
          payload.balance = {
            game: 'spelling',
            level: s.level,
            difficulty: s.diff,
            version: 1,
            outcome: dead ? 'lost' : 'finished',
            score: s.score,
            duration: secs,
            rounds_ok: okCount,
            rounds_err: rounds - okCount,
          };
        }
        if (acct && s.score > 0) {
          setCloud('sending');
          sendRun(acct.token, payload)
            .then((r) => {
              if (r === 'invalid_session') {
                enqueue(acct.student.id, payload);
                lost.current = true;
              }
              if (r === 'ok' && payload.balance) void sendItemStats(acct.token, 'spelling', s.level, s.diff, summarize(s.outcomes));
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
      const missedIds = new Set(s.missed.map((m) => m.id));
      rememberSeen([...s.used].filter((x) => !missedIds.has(x)));
      if (!sesRef.current.sess) saveRetry(s.retry, s.used, s.missed);
      setOver({ score: s.score, okRounds: s.okRounds, total, bestStreak: s.best, rank, record, level: s.level, diff: s.diff, missed: s.missed, dead, defeated: dead ? s.asked : total, hpLeft: s.hp, maxHp: s.maxHp, ...encre });
      sfx.play(dead ? 'over' : 'victory');
      setPhase('over');
    },
    [account, sfx],
  );

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
        outcomes: [],
        faults: {},
        missed: [],
        avoid: new Set(loadSeen()),
        retry: duel || sx.sess ? [] : loadRetry(),
        t0: Date.now(),
        hp: duel ? 0 : hpFor(diff, level),
        maxHp: duel ? 0 : hpFor(diff, level),
        freeTap: !duel && diff === 'apprenti',
        tuto: !duel && !tutoSeen(),
        order: shuffle([...Array(ENEMY_KINDS).keys()]),
      };
      try {
        localStorage.removeItem('atelier.spelling.bestiaire.v1'); // ancienne collection d'ennemis, retirée
      } catch {
        /* ignoré */
      }
      sfx.unlock();
      sfx.play('start');
      setOver(null);
      setCloud('off');
      setPhase('play');
      openRound();
    },
    [level, diff, openRound, sfx],
  );

  /** Résultat d'une phrase pour le suivi anonyme (rien n'est gardé pour un duel de l'Encre). */
  const outcomeOf = (s: GameState, r: Round, ok: boolean): ItemOutcome =>
    spellingOutcome(r.item.rule, ruleInfo(r.item.rule).name, r.item.id, r.item.fixed, ok, r.wrongPicks, isTyped(s.diff, s.level));

  /** Une erreur : la créature attaque et prend une vie (pas de vie en duel). Renvoie la manche à jour. */
  const hurt = (r: Round, why: string): Round => {
    const s = g.current as GameState;
    const nr = { ...r, hits: r.hits + 1 };
    sfx.play('attack');
    if (s.duel) return { ...nr, msg: why };
    s.hp = Math.max(0, s.hp - 1);
    if (s.hp > 0) return { ...nr, msg: why };
    // plus de vie : la créature gagne cette partie
    s.faults[r.item.rule] = (s.faults[r.item.rule] ?? 0) + 1;
    s.missed.push(r.item);
    s.outcomes.push(outcomeOf(s, r, false));
    s.lastOk.push(false);
    s.streak = 0;
    return { ...nr, step: 'done', lost: true, revealed: true, gained: 0, msg: '' };
  };

  const s0 = () => g.current as GameState;

  /** La créature a fini d'écrire : on peut chercher la faute. */
  const written = useCallback(() => {
    const r = rr.current;
    if (r && r.step === 'write') upd({ ...r, step: 'tap' });
  }, []);

  const tapWord = (i: number) => {
    const r = rr.current;
    if (!r || r.step !== 'tap' || r.badTaps.includes(i)) return;
    if (i === r.item.before.length) {
      sfx.play('select');
      upd({ ...r, step: 'fix', msg: '', tipShown: HINT[diff] === 'free' });
      return;
    }
    if (s0().freeTap) {
      // Apprenti : la première hésitation est offerte
      s0().freeTap = false;
      sfx.play('error');
      upd({ ...r, tapFirst: false, badTaps: [...r.badTaps, i], msg: 'Ce mot est bien écrit. Cette fois, ça ne compte pas !' });
      return;
    }
    upd(hurt({ ...r, tapFirst: false, badTaps: [...r.badTaps, i] }, 'Ce mot est bien écrit !'));
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
    s.outcomes.push(outcomeOf(s, r, !isFault(out)));
    s.lastOk.push(!isFault(out));
    return { ...r, step: 'done', gained, revealed: tries === 3, msg: '' };
  };

  const pick = (choice: string) => {
    const r = rr.current;
    if (!r || r.step !== 'fix') return;
    const good = isTyped(diff, level) ? isTypedRight(r.item, choice) : choice === r.item.right;
    if (good) {
      upd(settle({ ...r, tries: r.tries + 1 }, r.tries + 1));
      return;
    }
    const wrongPicks = [...r.wrongPicks, choice];
    const nr = hurt({ ...r, tries: r.tries + 1, wrongPicks, tipShown: HINT[diff] !== 'none' || r.tipShown }, pickFeedback(r.item, choice));
    if (nr.lost) upd(nr);
    else if (r.tries + 1 >= 2) upd(settle({ ...nr, tries: 2 }, 3));
    else upd(nr);
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
    else openRound();
  };

  const toMenu = () => {
    setPhase('menu');
    upd(null);
    if (lost.current) onSessionLost();
  };

  const inSession = !!ses.sess;

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
              <li>Les créatures d’encre ont semé des fautes dans les phrases. Chacune vient écrire la sienne.</li>
              <li>Touche le mot mal écrit, puis choisis la bonne écriture : ton canon tire et la phrase est corrigée.</li>
              <li>Une erreur, et la créature t’attaque : tu perds une vie. Dix phrases, la dernière écrite par le Grand Pâté.</li>
              <li>Chaque phrase te laisse une astuce pour retenir la règle.</li>
            </ol>
            <h2 className="subhead mt-[var(--sp)]">Ta difficulté</h2>
            <div className="seg mt-1" role="radiogroup" aria-label="Difficulté">
              {COURSE_DIFFS.map((d) => (
                <button key={d.id} type="button" role="radio" aria-checked={diff === d.id} className="seg-b" onClick={() => setDiff(d.id)}>
                  {d.label}
                </button>
              ))}
            </div>
            <p className="mt-1 text-[14px] leading-snug text-ink/75">{hintText(diff, level)}</p>
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

        {phase === 'menu' && inSession && ses.sess && <SessionIntro session={ses.sess} left={ses.left} onStart={() => begin()} onBack={() => (onSessions ?? onHome)()} />}

        {phase === 'play' && round && g.current && (
          <PlayView
            s={g.current}
            round={round}
            counter={counter}
            summon={summon}
            diff={diff}
            sfx={sfx}
            onWritten={written}
            onTap={tapWord}
            onPick={pick}
            onNext={next}
            onBack={toMenu}
            onTip={() => upd({ ...round, tipShown: true, hintUsed: true })}
          />
        )}

        {phase === 'over' && over && !ses.sess && <OverPanel over={over} cloud={cloud} account={!!account} onRestart={() => begin()} onDuel={(r) => begin(r)} onMenu={toMenu} />}
        {phase === 'over' && over && ses.sess && (
          <SessionOver
            session={ses.sess}
            state={ses.state}
            score={over.score}
            left={ses.left}
            details={
              <p className="mt-1 text-[15px]">
                Créatures vaincues : <strong>{over.defeated}</strong> sur {over.total} · phrases réussies : <strong>{over.okRounds}</strong>
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

/** Résumé de la difficulté ; le nombre de vies vient du moteur (il dépend de la classe). */
const hintText = (diff: CourseDiff, level: Level) => {
  const hp = `${hpFor(diff, level)} vies.`;
  if (diff === 'apprenti') return `${hp} Deux propositions seulement, l’astuce s’affiche toute seule, et ta première hésitation ne compte pas.`;
  if (diff === 'standard') return `${hp} Trois propositions. Un indice est possible, mais il rapporte moins de points.`;
  return isTyped(diff, level) ? `${hp} Pas de propositions : tu écris toi-même la bonne orthographe, sans indice.` : `${hp} Quatre propositions, sans indice : à toi de bien lire.`;
};

// ═══════════════════════════════ L'écran de jeu ═══════════════════════════════

interface PlayProps {
  s: GameState;
  round: Round;
  counter: { n: number; score: number };
  summon: RuleId | null;
  diff: CourseDiff;
  sfx: Sfx;
  onWritten: () => void;
  onTap: (i: number) => void;
  onPick: (c: string) => void;
  onNext: () => void;
  onBack: () => void;
  onTip: () => void;
}

/** Fin d'une manche : la créature est touchée, s'enfuit (réponse donnée) ou gagne (plus de vie). */
type Outcome = 'strike' | 'flee' | 'win' | null;

/**
 * L'écran de combat, en trois bandes de proportions fixes : la scène (ton canon à gauche, la créature à droite), la feuille
 * où la créature écrit sa phrase, puis la zone de réponse, dont la hauteur est réservée pour que rien ne bouge.
 */
function PlayView({ s, round, counter, summon, diff, sfx, onWritten, onTap, onPick, onNext, onBack, onTip }: PlayProps) {
  const duel = !!s.duel;
  const total = duel ? (s.duel as { items: Item[] }).items.length : ROUNDS;
  const boss = !duel && s.asked === BOSS_AT;
  const role = roleOf(round.item, boss);
  const slot = s.order[s.asked % ENEMY_KINDS];
  const kind = kindFor(role, slot);
  const name = foeName(role, slot);
  const done = round.step === 'done';
  const outcome: Outcome = done ? (round.lost ? 'win' : round.revealed ? 'flee' : 'strike') : null;
  const typed = isTyped(diff, s.level);

  // ─── chronologie des effets : impact du boulet, puis la correction s'écrit ───
  const [impact, setImpact] = useState(false);
  const [corrected, setCorrected] = useState(false);
  useEffect(() => {
    setImpact(false);
    setCorrected(false);
    if (!outcome) return;
    if (outcome !== 'strike' || reducedMotion()) {
      setImpact(outcome === 'strike');
      setCorrected(true);
      if (outcome === 'strike') sfx.play('correct');
      return;
    }
    sfx.play('cannon');
    const a = window.setTimeout(() => {
      setImpact(true);
      sfx.play(boss ? 'bigkill' : 'impact');
    }, T.shot);
    const b = window.setTimeout(() => {
      setCorrected(true);
      sfx.play('correct');
    }, T.shot + T.fix);
    return () => {
      window.clearTimeout(a);
      window.clearTimeout(b);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outcome, round.item.id]);

  const mood: EnemyMood = outcome === 'strike' ? (impact ? 'dead' : 'angry') : outcome === 'win' ? 'attack' : round.step === 'write' ? 'write' : round.step === 'fix' || round.hits > 0 ? 'angry' : 'idle';

  const nextRef = useRef<HTMLButtonElement>(null);
  const fixRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (round.step === 'done') nextRef.current?.focus({ preventScroll: true });
    else if (round.step === 'fix' && !typed) fixRef.current?.focus({ preventScroll: true });
  }, [round.step, round.item.id, typed]);

  const ask = round.msg
    ? round.msg
    : round.step === 'write'
      ? `${name} écrit sa phrase…`
      : round.step === 'tap'
        ? 'Touche le mot mal écrit.'
        : round.step === 'fix'
          ? typed
            ? 'Écris la bonne orthographe du mot.'
            : 'Choisis la bonne écriture.'
          : outcome === 'strike'
            ? round.tries > 1
              ? 'Corrigé ! La créature est vaincue.'
              : 'Bravo ! La créature est vaincue.'
            : outcome === 'flee'
              ? 'La créature s’enfuit. Voici la bonne écriture.'
              : 'L’encre a gagné cette fois. Voici la bonne phrase.';
  const askTone = round.msg && !done ? ' hx-ask-bad' : outcome === 'strike' ? ' hx-ask-good' : '';

  return (
    <section aria-label="Partie en cours" className="hx">
      <header className="hx-hud">
        <BackButton onClick={onBack} label="Menu" />
        <div className="hx-hud-mid">
          <span className="hx-count">{duel ? `Duel · ${counter.n}/${total}` : `Phrase ${counter.n}/${total}`}</span>
          <Progress total={total} at={counter.n} boss={!duel} />
        </div>
        <div className="hx-hud-end">
          {!duel && <Hearts hp={s.hp} max={s.maxHp} hits={round.hits} />}
          {!duel && <span className="hx-score num">{fmt(s.score)} pts</span>}
        </div>
      </header>

      <div className="hx-tags">
        <span className="hx-rule" title={ruleInfo(round.item.rule).fault}>
          {duel ? ruleInfo((s.duel as { rule: RuleId }).rule).name : ruleInfo(round.item.rule).name}
        </span>
        {!duel && (summon || s.retry.includes(round.item.id)) && <span className="hx-again">{summon ? 'À revoir' : 'Phrase ratée la dernière fois'}</span>}
      </div>

      <Stage key={round.item.id} role={role} kind={kind} name={name} mood={mood} hits={round.hits} outcome={outcome} impact={impact} />

      <p className={`hx-ask${askTone}`} aria-live="polite">
        {ask}
      </p>

      <Sheet round={round} sfx={sfx} tuto={s.tuto && s.asked === 0} corrected={corrected} onWritten={onWritten} onTap={onTap} />

      <div className="hx-zone">
        <div className={`hx-layer${round.step === 'fix' ? '' : ' off'}`} aria-hidden={round.step !== 'fix'}>
          {typed ? (
            <TypeBox key={round.item.id + round.tries} word={round.item.wrong} active={round.step === 'fix'} onSend={onPick} />
          ) : (
            <div className="hx-choices" role="group" aria-label="Propositions" data-n={round.choices.length}>
              {round.choices.map((c, i) => {
                const tried = round.wrongPicks.includes(c);
                return (
                  <button
                    key={c}
                    ref={i === 0 ? fixRef : undefined}
                    type="button"
                    className={`hx-choice${tried ? ' tried' : ''}`}
                    disabled={tried || round.step !== 'fix'}
                    aria-label={tried ? `${c} : ce n’est pas la bonne écriture` : c}
                    onClick={() => onPick(c)}
                  >
                    {c}
                  </button>
                );
              })}
            </div>
          )}
          <div className="hx-help">
            {HINT[diff] === 'cost' && !round.tipShown ? (
              <button type="button" className="hx-hint" onClick={onTip} disabled={round.step !== 'fix'}>
                Voir l’astuce <small>(moins de points)</small>
              </button>
            ) : (
              <p className={`hx-tip${round.tipShown ? '' : ' ghost'}`}>
                <strong>Astuce :</strong> {round.item.tip}
              </p>
            )}
          </div>
        </div>
        <div className={`hx-layer${done ? '' : ' off'}`} aria-hidden={!done}>
          <p className="hx-tip">
            <strong>À retenir :</strong> {round.item.tip}
          </p>
          <div className="hx-end">
            <span className={`hx-gain num${done && !duel && round.gained > 0 ? '' : ' ghost'}`}>+ {round.gained} points</span>
            <button ref={nextRef} type="button" className="btn btn-primary hx-next" onClick={onNext} disabled={!done}>
              {round.lost ? 'Voir mon bilan' : s.asked + 1 >= total ? 'Terminer' : 'Phrase suivante'}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

const foeName = (role: EnemyRole, slot: number) =>
  role === 'boss' ? BOSS_NAME : role === 'pate' ? PATE_NAMES[slot % PATE_NAMES.length] : role === 'splash' ? SPLASH_NAMES[slot % SPLASH_NAMES.length] : ENEMY_NAMES[slot % ENEMY_NAMES.length];

/** Avancement : une goutte par phrase, la dernière (le Grand Pâté) plus grosse. */
function Progress({ total, at, boss }: { total: number; at: number; boss: boolean }) {
  return (
    <span className="hx-prog" aria-hidden="true">
      {Array.from({ length: total }, (_, k) => (
        <i key={k} className={`${k < at - 1 ? 'past' : k === at - 1 ? 'now' : ''}${boss && k === total - 1 ? ' last' : ''}`} />
      ))}
    </span>
  );
}

const HEART = 'M12 21s-7.5-4.6-9.6-9.3C.9 8.3 2.8 4.5 6.5 4.5c2.1 0 3.6 1.2 4.5 2.7.9-1.5 2.4-2.7 4.5-2.7 3.7 0 5.6 3.8 4.1 7.2C19.5 16.4 12 21 12 21z';

/** Les vies : la dernière perdue se brise au moment où l'encre touche le canon. */
function Hearts({ hp, max, hits }: { hp: number; max: number; hits: number }) {
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

const SIZE: Record<EnemyRole, string> = { splash: '52%', tache: '64%', pate: '74%', boss: '82%' };

/**
 * La scène : le canon (toi) à gauche, la créature à droite, sur une ligne d'encre. Toutes les positions sont en pourcentage de
 * la scène, qui garde les mêmes proportions sur ordinateur et sur téléphone : le boulet et l'encre arrivent toujours au même
 * endroit, sans mesure ni calcul.
 */
function Stage({ role, kind, name, mood, hits, outcome, impact }: { role: EnemyRole; kind: number; name: string; mood: EnemyMood; hits: number; outcome: Outcome; impact: boolean }) {
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
const STAR = Array.from({ length: 16 }, (_, i) => {
  const a = (Math.PI * i) / 8;
  const r = i % 2 === 0 ? 48 : 24;
  return `${(50 + r * Math.cos(a)).toFixed(1)},${(50 + r * Math.sin(a)).toFixed(1)}`;
}).join(' ');
function ImpactFx() {
  return (
    <span className="hx-impact">
      <svg viewBox="0 0 100 100">
        <polygon points={STAR} />
      </svg>
      <i />
    </span>
  );
}

/**
 * La feuille : la créature y écrit sa phrase lettre après lettre (une plume suit l'écriture). Les mots gardent leur place dès le
 * départ (les lettres pas encore écrites sont invisibles), si bien que rien ne bouge quand la phrase apparaît. Toucher la feuille
 * pendant l'écriture l'affiche d'un coup.
 */
function Sheet({ round, sfx, tuto, corrected, onWritten, onTap }: { round: Round; sfx: Sfx; tuto: boolean; corrected: boolean; onWritten: () => void; onTap: (i: number) => void }) {
  const { item, step } = round;
  const tokens = [...item.before, item.wrong + item.suffix, ...item.after];
  const starts: number[] = [];
  let len = 0;
  for (const t of tokens) {
    starts.push(len);
    len += t.length + 1;
  }
  const target = item.before.length;
  const [shown, skip] = useWriter(item.id, len, step === 'write', starts, sfx, onWritten);
  const writing = step === 'write' && shown < len;
  const done = step === 'done';

  return (
    <div className={`hx-sheet${writing ? ' writing' : ''}`} onClick={writing ? skip : undefined}>
      <div className="hx-line" role="group" aria-label={writing ? 'Phrase en cours d’écriture' : 'Phrase'}>
        {tokens.map((t, i) => {
          const k = Math.max(0, Math.min(t.length, shown - starts[i]));
          // la plume se tient juste après la dernière lettre écrite
          const nib = writing && shown >= starts[i] && shown <= starts[i] + t.length;
          const text = (
            <>
              <span className="hx-ink">{t.slice(0, k)}</span>
              {nib && <span className="hx-nib" />}
              {k < t.length && <span className="hx-hide">{t.slice(k)}</span>}
            </>
          );
          if (i === target && done) {
            return (
              <span key={i} className={`hx-w hx-fixed${corrected ? ' on' : ''}`}>
                <span className="hx-was">{item.wrong}</span>
                <span className="hx-right">
                  {corrected ? item.right : item.wrong}
                  {item.suffix}
                </span>
              </span>
            );
          }
          if (i === target && step === 'fix') {
            return (
              <span key={i} className="hx-w hx-found">
                {t}
              </span>
            );
          }
          if (!isWord(t)) {
            return (
              <span key={i} className="hx-w hx-punct">
                {text}
              </span>
            );
          }
          const bad = round.badTaps.includes(i);
          return (
            <span key={i} className="hx-wrap">
              <button type="button" className={`hx-w${bad ? ' bad' : ''}`} disabled={step !== 'tap' || bad} onClick={() => onTap(i)}>
                {text}
              </button>
              {tuto && i === target && step === 'tap' && round.badTaps.length === 0 && <span className="hx-point">Touche ce mot !</span>}
            </span>
          );
        })}
      </div>
      {canSpeak && !writing && (
        <button
          type="button"
          className="hx-speak"
          aria-label="Lire la phrase à voix haute"
          title="Lire la phrase"
          onClick={(e) => {
            e.stopPropagation();
            speak(done ? item.fixed : tokens.join(' '));
          }}
        >
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <path d="M3 9v6h4l5 4V5L7 9H3z" fill="currentColor" />
            <path d="M15 8.5a5 5 0 0 1 0 7M17.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
      )}
    </div>
  );
}

/**
 * Écriture progressive : renvoie le nombre de caractères déjà écrits et une fonction pour tout afficher d'un coup.
 * Environ 1,4 s par phrase quelle que soit sa longueur (entre 18 et 34 ms par lettre), un grattement de plume à chaque mot.
 */
function useWriter(id: string, len: number, active: boolean, starts: number[], sfx: Sfx, onDone: () => void): [number, () => void] {
  const [shown, setShown] = useState(active ? 0 : len);
  const raf = useRef(0);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  const startsRef = useRef(starts);
  startsRef.current = starts;
  const finish = useCallback(() => {
    cancelAnimationFrame(raf.current);
    setShown(len);
    doneRef.current();
  }, [len]);
  useEffect(() => {
    if (!active) {
      setShown(len);
      return;
    }
    if (reducedMotion()) {
      finish();
      return;
    }
    setShown(0);
    const per = Math.max(18, Math.min(34, 1400 / len));
    const t0 = performance.now() + T.enter;
    let word = -1;
    const tick = (t: number) => {
      const n = Math.floor((t - t0) / per);
      if (n >= len) {
        finish();
        return;
      }
      if (n >= 0) {
        setShown(n);
        let w = word;
        while (w + 1 < startsRef.current.length && startsRef.current[w + 1] <= n) w++;
        if (w !== word) {
          word = w;
          sfx.play('scribble');
        }
      }
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, active]);
  return [shown, finish];
}

/** Expert : on corrige le mot en l'écrivant (le mot faux est déjà dans la case). */
function TypeBox({ word, active, onSend }: { word: string; active: boolean; onSend: (t: string) => void }) {
  const [text, setText] = useState(word);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (active) {
      ref.current?.focus({ preventScroll: true });
      ref.current?.select();
    }
  }, [active]);
  return (
    <form
      className="hx-type"
      onSubmit={(e) => {
        e.preventDefault();
        if (text.trim()) onSend(text);
      }}
    >
      <label className="sr-only" htmlFor="sp-type-in">
        Écris la bonne orthographe du mot
      </label>
      <input id="sp-type-in" ref={ref} value={text} onChange={(e) => setText(e.target.value)} lang="fr" autoCapitalize="off" autoComplete="off" autoCorrect="off" spellCheck={false} disabled={!active} />
      <button type="submit" className="btn btn-primary" disabled={!active || !text.trim()}>
        Valider
      </button>
    </form>
  );
}

/** Synthèse vocale du navigateur : tout reste sur l'appareil, rien n'est envoyé. */
const canSpeak = typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';
function speak(text: string) {
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'fr-FR';
    u.rate = 0.9;
    window.speechSynthesis.speak(u);
  } catch {
    /* pas de voix disponible */
  }
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
        {list.map((x) => (
          <li key={x.id} className="num">
            {fmt(x.score)} points
          </li>
        ))}
      </ol>
    </section>
  );
}

function OverPanel({ over, cloud, account, onRestart, onDuel, onMenu }: { over: Over; cloud: Cloud; account: boolean; onRestart: () => void; onDuel: (r: RuleId) => void; onMenu: () => void }) {
  const duel = !!over.duel;
  const title = duel ? 'Duel terminé' : over.dead ? 'L’encre a gagné, cette fois' : over.record ? 'Nouveau record !' : over.okRounds === over.total ? 'Page corrigée, sans faute !' : 'Page corrigée !';
  let line: ReactNode = null;
  if (!duel)
    line = over.dead
      ? `Tu as corrigé ${over.defeated} phrase${over.defeated > 1 ? 's' : ''} sur ${over.total}. Relis les astuces ci-dessous, puis retente : les phrases changent à chaque partie.`
      : `${over.okRounds} phrase${over.okRounds > 1 ? 's' : ''} réussie${over.okRounds > 1 ? 's' : ''} du premier coup sur ${over.total}. Il te restait ${over.hpLeft} vie${over.hpLeft > 1 ? 's' : ''} sur ${over.maxHp}.`;
  return (
    <section aria-labelledby="sp-over">
      <h1 id="sp-over" className="title title-wrap">
        {title}
      </h1>
      <div className="rule" aria-hidden="true" />
      {!duel && (
        <>
          <p className="mt-2 text-[16px]">
            <strong className="score-big">{fmt(over.score)}</strong> points{over.rank > 0 ? ` · n° ${over.rank} sur cet appareil` : ''}
          </p>
          <p className="mt-2 text-[16px] font-bold">{line}</p>
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
