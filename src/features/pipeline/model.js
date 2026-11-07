/* model.js — the Pipeline's pure logic. Port of the constants and the list pipeline of
 * rie-dashboard2/js/leads.js: the stages and types, the money / days-in-stage formats, the
 * filters (search, type, owner), the Kanban ordering, the table sort, and the filter row as URL
 * search params (spec C7 rule 4: the old toolbar inputs `lf-search`, `lf-type`, `lf-at` and the
 * `state.leadShowClosed` flag were DOM values and module state).
 *
 * No store, no DOM: plain Node can import it.
 */
import { parseD } from '../../lib/format.js';

/** Stage columns in the old order. `closed` stages are the Won / Lost columns behind "Closed". */
export const LEAD_STAGES = [
  { stage: 'Identified',        cls: 'kb-wo', closed: false },
  { stage: 'Applied/Contacted', cls: 'kb-ip', closed: false },
  { stage: 'In Conversation',   cls: 'kb-cv', closed: false },
  { stage: 'On Hold',           cls: 'kb-oh', closed: false },
  { stage: 'Won',               cls: 'kb-co', closed: true },
  { stage: 'Lost',              cls: 'kb-dr', closed: true },
];
export const STAGE_NAMES = LEAD_STAGES.map((s) => s.stage);
export const isClosedStage = (stage) => stage === 'Won' || stage === 'Lost';

export const LEAD_TYPES = ['Investor', 'Grant', 'Tender', 'Govt/Official Pitch', 'Sales/BD', 'Award/Program', 'Other'];

/** The touchpoint kinds; `icon` is an Icon name. `stage` is written by the app, never picked. */
export const TOUCHPOINT_TYPES = [
  { type: 'note',       icon: 'note',    label: 'Note' },
  { type: 'call',       icon: 'phone',   label: 'Call' },
  { type: 'meeting',    icon: 'users',   label: 'Meeting' },
  { type: 'email',      icon: 'mail',    label: 'Email' },
  { type: 'pitch',      icon: 'chart',   label: 'Pitch' },
  { type: 'submission', icon: 'arrowup', label: 'Submission' },
  { type: 'follow-up',  icon: 'bell',    label: 'Follow-up' },
  { type: 'stage',      icon: 'layers',  label: 'Stage change' },
];
export const tpIconName = (type) => TOUCHPOINT_TYPES.find((x) => x.type === type)?.icon || 'note';

export function fmtAmt(a) {
  if (a == null || a === '') return '';
  return '₹' + Number(a).toLocaleString('en-IN');
}

/** Whole days since the stage last changed, or null when unknown. */
export function daysInStage(l, now = Date.now()) {
  if (!l.stageChangedAt) return null;
  const d = new Date(l.stageChangedAt);
  if (isNaN(d)) return null;
  return Math.max(0, Math.floor((now - d.getTime()) / 86400000));
}

/** Search text, type and owner (filteredLeads). Owner is a substring match on assignedTo, as before. */
export function filterLeads(leads, { q = '', type = '', at = '' } = {}) {
  const needle = (q || '').toLowerCase();
  let list = [...leads];
  if (type) list = list.filter((l) => l.type === type);
  if (at) list = list.filter((l) => (l.assignedTo || '').includes(at));
  if (needle) {
    list = list.filter((l) => [l.title, l.org, l.contactName, l.nextStep, l.notes].some((v) => (v || '').toLowerCase().includes(needle)));
  }
  return list;
}

const PR_RANK = { P1: 1, P2: 2, P3: 3, '': 4 };

/** Kanban order inside a column: priority (P1 first, none last), then the next follow-up (soonest first, none last). */
export function sortForBoard(list) {
  return [...list].sort((a, b) => {
    const pa = PR_RANK[a.priority || ''] || 4;
    const pb = PR_RANK[b.priority || ''] || 4;
    if (pa !== pb) return pa - pb;
    const da = parseD(a.nextFollowUp);
    const db = parseD(b.nextFollowUp);
    if (!da && !db) return 0;
    if (!da) return 1;
    if (!db) return -1;
    return da - db;
  });
}

/** The columns on screen: closed ones only behind "Closed". */
export const visibleStages = (showClosed) => LEAD_STAGES.filter((c) => showClosed || !c.closed);

/** stage -> leads of that stage (every stage present, in LEAD_STAGES order; an unknown stage lands nowhere). */
export function groupByStage(leads) {
  const by = {};
  for (const s of STAGE_NAMES) by[s] = [];
  for (const l of leads) if (by[l.stage]) by[l.stage].push(l);
  return by;
}

/* ── table ───────────────────────────────────────────────────────────────── */

export const SORT_ACCESSORS = {
  title:        (l) => (l.title || '').toLowerCase(),
  type:         (l) => l.type || '',
  stage:        (l) => STAGE_NAMES.indexOf(l.stage),
  org:          (l) => (l.org || l.contactName || '').toLowerCase(),
  amount:       (l) => l.amount ?? -1,
  deadline:     (l) => l.deadline || '9999',
  nextFollowUp: (l) => l.nextFollowUp || '9999',
  updatedAt:    (l) => l.updatedAt || '',
};
export const DEFAULT_SORT = { col: 'updatedAt', dir: -1 };

/** The table's rows: closed ones only behind "Closed", then sorted by the column (dir 1 = ascending). */
export function sortLeadsForTable(list, { col, dir }, showClosed) {
  const rows = showClosed ? [...list] : list.filter((l) => !isClosedStage(l.stage));
  const acc = SORT_ACCESSORS[col] || SORT_ACCESSORS.updatedAt;
  return rows.sort((a, b) => {
    const va = acc(a);
    const vb = acc(b);
    return (va < vb ? -1 : va > vb ? 1 : 0) * dir;
  });
}

/** Click on a column header (sortLeads): the same column flips, a new one starts ascending. */
export const nextSort = (cur, col) => (cur.col === col ? { col, dir: cur.dir * -1 } : { col, dir: 1 });

/* ── the filter row as search params ─────────────────────────────────────── */

/**
 *   q      search text
 *   type   one of LEAD_TYPES
 *   at     owner display name
 *   closed 1 = show the Won / Lost columns
 *   sort   table column (a key of SORT_ACCESSORS)   dir  asc | desc
 * Unknown values are ignored, never an error; a default is never written.
 */
export const LEAD_KEYS = ['q', 'type', 'at', 'closed', 'sort', 'dir'];

const toParams = (search) => {
  if (search == null) return new URLSearchParams();
  if (typeof search === 'string') return new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  return new URLSearchParams(search.toString());
};

export function parseLeadParams(search) {
  const p = toParams(search);
  const type = p.get('type') || '';
  const sortCol = p.get('sort');
  let sort = { ...DEFAULT_SORT };
  if (sortCol && Object.prototype.hasOwnProperty.call(SORT_ACCESSORS, sortCol)) {
    sort = { col: sortCol, dir: p.get('dir') === 'desc' ? -1 : 1 };
  }
  return {
    q: p.get('q') || '',
    type: LEAD_TYPES.includes(type) ? type : '',
    at: p.get('at') || '',
    showClosed: p.get('closed') === '1',
    sort,
  };
}

export function serializeLeadParams(f) {
  const p = new URLSearchParams();
  if (f.q) p.set('q', f.q);
  if (f.type && LEAD_TYPES.includes(f.type)) p.set('type', f.type);
  if (f.at) p.set('at', f.at);
  if (f.showClosed) p.set('closed', '1');
  const s = f.sort || DEFAULT_SORT;
  if (!(s.col === DEFAULT_SORT.col && s.dir === DEFAULT_SORT.dir) && Object.prototype.hasOwnProperty.call(SORT_ACCESSORS, s.col)) {
    p.set('sort', s.col);
    p.set('dir', s.dir === -1 ? 'desc' : 'asc');
  }
  return p.toString();
}

/** The next query string: every param that is not the Pipeline's is kept, the Pipeline's are replaced by `f`. */
export function mergeLeadParams(currentSearch, f) {
  const next = new URLSearchParams();
  for (const [key, value] of toParams(currentSearch)) if (!LEAD_KEYS.includes(key)) next.append(key, value);
  for (const [key, value] of new URLSearchParams(serializeLeadParams(f))) next.append(key, value);
  return next.toString();
}

/** Only the filters (not the sort) as a query string, for the Board <-> Table link. */
export function filterQuery(f) {
  return serializeLeadParams({ ...f, sort: DEFAULT_SORT });
}
