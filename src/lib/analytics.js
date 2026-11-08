/* analytics.js — the company overview's numbers. Port of computeAnalytics() and the drill lists of
 * rie-dashboard2/js/analytics.js. Pure: data and filters in, numbers out. No store, no DOM, no
 * module state (the old file kept the filters `f`, the current tab and the drill lists `lists` in
 * module variables; here they are an argument, the URL and a function of the result).
 *
 * Counting rules (shared with Today, the Matrix, Team and Team workload):
 * - Dates are LOCAL (todayISO); a date-only string read as UTC midnight made today's tasks
 *   "overdue" from 05:30 IST.
 * - Archived tasks are not work. Dropped tasks are closed, not done.
 * - A shared task counts for everyone on it (assigneesOf); a person filter matches a person exactly.
 *   P1 is a task priority only.
 * - Every filter (period, company, person) applies to every section.
 *
 * Plain JS with relative imports so plain Node can run it.
 */
import { assigneesOf } from './mappers.js';
import { fmtD } from './format.js';
import { todayISO } from './queue.js';

export const OPEN = new Set(['Pending', 'In Progress', 'On Hold']);
export const RANGES = [['7', '7 days'], ['30', '30 days'], ['90', '90 days'], ['ALL', 'All time']];
export const TABS = [['overview', 'Overview'], ['people', 'People'], ['areas', 'Companies & functions'], ['pipeline', 'Pipeline']];
export const STALE_DAYS = 14;
/** The filters at rest: all companies, everyone, the last 30 days. */
export const DEFAULT_FILTERS = Object.freeze({ company: 'ALL', person: 'ALL', range: '30' });
/** The most rows the drill dialog lists. */
export const DRILL_LIMIT = 300;

const localDay = (s) => (s ? todayISO(new Date(s)) : '');
const people = (t) => { const p = assigneesOf(t); return p.length ? p : ['Unassigned']; };
export const isP1 = (t) => t.priority === 'P1';
export const byDue = (a, b) => (a.nextFollowUp || '9999').localeCompare(b.nextFollowUp || '9999');
const doneAt = (t) => localDay(t.closedAt || t.updatedAt);
/** The people on a task, 'Unassigned' for none (what the rows and the task lists print). */
export const peopleOf = people;

function bump(map, key, field, t) {
  const row = map.get(key) || { open: 0, overdue: 0, week: 0, done: 0, p1: 0, inProgress: 0, waiting: 0, tasks: [] };
  row[field]++;
  if (field === 'open') row.tasks.push(t);
  map.set(key, row);
}

/**
 * @param {{tasks?: object[], leads?: object[], escalations?: object[]}} state
 * @param {{company?: string, person?: string, range?: string}} [filters]  range: '7' | '30' | '90' | 'ALL'
 * @param {Date} [now]
 * @returns the same object the old computeAnalytics() returned
 */
export function computeAnalytics(state, filters = DEFAULT_FILTERS, now = new Date()) {
  const f = { ...DEFAULT_FILTERS, ...filters };
  const daysFrom = (n) => { const d = new Date(now); d.setDate(d.getDate() + n); return todayISO(d); };
  const daysAgo = (n) => daysFrom(-n);
  const daysAhead = (n) => daysFrom(n);

  const inScope = (t, { ignorePerson = false } = {}) => {
    if (t.archivedAt) return false;
    if (f.company !== 'ALL' && (t.company || 'No company') !== f.company) return false;
    if (!ignorePerson && f.person !== 'ALL' && !people(t).includes(f.person)) return false;
    return true;
  };

  const today = todayISO(now);
  const in7 = daysAhead(7);
  const n = f.range === 'ALL' ? 0 : +f.range;
  const since = n ? daysAgo(n) : '';
  const prevFrom = n ? daysAgo(2 * n) : '';
  const all = (state.tasks || []).filter((t) => inScope(t));

  const open = all.filter((t) => OPEN.has(t.status));
  const overdue = open.filter((t) => t.nextFollowUp && t.nextFollowUp < today);
  const week = open.filter((t) => t.nextFollowUp && t.nextFollowUp >= today && t.nextFollowUp <= in7);
  const stale = open.filter((t) => t.updatedAt && localDay(t.updatedAt) <= daysAgo(STALE_DAYS));
  const completed = all.filter((t) => t.status === 'Completed');
  const done = completed.filter((t) => !since || doneAt(t) >= since).sort((a, b) => doneAt(b).localeCompare(doneAt(a)));
  const created = all.filter((t) => !since || localDay(t.createdAt) >= since);
  // The same-length window just before this one, for "vs previous period".
  const prevDone = n ? completed.filter((t) => doneAt(t) >= prevFrom && doneAt(t) < since).length : null;
  const prevCreated = n ? all.filter((t) => localDay(t.createdAt) >= prevFrom && localDay(t.createdAt) < since).length : null;
  const p1 = open.filter(isP1);
  const attention = [...overdue].sort((a, b) => (isP1(b) - isP1(a)) || byDue(a, b));

  const byPerson = new Map(); const byCompany = new Map(); const byFunc = new Map();
  for (const t of open) {
    const late = t.nextFollowUp && t.nextFollowUp < today;
    const soon = t.nextFollowUp && t.nextFollowUp >= today && t.nextFollowUp <= in7;
    for (const [map, keys] of [[byPerson, people(t)], [byCompany, [t.company || 'No company']], [byFunc, [t.func || 'No function']]]) {
      for (const k of keys) {
        bump(map, k, 'open', t);
        if (late) bump(map, k, 'overdue', t);
        if (soon) bump(map, k, 'week', t);
        if (isP1(t)) bump(map, k, 'p1', t);
        bump(map, k, t.status === 'In Progress' ? 'inProgress' : 'waiting', t);
      }
    }
  }
  for (const t of done) {
    for (const k of people(t)) bump(byPerson, k, 'done', t);
    bump(byCompany, t.company || 'No company', 'done', t);
    bump(byFunc, t.func || 'No function', 'done', t);
  }

  const flow = [];
  for (let w = 7; w >= 0; w--) {
    const from = daysAgo(w * 7 + 6), to = daysAgo(w * 7);
    const inWeek = (d) => d && d >= from && d <= to;
    flow.push({
      label: fmtD(from),
      created: all.filter((t) => inWeek(localDay(t.createdAt))).length,
      completed: completed.filter((t) => inWeek(doneAt(t))).length,
    });
  }

  const leads = state.leads || [];
  const leadOpen = leads.filter((l) => l.stage !== 'Won' && l.stage !== 'Lost');
  const stages = new Map();
  for (const l of leadOpen) {
    const s = stages.get(l.stage) || { n: 0, value: 0, leads: [] };
    s.n++; s.value += Number(l.amount) || 0; s.leads.push(l); stages.set(l.stage, s);
  }
  const won = leads.filter((l) => l.stage === 'Won' && (!since || localDay(l.stageChangedAt || l.updatedAt) >= since));
  const lost = leads.filter((l) => l.stage === 'Lost' && (!since || localDay(l.stageChangedAt || l.updatedAt) >= since));
  const escalations = (state.escalations || []).filter((e) => e.status === 'open');

  const forChoices = (state.tasks || []).filter((t) => inScope(t, { ignorePerson: true }));
  const availablePeople = [...new Set(forChoices.flatMap(people))].filter((p) => p !== 'Unassigned').sort((a, b) => a.localeCompare(b));
  const availableCompanies = [...new Set((state.tasks || []).filter((t) => !t.archivedAt).map((t) => t.company || 'No company'))].sort();

  const sortRows = (m) => [...m.entries()].sort((a, b) => b[1].open - a[1].open || b[1].done - a[1].done);
  return {
    today, n, since, open, overdue, week, stale, done, created, p1, attention, flow, prevDone, prevCreated,
    byPerson: sortRows(byPerson), byCompany: sortRows(byCompany), byFunc: sortRows(byFunc),
    stages: [...stages.entries()], leadOpen, won, lost, escalations, availablePeople, availableCompanies,
    statusMix: {
      inProgress: open.filter((t) => t.status === 'In Progress').length,
      pending: open.filter((t) => t.status === 'Pending').length,
      onHold: open.filter((t) => t.status === 'On Hold').length,
    },
  };
}

/* ── the drill dialog ───────────────────────────────────────────────────── */

const DRILL_TITLE = {
  open: 'Open tasks', overdue: 'Overdue', week: 'Due in the next 7 days', stale: `No movement in ${STALE_DAYS}+ days`,
  done: 'Completed', created: 'New tasks', p1: 'Open P1 tasks', attention: 'Needs attention',
};

/**
 * The lists a number opens, by key: the six counters, p1, attention, and one list per
 * `person:`, `company:` and `func:` row (that row's OPEN tasks). The old code rebuilt these as a
 * side effect of every computeAnalytics().
 */
export function drillLists(d) {
  const lists = {
    open: d.open, overdue: d.overdue, week: d.week, stale: d.stale, done: d.done, created: d.created, p1: d.p1, attention: d.attention,
  };
  for (const [k, v] of d.byPerson) lists['person:' + k] = v.tasks;
  for (const [k, v] of d.byCompany) lists['company:' + k] = v.tasks;
  for (const [k, v] of d.byFunc) lists['func:' + k] = v.tasks;
  return lists;
}

/**
 * What analyticsDrill(key) put in the dialog: its title (with the count of ALL rows), the rows
 * (due soonest first, no date last; `done` keeps its newest-first order), the first 300 of them,
 * and whether more were cut.
 */
export function drillView(d, key) {
  const all = (drillLists(d)[key] || []).slice().sort(key === 'done' ? () => 0 : byDue);
  const [kind, name] = key.includes(':') ? key.split(/:(.*)/s) : [key, ''];
  const title = name ? `${name}: open tasks` : DRILL_TITLE[kind] || 'Tasks';
  return { title: `${title} · ${all.length}`, rows: all.slice(0, DRILL_LIMIT), total: all.length, truncated: all.length > DRILL_LIMIT };
}
