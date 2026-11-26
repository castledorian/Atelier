import { useMemo, useState } from 'react';
import { FACTEUR_TARGET, NO_END, TARGET, TOLERANCE, diffName, gameName, itemsCsv, levelName, levelsCsv, mergeRows, picksText, rank, summaryText, targetOf, verdictOf } from '../game/balanceView';
import { adviceOf, asLevels, statsText } from '../game/statsView';
import { downloadText } from '../game/history';
import { SortTh, sortRows, useSort } from '../components/SortTable';
import type { SortValue } from '../components/SortTable';
import type { AdminItems, BalanceLevel, ClassStat, GameStats, GradeStat, ItemSpreadRow } from '../server/admin';
import { adviceText, exerciseAdvice } from '../game/exerciseAdvice';
import { Tip } from '../components/Tip';
import { Activity, ByGrade, Kpis } from './admin/GameDetail';
import { ExercisePanel } from './admin/ExercisePanel';
import { Meter, ORDER, num, stamp } from './admin/shared';

const GAMES = ['math', 'spelling', 'facteur'];
const PERIODS: [number, string][] = [
  [30, '30 jours'],
  [90, '3 mois'],
  [365, '1 an'],
];
const PRIO: Record<number, string> = { 1: 'À régler', 2: 'À surveiller', 3: 'Pour info' };
const today = () => new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });

/** Onglet « Équilibrage » : où les élèves réussissent trop ou pas assez, et ce qui les fait échouer. */
export default function AdminBalance({ levels: allTime, stats, detail, spread = null, days, onDays }: { levels: BalanceLevel[]; stats: AdminItems; detail: GameStats | null; spread?: ItemSpreadRow[] | null; days: number; onDays: (d: number) => void }) {
  const levels = useMemo(() => (detail ? asLevels(detail.balance) : allTime), [detail, allTime]);
  const advice = useMemo(() => (detail ? adviceOf(detail) : []), [detail]);
  const [game, setGame] = useState('math');
  const [level, setLevel] = useState('all');
  const [diff, setDiff] = useState('all');
  const [copied, setCopied] = useState('');
  const [tab, setTab] = useState<Tab>('conseils');

  const levelsSeen = useMemo(() => {
    const seen = new Set<string>();
    for (const r of [...stats.rules, ...stats.items]) if (r.game === game) seen.add(r.level);
    return ORDER.filter((l) => seen.has(l));
  }, [stats, game]);
  const families = useMemo(() => rank(mergeRows(stats.rules, { game, level, difficulty: diff }), 1).slice(0, 12), [stats.rules, game, level, diff]);
  const items = useMemo(() => rank(mergeRows(stats.items, { game, level, difficulty: diff }), 5).slice(0, 30), [stats.items, game, level, diff]);

  const lv = useSort<LvKey>('place', 'asc');
  const sorted = useMemo(() => sortRows(levels, lv.sort, lvValue), [levels, lv.sort]);
  const fam = useSort<ItemKey>('err', 'desc');
  const it = useSort<ItemKey>('err', 'desc');
  const famRows = useMemo(() => sortRows(families, fam.sort, itemValue), [families, fam.sort]);
  const itemRows = useMemo(() => sortRows(items, it.sort, itemValue), [items, it.sort]);

  const copy = async () => {
    const text = (detail ? statsText(detail, stats, today()) : summaryText(levels, stats.rules, stats.items, today())) + '\n' + adviceText(exerciseAdvice(stats.rules, stats.items, spread));
    try {
      await navigator.clipboard.writeText(text);
      setCopied('Résumé copié : collez-le dans la conversation.');
    } catch {
      downloadText(`bilan-equilibrage-${stamp()}.txt`, text, 'text/plain;charset=utf-8');
      setCopied('Copie impossible ici : le résumé a été téléchargé.');
    }
  };

  return (
    <>
      <div className="adm-filters mt-3">
        <span className="adm-note">Période</span>
        <div className="seg" role="radiogroup" aria-label="Période étudiée">
          {PERIODS.map(([d, label]) => (
            <button key={d} type="button" role="radio" aria-checked={days === d} className="seg-b" onClick={() => onDays(d)} disabled={!detail && d !== days}>
              {label}
            </button>
          ))}
        </div>
      </div>
      {!detail && (
        <p className="adm-note">
          Statistiques détaillées indisponibles : lancez <code>serveur/mise-a-jour-stats.sql</code> dans Supabase. En attendant, voici la réussite depuis le début.
        </p>
      )}
      <p className="adm-note adm-actions">
        <button type="button" className="link" onClick={() => void copy()} disabled={levels.length === 0 && stats.items.length === 0}>
          Copier le bilan complet (texte)
        </button>
        <Tip label="À quoi sert ce bilan ?">Tout le contenu des quatre onglets, en texte, à coller dans une conversation pour décider des réglages.</Tip>
        <span className="adm-copied" role="status" aria-live="polite">
          {copied}
        </span>
      </p>
      {detail && <Kpis g={detail} />}

      <div className="part-bar mt-4" role="tablist" aria-label="Équilibrage">
        {TABS.map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className="part-tab" onClick={() => setTab(k)}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'conseils' && (
        <>
      {detail && (
        <>
          <h2 className="subhead mt-3">
            À régler : jeux et niveaux
            <Tip label="Ce que couvre cette liste">Réussite de chaque jeu, niveau et difficulté, parties perdues tout de suite, jeux délaissés, anti-triche. Les familles de calculs, règles et mots sont jugées juste en dessous.</Tip>
          </h2>
          {advice.length === 0 ? (
            <p className="adm-note">Rien de net pour l’instant : pas assez de parties, ou tout est bien réglé.</p>
          ) : (
            <ol className="adm-advice">
              {advice.map((a, k) => (
                <li key={k} data-p={a.priority}>
                  <span className={`adm-verdict v-${a.priority === 1 ? 'hard' : a.priority === 2 ? 'few' : 'none'}`}>{PRIO[a.priority]}</span>
                  <strong>{a.topic}</strong>
                  <span>{a.fact}</span>
                  <span className="adm-gap">{a.hint}</span>
                </li>
              ))}
            </ol>
          )}
        </>
      )}

      <ExercisePanel rules={stats.rules} items={stats.items} spread={spread} />
        </>
      )}

      {tab === 'reussite' && (
        <>

      <h2 className="subhead mt-3">
        Réussite par niveau
        <Tip label="Objectifs">
          Apprenti ≈ {TARGET.apprenti} %, Standard ≈ {TARGET.standard} %, Expert ≈ {TARGET.expert} % de manches réussies du premier coup (± {TOLERANCE} points) ; Le facteur ≈ {FACTEUR_TARGET} %. Jugé à partir de 150 manches, parties libres seulement.
        </Tip>
      </h2>
      <p className="adm-note adm-actions">
        <button type="button" className="link" onClick={() => downloadText(`reussite-par-niveau-${stamp()}.csv`, levelsCsv(levels))} disabled={levels.length === 0}>
          Exporter en CSV
        </button>
      </p>
      {sorted.length === 0 ? (
        <p className="adm-note">Aucune partie enregistrée pour l’instant.</p>
      ) : (
        <div className="adm-wrap">
          <table className="adm-table">
            <caption className="sr-only">Réussite par jeu, niveau et difficulté</caption>
            <thead>
              <tr>
                <SortTh col="place" sort={lv.sort} onSort={lv.toggle}>
                  Jeu
                </SortTh>
                <SortTh col="level" sort={lv.sort} onSort={lv.toggle}>
                  Niveau
                </SortTh>
                <SortTh col="runs" sort={lv.sort} onSort={lv.toggle} numeric>
                  Parties · manches
                </SortTh>
                <SortTh col="success" sort={lv.sort} onSort={lv.toggle} numeric>
                  Réussite
                </SortTh>
                <SortTh col="gap" sort={lv.sort} onSort={lv.toggle} numeric>
                  Verdict
                </SortTh>
                <SortTh col="finished" sort={lv.sort} onSort={lv.toggle} numeric>
                  Gagnées
                </SortTh>
              </tr>
            </thead>
            <tbody>
              {sorted.map((l) => {
                const v = verdictOf(l);
                const target = targetOf(l.game, l.difficulty);
                return (
                  <tr key={`${l.game}-${l.level}-${l.difficulty}-${l.version}`}>
                    <td className="adm-game">{gameName(l.game)}</td>
                    <td className="adm-nowrap">
                      {l.level === '-' || /^(cp|ce1|ce2|cm1|cm2)(-|$)/.test(l.difficulty) ? diffName(l.difficulty) : `${levelName(l.level)} · ${diffName(l.difficulty)}`}
                    </td>
                    <td className="adm-nowrap">
                      {l.runs} · {l.ok + l.err}
                    </td>
                    <td className="adm-nowrap">
                      <strong>{num(l.success_pct, ' %')}</strong>
                      {target !== undefined && <span className="adm-gap adm-block">objectif {target} %</span>}
                    </td>
                    <td>
                      <span className={`adm-verdict v-${v.verdict}`}>{v.label}</span>
                      {v.detail && <span className="adm-gap adm-block">{v.detail}</span>}
                    </td>
                    <td>
                      {NO_END.includes(l.game) ? '—' : num(l.finished_pct, ' %')}
                      {v.note && <span className="adm-gap adm-block">{v.note}</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {detail && <ByGrade g={detail} />}
        </>
      )}

      {tab === 'erreurs' && (
        <>

      <h2 className="subhead mt-3">Ce qui fait échouer</h2>
      <div className="adm-filters">
        <label>
          Jeu
          <select className="field" value={game} onChange={(e) => { setGame(e.target.value); setLevel('all'); setDiff('all'); }}>
            {GAMES.map((g) => (
              <option key={g} value={g}>
                {gameName(g)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Niveau
          <select className="field" value={level} onChange={(e) => setLevel(e.target.value)}>
            <option value="all">Tous</option>
            {levelsSeen.map((l) => (
              <option key={l} value={l}>
                {levelName(l)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Difficulté
          <select className="field" value={diff} onChange={(e) => setDiff(e.target.value)}>
            <option value="all">Toutes</option>
            {(game === 'facteur' ? ['n1', 'n2', 'n3', 'n4'] : ['apprenti', 'standard', 'expert']).map((d) => (
              <option key={d} value={d}>
                {diffName(d)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="adm-note adm-actions">
        <button type="button" className="link" onClick={() => downloadText(`exercices-rates-${stamp()}.csv`, itemsCsv(stats.rules, stats.items))} disabled={stats.rules.length + stats.items.length === 0}>
          Exporter tous les exercices en CSV
        </button>
        <Tip label="Exercices masqués">Les exercices posés moins de 5 fois sont masqués ici (trop peu fiables). Le CSV les contient tous.</Tip>
      </p>

      {families.length === 0 && items.length === 0 ? (
        <p className="adm-note">
          Pas encore de données.
          <Tip label="D’où viennent les données ?">Des parties libres d’élèves connectés. Si rien n’apparaît, vérifiez la mise à jour SQL « exercices ».</Tip>
        </p>
      ) : (
        <>
          <h3 className="font-bold mt-2">{game === 'math' ? 'Familles de calculs' : game === 'facteur' ? 'Mots par niveau' : 'Règles d’orthographe'}</h3>
          <div className="adm-wrap">
            <table className="adm-table">
              <caption className="sr-only">Familles les plus ratées</caption>
              <thead>
                <tr>
                  <SortTh col="label" sort={fam.sort} onSort={fam.toggle}>
                    Famille
                  </SortTh>
                  <SortTh col="shown" sort={fam.sort} onSort={fam.toggle} numeric>
                    Posé
                  </SortTh>
                  <SortTh col="err" sort={fam.sort} onSort={fam.toggle} numeric>
                    Erreurs
                  </SortTh>
                  <th scope="col">Mauvaises réponses fréquentes</th>
                </tr>
              </thead>
              <tbody>
                {famRows.map((r) => (
                  <tr key={r.item}>
                    <td>{r.label}</td>
                    <td>{r.shown}</td>
                    <td>
                      <Meter pct={r.err_pct} />
                    </td>
                    <td>{picksText(r.picks) || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h3 className="font-bold mt-3">{game === 'math' ? 'Calculs les plus ratés' : game === 'facteur' ? 'Mots les plus ratés' : 'Phrases les plus ratées'}</h3>
          {items.length === 0 ? (
            <p className="adm-note">Aucun exercice posé au moins 5 fois pour l’instant.</p>
          ) : (
            <div className="adm-wrap">
              <table className="adm-table">
                <caption className="sr-only">Exercices les plus ratés</caption>
                <thead>
                  <tr>
                    <SortTh col="label" sort={it.sort} onSort={it.toggle}>
                      Exercice
                    </SortTh>
                    <SortTh col="level" sort={it.sort} onSort={it.toggle}>
                      Niveau
                    </SortTh>
                    <SortTh col="shown" sort={it.sort} onSort={it.toggle} numeric>
                      Posé
                    </SortTh>
                    <SortTh col="err" sort={it.sort} onSort={it.toggle} numeric>
                      Erreurs
                    </SortTh>
                    <th scope="col">Mauvaises réponses choisies</th>
                  </tr>
                </thead>
                <tbody>
                  {itemRows.map((r) => (
                    <tr key={`${r.level}-${r.item}`}>
                      <td>{r.label}</td>
                      <td>{levelName(r.level)}</td>
                      <td>{r.shown}</td>
                      <td>
                        <Meter pct={r.err_pct} />
                      </td>
                      <td>{picksText(r.picks) || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
        </>
      )}

      {tab === 'activite' && (detail ? <Activity g={detail} /> : <p className="adm-note mt-3">Activité indisponible : lancez <code>serveur/mise-a-jour-stats.sql</code> dans Supabase.</p>)}
    </>
  );
}

/** Onglets de la page : ce qu'il faut régler d'abord, puis les chiffres qui l'expliquent. */
type Tab = 'conseils' | 'reussite' | 'erreurs' | 'activite';
const TABS: Array<[Tab, string]> = [
  ['conseils', 'À régler'],
  ['reussite', 'Réussite'],
  ['erreurs', 'Erreurs'],
  ['activite', 'Activité'],
];

/** Colonnes triables du tableau « Réussite par niveau ». */
type LvKey = 'place' | 'level' | 'runs' | 'success' | 'gap' | 'finished';

function lvValue(l: BalanceLevel, key: LvKey): SortValue {
  switch (key) {
    case 'place':
      // ordre d'origine : par jeu, puis par niveau de classe, puis par difficulté
      return `${gameName(l.game)} ${String(Math.max(0, ORDER.indexOf(l.level))).padStart(2, '0')} ${l.difficulty} ${l.version}`;
    case 'level':
      return `${String(Math.max(0, ORDER.indexOf(l.level))).padStart(2, '0')} ${l.difficulty}`;
    case 'runs':
      return l.runs;
    case 'success':
      return l.success_pct;
    case 'gap':
      // du plus mal réglé au mieux réglé : on trie sur l'écart à l'objectif
      return verdictOf(l).gap ?? null;
    case 'finished':
      return l.finished_pct;
  }
}

/** Colonnes triables des tableaux d'exercices. */
type ItemKey = 'label' | 'level' | 'shown' | 'err';

function itemValue(r: { label: string; level: string; shown: number; err_pct: number | null }, key: ItemKey): SortValue {
  switch (key) {
    case 'label':
      return r.label;
    case 'level':
      return String(Math.max(0, ORDER.indexOf(r.level))).padStart(2, '0');
    case 'shown':
      return r.shown;
    case 'err':
      return r.err_pct;
  }
}
