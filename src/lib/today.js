/* today.js — the pure logic behind Today and Triage. Port of the data half of
 * rie-dashboard2/js/today.js and the queue / date helpers of js/triage.js.
 *
 * Everything here is derived from the lists you pass in (the store's `tasks`,
 * `decisions`, `entityLinks`); nothing is cached. See queue.js for why: a queue held
 * in a second array silently ignored every edit the user made.
 *
 * Plain JS with relative imports so plain Node can run it.
 */
import { buildQueue, todayISO } from './queue.js';
import { isMine, mineSet } from './scope.js';

/** The cap is the point. Showing a person 90 overdue tasks produces no work;
 *  showing five and a button that says "Triage the other 85" produces both. */
export const SHOW = 5;

/** Local ISO date n days from `now`. toISOString() would shift across midnight in +05:30. */
export function addDaysISO(n, now = new Date()) {
  const d = new Date(now);
  d.setDate(d.getDate() + n);
  return todayISO(d);
}

/** Next Monday, so "next week" means a week that has actually started. */
export function nextMondayISO(now = new Date()) {
  const d = new Date(now);
  d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7));
  return todayISO(d);
}

/** The signed-in user's person code (from rie_my_access), or null if no one bound one. Never a guess. */
export const currentOwnerCode = (access) => access?.person_code || null;

/** Per-owner load for the collapsed Team section. Excludes me. */
function teamLoad(q, me) {
  const by = new Map();
  for (const t of q) {
    if (t.unowned) continue;
    // Owner and every co-owner: a shared task is on each of their plates.
    for (const person of [t.owner, ...(t.co_owners || [])]) {
      if (!person || person === me) continue;
      const row = by.get(person) || { owner: person, open: 0, overdue: 0, p1: 0 };
      row.open++;
      if (t.overdue) row.overdue++;
      if (t.priority === 'P1') row.p1++;
      by.set(person, row);
    }
  }
  return [...by.values()].sort((a, b) => b.overdue - a.overdue);
}

/** Everything Today needs, computed once so the sections cannot disagree. */
export function buildToday({ tasks = [], decisions = [], entityLinks = [], me = null, now = new Date() } = {}) {
  const q = buildQueue(tasks, now);
  const mine = q.filter((t) => isMine(t, me));

  const overdue = mine.filter((t) => t.overdue);
  // Today is about me, so its decisions are the ones Decide shows under Mine:
  // about my task, workstream or initiative, or about nothing in particular.
  const ids = me ? mineSet(tasks, entityLinks, me) : null;
  const mineDecisions = decisions.filter((d) => !ids || d.entityId == null || d.entityId === '' || ids.has(String(d.entityId)));
  return {
    me,
    decisions: mineDecisions,
    p1Overdue: overdue.filter((t) => t.priority === 'P1'),
    overdue,
    dueSoon: mine.filter((t) => !t.overdue && t.due_date),
    undated: mine.filter((t) => !t.due_date),
    team: teamLoad(q, me),
    unowned: q.filter((t) => t.unowned),
  };
}

/* ── decision rows ─────────────────────────────────────────────────────────── */

/** What a decision is ABOUT: the entity it was raised against, else the signal. */
export function decisionSubject(d, tasks = []) {
  const id = String(d.entityId ?? '');
  const hit = tasks.find((t) => String(t.id) === id);
  return hit?.task || (d.signalCode ? d.signalCode.replace(/_/g, ' ') : 'Decision');
}

const DECISION_MAX = 170;

/** The decision itself, trimmed to something readable in a row (shouted lead-ins dropped). */
export function decisionQuestion(d) {
  let q = (d.question || '').trim();
  q = q.replace(/^[A-Z][A-Z ,'"-]{6,}[—:-]\s*/, '');   // strip a shouted lead-in
  if (!q) return d.recommendedAction || 'Decision';

  // Prefer a sentence boundary, but only one that actually shortens the text to
  // something a row can hold.
  for (const m of q.matchAll(/[.?]\s/g)) {
    if (m.index >= 60) { q = q.slice(0, m.index + 1); break; }
  }
  if (q.length > DECISION_MAX) q = q.slice(0, DECISION_MAX).replace(/\s+\S*$/, '') + '…';
  return q;
}

/** How long it has been waiting. */
export function decisionAge(d, now = Date.now()) {
  if (!d.raisedAt) return '';
  const days = Math.floor((now - Date.parse(d.raisedAt)) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return '1d';
  return `${days}d`;
}

/** One line about the shape of the week, including what went right. */
export function weekShape(d, tasks = [], now = new Date()) {
  const t0 = todayISO(now);
  const t7 = addDaysISO(7, now);
  const mineOpen = d.overdue.length + d.dueSoon.length + d.undated.length;
  const dueWeek = d.dueSoon.filter((t) => t.due_date <= t7).length;
  const closedToday = tasks.filter((t) => t.status === 'Completed' && isMine(t, d.me)
    && String(t.closedAt || t.updatedAt || '').slice(0, 10) === t0).length;
  return { mineOpen, dueWeek, closedToday };
}

/* ── navigation out of Today (todayGoto) ───────────────────────────────────── */

/**
 * Where a Today row leads. The old function switched tab / scope / surface / filter in
 * code; each is now a URL. The Matrix filters on the DISPLAY name, so `owner` takes it.
 *   decisions -> Initiatives (that is where the decision queue is rendered)
 *   owner     -> Matrix, scope everyone (an owner filter under Mine would show nothing)
 *   unowned   -> Matrix, scope team (unowned work is a team fact)
 */
export function todayHref(kind, value = '') {
  switch (kind) {
    case 'decisions': return '/work/initiatives';
    case 'owner': return `/work/matrix?scope=everyone&o=${encodeURIComponent(value)}`;
    case 'unowned': return '/work/matrix?scope=team';
    default: return '/work';
  }
}

/* ── triage ────────────────────────────────────────────────────────────────── */

/** The overdue backlog, most urgent first, as a fresh array (the caller keeps it as its snapshot). */
export function triageQueue(tasks = [], me = null, scope = 'mine', now = new Date()) {
  return buildQueue(tasks, now)
    .filter((t) => t.overdue)
    .filter((t) => (scope === 'all' || !me) ? true : isMine(t, me));
}
