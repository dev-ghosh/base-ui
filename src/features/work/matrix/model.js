/* model.js — the Matrix as plain data. Port of the non-DOM half of rie-dashboard2/js/matrix.js:
 * "RIE v2 - Two-Level Filter Model: Company x Function".
 *
 * Anti-hardcoding contract (spec 2.4): the function list, function order, function
 * definitions, the company list and every count are read at runtime from `task_functions`
 * (the registry rows passed in) and from the tasks. The ONLY constants in this file are the
 * presentation constants enumerated in spec Appendix C, below. Adding a function or
 * deactivating one for a company must be a data edit with zero deploy.
 *
 * Pure: no store, no DOM, no clock of its own (`now` is passed in), so plain Node can run it.
 * Relative imports with explicit .js extensions for the same reason.
 */
import { isMine, inScope } from '../../../lib/scope.js';
import { assigneesOf } from '../../../lib/mappers.js';

// -- Presentation constants (spec Appendix C) -------------------------------
// Deliberately absent: company list, function list, function order, function
// definitions, activation state, and every count.

export const STATUSES      = ['Pending', 'In Progress', 'On Hold', 'Completed', 'Dropped'];
export const LIVE_PRESET   = ['Pending', 'In Progress', 'On Hold'];
export const CLOSED_PRESET = ['Completed', 'Dropped'];

export const STATUS_COLORS = {
  light: { 'Pending':'#2a78d6','In Progress':'#eb6834','On Hold':'#1baf7a','Completed':'#eda100','Dropped':'#e87ba4' },
  dark:  { 'Pending':'#3987e5','In Progress':'#d95926','On Hold':'#199e70','Completed':'#c98500','Dropped':'#d55181' },
};

export const PIVOT_AXES = [
  { key: 'assignedTo', label: 'Owner' },
  { key: 'priority',   label: 'Priority' },
  { key: 'dueBucket',  label: 'Due bucket' },
  { key: 'func',       label: 'Function' },
  { key: 'company',    label: 'Company' },
  { key: 'contactOrg', label: 'Counterparty' },
];

export const DUE_BUCKETS = ['Overdue 30d+', 'Overdue 8-30d', 'Overdue 1-7d', 'Due today', 'Due this week', 'Later', 'No date'];

export const KANBAN_PAGE_SIZE    = 60;
export const SEARCH_DEBOUNCE_MS  = 150;
export const PANEL_TRANSITION_MS = 200;

export const LIST_COLS = [
  { key: 'id',           label: '#' },
  { key: 'company',      label: 'Company' },
  { key: 'func',         label: 'Function' },
  { key: 'task',         label: 'Task' },
  { key: 'status',       label: 'Status' },
  { key: 'priority',     label: 'P' },
  { key: 'assignedTo',   label: 'Owner' },
  { key: 'nextFollowUp', label: 'Due' },
];

export const DRILL_KINDS = ['cell', 'untagged', 'review'];
export const DRILL_TABS  = ['board', 'list', 'pivot'];

/** Is this set of statuses (any order) exactly the preset? */
export function sameSet(arr, preset) {
  const set = new Set(arr);
  return set.size === preset.length && preset.every((v) => set.has(v));
}

// -- Colour maths -----------------------------------------------------------

// Ink for a cell. The sequential heat fill (and with it the heat ramp, its luminance
// maths and the per-theme ink-flip thresholds) is gone from the old file: there is
// nothing to invert against, so the tokens do the work. Kept as a function because the
// call sites read {ink, risk, crit, warn} as a unit.
export function cellInk() {
  return { ink: 'var(--tx)', risk: 'var(--txd)', crit: 'var(--hot)', warn: 'var(--warm)' };
}

/** The old statusColor(): only `light` has its own palette, every other theme uses `dark`. */
export function statusColor(status, theme) {
  return STATUS_COLORS[theme === 'light' ? 'light' : 'dark'][status] || 'var(--txd)';
}

// -- Registry ---------------------------------------------------------------

/**
 * Ordered, de-duplicated function list - order comes from sort_order, never code.
 * Only functions at least one company still runs: a retired function (inactive
 * everywhere) is not a column. One a single company doesn't run still shows, greyed, for it.
 */
export function funcRows(registry = []) {
  const seen = new Map();
  registry.forEach((r) => {
    if (!r.active) return;
    if (!seen.has(r.func)) seen.set(r.func, { func: r.func, sortOrder: r.sort_order, definition: r.definition || '' });
  });
  return [...seen.values()].sort((a, b) => a.sortOrder - b.sortOrder || a.func.localeCompare(b.func));
}

export function companyList(registry = []) {
  return [...new Set(registry.map((r) => r.company))].sort((a, b) => a.localeCompare(b));
}

export function isActive(registry, company, func) {
  const row = registry.find((r) => r.company === company && r.func === func);
  return !!(row && row.active);
}

export function activeFuncsFor(registry, company) {
  return registry
    .filter((r) => r.company === company && r.active)
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((r) => r.func);
}

export function definitionOf(registry, func) {
  const row = registry.find((r) => r.func === func && r.definition);
  return row ? row.definition : '';
}

/** A task can carry co-owners ("A, B"); the Owner filter matches on any part. */
export const ownerParts = (t) => (t.assignedTo || '').split(',').map((s) => s.trim()).filter(Boolean);

export const isUnowned = (t) => !(t.assignedTo || '').trim();

// -- Due buckets and pivot ---------------------------------------------------

export function dueBucket(t, today) {
  if (!t.nextFollowUp) return 'No date';
  const ms = 86400000;
  const d0 = new Date(today + 'T00:00:00Z').getTime();
  const dd = Math.round((new Date(t.nextFollowUp + 'T00:00:00Z').getTime() - d0) / ms);
  if (dd <= -30) return 'Overdue 30d+';
  if (dd <= -8)  return 'Overdue 8-30d';
  if (dd <= -1)  return 'Overdue 1-7d';
  if (dd === 0)  return 'Due today';
  if (dd <= 7)   return 'Due this week';
  return 'Later';
}

/**
 * The list tab's order. Nulls last regardless of direction (spec 7.7, 7.10).
 */
export function sortTasks(rows, col, dir) {
  return [...rows].sort((a, b) => {
    const av = a[col] == null ? '' : String(a[col]);
    const bv = b[col] == null ? '' : String(b[col]);
    if (!av && bv) return 1;
    if (av && !bv) return -1;
    return av.localeCompare(bv, undefined, { numeric: true }) * dir;
  });
}

// -- The model --------------------------------------------------------------

/**
 * Everything the Matrix shows, derived from its inputs:
 *   registry   task_functions rows
 *   tasks      store.tasks
 *   filters    the parsed URL state (see params.js)
 *   scope, me  the Work scope and the signed-in person's code
 *   now        a Date (today in the old code was `new Date().toISOString().slice(0, 10)`)
 */
export function createModel({ registry = [], tasks = [], filters, scope = 'everyone', me = null, now = new Date() }) {
  const today = now.toISOString().slice(0, 10);
  const in7 = (() => { const d = new Date(now); d.setDate(d.getDate() + 7); return d.toISOString().slice(0, 10); })();
  const statuses = new Set(filters.statuses);

  const funcs = funcRows(registry);
  const companies = companyList(registry);

  const active = (company, func) => isActive(registry, company, func);
  const isOverdue = (t) => !!t.nextFollowUp && t.nextFollowUp < today && LIVE_PRESET.includes(t.status);
  const isUntagged = (t) => !t.func || !t.company || !active(t.company, t.func);

  // Secondary filters only - status is handled separately so chip counts stay
  // stable under the status selection itself (spec 7.4).
  const passesSecondary = (t) => {
    // The Work scope (Mine / Team / Everyone) comes before every other filter.
    if (!inScope(t, scope, me)) return false;
    // Under Mine the Owner select is not shown, so it must not filter either.
    if (filters.owner && scope !== 'mine' && !ownerParts(t).includes(filters.owner)) return false;
    if (filters.priority && (t.priority || '') !== filters.priority) return false;
    if (filters.overdueOnly && !isOverdue(t)) return false;
    if (filters.reviewOnly && !t.funcReview) return false;
    if (filters.q) {
      const hay = [t.task, t.contactName, t.contactOrg, t.actionItem, t.keyInputs, t.assignedTo]
        .map((v) => (v || '').toLowerCase()).join('   ');
      if (!hay.includes(filters.q.toLowerCase())) return false;
    }
    return true;
  };

  const base = tasks.filter(passesSecondary);
  const rows = base.filter((t) => statuses.has(t.status));

  // Chip counts respect the secondary filters but NOT the status selection,
  // otherwise every unselected chip would read zero (spec 7.4).
  const chipCounts = {};
  STATUSES.forEach((s) => { chipCounts[s] = base.filter((t) => t.status === s).length; });

  const preset =
    sameSet(filters.statuses, LIVE_PRESET)   ? 'live'   :
    sameSet(filters.statuses, STATUSES)      ? 'all'    :
    sameSet(filters.statuses, CLOSED_PRESET) ? 'closed' : '';

  const prios = [...new Set(tasks.map((t) => t.priority).filter(Boolean))].sort();
  const reviewCount = tasks.filter((t) => t.funcReview).length;
  const ownerSource = tasks.flatMap(ownerParts);

  // Bucket once; every number below is derived from this, never hardcoded.
  const cell = new Map();                       // "company func" -> task[]
  rows.forEach((t) => {
    if (isUntagged(t)) return;
    const k = t.company + ' ' + t.func;
    if (!cell.has(k)) cell.set(k, []);
    cell.get(k).push(t);
  });
  const at = (c, f) => cell.get(c + ' ' + f) || [];

  // Colour rule for the whole Work tab: red only where a task is P1, overdue AND mine.
  // Overdue alone is amber.
  const isFire = (t) => isOverdue(t) && t.priority === 'P1' && isMine(t, me);

  const riskOf = (list) => ({
    od: list.filter(isOverdue).length,
    p1: list.filter((t) => t.priority === 'P1').length,
    fire: list.some(isFire),
  });

  // Only selected statuses get a segment; unselected ones are omitted, not zeroed.
  const composition = (list) => {
    if (!list.length) return [];
    return STATUSES.filter((s) => statuses.has(s))
      .map((s) => ({ status: s, n: list.filter((t) => t.status === s).length }))
      .filter((seg) => seg.n > 0);
  };

  // Zero and not-applicable are different facts and render differently.
  const cellData = (company, func) => {
    if (!active(company, func)) return { state: 'inactive' };
    const list = at(company, func);
    if (!list.length) return { state: 'zero' };
    return { state: 'cell', n: list.length, ...riskOf(list), review: list.some((t) => t.funcReview), composition: composition(list), tasks: list };
  };
  const totalData = (list) => {
    if (!list.length) return { state: 'zero' };
    return { state: 'cell', n: list.length, ...riskOf(list), composition: composition(list), tasks: list };
  };

  const grid = {
    rowTotal: (func) => totalData(companies.flatMap((c) => at(c, func))),
    colTotal: (company) => totalData(funcs.flatMap((fr) => at(company, fr.func))),
    grand: () => totalData([...cell.values()].flat()),
  };

  // The empty grid is itself informative, so it is never hidden (spec 7.10). But an all-zero
  // grid has two very different causes: nothing matched the filters, or everything matched and
  // none of it is classified.
  const placed = [...cell.values()].reduce((n, v) => n + v.length, 0);
  const emptyKind = !rows.length ? 'nomatch' : !placed ? 'untagged' : null;

  // Tiles are numbers in neutral ink; the label carries the meaning. Under scope Mine the row
  // is about my week (in scope, due this week, overdue, no date). Unowned and P1 are team facts
  // and appear under Team and Everyone.
  const kpis = () => {
    const mine = scope === 'mine';
    const tiles = [
      { k: 'scope',    label: 'In scope',      n: rows.length,                                                                             always: true },
      { k: 'week',     label: 'Due this week', n: rows.filter((t) => t.nextFollowUp && t.nextFollowUp >= today && t.nextFollowUp <= in7).length, always: true },
      { k: 'overdue',  label: 'Overdue',       n: rows.filter(isOverdue).length,                                                           always: true },
      { k: 'nodue',    label: 'No due date',   n: rows.filter((t) => !t.nextFollowUp).length,                                              always: true },
      { k: 'p1',       label: 'P1',            n: rows.filter((t) => t.priority === 'P1').length,                                          always: !mine },
      { k: 'unowned',  label: 'Unowned',       n: rows.filter(isUnowned).length,                                                           always: !mine },
      { k: 'review',   label: 'Needs review',  n: rows.filter((t) => t.funcReview).length,                                                 always: false },
      { k: 'untagged', label: 'Untagged',      n: rows.filter(isUntagged).length,                                                          always: false },
    ];
    return tiles
      .filter((t) => t.always || (t.n > 0 && !(mine && (t.k === 'p1' || t.k === 'unowned'))))
      .map((t) => ({ ...t, drills: t.k === 'review' || t.k === 'untagged' }));
  };

  /**
   * The drill deliberately ignores the status chips (old comment): the grid is a summary OF
   * the selected statuses, the drill is "everything in this cell", so a card whose status you
   * change moves column instead of vanishing.
   */
  const drillTasks = (drill) => {
    let list = base;
    if (drill.kind === 'untagged') return list.filter(isUntagged);
    if (drill.kind === 'review')   return list.filter((t) => t.funcReview);
    list = list.filter((t) => !isUntagged(t));
    if (drill.company) list = list.filter((t) => t.company === drill.company);
    if (drill.func)    list = list.filter((t) => t.func === drill.func);
    return list;
  };

  const scopeTitle = (drill) => {
    if (drill.kind === 'untagged') return 'Untagged tasks';
    if (drill.kind === 'review')   return 'Needs review';
    return (drill.company || 'All companies') + ' · ' + (drill.func || 'All functions');
  };

  /** Pivot rows for an axis: [{label, items}] in display order. */
  const pivotEntries = (list, axis) => {
    const keyOf = (t) => {
      if (axis === 'dueBucket') return dueBucket(t, today);
      const v = (t[axis] || '').toString().trim();
      return v || '— none —';
    };
    const groups = new Map();
    list.forEach((t) => {
      // By Owner, a shared task sits under each of its people, not under a combined "A, B" owner.
      let keys = [keyOf(t)];
      if (axis === 'assignedTo') {
        const people = assigneesOf(t);
        if (people.length) keys = people;
      }
      for (const k of keys) {
        if (!groups.has(k)) groups.set(k, []);
        groups.get(k).push(t);
      }
    });
    const entries = [...groups.entries()].map(([label, items]) => ({ label, items }));
    if (axis === 'dueBucket') entries.sort((a, b) => DUE_BUCKETS.indexOf(a.label) - DUE_BUCKETS.indexOf(b.label));
    else entries.sort((a, b) => b.items.length - a.items.length);
    return entries;
  };

  /** Stale values in the URL (a company or function the registry no longer has) are ignored (spec 7.13). */
  const validDrill = (drill) => {
    if (!drill) return null;
    const companyOk = !drill.company || companies.includes(drill.company);
    const funcOk = !drill.func || funcs.some((r) => r.func === drill.func);
    return companyOk && funcOk ? drill : null;
  };

  return {
    today, statuses, funcs, companies,
    isActive: active, isOverdue, isFire, isUntagged, isUnowned,
    activeFuncsFor: (company) => activeFuncsFor(registry, company),
    definitionOf: (func) => definitionOf(registry, func),
    rows, base, chipCounts, preset, prios, reviewCount, ownerSource,
    at, cellData, totalData, grid, composition, riskOf, emptyKind,
    kpis, drillTasks, scopeTitle, pivotEntries, validDrill,
  };
}
