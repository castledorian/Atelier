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
import { GAME_NAMES, describeConfig, parseFacteur, parseLexique, parseMath, parseMemory, parseTyping } from '../game/sessionConfig';
import { F_LEVELS } from '../game/facteur/words';
import type { FLevel } from '../game/facteur/words';
import type { GameKind } from '../game/sessionConfig';
import { LEX_DIFFS, LEX_LEVELS, LEX_RELS } from '../game/lexique/rounds';
import type { LexDiff, LexLevel, Rel } from '../game/lexique/rounds';
import type { Settings } from '../game/storage';
import * as T from '../server/teacher';
import { Tip } from '../components/Tip';
import { WeakPoints } from '../components/WeakPoints';
import type { WeakRow } from '../components/WeakPoints';

/** Détail de chaque jeu, montré dans la bulle « i » du formulaire (la page reste courte). */
const GAME_HELP: Record<string, string> = {
  typing: 'Choisis la difficulté ; « Perso » ouvre les réglages détaillés.',
  math: 'Les calculs suivent le programme du niveau ; la difficulté règle le temps et l’indulgence.',
  spelling: 'Dix phrases par essai. La difficulté règle le nombre de propositions et l’indice.',
  lexique: 'Synonymes, contraires, familles de mots. La difficulté règle vitesse, nombre de mots et vies.',
  facteur: '16 colis par essai. Chaque niveau reprend les mots des précédents.',
  memory: 'La Suite : refaire une suite dans l’ordre. Les Cases : retrouver des places sur une grille. « Départ » choisit la page du cahier où commencer.',
};
import type { ClassRow, ClassSession, SessionResultRow } from '../server/types';

const fmt = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
type Act = <R>(f: () => Promise<R>) => Promise<R | undefined>;

const GAMES: GameKind[] = ['typing', 'math', 'spelling', 'memory', 'lexique', 'facteur'];
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
  lexRel: Rel;
  lexDiff: LexDiff;
  lexLevel: LexLevel;
  fLevel: FLevel;
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
  lexRel: 'melange',
  lexDiff: 'standard',
  lexLevel: 'cm1',
  fLevel: 1,
});

function draftOf(s: ClassSession): Draft {
  const t = parseTyping(s.config);
  const m = parseMath(s.config);
  const y = parseMemory(s.config);
  const x = parseLexique(s.config);
  const f = parseFacteur(s.config);
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
    lexRel: x.rel,
    lexDiff: x.diff,
    lexLevel: x.level,
    fLevel: f.level,
  };
}

function configOf(d: Draft): Record<string, unknown> {
  if (d.game === 'typing') return d.typingDiff === 'perso' ? { diff: 'perso', custom: d.custom } : { diff: d.typingDiff };
  if (d.game === 'math' || d.game === 'spelling') return { level: d.level, diff: d.courseDiff };
  if (d.game === 'lexique') return { rel: d.lexRel, diff: d.lexDiff, level: d.lexLevel };
  if (d.game === 'facteur') return { level: d.fLevel };
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
  const [view, setView] = useState<{ session: ClassSession; rows: SessionResultRow[]; missed: WeakRow[] | null } | null>(null);
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
    // le détail des erreurs n'existe que pour les jeux de calcul, d'orthographe et de lecture
    const detailed = s.game === 'math' || s.game === 'spelling' || s.game === 'facteur';
    const [rows, missed] = await Promise.all([act(() => T.sessionResults(s.id)), detailed ? act(() => T.sessionItems(s.id)) : Promise.resolve(null)]);
    if (rows) setView({ session: s, rows, missed: missed ?? null });
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
    const { session, rows, missed } = view;
    const shown = sortRows(rows, resSort.sort, (r, k) => (k === 'name' ? r.name : k === 'attempts' ? r.attempts : r.best_score));
    const done = rows.filter((r) => r.attempts > 0);
    const avg = done.length ? done.reduce((a, r) => a + (r.best_score ?? 0), 0) / done.length : 0;
    return (
      <section className="sec" aria-labelledby="sres-h" data-observe-ok>
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
          {done.length > 0 && (
            <>
              {' '}
              · moyenne <strong>{fmt(avg)}</strong>
              <Tip label="Calcul de la moyenne">Moyenne des meilleurs essais des élèves qui ont joué.</Tip>
            </>
          )}
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
        {missed && (
          <div className="mt-3">
            <WeakPoints
              rows={missed}
              title="Questions les plus ratées"
              note="Familles et exercices de cette séance ratés au moins une fois sur quatre, tous essais confondus, avec les mauvaises réponses les plus choisies. Les essais joués avant la mise à jour n’ont pas ce détail."
            />
          </div>
        )}
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
          <Tip label="À propos de ce réglage">
            {GAME_HELP[draft.game]} Seul le meilleur essai de chaque élève compte ; tu vois tous ses essais.
          </Tip>
        </h2>
        <form className="form" onSubmit={save}>
          <label className="cfg-label" htmlFor="ses-title">
            Titre
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
            {locked && (
              <p className="text-[14px]">
                Jeu verrouillé
                <Tip label="Pourquoi ?">Des élèves ont déjà joué : changer de jeu rendrait les résultats incomparables.</Tip>
              </p>
            )}

            <div className="cfg-stack">
              <div className={pane('typing')}>
                <Seg label="Difficulté" value={draft.typingDiff} options={TYPING_DIFFS} onChange={(typingDiff) => set({ typingDiff })} />
                {draft.game === 'typing' && draft.typingDiff === 'perso' && <CustomPanel settings={settings} onChange={(p) => p.custom && set({ custom: p.custom })} />}
              </div>
              <div className={pane('math')}>
                <Seg label="Niveau" value={draft.level} options={LEVELS.map((l) => [l.id, l.label] as [Level, string])} onChange={(level) => set({ level })} />
                <Seg label="Difficulté" value={draft.courseDiff} options={COURSE_DIFFS.map((d) => [d.id, d.label] as [CourseDiff, string])} onChange={(courseDiff) => set({ courseDiff })} />
              </div>
              <div className={pane('spelling')}>
                <Seg label="Niveau" value={draft.level} options={LEVELS.filter((l) => AVAILABLE.spelling.includes(l.id)).map((l) => [l.id, l.label] as [Level, string])} onChange={(level) => set({ level })} />
                <Seg label="Difficulté" value={draft.courseDiff} options={COURSE_DIFFS.map((d) => [d.id, d.label] as [CourseDiff, string])} onChange={(courseDiff) => set({ courseDiff })} />
              </div>
              <div className={pane('lexique')}>
                <Seg label="Consigne" value={draft.lexRel} options={LEX_RELS.map((r) => [r.id, r.label] as [Rel, string])} onChange={(lexRel) => set({ lexRel })} />
                <Seg label="Niveau des mots" value={draft.lexLevel} options={LEX_LEVELS.map((l) => [l.id, l.label] as [LexLevel, string])} onChange={(lexLevel) => set({ lexLevel })} />
                <Seg label="Difficulté" value={draft.lexDiff} options={LEX_DIFFS.map((d) => [d.id, d.label] as [LexDiff, string])} onChange={(lexDiff) => set({ lexDiff })} />
              </div>
              <div className={pane('facteur')}>
                <Seg label="Niveau" value={draft.fLevel} options={F_LEVELS.map((l) => [l.id, l.label] as [FLevel, string])} onChange={(fLevel) => set({ fLevel })} />
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
                &nbsp;Séance ouverte
                <Tip label="Fermer une séance">Décoche pour la fermer : les élèves ne peuvent plus jouer.</Tip>
              </label>
            )}
          </div>
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
        <Tip label="Qu’est-ce qu’une séance ?">Un jeu réglé pour la classe, à essayer 1 à 3 fois dans « Mes séances ». Le meilleur score compte.</Tip>
      </h2>
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
                <button type="button" data-observe-ok className="btn btn-primary" onClick={() => void open(s)}>
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
