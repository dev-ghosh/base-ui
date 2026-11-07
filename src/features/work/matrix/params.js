/* params.js — the Matrix's filter state as URL search params.
 *
 * Replaces the `#mx?` hash contract of rie-dashboard2/js/matrix.js (writeHash / readHash,
 * spec 7.13): the short keys are exactly the old ones, now on `/work/matrix?...`.
 *
 *   s   statuses, `|`-separated (absent = the Live preset)
 *   o   owner         p   priority        q   search text
 *   od  `1` = overdue only                rv  `1` = needs review
 *   c f company and function of the drill overlay ("" = all)
 *   k   drill kind: cell | untagged | review (absent = cell; written for the All x All drill)
 *   t   drill tab: board | list | pivot (default board)
 *   pv  pivot axis, only with t=pivot (default assignedTo)
 *
 * Unknown or stale values are ignored, never an error (the old readHash comment).
 * Pure and Node-importable. The Work scope (`scope`) is another param of the same URL and
 * is not touched here; mergeMatrixParams keeps every key it does not own.
 */
import { STATUSES, LIVE_PRESET, PIVOT_AXES, DRILL_KINDS, DRILL_TABS, sameSet } from './model.js';

export const MATRIX_KEYS = ['s', 'o', 'p', 'q', 'od', 'rv', 'c', 'f', 'k', 't', 'pv'];
export const DEFAULT_TAB = 'board';
export const DEFAULT_PIVOT = 'assignedTo';

/** The filters when the URL says nothing. */
export function defaultFilters() {
  return {
    statuses: [...LIVE_PRESET],
    owner: '',
    priority: '',
    q: '',
    overdueOnly: false,
    reviewOnly: false,
    drill: null,                 // null | { company, func, kind }; '' company / func = all
    tab: DEFAULT_TAB,
    pivot: DEFAULT_PIVOT,
  };
}

const toParams = (search) => {
  if (search == null) return new URLSearchParams();
  if (typeof search === 'string') return new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  return new URLSearchParams(search.toString());   // URLSearchParams / ReadonlyURLSearchParams
};

/** `?s=Pending|Completed&o=...` (or a URLSearchParams) -> filters. */
export function parseMatrixParams(search) {
  const p = toParams(search);
  const f = defaultFilters();

  const s = p.get('s');
  if (s) {
    const picked = [...new Set(s.split('|').filter((v) => STATUSES.includes(v)))];
    if (picked.length) f.statuses = picked;
  }
  f.owner = p.get('o') || '';
  f.priority = p.get('p') || '';
  f.q = p.get('q') || '';
  f.overdueOnly = p.get('od') === '1';
  f.reviewOnly = p.get('rv') === '1';

  const c = p.get('c') || '';
  const fn = p.get('f') || '';
  const k = DRILL_KINDS.includes(p.get('k')) ? p.get('k') : '';
  if (c || fn || k) {
    f.drill = { company: c, func: fn, kind: k || 'cell' };
    const t = p.get('t');
    if (DRILL_TABS.includes(t)) f.tab = t;
    const pv = p.get('pv');
    if (PIVOT_AXES.some((a) => a.key === pv)) f.pivot = pv;
  }
  return f;
}

/** filters -> the query string (no leading `?`), only what differs from the defaults. */
export function serializeMatrixParams(filters) {
  const p = new URLSearchParams();
  const statuses = (filters.statuses || []).filter((v) => STATUSES.includes(v));
  if (statuses.length && !sameSet(statuses, LIVE_PRESET)) p.set('s', [...new Set(statuses)].join('|'));
  if (filters.owner)       p.set('o', filters.owner);
  if (filters.priority)    p.set('p', filters.priority);
  if (filters.q)           p.set('q', filters.q);
  if (filters.overdueOnly) p.set('od', '1');
  if (filters.reviewOnly)  p.set('rv', '1');
  const d = filters.drill;
  if (d) {
    if (d.company) p.set('c', d.company);
    if (d.func)    p.set('f', d.func);
    // `k=cell` is only written for the All x All drill: with no c, f or k at all the old hash could
    // not tell "the All drill" from "no drill", and a reload lost it.
    if (d.kind && (d.kind !== 'cell' || (!d.company && !d.func))) p.set('k', d.kind);
    p.set('t', filters.tab || DEFAULT_TAB);
    if (filters.tab === 'pivot') p.set('pv', filters.pivot || DEFAULT_PIVOT);
  }
  return p.toString();
}

/**
 * The next query string for the page: every param that is not the Matrix's (the Work
 * `scope`, anything else) is kept, the Matrix's own are replaced by `filters`.
 */
export function mergeMatrixParams(currentSearch, filters) {
  const next = new URLSearchParams();
  for (const [key, value] of toParams(currentSearch)) {
    if (!MATRIX_KEYS.includes(key)) next.append(key, value);
  }
  for (const [key, value] of new URLSearchParams(serializeMatrixParams(filters))) next.append(key, value);
  return next.toString();
}
