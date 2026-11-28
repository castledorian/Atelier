import { GAME_NAMES } from '../../game/sessionConfig';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { Notice } from '../Frame';
import { SessionsPanel } from '../SessionsTeacher';
import { downloadText, fmtDate, toCsv } from '../../game/history';
import * as T from '../../server/teacher';
import { Check } from '../../components/Screens';
import StudentProfile from '../StudentProfile';
import { Tip } from '../../components/Tip';
import { Card, Pill, Stat } from '../../components/ui';
import type { Tone } from '../../components/ui';
import { classIsActive, deltaOf, flagOf, focusGame } from '../../game/studentView';
import { WeakPoints } from '../../components/WeakPoints';
import type { Flag } from '../../game/studentView';
import { endOfYearReminder, RETENTION_MONTHS } from '../../server/retention';
import { SortTh, useSort, useSorted } from '../../components/SortTable';
import type { SortValue } from '../../components/SortTable';
import type { ClassRow, NewStudent, Overview } from '../../server/types';
import { GradeSetting } from './GradeSetting';
import { nice } from './shared';
import type { Act } from './shared';

/** Colonnes triables du tableau des élèves. */
type OverKey = 'name' | 'flag' | 'games' | 'acc' | 'weak' | 'last';
type Row = Overview & { ins: T.Insight | null };

const FLAG_ORDER: Record<Flag, number> = { struggling: 0, inactive: 1, never: 2, steady: 3, rising: 4 };
const FLAG_TONE: Record<Flag, Tone> = { struggling: 'bad', inactive: 'warn', never: 'mute', steady: 'good', rising: 'good' };
const NOW = () => Date.now();

const gameLabel = (g: string) => (GAME_NAMES as Record<string, string>)[g] ?? g;

function rowFlag(r: Row, classActive: boolean) {
  return flagOf(r.ins ?? { last_played: r.last_played }, NOW(), gameLabel, classActive);
}

function overValue(r: Row, key: OverKey, classActive: boolean): SortValue {
  switch (key) {
    case 'name':
      return r.name;
    case 'flag':
      return FLAG_ORDER[rowFlag(r, classActive).flag];
    case 'games':
      return r.games;
    case 'acc':
      return focusGame(r.ins?.games)?.acc_recent ?? null;
    case 'weak':
      return r.ins?.weak?.err ?? null;
    case 'last':
      return r.last_played;
  }
}

// ───────────────────────── Une classe ─────────────────────────


export function ClassPanel({
  cls,
  schoolName,
  act,
  onDeleted,
  onStudentScreen,
}: {
  cls: ClassRow;
  schoolName: string;
  act: Act;
  onDeleted: () => void;
  onStudentScreen?: (id: string, name: string) => void;
}) {
  const [rawRows, setRows] = useState<Overview[] | null>(null);
  const [insights, setInsights] = useState<T.Insight[] | null>(null);
  const [classErr, setClassErr] = useState<T.ClassItem[] | null>(null);
  const [openStudent, setOpenStudent] = useState<{ id: string; name: string } | null>(null);
  const rows = useMemo<Row[] | null>(() => {
    if (!rawRows) return null;
    const byId = new Map((insights ?? []).map((i) => [i.id, i]));
    return rawRows.map((r) => ({ ...r, ins: byId.get(r.id) ?? null }));
  }, [rawRows, insights]);
  const { sort, toggle } = useSort<OverKey>('name', 'asc');
  const classActive = useMemo(() => classIsActive((rows ?? []).map((r) => r.last_played), NOW()), [rows]);
  const sortValue = useCallback((r: Row, k: OverKey) => overValue(r, k, classActive), [classActive]);
  const shown = useSorted<Row, OverKey>(rows, sort, sortValue);
  const [names, setNames] = useState('');
  const [fresh, setFresh] = useState<NewStudent[] | null>(null);
  /** Codes connus uniquement dans cette page (jamais conservés ailleurs) : le serveur ne garde que leur empreinte. */
  const [cards, setCards] = useState<Record<string, string>>({});
  const codeOf = (r: Row): string | null => cards[r.id] ?? r.access_code ?? null;
  const remember = (list: NewStudent[]) => setCards((c) => ({ ...c, ...Object.fromEntries(list.map((s) => [s.id, s.access_code])) }));
  const [msg, setMsg] = useState('');
  const [confirm, setConfirm] = useState<string | null>(null);
  /** une seule partie de la classe à la fois : la page reste courte */
  const [part, setPart] = useState<'results' | 'add' | 'session' | 'danger'>('results');
  const [boardHidden, setBoardHidden] = useState(cls.hide_board === true);

  const reload = useCallback(async () => {
    const [r, ins, ci] = await Promise.all([act(() => T.classOverview(cls.id)), act(() => T.classInsights(cls.id)), act(() => T.classItems(cls.id))]);
    if (ins !== undefined) setInsights(ins);
    if (ci !== undefined) setClassErr(ci);
    if (r) {
      setRows(r);
      if (r.length === 0) setPart('add');
    }
  }, [act, cls.id]);
  useEffect(() => {
    void reload();
  }, [reload]);

  const add = async (e: FormEvent) => {
    e.preventDefault();
    const list = names
      .split(/\r?\n/)
      .map((n) => n.trim())
      .filter(Boolean);
    if (list.length === 0) return;
    const created = await act(() => T.addStudents(cls.id, list));
    if (created) {
      setFresh(created);
      remember(created);
      setNames('');
      setMsg(`${created.length} élève${created.length > 1 ? 's' : ''} ajouté${created.length > 1 ? 's' : ''}.`);
      const r = await act(() => T.classOverview(cls.id));
      if (r) setRows(r);
    }
  };

  const exportRuns = async () => {
    const runs = await act(() => T.classRuns(cls.id));
    if (!runs) return;
    const GAME: Record<string, string> = GAME_NAMES;
    downloadText(
      `resultats-${cls.name.replace(/[^\w-]+/g, '_')}.csv`,
      toCsv(
        ['Date', 'Élève', 'Jeu', 'Mode', 'Type', 'Score', 'Vague / série', 'Mots/min', 'Précision %', 'Bonnes réponses', 'Durée (s)'],
        runs.map((r) => [
          fmtDate(new Date(r.played_at).getTime()),
          r.students?.name ?? '',
          GAME[r.game] ?? r.game,
          r.mode,
          r.kind === 'drill' ? 'Entraînement' : 'Partie',
          r.score,
          r.wave,
          r.wpm,
          r.acc,
          r.correct,
          r.duration,
        ]),
      ),
    );
    setMsg(
      `${runs.length} partie${runs.length > 1 ? 's' : ''} exportée${runs.length > 1 ? 's' : ''}${runs.length >= 5000 ? ' (les 5 000 plus récentes)' : ''}.`,
    );
  };

  const clearRuns = async () => {
    if (
      !window.confirm(
        `Effacer tous les résultats de la classe « ${cls.name} » ?\nLes élèves et leurs codes sont gardés. Pense à exporter d’abord : l’effacement est définitif.`,
      )
    )
      return;
    const ok = await act(async () => {
      await T.clearClassRuns(cls.id);
      return true;
    });
    if (ok) {
      setMsg('Résultats effacés. Les élèves gardent leur code.');
      await reload();
    }
  };

  const PARTS: Array<[typeof part, string]> = [
    ['results', 'Résultats'],
    ['add', 'Ajouter des élèves'],
    ['session', 'Séances'],
    ['danger', 'Supprimer'],
  ];

  if (openStudent)
    return (
      <StudentProfile
        id={openStudent.id}
        name={openStudent.name}
        act={act}
        onBack={() => setOpenStudent(null)}
        onScreen={onStudentScreen ? () => onStudentScreen(openStudent.id, openStudent.name) : undefined}
      />
    );

  const now = NOW();
  const weekAgo = now - 7 * 86_400_000;
  const active7 = (rows ?? []).filter((r) => r.last_played !== null && r.last_played >= weekAgo).length;
  const runs30 = (insights ?? []).reduce((n, i) => n + i.runs_30d, 0);
  const watchAll = (rows ?? [])
    .map((r) => ({ r, f: rowFlag(r, classActive) }))
    .filter((x) => x.f.flag === 'struggling' || x.f.flag === 'inactive')
    .sort((a, b) => FLAG_ORDER[a.f.flag] - FLAG_ORDER[b.f.flag]);
  const toWatch = watchAll.slice(0, 6);

  return (
    <>
      <div className="part-bar" role="tablist" aria-label={`Classe ${cls.name}`}>
        {PARTS.map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={part === k} className="part-tab" onClick={() => setPart(k)}>
            {label}
          </button>
        ))}
      </div>

      {msg && <Notice kind="ok">{msg}</Notice>}

      {part === 'results' && endOfYearReminder(new Date()) && (
        <div className="notice notice-info" role="status">
          <p>
            <strong>Fin d’année : exporte puis efface les résultats.</strong>
            <Tip label="Pourquoi ?">
              Les élèves gardent leur code et repartent de zéro. Sinon, le serveur efface lui-même les parties de plus de {RETENTION_MONTHS} mois.
            </Tip>
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" data-observe-ok className="btn btn-ghost" onClick={exportRuns}>
              Exporter (CSV)
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => void clearRuns()}>
              Effacer les résultats…
            </button>
          </div>
        </div>
      )}

      {part === 'results' && (
        <section className="sec sec-fill" aria-labelledby="res-h">
          <div className="sec-head">
            <h2 id="res-h" className="subhead">
              Élèves et résultats · {cls.name}
            </h2>
            <div className="flex flex-wrap gap-2">
              <button type="button" data-observe-ok className="btn btn-ghost" onClick={() => void reload()}>
                Actualiser
              </button>
              <button type="button" data-observe-ok className="btn btn-ghost" onClick={exportRuns}>
                Exporter (CSV)
              </button>
              <button type="button" className="btn btn-ghost" disabled={!(rows ?? []).some((r) => codeOf(r))} onClick={() => window.print()}>
                Imprimer les codes
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                disabled={!rows?.length}
                onClick={async () => {
                  if (confirm !== 'class-codes') {
                    setConfirm('class-codes');
                    setMsg('Cela change le code de TOUS les élèves de la classe : les anciennes fiches ne marcheront plus. Clique encore pour confirmer.');
                    return;
                  }
                  setConfirm(null);
                  const all = await act(() => T.resetClassCodes(cls.id));
                  if (all) {
                    remember(all);
                    setMsg('Nouveaux codes créés. Clique sur « Imprimer les codes » maintenant : ils ne seront plus affichés ensuite.');
                    await reload();
                  }
                }}
              >
                {confirm === 'class-codes' ? 'Confirmer : nouveaux codes' : 'Nouveaux codes pour la classe'}
              </button>
            </div>
          </div>
          {(cls.grade !== undefined || cls.hide_board !== undefined) && (
            <details className="fold fold-flat">
              <summary>Réglages de la classe</summary>
              <div className="fold-in">
                {cls.grade !== undefined && <GradeSetting cls={cls} act={act} />}
                {cls.hide_board !== undefined && (
                  <Check
                    on={boardHidden}
                    onClick={async () => {
                      const next = !boardHidden;
                      const ok = await act(async () => {
                        await T.setBoardHidden(cls.id, next);
                        return true;
                      });
                      if (ok) setBoardHidden(next);
                    }}
                  >
                    Masquer les classements aux élèves
                  </Check>
                )}
              </div>
            </details>
          )}
          {rows === null ? (
            <p className="text-[15px]">Chargement…</p>
          ) : rows.length === 0 ? (
            <p className="text-[15px] leading-snug">
              Aucun élève pour l’instant.{' '}
              <button type="button" className="link" onClick={() => setPart('add')}>
                Ajouter des élèves
              </button>
            </p>
          ) : (
            <>
              <div className="u-grid-stats">
                <Stat label="Élèves" value={rows.length} />
                <Stat label="Actifs cette semaine" value={`${active7} / ${rows.length}`} />
                <Stat label="Parties en 30 jours" value={insights ? runs30 : '—'} />
                <Stat label="À suivre" value={insights ? watchAll.length : '—'} hint="Élèves avec une réussite basse à un jeu, ou sans partie depuis 2 semaines." />
              </div>
              {insights === null && (
                <p className="u-info">Fiches élèves indisponibles : mise à jour du serveur à faire.</p>
              )}
              {toWatch.length > 0 && (
                <Card title="À suivre" note="Élèves qui ont peut-être besoin d’un coup de pouce : réussite basse en ce moment, ou pas de partie depuis 2 semaines.">
                  <ul className="u-watch">
                    {toWatch.map(({ r, f }) => (
                      <li key={r.id}>
                        <button type="button" data-observe-ok className="u-name" onClick={() => setOpenStudent({ id: r.id, name: r.name })}>
                          {r.name}
                        </button>
                        <Pill tone={FLAG_TONE[f.flag]}>{f.label}</Pill>
                      </li>
                    ))}
                  </ul>
                </Card>
              )}
              {classErr && (
                <WeakPoints
                  rows={classErr}
                  title="Ce que la classe rate le plus"
                  note="Familles de calculs, règles et mots ratés au moins une fois sur quatre, par au moins 2 élèves. Les mauvaises réponses les plus choisies aident à repérer la confusion à travailler."
                />
              )}
              <p className="text-[15px]">
                Clique sur un prénom pour ouvrir sa fiche.
                <Tip label="Lire le tableau">« Réussite » : le jeu où l’élève réussit le moins en ce moment (moyenne de ses 5 dernières parties à ce jeu, 3 au minimum ; Frappe ! n’est pas compté, sa précision de frappe n’est pas une réussite). Flèche : hausse ou baisse par rapport aux 5 parties d’avant. L’export CSV contient tout.</Tip>
              </p>
              <div className="tbl-wrap">
                <table className="scores tbl">
                  <caption className="sr-only">Élèves de la classe : repère, parties, réussite récente, point à revoir, dernière partie. Cliquez sur un prénom pour ouvrir sa fiche.</caption>
                  <thead>
                    <tr>
                      <SortTh col="name" sort={sort} onSort={toggle}>
                        Élève
                      </SortTh>
                      <SortTh col="flag" sort={sort} onSort={toggle}>
                        Repère
                      </SortTh>
                      <SortTh col="games" sort={sort} onSort={toggle} numeric className="num c-mid">
                        Parties
                      </SortTh>
                      <SortTh col="acc" sort={sort} onSort={toggle} numeric className="num c-sm">
                        Réussite
                      </SortTh>
                      <SortTh col="weak" sort={sort} onSort={toggle} className="c-mid">
                        À revoir
                      </SortTh>
                      <SortTh col="last" sort={sort} onSort={toggle} numeric className="c-lo">
                        Dernière<span className="sr-only"> partie</span>
                      </SortTh>
                      <th scope="col" className="c-lo">
                        Code
                      </th>
                      <th scope="col">
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {(shown ?? []).map((r) => {
                      const f = rowFlag(r, classActive);
                      const focus = focusGame(r.ins?.games);
                      const trend = deltaOf(focus);
                      return (
                        <tr key={r.id}>
                          <td>
                            <button type="button" data-observe-ok className="u-name" onClick={() => setOpenStudent({ id: r.id, name: r.name })}>
                              {r.name}
                            </button>
                          </td>
                          <td>
                            <Pill tone={FLAG_TONE[f.flag]}>{f.label}</Pill>
                          </td>
                          <td className="num c-mid">{r.games}</td>
                          <td className="num c-sm">
                            {focus && focus.acc_recent !== null ? `${Math.round(focus.acc_recent)} %` : '–'}
                            {trend !== null && Math.abs(trend) >= 5 && (
                              <span className={trend > 0 ? 'u-up' : 'u-down'} aria-label={trend > 0 ? 'en hausse' : 'en baisse'}>
                                {trend > 0 ? ' ↑' : ' ↓'}
                              </span>
                            )}
                            {focus && <span className="u-cell-sub">{gameLabel(focus.game)}</span>}
                          </td>
                          <td className="c-mid">{r.ins?.weak ? `${r.ins.weak.label} (${r.ins.weak.err} %)` : '–'}</td>
                          <td className="c-lo">{r.last_played ? fmtDate(r.last_played) : '–'}</td>
                          <td className="mono c-lo">{codeOf(r) ? nice(codeOf(r) as string) : <span className="text-ink/60">Masqué</span>}</td>
                          <td className="row-actions">
                            <button
                              type="button"
                              className="link"
                              onClick={async () => {
                                const code = await act(() => T.resetCode(r.id));
                                if (code) {
                                  remember([{ id: r.id, name: r.name, access_code: String(code) }]);
                                  setMsg(`Nouveau code de ${r.name} : ${nice(String(code))} (l’ancien ne fonctionne plus). Note-le : il ne sera plus affiché.`);
                                  await reload();
                                }
                              }}
                            >
                              <span aria-hidden="true">Nouveau code</span>
                              <span className="sr-only">Nouveau code pour {r.name}</span>
                            </button>
                            <button
                              type="button"
                              className="link"
                              onClick={async () => {
                                if (confirm !== r.id) {
                                  setConfirm(r.id);
                                  return;
                                }
                                setConfirm(null);
                                const ok = await act(async () => {
                                  await T.deleteStudent(r.id);
                                  return true;
                                });
                                if (ok) {
                                  setMsg(`${r.name} et ses scores ont été supprimés.`);
                                  await reload();
                                }
                              }}
                              onBlur={() => setConfirm(null)}
                            >
                              <span aria-hidden="true">{confirm === r.id ? 'Confirmer' : 'Retirer'}</span>
                              <span className="sr-only">{confirm === r.id ? `Confirmer la suppression de ${r.name}` : `Supprimer ${r.name}`}</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      )}

      {part === 'add' && (
        <section className="sec" aria-labelledby="add-h">
          <h2 id="add-h" className="subhead mb-2">
            Ajouter des élèves
          </h2>
          <form onSubmit={add} className="form">
            <label className="text-[15px]" htmlFor="add-names">
              Un prénom par ligne
              <Tip label="Conseils">Prénom ou pseudo, jamais de nom complet. Tu peux coller une liste. Chaque élève reçoit un code.</Tip>
            </label>
            <textarea
              id="add-names"
              className="field names-area"
              rows={5}
              value={names}
              placeholder={'Léa\nHugo\nInès M.'}
              onChange={(e) => setNames(e.target.value)}
            />
            <div>
              <button type="submit" className="btn btn-primary" disabled={!names.trim()}>
                Ajouter à {cls.name}
              </button>
            </div>
          </form>
          {fresh && (
            <div className="mt-3">
              <h3 className="subhead mb-1">Codes créés</h3>
              <ul className="code-list">
                {fresh.map((s) => (
                  <li key={s.id}>
                    <span>{s.name}</span>
                    <span className="mono">{nice(s.access_code)}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-[15px]">
                <strong>Imprime-les maintenant :</strong> ils ne s’afficheront plus.
              </p>
              <p className="mt-1">
                <button type="button" className="btn btn-ghost" onClick={() => window.print()}>
                  Imprimer les codes
                </button>
              </p>
            </div>
          )}
        </section>
      )}

      {part === 'session' && <SessionsPanel cls={cls} act={act} />}

      {part === 'danger' && (
        <section className="sec danger-sec" aria-labelledby="clr-h">
          <h2 id="clr-h" className="subhead">
            Effacer les résultats de {cls.name}
          </h2>
          <p className="mt-2 text-[15px] leading-snug">
            Efface les scores ; garde les élèves et leurs codes. Exporte d’abord.
            <Tip label="Bon à savoir">Idéal pour repartir de zéro à la rentrée. Les parties de plus de {RETENTION_MONTHS} mois sont de toute façon effacées par le serveur.</Tip>
          </p>
          <button type="button" className="btn btn-ghost mt-2" onClick={() => void clearRuns()}>
            Effacer les résultats
          </button>
        </section>
      )}

      {part === 'danger' && (
        <section className="sec danger-sec" aria-labelledby="del-h">
          <h2 id="del-h" className="subhead">
            Supprimer la classe {cls.name}
          </h2>
          <p className="mt-2 text-[14px] leading-snug">Efface la classe, ses élèves et tous leurs scores. Cette action est définitive.</p>
          <button
            type="button"
            className="btn btn-ghost mt-2"
            onClick={async () => {
              if (!window.confirm(`Supprimer définitivement la classe « ${cls.name} » et tous ses élèves ?`)) return;
              const ok = await act(async () => {
                await T.deleteClass(cls.id);
                return true;
              });
              if (ok) onDeleted();
            }}
          >
            Supprimer {cls.name}
          </button>
        </section>
      )}

      {/* Fiche imprimable : visible uniquement à l'impression */}
      <section className="print-only" aria-hidden="true">
        <h2>
          {schoolName} — {cls.name}
        </h2>
        <p>Pour jouer : ouvre le site, choisis « Je suis élève » et tape ton code.</p>
        <div className="print-cards">
          {(rows ?? [])
            .filter((r) => codeOf(r))
            .map((r) => (
              <div key={r.id} className="print-card">
                <strong>{r.name}</strong>
                <span className="mono">{nice(codeOf(r) as string)}</span>
              </div>
            ))}
        </div>
      </section>
    </>
  );
}
