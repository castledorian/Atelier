import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { CustomPanel } from '../components/Screens';
import { SortTh, sortRows, useSort } from '../components/SortTable';
import { COURSE_DIFFS, LEVELS } from '../game/course/questions';
import type { CourseDiff, Level } from '../game/course/questions';
import { DEFAULT_CUSTOM } from '../game/difficulty';
import type { CustomConfig, Difficulty } from '../game/difficulty';
import { downloadText, fmtDate, toCsv } from '../game/history';
import { MEM_DIFFS, MODES, PAGES, PAGE_TITLES } from '../game/memory/rounds';
import type { MemDiff, Mode } from '../game/memory/rounds';
import { AVAILABLE } from '../game/grade';
import { GAME_NAMES, describeConfig, parseMath, parseMemory, parseTyping } from '../game/sessionConfig';
import type { GameKind } from '../game/sessionConfig';
import type { Settings } from '../game/storage';
import * as T from '../server/teacher';
import type { ClassRow, ClassSession, SessionResultRow } from '../server/types';

const fmt = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
type Act = <R>(f: () => Promise<R>) => Promise<R | undefined>;

const GAMES: GameKind[] = ['typing', 'math', 'spelling', 'memory'];
const TYPING_DIFFS: Array<[Difficulty, string]> = [
  ['apprenti', 'Apprenti'],
  ['standard', 'Standard'],
  ['expert', 'Expert'],
  ['perso', 'Personnalisé'],
];

interface Draft {
  id?: string;
  title: string;
  game: GameKind;
  maxAttempts: number;
  active: boolean;
  typingDiff: Difficulty;
  custom: CustomConfig;
  level: Level;
  courseDiff: CourseDiff;
  mode: Mode;
  memDiff: MemDiff;
  startPage: number;
}

const blank = (): Draft => ({
  title: '',
  game: 'math',
  maxAttempts: 2,
  active: true,
  typingDiff: 'standard',
  custom: DEFAULT_CUSTOM,
  level: 'cm1',
  courseDiff: 'standard',
  mode: 'suite',
  memDiff: 'standard',
  startPage: 0,
});

function draftOf(s: ClassSession): Draft {
  const t = parseTyping(s.config);
  const m = parseMath(s.config);
  const y = parseMemory(s.config);
  return {
    id: s.id,
    title: s.title,
    game: s.game,
    maxAttempts: s.max_attempts,
    active: s.active,
    typingDiff: t.diff,
    custom: t.custom,
    level: m.level,
    courseDiff: m.diff,
    mode: y.mode,
    memDiff: y.diff,
    startPage: y.startPage,
  };
}

function configOf(d: Draft): Record<string, unknown> {
  if (d.game === 'typing') return d.typingDiff === 'perso' ? { diff: 'perso', custom: d.custom } : { diff: d.typingDiff };
  if (d.game === 'math' || d.game === 'spelling') return { level: d.level, diff: d.courseDiff };
  return { mode: d.mode, diff: d.memDiff, startPage: d.startPage };
}

function Seg<V extends string | number>({ label, value, options, onChange }: { label: string; value: V; options: Array<[V, string]>; onChange: (v: V) => void }) {
  return (
    <div className="cfg-row">
      <span className="cfg-label">{label}</span>
      <div className="seg" role="radiogroup" aria-label={label}>
        {options.map(([v, text]) => (
          <button key={String(v)} type="button" role="radio" aria-checked={value === v} className="seg-b" onClick={() => onChange(v)}>
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Séances de la classe : l'enseignant prépare un jeu réglé, avec 1 à 3 essais ; seul le meilleur score de chaque élève compte. */
export function SessionsPanel({ cls, act }: { cls: ClassRow; act: Act }) {
  const [list, setList] = useState<ClassSession[] | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [view, setView] = useState<{ session: ClassSession; rows: SessionResultRow[] } | null>(null);
  const resSort = useSort<'name' | 'attempts' | 'best'>('best', 'desc');
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    const r = await act(() => T.listSessions(cls.id));
    if (r) setList(r);
  }, [act, cls.id]);
  useEffect(() => {
    void reload();
  }, [reload]);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!draft) return;
    setBusy(true);
    const id = await act(() =>
      T.saveSession(cls.id, { id: draft.id, title: draft.title.trim(), game: draft.game, config: configOf(draft), maxAttempts: draft.maxAttempts, active: draft.active }),
    );
    setBusy(false);
    if (id) {
      setDraft(null);
      await reload();
    }
  };

  const open = async (s: ClassSession) => {
    const rows = await act(() => T.sessionResults(s.id));
    if (rows) setView({ session: s, rows });
  };

  const exportCsv = (s: ClassSession, rows: SessionResultRow[]) => {
    const out: (string | number)[][] = [];
    for (const r of rows) {
      if (r.runs.length === 0) out.push([r.name, '', 0, '', '', '', '', '', 'non']);
      r.runs.forEach((x, i) =>
        out.push([r.name, i + 1, r.attempts, fmtDate(x.at), x.score, x.wave, x.wpm, x.acc, x.score === r.best_score ? 'oui' : 'non']),
      );
    }
    downloadText(
      `seance-${s.title.replace(/[^\w-]+/g, '_')}.csv`,
      toCsv(['Élève', 'Essai', 'Essais utilisés', 'Date', 'Score', 'Vague / série / suite', 'Mots/min', 'Précision %', 'Meilleur essai (compte)'], out),
    );
  };

  if (view) {
    const { session, rows } = view;
    const shown = sortRows(rows, resSort.sort, (r, k) => (k === 'name' ? r.name : k === 'attempts' ? r.attempts : r.best_score));
    const done = rows.filter((r) => r.attempts > 0);
    const avg = done.length ? done.reduce((a, r) => a + (r.best_score ?? 0), 0) / done.length : 0;
    return (
      <section className="sec" aria-labelledby="sres-h">
        <button type="button" className="link" onClick={() => setView(null)}>
          ← Toutes les séances
        </button>
        <h2 id="sres-h" className="subhead mt-2">
          {session.title}
        </h2>
        <p className="text-[14px] leading-snug text-ink/80">
          {GAME_NAMES[session.game]} · {describeConfig(session.game, session.config).join(' · ')} · {session.max_attempts} essai{session.max_attempts > 1 ? 's' : ''}
        </p>
        <p className="mt-1 text-[14px]">
          {done.length} élève{done.length > 1 ? 's' : ''} sur {rows.length} {done.length > 1 ? 'ont' : 'a'} joué
          {done.length > 0 && <> · score moyen (meilleurs essais) : <strong>{fmt(avg)}</strong></>}
        </p>
        <div className="mt-2 overflow-x-auto">
          <table className="scores">
            <caption className="sr-only">Résultats de la séance</caption>
            <thead>
              <tr>
                <SortTh col="name" sort={resSort.sort} onSort={resSort.toggle}>
                  Élève
                </SortTh>
                <SortTh col="attempts" sort={resSort.sort} onSort={resSort.toggle} numeric className="num">
                  Essais
                </SortTh>
                <SortTh col="best" sort={resSort.sort} onSort={resSort.toggle} numeric className="num">
                  Meilleur score
                </SortTh>
                <th scope="col">Détail des essais</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id}>
                  <td>{r.name}</td>
                  <td className="num">
                    {r.attempts}/{session.max_attempts}
                  </td>
                  <td className="num font-bold">{r.best_score === null ? '—' : fmt(r.best_score)}</td>
                  <td className="text-[14px]">{r.runs.length ? r.runs.map((x) => fmt(x.score)).join(' · ') : 'pas encore joué'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-3">
          <button type="button" className="btn btn-ghost" onClick={() => exportCsv(session, rows)}>
            Exporter les essais (CSV)
          </button>
        </div>
      </section>
    );
  }

  if (draft) {
    const set = (p: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...p } : d));
    const settings = { layout: 'azerty', custom: draft.custom } as unknown as Settings;
    const pane = (g: GameKind) => `cfg-pane${draft.game === g ? '' : ' cfg-off'}`;
    const locked = !!draft.id && (list?.find((x) => x.id === draft.id)?.done ?? 0) > 0;
    return (
      <section className="sec" aria-labelledby="sform-h">
        <h2 id="sform-h" className="subhead mb-2">
          {draft.id ? 'Modifier la séance' : 'Nouvelle séance'}
        </h2>
        <form className="form" onSubmit={save}>
          <label className="cfg-label" htmlFor="ses-title">
            Titre (vu par les élèves)
          </label>
          <input
            id="ses-title"
            className="field"
            value={draft.title}
            maxLength={60}
            placeholder="Évaluation : tables de multiplication"
            onChange={(e) => set({ title: e.target.value })}
            autoFocus
          />
          <div className="cfg mt-2">
            <Seg label="Jeu" value={draft.game} options={GAMES.map((g) => [g, GAME_NAMES[g]] as [GameKind, string])} onChange={(game) => !locked && set({ game })} />
            {locked && <p className="text-[14px] text-ink/70">Des élèves ont déjà joué : le jeu ne peut plus changer (les résultats resteraient incomparables).</p>}

            <div className="cfg-stack">
              <div className={pane('typing')}>
                <Seg label="Difficulté" value={draft.typingDiff} options={TYPING_DIFFS} onChange={(typingDiff) => set({ typingDiff })} />
                {draft.game === 'typing' && draft.typingDiff === 'perso' && <CustomPanel settings={settings} onChange={(p) => p.custom && set({ custom: p.custom })} />}
              </div>
              <div className={pane('math')}>
                <Seg label="Niveau" value={draft.level} options={LEVELS.map((l) => [l.id, l.label] as [Level, string])} onChange={(level) => set({ level })} />
                <Seg label="Difficulté" value={draft.courseDiff} options={COURSE_DIFFS.map((d) => [d.id, d.label] as [CourseDiff, string])} onChange={(courseDiff) => set({ courseDiff })} />
                <p className="text-[14px] leading-snug text-ink/70">Les calculs suivent le programme du niveau ; la difficulté règle le temps et l’indulgence.</p>
              </div>
              <div className={pane('spelling')}>
                <Seg label="Niveau" value={draft.level} options={LEVELS.filter((l) => AVAILABLE.spelling.includes(l.id)).map((l) => [l.id, l.label] as [Level, string])} onChange={(level) => set({ level })} />
                <Seg label="Difficulté" value={draft.courseDiff} options={COURSE_DIFFS.map((d) => [d.id, d.label] as [CourseDiff, string])} onChange={(courseDiff) => set({ courseDiff })} />
                <p className="text-[14px] leading-snug text-ink/70">Dix phrases par essai. La difficulté règle le nombre de propositions et la présence de l’indice.</p>
              </div>
              <div className={pane('memory')}>
                <Seg label="Mode" value={draft.mode} options={MODES.map((m) => [m.id, m.label] as [Mode, string])} onChange={(mode) => set({ mode })} />
                <Seg label="Difficulté" value={draft.memDiff} options={MEM_DIFFS.map((d) => [d.id, d.label] as [MemDiff, string])} onChange={(memDiff) => set({ memDiff })} />
                <div className="cfg-row">
                  <label className="cfg-label" htmlFor="ses-page">
                    Départ
                  </label>
                  <select id="ses-page" className="field" value={draft.startPage} onChange={(e) => set({ startPage: Number(e.target.value) })}>
                    {Array.from({ length: PAGES }, (_, i) => (
                      <option key={i} value={i}>
                        Page {i + 1} — {PAGE_TITLES[draft.mode][i]}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <Seg label="Essais par élève" value={draft.maxAttempts} options={[1, 2, 3].map((n) => [n, String(n)] as [number, string])} onChange={(maxAttempts) => set({ maxAttempts })} />
            {draft.id && (
              <label className="opt" style={{ cursor: 'pointer' }}>
                <input type="checkbox" checked={draft.active} onChange={(e) => set({ active: e.target.checked })} />
                &nbsp;Séance ouverte (décocher pour la fermer : les élèves ne peuvent plus jouer)
              </label>
            )}
          </div>
          <p className="text-[14px] leading-snug text-ink/75">
            Seul le <strong>meilleur score</strong> de chaque élève compte pour l’évaluation ; tu vois tous ses essais. Un essai est compté quand la partie est terminée.
          </p>
          <div className="flex flex-wrap gap-3">
            <button type="submit" className="btn btn-primary" disabled={busy || draft.title.trim().length < 1}>
              {draft.id ? 'Enregistrer' : 'Créer la séance'}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setDraft(null)}>
              Annuler
            </button>
          </div>
        </form>
      </section>
    );
  }

  return (
    <section className="sec" aria-labelledby="ses-h">
      <h2 id="ses-h" className="subhead mb-2">
        Séances de la classe
      </h2>
      <p className="text-[14px] leading-snug text-ink/80">
        Prépare un jeu avec ses réglages. Les élèves le retrouvent dans « Mes séances » et peuvent l’essayer 1 à 3 fois ; seul leur meilleur score compte.
      </p>
      <div className="mt-2">
        <button type="button" className="btn btn-primary" onClick={() => setDraft(blank())}>
          + Nouvelle séance
        </button>
      </div>
      {list === null ? (
        <p className="mt-3 text-[15px]">Chargement…</p>
      ) : list.length === 0 ? (
        <p className="mt-3 text-[15px]">Aucune séance pour l’instant.</p>
      ) : (
        <ul className="sess-list mt-3">
          {list.map((s) => (
            <li key={s.id} className="sess-card">
              <div className="sess-main">
                <strong className="sess-title">
                  {s.title}
                  {!s.active && <span className="text-[14px] font-normal"> (fermée)</span>}
                </strong>
                <span className="text-[14px] text-ink/80">
                  {GAME_NAMES[s.game]} · {describeConfig(s.game, s.config).join(' · ')} · {s.max_attempts} essai{s.max_attempts > 1 ? 's' : ''}
                </span>
                <span className="text-[14px]">
                  {s.done} élève{s.done > 1 ? 's' : ''} sur {s.total} {s.done > 1 ? 'ont' : 'a'} joué
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" className="btn btn-primary" onClick={() => void open(s)}>
                  Résultats
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => setDraft(draftOf(s))}>
                  Modifier
                </button>
                {confirmDel === s.id ? (
                  <>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={async () => {
                        const ok = await act(async () => {
                          await T.deleteSession(s.id);
                          return true;
                        });
                        setConfirmDel(null);
                        if (ok) await reload();
                      }}
                    >
                      Confirmer : supprimer (essais compris)
                    </button>
                    <button type="button" className="link" onClick={() => setConfirmDel(null)}>
                      Annuler
                    </button>
                  </>
                ) : (
                  <button type="button" className="link" onClick={() => setConfirmDel(s.id)}>
                    Supprimer
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
