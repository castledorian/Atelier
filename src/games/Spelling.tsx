import { useCallback, useEffect, useRef, useState } from 'react';
import { BackButton } from '../components/BackButton';
import { DuelResult, ReviewNote } from '../components/EncreNotes';
import type { DuelInfo } from '../components/EncreNotes';
import { Check } from '../components/Screens';
import { SessionIntro, SessionOver, useSessionRun } from '../components/SessionPanels';
import { COURSE_DIFFS, LEVELS, boardKey } from '../game/course/questions';
import type { CourseDiff, Level } from '../game/course/questions';
import { ruleInfo, rulesOf } from '../game/encre/rules';
import type { RuleId } from '../game/encre/rules';
import { DUEL_SIZE, activeRules, dayKey, loadStore, recordDuel, recordGame, saveStore, stateOf } from '../game/encre/tracker';
import { newRunId } from '../game/history';
import { parseSpelling } from '../game/sessionConfig';
import { loadSettings, saveSettings } from '../game/storage';
import type { Settings } from '../game/storage';
import { HINT, ROUNDS, choicesFor, duelItems, isFault, isPerfect, nextItem, pointsFor } from '../game/spelling/engine';
import type { Item, RoundOutcome } from '../game/spelling/engine';
import { addSpellingScore, loadSpellingPrefs, loadSpellingScores, saveSpellingPrefs } from '../game/spelling/scores';
import { enqueue, flush } from '../server/outbox';
import { sendRun } from '../server/student';
import type { RunPayload, SessionInfo, StudentAccount } from '../server/types';
import { Frame } from '../pages/Frame';

/**
 * « Chasse aux fautes » — jeu d'orthographe (CM1 / CM2) : une faute s'est glissée dans chaque phrase.
 * On touche le mot faux, puis on choisit la bonne écriture. Chaque faute se range dans une règle.
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
  const [level, setLevel] = useState<Level>(() => (session ? parseSpelling(session.config).level : prefs.current.level));
  const [diff, setDiff] = useState<CourseDiff>(() => (session ? parseSpelling(session.config).diff : prefs.current.diff));
  const ses = useSessionRun(account, session);
  const sesRef = useRef(ses);
  sesRef.current = ses;
  const g = useRef<GameState | null>(null);
  const [round, setRound] = useState<Round | null>(null);
  const [counter, setCounter] = useState({ n: 0, score: 0 });
  const [summon, setSummon] = useState<RuleId | null>(null);
  const [over, setOver] = useState<Over | null>(null);
  const [cloud, setCloud] = useState<Cloud>('off');
  const lost = useRef(false);

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
    setCounter({ n: s.asked + 1, score: s.score });
    setRound({
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
    });
  }, []);

  const finish = useCallback(() => {
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
      setOver({ score: 0, okRounds: s.okRounds, total, bestStreak: 0, rank: -1, record: false, level: s.level, diff: s.diff, missed: [], ...encre });
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
    setOver({ score: s.score, okRounds: s.okRounds, total, bestStreak: s.best, rank, record, level: s.level, diff: s.diff, missed: s.missed, ...encre });
    setPhase('over');
  }, [account]);

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
      };
      setOver(null);
      setCloud('off');
      setPhase('play');
      openRound();
    },
    [level, diff, openRound],
  );

  const tapWord = (i: number) => {
    setRound((r) => {
      if (!r || r.step !== 'tap') return r;
      if (i === r.item.before.length) return { ...r, step: 'fix', msg: '', tipShown: HINT[diff] === 'free' };
      return { ...r, tapFirst: false, msg: 'Ce mot est bien écrit. Cherche encore !' };
    });
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
    }
    else s.okRounds++;
    s.lastOk.push(!isFault(out));
    return { ...r, step: 'done', gained, revealed: tries === 3 };
  };

  const pick = (choice: string) => {
    setRound((r) => {
      if (!r || r.step !== 'fix') return r;
      if (choice === r.item.right) return settle({ ...r, tries: r.tries + 1 }, r.tries + 1);
      const wrongPicks = [...r.wrongPicks, choice];
      if (r.tries + 1 >= 2) return settle({ ...r, tries: 2, wrongPicks }, 3);
      return { ...r, tries: r.tries + 1, wrongPicks, tipShown: true, msg: 'Pas tout à fait. Relis l’astuce et réessaie !' };
    });
  };

  const next = () => {
    const s = g.current;
    if (!s) return;
    s.asked++;
    const total = s.duel ? s.duel.items.length : ROUNDS;
    if (s.asked >= total) finish();
    else openRound();
  };

  const toMenu = () => {
    setPhase('menu');
    setRound(null);
    if (lost.current) onSessionLost();
  };

  const inSession = !!ses.sess;
  const closing = round?.step === 'done';
  const nextRef = useRef<HTMLButtonElement>(null);
  const fixRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (round?.step === 'done') nextRef.current?.focus();
    else if (round?.step === 'fix') fixRef.current?.focus();
  }, [round?.step, round?.item.id]);

  return (
    <Frame>
      <BackButton onClick={phase === 'menu' ? (onSessions ?? onHome) : toMenu} label={phase === 'menu' ? (inSession ? 'Mes séances' : 'Accueil') : 'Menu'} />

      {phase === 'menu' && !inSession && (
        <section aria-labelledby="sp-title">
          <p className="eyebrow">Orthographe · CM1 / CM2</p>
          <h1 id="sp-title" className="title">
            Chasse aux fautes
          </h1>
          <div className="rule" aria-hidden="true" />
          <ol className="mt-3 list-decimal space-y-1 pl-6 text-[16px] leading-snug">
            <li>Une faute s’est glissée dans chaque phrase : touche le mot mal écrit.</li>
            <li>Choisis ensuite la bonne écriture.</li>
            <li>Chaque phrase te donne une astuce pour retenir la règle.</li>
          </ol>
          <h2 className="subhead mt-[var(--sp)]">Ton niveau</h2>
          <div className="seg mt-1" role="radiogroup" aria-label="Niveau">
            {LEVELS.map((l) => (
              <button key={l.id} type="button" role="radio" aria-checked={level === l.id} className="seg-b" onClick={() => setLevel(l.id)}>
                {l.label}
              </button>
            ))}
          </div>
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
        <section aria-label="Partie en cours">
          <div className="flex flex-wrap items-baseline justify-between gap-2 text-[15px]">
            <span className="subhead">
              {g.current.duel ? `Duel · ${ruleInfo(g.current.duel.rule).name}` : `Phrase ${counter.n} sur ${ROUNDS}`}
              {g.current.duel ? ` · ${counter.n} sur ${g.current.duel.items.length}` : ''}
            </span>
            {!g.current.duel && <span className="num">Score : {fmt(counter.score)}</span>}
          </div>
          {summon && (
            <div className="summon-inline" role="status">
              <span>
                On revoit : <strong>{ruleInfo(summon).name}</strong>.
              </span>
            </div>
          )}
          <p className="mt-3 text-[15px] font-bold" aria-live="polite">
            {round.step === 'tap' && 'Touche le mot qui n’est pas bien écrit.'}
            {round.step === 'fix' && 'Choisis la bonne écriture.'}
            {round.step === 'done' && (round.revealed ? 'Voici la bonne écriture.' : round.tapFirst && round.tries === 1 ? 'Bravo !' : 'Bien joué, tu as trouvé !')}
          </p>
          <div className="sp-sentence" role="group" aria-label="Phrase">
            {round.item.before.map((w, i) => (
              <Word key={`b${i}`} text={w} onTap={() => tapWord(i)} disabled={round.step !== 'tap'} />
            ))}
            <span className={`sp-target sp-${round.step}`}>
              {round.step === 'tap' ? (
                <button type="button" className="sp-word" onClick={() => tapWord(round.item.before.length)}>
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
            {round.item.after.map((w, i) => (
              <Word key={`a${i}`} text={w} onTap={() => tapWord(round.item.before.length + 1 + i)} disabled={round.step !== 'tap'} />
            ))}
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
                      onClick={() => pick(c)}
                    >
                      {c}
                    </button>
                  );
                })}
              </div>
              {HINT[diff] === 'cost' && !round.tipShown && (
                <button
                  type="button"
                  className="btn btn-ghost mt-3"
                  onClick={() => setRound((r) => (r ? { ...r, tipShown: true, hintUsed: true } : r))}
                >
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
              {!g.current.duel && round.gained > 0 && <p className="mt-1 text-[15px]">+ {round.gained} points</p>}
              <button ref={nextRef} type="button" className="btn btn-primary mt-3" onClick={next}>
                {g.current.asked + 1 >= (g.current.duel ? g.current.duel.items.length : ROUNDS) ? 'Terminer' : 'Phrase suivante'}
              </button>
            </div>
          )}
        </section>
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
              Phrases réussies : <strong>{over.okRounds}</strong> sur {over.total}
            </p>
          }
          onRetry={() => begin()}
          onBack={() => (onSessions ?? onHome)()}
        />
      )}
    </Frame>
  );
}

const HINT_TEXT: Record<CourseDiff, string> = {
  apprenti: 'Deux propositions seulement, et l’astuce s’affiche toute seule.',
  standard: 'Trois propositions. Un indice est possible, mais il rapporte moins de points.',
  expert: 'Jusqu’à quatre propositions, sans indice : il faut connaître la règle.',
};

function Word({ text, onTap, disabled }: { text: string; onTap: () => void; disabled: boolean }) {
  if (!isWord(text)) return <span className="sp-plain">{text}</span>;
  return (
    <button type="button" className="sp-word" disabled={disabled} onClick={onTap}>
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
  const title = duel ? 'Duel terminé' : over.record ? 'Nouveau record !' : over.okRounds === over.total ? 'Sans faute !' : 'Partie terminée';
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
            {over.okRounds} phrase{over.okRounds > 1 ? 's' : ''} réussie{over.okRounds > 1 ? 's' : ''} sur {over.total}
            {over.bestStreak >= 3 ? `, dont ${over.bestStreak} parfaites d’affilée` : ''}. Bien joué&nbsp;!
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
