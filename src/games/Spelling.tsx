import { useCallback, useEffect, useRef, useState } from 'react';
import { BackButton } from '../components/BackButton';
import { ENEMY_KINDS } from '../components/InkEnemy';
import { SessionIntro, SessionOver, useSessionRun } from '../components/SessionPanels';
import { boardKey } from '../game/course/questions';
import type { CourseDiff, Level } from '../game/course/questions';
import { ruleInfo, rulesOf } from '../game/encre/rules';
import type { RuleId } from '../game/encre/rules';
import { activeRules, dayKey, DUEL_SIZE, loadStore, recordDuel, recordGame, saveStore, stateOf } from '../game/encre/tracker';
import { effectiveGrade, levelOf } from '../game/grade';
import { Sfx } from '../game/audio';
import { streakAfterLoss } from '../game/scoring';
import { addLog } from '../game/progress';
import { CALM, calmBoss, feedBoss } from '../game/boss/state';
import { newRunId } from '../game/history';
import { spellingOutcome, summarize } from '../game/itemstats';
import type { ItemOutcome } from '../game/itemstats';
import { parseSpelling } from '../game/sessionConfig';
import { loadSettings, saveSettings } from '../game/storage';
import type { Settings } from '../game/storage';
import { choicesFor, duelItems, HINT, hpFor, isFault, isPerfect, isTyped, isTypedRight, nextItem, pickFeedback, pickRetry, pointsFor, ROUNDS, shuffle } from '../game/spelling/engine';
import type { Item, RoundOutcome } from '../game/spelling/engine';
import { addSpellingScore, loadSpellingPrefs, loadSpellingScores, saveSpellingPrefs } from '../game/spelling/scores';
import { enqueue, flush, queueStudentItems } from '../server/outbox';
import { dropCave, sendItemStats, sendRun } from '../server/student';
import type { RunPayload, SessionInfo, StudentAccount } from '../server/types';
import { Frame } from '../pages/Frame';
import { MenuScene, SpellingMenu } from './SpellingMenu';
import type { SpellingView } from './SpellingMenu';
import type { Cloud, GameState, Over, Phase, Round } from './spelling/types';
import { loadRetry, loadSeen, rememberSeen, saveRetry, tutoSeen } from './spelling/storage';
import { hintText } from './spelling/helpers';
import { PlayView } from './spelling/PlayView';
import { OverPanel } from './spelling/OverPanel';

/**
 * « Chasse aux fautes » — jeu d'orthographe (CE1 → CM2).
 * Les créatures d'encre ont semé des ratures dans les phrases. Chaque créature apparaît et écrit sa phrase sous nos yeux ;
 * l'élève touche le mot fautif, puis choisit (ou écrit) la bonne orthographe. Bonne réponse : le canon tire et la phrase est
 * corrigée. Erreur : la créature attaque et l'élève perd une vie. Dix phrases par partie, la dernière écrite par le
 * Grand Pâté. Chaque faute se range dans une règle à revoir (l'Encre), sur l'appareil seulement.
 */

interface Props {
  account: StudentAccount | null;
  onHome: () => void;
  onSessionLost: () => void;
  session?: SessionInfo | null;
  onSessions?: () => void;
}

export default function Spelling({ account, onHome, onSessionLost, session, onSessions }: Props) {
  const [phase, setPhase] = useState<Phase>('menu');
  const [view, setView] = useState<SpellingView>('main');
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
        // règle revue : la créature de la grotte perd un peu d'encre
        if (won) {
          calmBoss();
          if (account && !sesRef.current.sess) void dropCave(account.student.id, account.token, `duel-${id}`, -CALM, 0);
        }
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
        sesRef.current.submit(
          payload,
          () => {
            lost.current = true;
          },
          { game: 'spelling', level: s.level, difficulty: s.diff, items: summarize(s.outcomes) },
        );
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
        if (rounds > 0) {
          addLog('spelling', { t: Date.now(), ok: okCount, err: rounds - okCount, score: s.score, board });
          feedBoss(okCount, rounds - okCount);
          payload.cave = { ink: rounds - okCount, power: okCount };
        }
        if (acct && s.score > 0) {
          setCloud('sending');
          const mine = { studentId: acct.student.id, clientId: payload.clientId, game: 'spelling' as const, level: s.level, difficulty: s.diff, items: summarize(s.outcomes) };
          sendRun(acct.token, payload)
            .then((r) => {
              if (r === 'invalid_session') {
                enqueue(acct.student.id, payload);
                lost.current = true;
              }
              if (r === 'ok' && payload.balance) void sendItemStats(acct.token, 'spelling', s.level, s.diff, summarize(s.outcomes));
              if (r === 'ok' || r === 'invalid_session') queueStudentItems(acct.token, mine, r === 'ok');
              setCloud(r === 'ok' ? 'sent' : 'queued');
            })
            .catch(() => {
              enqueue(acct.student.id, payload);
              queueStudentItems(acct.token, mine, false);
              setCloud('queued');
            });
        } else {
          if (acct && payload.cave && !payload.sessionId) void dropCave(acct.student.id, acct.token, id, payload.cave.ink, payload.cave.power);
          setCloud('off');
        }
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
    s.streak = isPerfect(out) ? s.streak + 1 : streakAfterLoss(s.streak, s.diff);
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
    setView('main');
    setPhase('menu');
    upd(null);
    if (lost.current) onSessionLost();
  };

  const inSession = !!ses.sess;

  // Le menu a la même mise en page que les autres jeux : fond vivant, titre tamponné, quatre rubriques.
  if (phase === 'menu' && !inSession) {
    return (
      <div className="desk">
        <main className="sheet">
          <div className="stage">
            <MenuScene />
            <SpellingMenu
              view={view}
              setView={setView}
              level={level}
              diff={diff}
              setDiff={setDiff}
              hint={hintText(diff, level)}
              settings={settings}
              onChange={(p) => {
                if (p.sound) sfx.unlock();
                setSettings((s) => ({ ...s, ...p }));
              }}
              onStart={() => begin()}
              onTrain={(rule) => begin(rule)}
              onHome={onHome}
            />
          </div>
        </main>
      </div>
    );
  }

  return (
    <Frame wide fill>
      <div className="sp-card">
        {phase !== 'play' && (
          <div className="card-top">
            <BackButton onClick={phase === 'menu' ? (onSessions ?? onHome) : toMenu} label={phase === 'menu' ? (inSession ? 'Mes séances' : 'Accueil') : 'Menu'} />
          </div>
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



