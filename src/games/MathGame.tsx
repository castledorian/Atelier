import { useCallback, useEffect, useRef, useState } from 'react';
import { BackButton } from '../components/BackButton';
import { Frame } from '../pages/Frame';
import { newRunId } from '../game/history';
import { explain } from '../server/api';
import { enqueue, flush } from '../server/outbox';
import { fetchBoard, sendRun } from '../server/student';
import type { BoardRow, RunPayload, Scope, StudentAccount } from '../server/types';

/**
 * « Calcul éclair » — jeu de calcul mental PROVISOIRE (60 s), en attendant le vrai jeu de maths.
 * Il sert surtout à montrer que le même compte, la même classe et le même classement servent à plusieurs jeux.
 */

type Level = 'ce2' | 'cm1' | 'cm2';
const LEVELS: Array<{ id: Level; label: string; hint: string }> = [
  { id: 'ce2', label: 'CE2', hint: 'Additions, soustractions, tables de 2 à 5 et de 10' },
  { id: 'cm1', label: 'CM1', hint: 'Toutes les tables, additions et soustractions jusqu’à 1 000' },
  { id: 'cm2', label: 'CM2', hint: 'Multiplications à 2 chiffres, divisions, grands nombres' },
];

const DURATION = 60;
const rnd = (a: number, b: number) => a + Math.floor(Math.random() * (b - a + 1));
const pick = <T,>(a: T[]): T => a[Math.floor(Math.random() * a.length)];

export interface Question {
  text: string;
  answer: number;
}

export function makeQuestion(level: Level): Question {
  if (level === 'ce2') {
    const k = rnd(0, 2);
    if (k === 0) {
      const a = rnd(5, 60);
      const b = rnd(5, 40);
      return { text: `${a} + ${b}`, answer: a + b };
    }
    if (k === 1) {
      const a = rnd(20, 99);
      const b = rnd(5, a - 1);
      return { text: `${a} − ${b}`, answer: a - b };
    }
    const t = pick([2, 3, 4, 5, 10]);
    const n = rnd(1, 10);
    return Math.random() < 0.5 ? { text: `${t} × ${n}`, answer: t * n } : { text: `${n} × ${t}`, answer: t * n };
  }
  if (level === 'cm1') {
    const k = rnd(0, 3);
    if (k === 0) {
      const a = rnd(100, 899);
      const b = rnd(11, 99);
      return { text: `${a} + ${b}`, answer: a + b };
    }
    if (k === 1) {
      const a = rnd(200, 999);
      const b = rnd(11, a - 50);
      return { text: `${a} − ${b}`, answer: a - b };
    }
    const a = rnd(2, 10);
    const b = rnd(2, 10);
    return k === 2 ? { text: `${a} × ${b}`, answer: a * b } : { text: `${a * b} ÷ ${a}`, answer: b };
  }
  const k = rnd(0, 3);
  if (k === 0) {
    const a = rnd(11, 99);
    const b = rnd(3, 9);
    return { text: `${a} × ${b}`, answer: a * b };
  }
  if (k === 1) {
    const a = rnd(2, 12);
    const b = rnd(6, 25);
    return { text: `${a * b} ÷ ${a}`, answer: b };
  }
  if (k === 2) {
    const a = rnd(1000, 8999);
    const b = rnd(101, 999);
    return { text: `${a} + ${b}`, answer: a + b };
  }
  const a = rnd(2000, 9999);
  const b = rnd(101, a - 500);
  return { text: `${a} − ${b}`, answer: a - b };
}

const BEST_KEY = 'frappe.math.best.v1';
const readBest = (): Record<string, number> => {
  try {
    const v = JSON.parse(localStorage.getItem(BEST_KEY) ?? '{}');
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
};

interface Result {
  level: Level;
  score: number;
  correct: number;
  wrong: number;
  best: number;
}

interface Props {
  account: StudentAccount | null;
  onHome: () => void;
  onSessionLost: () => void;
}

export default function MathGame({ account, onHome, onSessionLost }: Props) {
  const [phase, setPhase] = useState<'menu' | 'play' | 'over'>('menu');
  const [level, setLevel] = useState<Level>('cm1');
  const [q, setQ] = useState<Question>({ text: '', answer: 0 });
  const [input, setInput] = useState('');
  const [left, setLeft] = useState(DURATION);
  const [score, setScore] = useState(0);
  const [flash, setFlash] = useState<'ok' | 'ko' | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [sync, setSync] = useState<'off' | 'sending' | 'sent' | 'queued'>('off');
  const st = useRef({ correct: 0, wrong: 0, streak: 0, best: 0, score: 0, endAt: 0, done: false });
  const inputRef = useRef<HTMLInputElement>(null);

  const finish = useCallback(
    (lv: Level) => {
      const s = st.current;
      if (s.done) return;
      s.done = true;
      setPhase('over');
      const total = s.correct + s.wrong;
      const payload: RunPayload = {
        clientId: newRunId(),
        game: 'math',
        mode: lv,
        kind: 'game',
        score: s.score,
        wave: s.best,
        wpm: 0,
        acc: total ? Math.round((s.correct / total) * 100) : 0,
        correct: s.correct,
        duration: DURATION,
        playedMs: Date.now(),
      };
      const bests = readBest();
      if (s.score > (bests[lv] ?? 0)) {
        try {
          localStorage.setItem(BEST_KEY, JSON.stringify({ ...bests, [lv]: s.score }));
        } catch {
          /* ignoré */
        }
      }
      setResult({ level: lv, score: s.score, correct: s.correct, wrong: s.wrong, best: s.best });
      if (account && s.correct > 0) {
        setSync('sending');
        sendRun(account.token, payload)
          .then((r) => {
            if (r === 'invalid_session') {
              enqueue(account.student.id, payload);
              onSessionLost();
            }
            setSync(r === 'ok' ? 'sent' : 'queued');
          })
          .catch(() => {
            enqueue(account.student.id, payload);
            setSync('queued');
          });
      } else setSync('off');
    },
    [account, onSessionLost],
  );

  const start = (lv: Level) => {
    st.current = { correct: 0, wrong: 0, streak: 0, best: 0, score: 0, endAt: Date.now() + DURATION * 1000, done: false };
    setLevel(lv);
    setScore(0);
    setLeft(DURATION);
    setInput('');
    setFlash(null);
    setQ(makeQuestion(lv));
    setResult(null);
    setPhase('play');
    window.setTimeout(() => inputRef.current?.focus(), 30);
  };

  // chronomètre
  useEffect(() => {
    if (phase !== 'play') return;
    const id = window.setInterval(() => {
      const ms = st.current.endAt - Date.now();
      setLeft(Math.max(0, Math.ceil(ms / 1000)));
      if (ms <= 0) finish(level);
    }, 200);
    return () => window.clearInterval(id);
  }, [phase, level, finish]);

  // envoi des parties en attente
  useEffect(() => {
    if (!account) return;
    const go = () => void flush(account.student.id, account.token);
    go();
    window.addEventListener('online', go);
    return () => window.removeEventListener('online', go);
  }, [account]);

  const answer = (value: string, force: boolean) => {
    const s = st.current;
    if (phase !== 'play' || s.done) return;
    const want = String(q.answer);
    const n = value.trim();
    if (n === '') return;
    if (n === want) {
      s.correct++;
      s.streak++;
      s.best = Math.max(s.best, s.streak);
      s.score += 10 + Math.min(s.streak - 1, 10);
      setScore(s.score);
      setFlash('ok');
    } else if (force || n.length >= want.length) {
      s.wrong++;
      s.streak = 0;
      setFlash('ko');
    } else return; // la réponse est encore en cours de frappe
    setInput('');
    setQ(makeQuestion(level));
    window.setTimeout(() => setFlash(null), 220);
  };

  const bests = readBest();

  if (phase === 'menu') {
    return (
      <Frame>
        <div className="card-top">
          <BackButton onClick={onHome} />
        </div>
        <p className="eyebrow">Maths · version provisoire</p>
        <h1 className="title-sm">Calcul éclair</h1>
        <div className="rule" aria-hidden="true" />
        <p className="tagline">
          Tu as {DURATION}&nbsp;secondes. Tape la réponse : elle est validée toute seule dès qu’elle est juste. Les bonnes réponses à la suite rapportent des points en plus.
        </p>
        {account && (
          <p className="mt-2 text-[14px] text-ink/75">
            Joueur&nbsp;: <strong>{account.student.name}</strong> · {account.class.name}
          </p>
        )}
        <h2 className="subhead mt-[var(--sp)]">Choisis ton niveau</h2>
        <div className="games games-levels">
          {LEVELS.map((l) => (
            <button key={l.id} type="button" className="gcard" onClick={() => start(l.id)}>
              <span className="gcard-name">{l.label}</span>
              <span className="gcard-text">{l.hint}</span>
              <span className="gcard-go">{bests[l.id] ? `Record : ${bests[l.id]}` : 'Jouer →'}</span>
            </button>
          ))}
        </div>
      </Frame>
    );
  }

  if (phase === 'play') {
    return (
      <Frame>
        <div className="card-top">
          <BackButton onClick={onHome} />
          <span className="subhead">{LEVELS.find((l) => l.id === level)?.label}</span>
        </div>
        <div className="math-top">
          <span className="num math-time" role="timer" aria-label={`${left} secondes restantes`}>
            {left}&nbsp;s
          </span>
          <span className="num">Score {score}</span>
        </div>
        <div className="math-bar" aria-hidden="true">
          <i style={{ transform: `scaleX(${left / DURATION})` }} />
        </div>
        <div className={`math-q ${flash === 'ok' ? 'is-ok' : flash === 'ko' ? 'is-ko' : ''}`} aria-live="off">
          {q.text} = ?
        </div>
        <form
          className="math-form"
          onSubmit={(e) => {
            e.preventDefault();
            answer(input, true);
          }}
        >
          <input
            ref={inputRef}
            className="field math-input"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="off"
            aria-label="Ta réponse"
            value={input}
            onChange={(e) => {
              const v = e.target.value.replace(/[^0-9]/g, '').slice(0, 6);
              setInput(v);
              answer(v, false);
            }}
            onBlur={() => phase === 'play' && window.setTimeout(() => inputRef.current?.focus(), 0)}
          />
        </form>
        <p className="mt-3 text-center text-[13px] text-ink/70">
          Série en cours&nbsp;: {st.current.streak} · Entrée valide ta réponse
        </p>
      </Frame>
    );
  }

  return (
    <Frame>
      <div className="card-top">
        <BackButton onClick={onHome} />
      </div>
      <p className="eyebrow">Calcul éclair · {LEVELS.find((l) => l.id === result?.level)?.label}</p>
      <h1 className="title-sm">Temps écoulé&nbsp;!</h1>
      <div className="rule" aria-hidden="true" />
      <div className="mt-[var(--sp)] flex items-end gap-3">
        <div className="score-big" aria-label={`Score : ${result?.score ?? 0}`}>
          {result?.score ?? 0}
        </div>
        <div className="pb-2 text-[13px] uppercase tracking-[0.12em] text-ink/65">points</div>
      </div>
      <dl className="mt-3 grid grid-cols-3 border-2 border-ink">
        {[
          ['Justes', String(result?.correct ?? 0)],
          ['Fautes', String(result?.wrong ?? 0)],
          ['Meilleure série', String(result?.best ?? 0)],
        ].map(([k, v], i) => (
          <div key={k} className={`px-2 py-2 text-center ${i > 0 ? 'border-l-2 border-ink' : ''}`}>
            <dt className="text-[11px] uppercase tracking-[0.08em] text-ink/65">{k}</dt>
            <dd className="font-display text-[22px] leading-tight">{v}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-[var(--sp)] flex flex-wrap gap-3">
        <button type="button" className="btn btn-primary" autoFocus onClick={() => start(result?.level ?? level)}>
          Rejouer
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => setPhase('menu')}>
          Changer de niveau
        </button>
      </div>
      {account && (
        <>
          {sync === 'sending' && <p className="mt-4 text-[14px] text-ink/75">Envoi du score à la classe…</p>}
          {sync === 'sent' && <p className="mt-4 text-[14px] text-ink/75">Score envoyé à la classe ✓</p>}
          {sync === 'queued' && <p className="mt-4 text-[14px] text-ink/75">Pas de réseau : ton score est gardé et sera envoyé plus tard.</p>}
          <MathBoard account={account} level={result?.level ?? level} refreshKey={sync} />
        </>
      )}
    </Frame>
  );
}

function MathBoard({ account, level, refreshKey }: { account: StudentAccount; level: Level; refreshKey: string }) {
  const [scope, setScope] = useState<Scope>('class');
  const [rows, setRows] = useState<BoardRow[] | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    if (refreshKey === 'sending') return;
    let alive = true;
    setRows(null);
    setErr('');
    fetchBoard(account.token, 'math', level, scope, 10)
      .then((r) => alive && setRows(r))
      .catch((e) => alive && setErr(explain(e)));
    return () => {
      alive = false;
    };
  }, [account.token, level, scope, refreshKey]);
  return (
    <div className="mt-6">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="subhead">Meilleurs scores · {level.toUpperCase()}</h2>
        <div className="seg" role="tablist" aria-label="Classement">
          <button type="button" role="tab" aria-selected={scope === 'class'} className="seg-b" onClick={() => setScope('class')}>
            Classe
          </button>
          <button type="button" role="tab" aria-selected={scope === 'school'} className="seg-b" onClick={() => setScope('school')}>
            École
          </button>
        </div>
      </div>
      {err ? (
        <p className="text-[15px] text-ink/75">{err}</p>
      ) : rows === null ? (
        <p className="text-[15px] text-ink/75">Chargement du classement…</p>
      ) : rows.length === 0 ? (
        <p className="text-[15px] text-ink/75">Personne n’a encore joué ce niveau.</p>
      ) : (
        <table className="scores">
          <caption className="sr-only">Meilleurs scores</caption>
          <thead>
            <tr>
              <th scope="col">#</th>
              <th scope="col">Prénom</th>
              <th scope="col" className="num">
                Score
              </th>
              <th scope="col" className="num">
                Série
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.rank + r.name} className={r.is_me ? 'me' : undefined}>
                <td>{r.rank}.</td>
                <td>{r.name}</td>
                <td className="num">{r.score}</td>
                <td className="num">{r.wave}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
