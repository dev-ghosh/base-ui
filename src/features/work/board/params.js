/* params.js — the Board / Hierarchy filter row as URL search params.
 *
 * The legacy filter row of rie-dashboard2/js/tasks.js (tf-proj, tf-task, tf-cat, the assigned-to and
 * priority multi-selects, the created range, the due buttons, the tag filter) lived in DOM values and
 * in module state (state.atFilter, prFilter, taskDateFilter, taskCreatedFilter, taskCreatedFrom/To,
 * tagFilter). Filters are search params now (spec C7 rule 4), on /work/board and /work/hierarchy,
 * with short stable names:
 *
 *   pj    project (exact match on the task's project)
 *   q     search text (task, contact, organisation, assignee; or a task number such as #12)
 *   cat   category (exact match)
 *   at    assigned-to, repeated: a display name, or `__unassigned__`
 *   pr    priority, repeated: P1 | P2 | P3 | none  (none = "no priority", the old '' member of prFilter)
 *   due   overdue | today | 3days   (absent = all)
 *   cr    created: today | week | month | quarter | custom   (absent = all)
 *   crf   custom range start, YYYY-MM-DD   (only with cr=custom)
 *   crt   custom range end,   YYYY-MM-DD   (only with cr=custom)
 *   tg    tag filter, repeated (the shared tag bar, #tag-filter-bar)
 *
 * The Work scope (`scope`) is another param of the same URL and is not touched here;
 * mergeBoardParams keeps every key it does not own. Unknown or stale values are ignored, never an
 * error; a default is never written. Pure and Node-importable.
 */

export const BOARD_KEYS = ['pj', 'q', 'cat', 'at', 'pr', 'due', 'cr', 'crf', 'crt', 'tg'];

/** The "Unassigned" row of the assigned-to dropdown (the old sentinel). */
export const UNASSIGNED = '__unassigned__';

export const DUE_VALUES = ['overdue', 'today', '3days'];
export const CREATED_VALUES = ['today', 'week', 'month', 'quarter', 'custom'];
/** The priority members of the old prFilter set: '' is "— No priority". */
export const PRIORITIES = ['P1', 'P2', 'P3', ''];
const NO_PRIORITY = 'none';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** The filters when the URL says nothing: the old empty state. */
export function defaultBoardFilters() {
  return {
    project: '',
    q: '',
    category: '',
    assignees: [],
    priorities: [],
    due: 'all',
    created: 'all',
    createdFrom: '',
    createdTo: '',
    tags: [],
  };
}

const toParams = (search) => {
  if (search == null) return new URLSearchParams();
  if (typeof search === 'string') return new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  return new URLSearchParams(search.toString());   // URLSearchParams / ReadonlyURLSearchParams
};

const uniq = (list) => [...new Set(list)];

/** `?pj=..&at=A&at=B` (or a URLSearchParams) -> filters. */
export function parseBoardParams(search) {
  const p = toParams(search);
  const f = defaultBoardFilters();

  f.project = p.get('pj') || '';
  f.q = p.get('q') || '';
  f.category = p.get('cat') || '';
  f.assignees = uniq(p.getAll('at').filter(Boolean));
  f.priorities = uniq(
    p.getAll('pr')
      .map((v) => (v === NO_PRIORITY ? '' : v))
      .filter((v) => PRIORITIES.includes(v)),
  );
  const due = p.get('due');
  if (DUE_VALUES.includes(due)) f.due = due;
  const cr = p.get('cr');
  if (CREATED_VALUES.includes(cr)) {
    f.created = cr;
    if (cr === 'custom') {
      const from = p.get('crf');
      const to = p.get('crt');
      if (DATE_RE.test(from || '') && !Number.isNaN(Date.parse(from))) f.createdFrom = from;
      if (DATE_RE.test(to || '') && !Number.isNaN(Date.parse(to))) f.createdTo = to;
    }
  }
  f.tags = uniq(p.getAll('tg').filter(Boolean));
  return f;
}

/** filters -> the query string (no leading `?`), only what differs from the defaults. */
export function serializeBoardParams(filters) {
  const p = new URLSearchParams();
  if (filters.project) p.set('pj', filters.project);
  if (filters.q) p.set('q', filters.q);
  if (filters.category) p.set('cat', filters.category);
  for (const a of filters.assignees || []) if (a) p.append('at', a);
  for (const v of filters.priorities || []) {
    if (PRIORITIES.includes(v)) p.append('pr', v === '' ? NO_PRIORITY : v);
  }
  if (DUE_VALUES.includes(filters.due)) p.set('due', filters.due);
  if (CREATED_VALUES.includes(filters.created)) {
    p.set('cr', filters.created);
    if (filters.created === 'custom') {
      if (filters.createdFrom) p.set('crf', filters.createdFrom);
      if (filters.createdTo) p.set('crt', filters.createdTo);
    }
  }
  for (const t of filters.tags || []) if (t) p.append('tg', t);
  return p.toString();
}

/**
 * The next query string for the page: every param that is not the Board's (the Work `scope`,
 * anything else) is kept, the Board's own are replaced by `filters`.
 */
export function mergeBoardParams(currentSearch, filters) {
  const next = new URLSearchParams();
  for (const [key, value] of toParams(currentSearch)) {
    if (!BOARD_KEYS.includes(key)) next.append(key, value);
  }
  for (const [key, value] of new URLSearchParams(serializeBoardParams(filters))) next.append(key, value);
  return next.toString();
}
