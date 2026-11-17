import { useMemo, useState } from 'react';
import { TARGET, TOLERANCE, diffName, gameName, itemsCsv, levelName, levelsCsv, mergeRows, picksText, rank, summaryText, verdictOf } from '../game/balanceView';
import { downloadText } from '../game/history';
import { SortTh, sortRows, useSort } from '../components/SortTable';
import type { SortValue } from '../components/SortTable';
import type { AdminItems, BalanceLevel } from '../server/admin';

const ORDER = ['cp', 'ce1', 'ce2', 'cm1', 'cm2'];
const GAMES = ['math', 'spelling'];
const num = (n: number | null | undefined, unit = '') => (n === null || n === undefined ? '—' : `${String(n).replace('.', ',')}${unit}`);
const today = () => new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
const stamp = () => new Date().toISOString().slice(0, 10);

/** Onglet « Équilibrage » : où les élèves réussissent trop ou pas assez, et ce qui les fait échouer. */
export default function AdminBalance({ levels, stats }: { levels: BalanceLevel[]; stats: AdminItems }) {
  const [game, setGame] = useState('math');
  const [level, setLevel] = useState('all');
  const [diff, setDiff] = useState('all');
  const [copied, setCopied] = useState('');

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
    const text = summaryText(levels, stats.rules, stats.items, today());
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
      <h2 className="subhead mt-3">Réussite par niveau</h2>
      <p className="adm-note">
        Objectif : Apprenti ≈ {TARGET.apprenti} %, Standard ≈ {TARGET.standard} %, Expert ≈ {TARGET.expert} % de manches réussies du premier coup (± {TOLERANCE} points), sans que les parties soient toujours gagnées ni toujours perdues.
        Les moyennes ne sont jugées qu’à partir de 150 manches. Seules les parties libres jouées avec un compte élève sont comptées (ni séances, ni entraînements, ni réglages personnalisés).
      </p>
      <p className="adm-note adm-actions">
        <button type="button" className="link" onClick={() => downloadText(`reussite-par-niveau-${stamp()}.csv`, levelsCsv(levels))} disabled={levels.length === 0}>
          Exporter en CSV
        </button>
        <button type="button" className="link" onClick={() => void copy()} disabled={levels.length === 0 && stats.items.length === 0}>
          Copier le bilan complet (texte)
        </button>
        <span className="adm-copied" role="status" aria-live="polite">
          {copied}
        </span>
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
                const rated = TARGET[l.difficulty] !== undefined && GAMES.includes(l.game);
                return (
                  <tr key={`${l.game}-${l.level}-${l.difficulty}-${l.version}`}>
                    <td className="adm-game">{gameName(l.game)}</td>
                    <td className="adm-nowrap">
                      {l.level === '-' ? diffName(l.difficulty) : `${levelName(l.level)} · ${diffName(l.difficulty)}`}
                    </td>
                    <td className="adm-nowrap">
                      {l.runs} · {l.ok + l.err}
                    </td>
                    <td className="adm-nowrap">
                      <strong>{num(l.success_pct, ' %')}</strong>
                      {rated && <span className="adm-gap adm-block">objectif {TARGET[l.difficulty]} %</span>}
                    </td>
                    <td>
                      <span className={`adm-verdict v-${v.verdict}`}>{v.label}</span>
                      {v.detail && <span className="adm-gap adm-block">{v.detail}</span>}
                    </td>
                    <td>
                      {num(l.finished_pct, ' %')}
                      {v.note && <span className="adm-gap adm-block">{v.note}</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <h2 className="subhead mt-4">Ce qui fait échouer</h2>
      <div className="adm-filters">
        <label>
          Jeu
          <select className="field" value={game} onChange={(e) => { setGame(e.target.value); setLevel('all'); }}>
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
            <option value="apprenti">Apprenti</option>
            <option value="standard">Standard</option>
            <option value="expert">Expert</option>
          </select>
        </label>
      </div>
      <p className="adm-note adm-actions">
        <button type="button" className="link" onClick={() => downloadText(`exercices-rates-${stamp()}.csv`, itemsCsv(stats.rules, stats.items))} disabled={stats.rules.length + stats.items.length === 0}>
          Exporter tous les exercices en CSV
        </button>
        <span>Les exercices posés moins de 5 fois sont masqués ici (trop peu fiables).</span>
      </p>

      {families.length === 0 && items.length === 0 ? (
        <p className="adm-note">
          Pas encore de données pour ce choix. Les compteurs se remplissent quand des élèves connectés jouent des parties libres ; si rien n’apparaît après des parties, vérifiez que la mise à jour SQL « exercices » a bien été exécutée (voir le guide du serveur).
        </p>
      ) : (
        <>
          <h3 className="font-bold mt-2">{game === 'math' ? 'Familles de calculs' : 'Règles d’orthographe'}</h3>
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

          <h3 className="font-bold mt-3">{game === 'math' ? 'Calculs les plus ratés' : 'Phrases les plus ratées'}</h3>
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
  );
}

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

/** Pourcentage d'erreurs : le chiffre est toujours écrit, la barre n'est qu'un repère. */
function Meter({ pct }: { pct: number | null }) {
  const v = pct ?? 0;
  return (
    <span className="adm-meter">
      <span className="adm-meter-bar" aria-hidden="true">
        <i style={{ width: `${Math.min(100, Math.max(0, v))}%` }} />
      </span>
      <strong>{num(pct, ' %')}</strong>
    </span>
  );
}
