/* model.js — the Board and Hierarchy, as pure functions of the task list.
 *
 * Port of applyTF() (the legacy filter pipeline), matchesCreatedFilter(), closedThisWeek(),
 * renderHierarchyView() (the grouping and the order of the groups) and hGroup() (what a group's
 * header says) from rie-dashboard2/js/tasks.js. The filters keep their old meaning byte for byte;
 * the only change is where they come from (URL params, params.js) and that "now" is an argument.
 *
 * Pure and Node-importable (relative imports with .js). No component here reads a clock.
 */
import { inScope, isMine } from '../../../lib/scope.js';
import { queueRank, todayISO } from '../../../lib/queue.js';
import { parseD } from '../../../lib/format.js';
import { allTags } from '../../../lib/tags.js';
import { peopleNames } from '../../../lib/mappers.js';
import { UNASSIGNED } from './params.js';

// Live work is the Board. Closed work (Completed, Dropped) sits behind a rail at the right.
export const KB_LIVE = [
  { status: 'Pending', cls: 'kb-wo' },
  { status: 'In Progress', cls: 'kb-ip' },
  { status: 'On Hold', cls: 'kb-oh' },
];
export const KB_CLOSED = [
  { status: 'Completed', cls: 'kb-co' },
  { status: 'Dropped', cls: 'kb-dr' },
];
export const STATUS_OPTIONS = ['Pending', 'In Progress', 'On Hold', 'Completed', 'Dropped'];

/** Eight cards per column (and per Hierarchy group) before the fold. */
export const KB_SHOW = 8;

export const MUTED_STATUSES = new Set(['Completed', 'On Hold', 'Dropped']);
export const LIVE_STATUSES = new Set(['Pending', 'In Progress', 'On Hold']);

const startOfDay = (now) => { const d = new Date(now); d.setHours(0, 0, 0, 0); return d; };

/* ── created filter ───────────────────────────────────────────────────────── */

function matchesCreated(createdAt, filters, now) {
  if (!createdAt) return false;
  const d = new Date(createdAt);
  const dayStart = startOfDay(now);
  const dayEnd = new Date(now); dayEnd.setHours(23, 59, 59, 999);

  if (filters.created === 'today') return d >= dayStart && d <= dayEnd;
  if (filters.created === 'week') {
    const dow = dayStart.getDay();
    const mon = new Date(dayStart); mon.setDate(dayStart.getDate() - ((dow + 6) % 7));
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6); sun.setHours(23, 59, 59, 999);
    return d >= mon && d <= sun;
  }
  if (filters.created === 'month') {
    const mStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const mEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    return d >= mStart && d <= mEnd;
  }
  if (filters.created === 'quarter') {
    const qStart = Math.floor(now.getMonth() / 3) * 3;
    const from = new Date(now.getFullYear(), qStart, 1);
    const to = new Date(now.getFullYear(), qStart + 3, 0, 23, 59, 59, 999);
    return d >= from && d <= to;
  }
  if (filters.created === 'custom') {
    const from = filters.createdFrom ? new Date(filters.createdFrom) : null;
    const to = filters.createdTo ? new Date(filters.createdTo + 'T23:59:59') : null;
    if (from && d < from) return false;
    if (to && d > to) return false;
    return true;
  }
  return true;
}

/* ── the filter pipeline ──────────────────────────────────────────────────── */

/**
 * Scope first (Mine / Team / Everyone), then the legacy filters, then the database's ordering:
 * queueRank puts P1 first, then the oldest due date, and undated last. Returns a new array.
 */
export function filterTasks(tasks, filters, { scope, me, now = new Date() } = {}) {
  const q = (filters.q || '').toLowerCase();
  const today = startOfDay(now);
  const in3 = new Date(today); in3.setDate(in3.getDate() + 3);

  let list = tasks.filter((t) => inScope(t, scope, me));
  if (filters.project) list = list.filter((t) => t.project === filters.project);
  if (filters.category) list = list.filter((t) => t.category === filters.category);
  if (q) {
    const numMatch = q.match(/^#?\s*(\d+)$/) || q.match(/^task[-\s#]*(\d+)$/);
    const num = numMatch ? parseInt(numMatch[1], 10) : null;
    list = list.filter((t) => {
      const haystack = [t.task, t.contactName, t.contactOrg, t.assignedTo].some((v) => (v || '').toLowerCase().includes(q));
      const idHit = num !== null && t.legacyTaskId === num;
      return haystack || idHit;
    });
  }
  // assignedTo is "Owner, Co-owner, ...": match any one of them, so picking a person finds the
  // tasks they share and not only the ones they own alone.
  if (filters.assignees.length > 0) {
    const set = new Set(filters.assignees);
    list = list.filter((t) => {
      const parts = (t.assignedTo || '').split(',').map((s) => s.trim()).filter(Boolean);
      if (!parts.length) return set.has(UNASSIGNED);
      return parts.some((p) => set.has(p));
    });
  }
  if (filters.priorities.length > 0) {
    const set = new Set(filters.priorities);
    list = list.filter((t) => set.has(t.priority || ''));
  }
  if (filters.due === 'overdue') list = list.filter((t) => { const d = parseD(t.nextFollowUp); return d && d < today; });
  else if (filters.due === 'today') list = list.filter((t) => { const d = parseD(t.nextFollowUp); return d && d.getTime() === today.getTime(); });
  else if (filters.due === '3days') list = list.filter((t) => { const d = parseD(t.nextFollowUp); return d && d >= today && d <= in3; });
  if (filters.created !== 'all') list = list.filter((t) => matchesCreated(t.createdAt, filters, now));
  if (filters.tags.length > 0) {
    const set = new Set(filters.tags);
    list = list.filter((t) => allTags(t, now).some((tag) => set.has(tag)));
  }

  // One ordering, the database's: the Board and Today agree on what is on top.
  const tod = todayISO(now);
  list.sort((a, b) => queueRank(a.priority, a.nextFollowUp, tod) - queueRank(b.priority, b.nextFollowUp, tod)
    || String(a.nextFollowUp || '9999').localeCompare(String(b.nextFollowUp || '9999')));
  return list;
}

/** The project / category / assignee options, from ALL tasks (not the scoped list), as populateFilters did. */
export function filterOptions(tasks) {
  return {
    projects: [...new Set(tasks.map((t) => t.project).filter(Boolean))].sort(),
    categories: [...new Set(tasks.map((t) => t.category).filter(Boolean))].sort(),
    // Everyone onboarded, plus any legacy free-text name still on a task.
    assignees: peopleNames(tasks.flatMap((t) => (t.assignedTo || '').split(','))),
  };
}

/** Drop URL values the data no longer offers (a project nobody has, a person who left): stale = ignored. */
export function sanitizeFilters(filters, options) {
  return {
    ...filters,
    project: options.projects.includes(filters.project) ? filters.project : '',
    category: options.categories.includes(filters.category) ? filters.category : '',
    assignees: filters.assignees.filter((a) => a === UNASSIGNED || options.assignees.includes(a)),
  };
}

/** How many kinds of filter are active: the number on the Filters button. */
export function activeFilterCount(f) {
  let n = 0;
  if ((f.q || '').trim()) n++;
  if (f.project) n++;
  if (f.category) n++;
  if (f.assignees.length) n++;
  if (f.priorities.length) n++;
  if (f.due !== 'all') n++;
  if (f.created !== 'all') n++;
  if (f.tags.length) n++;
  return n;
}

/** Closed since Monday, for the rail. closedAt is set by the lifecycle; a Completed row without it
 *  (pre-lifecycle data) counts by updatedAt. */
export function closedThisWeek(list, now = new Date()) {
  const d = startOfDay(now);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  const monday = todayISO(d);
  return list.filter((t) => t.status === 'Completed' && String(t.closedAt || t.updatedAt || '').slice(0, 10) >= monday).length;
}

/* ── Hierarchy ────────────────────────────────────────────────────────────── */

/**
 * Group the (filtered) tasks: by workstream, else by their first tag, else Unfiled. Groups with open
 * work come first, soonest next-due first; groups with nothing open fold into one line at the bottom.
 * @returns {{live: Group[], done: Group[]}}  Group = { key, kind: 'ws'|'tag'|'unfiled', title, tasks, ws?, tag? }
 */
export function groupHierarchy(list, { entityLinks = [], workstreams = [] } = {}) {
  const childToParent = new Map();
  entityLinks.forEach(({ parentId, childId }) => childToParent.set(String(childId), String(parentId)));

  const wsMap = new Map();    // wsId -> { ws, tasks[] }
  const tagMap = new Map();   // tagName -> task[]
  const uncat = [];
  list.forEach((task) => {
    const parentId = childToParent.get(String(task.id));
    const ws = parentId ? workstreams.find((w) => String(w.id) === parentId) : null;
    if (ws) {
      if (!wsMap.has(ws.id)) wsMap.set(ws.id, { ws, tasks: [] });
      wsMap.get(ws.id).tasks.push(task);
    } else if (task.tags?.length) {
      const tag = task.tags[0];
      if (!tagMap.has(tag)) tagMap.set(tag, []);
      tagMap.get(tag).push(task);
    } else {
      uncat.push(task);
    }
  });

  const groups = [
    ...[...wsMap.values()].map(({ ws, tasks }) => ({ key: 'ws:' + ws.id, kind: 'ws', title: ws.task || 'Untitled Workstream', ws, tasks })),
    ...[...tagMap.entries()].map(([tag, tasks]) => ({ key: 'tag:' + tag, kind: 'tag', title: tag, tag, tasks })),
    ...(uncat.length ? [{ key: 'unfiled', kind: 'unfiled', title: 'Unfiled', tasks: uncat }] : []),
  ];

  const isLive = (t) => LIVE_STATUSES.has(t.status);
  const nextDue = (tasks) => tasks.filter((t) => isLive(t) && t.nextFollowUp).map((t) => t.nextFollowUp).sort()[0] || '9999';
  const byDue = (a, b) => nextDue(a.tasks).localeCompare(nextDue(b.tasks))
    || b.tasks.filter(isLive).length - a.tasks.filter(isLive).length;
  return {
    live: groups.filter((g) => g.tasks.some(isLive)).sort(byDue),
    done: groups.filter((g) => !g.tasks.some(isLive)),
  };
}

/**
 * What a group's header says, so a folded group can be judged without opening it: its open tasks
 * (ranked), the closed ones, the next due date, whether it holds a P1 that is overdue and mine, the
 * progress, and whether it should start open (only if my open work in it is due within a week or late).
 */
export function groupInfo(group, { me, now = new Date() } = {}) {
  const tod = todayISO(now);
  const in7 = (() => { const d = new Date(now); d.setDate(d.getDate() + 7); return todayISO(d); })();
  const { tasks } = group;
  const live = tasks.filter((t) => LIVE_STATUSES.has(t.status))
    .sort((a, b) => queueRank(a.priority, a.nextFollowUp, tod) - queueRank(b.priority, b.nextFollowUp, tod));
  const done = tasks.filter((t) => !LIVE_STATUSES.has(t.status));
  const next = live.map((t) => t.nextFollowUp).filter(Boolean).sort()[0];
  const fire = live.some((t) => t.priority === 'P1' && t.nextFollowUp && t.nextFollowUp < tod && isMine(t, me));
  const total = tasks.length;
  const pct = total ? Math.round((tasks.filter((t) => t.v3Status === 'completed').length / total) * 100) : 0;
  const wantsOpen = tasks.some((t) => LIVE_STATUSES.has(t.status) && t.nextFollowUp && t.nextFollowUp <= in7
    && (me ? isMine(t, me) : true));
  return { live, done, next, fire, total, pct, wantsOpen };
}
