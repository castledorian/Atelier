import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';

/**
 * Tri des tableaux, le même partout : on clique (ou on tape Entrée) sur un titre de colonne.
 * Premier clic : du meilleur au moins bon pour les chiffres, de A à Z pour les mots. Deuxième clic : l'inverse.
 * Volontairement discret : une seule petite flèche, sur la colonne triée ; rien d'autre ne change dans le tableau.
 */

export type SortDir = 'asc' | 'desc';
export interface Sort<K extends string> {
  key: K;
  dir: SortDir;
}

export type SortValue = string | number | null | undefined;

export function useSort<K extends string>(key: K, dir: SortDir = 'asc') {
  const [sort, setSort] = useState<Sort<K>>({ key, dir });
  /** Change de colonne (dans son sens par défaut) ou inverse le sens de la colonne déjà triée. */
  const toggle = (k: K, def: SortDir = 'desc') => setSort((s) => (s.key === k ? { key: k, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key: k, dir: def }));
  return { sort, toggle, setSort };
}

/** Compare deux valeurs ; les cases vides (« – ») restent toujours en bas, dans les deux sens. */
export function compare(a: SortValue, b: SortValue, dir: SortDir): number {
  const empty = (v: SortValue) => v === null || v === undefined || v === '';
  if (empty(a) && empty(b)) return 0;
  if (empty(a)) return 1;
  if (empty(b)) return -1;
  const sign = dir === 'asc' ? 1 : -1;
  if (typeof a === 'number' && typeof b === 'number') return (a - b) * sign;
  return String(a).localeCompare(String(b), 'fr', { numeric: true, sensitivity: 'base' }) * sign;
}

/** Trie une copie de la liste ; `get` donne la valeur de la colonne triée pour une ligne. */
export function sortRows<T, K extends string>(rows: readonly T[], sort: Sort<K>, get: (row: T, key: K) => SortValue): T[] {
  return [...rows].sort((a, b) => compare(get(a, sort.key), get(b, sort.key), sort.dir));
}

/** Même chose, mémorisée : à utiliser dans un composant. */
export function useSorted<T, K extends string>(rows: readonly T[] | null, sort: Sort<K>, get: (row: T, key: K) => SortValue): T[] | null {
  return useMemo(() => (rows ? sortRows(rows, sort, get) : null), [rows, sort, get]);
}

interface ThProps<K extends string> {
  children: ReactNode;
  /** colonne triée par ce titre */
  col: K;
  sort: Sort<K>;
  onSort: (k: K, def?: SortDir) => void;
  /** colonne de chiffres : le premier clic classe du plus grand au plus petit */
  numeric?: boolean;
  className?: string;
}

/** Titre de colonne triable. */
export function SortTh<K extends string>({ children, col, sort, onSort, numeric = false, className }: ThProps<K>) {
  const active = sort.key === col;
  const dir = active ? sort.dir : null;
  const next = active ? (sort.dir === 'asc' ? 'décroissant' : 'croissant') : numeric ? 'décroissant' : 'croissant';
  return (
    <th scope="col" className={className} aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button type="button" className="th-sort" onClick={() => onSort(col, numeric ? 'desc' : 'asc')} title={`Trier : ordre ${next}`}>
        <span>{children}</span>
        <span className="th-arrow" aria-hidden="true">
          {dir === 'asc' ? '↑' : dir === 'desc' ? '↓' : ''}
        </span>
      </button>
    </th>
  );
}
