// Escalations: the pure parts. Port of the constants, the filters, the payload builders and the little
// formatters of rie-dashboard2/js/escalations.js. No DOM, no React, no store: importable in Node.
//
// What an escalation is: a task is stuck and its owner cannot unstick it. They hand it to a named person with
// a reason; that person resolves it, passes it further up (up to MAX_LEVEL steps), or the raiser withdraws it.
// Every hop is kept on the row's `trail`. The rows are public.escalations (raw snake_case rows).

export const MAX_LEVEL = 4;
export const LEVEL_NAME = { 1: 'Raised', 2: 'Escalated', 3: 'Senior review', 4: 'Final stop' };

export const ESCALATION_REASONS = [
  'Blocked by an external dependency',
  'Needs a senior decision or approval',
  'Deadline at risk',
  'Needs budget or resources',
  'Technical roadblock',
  'Other',
];

/** The four sub-views, in tab order: [segment, label]. Segments are the routes /escalations/<segment>. */
export const VIEWS = [
  ['waiting', 'Waiting on me'],
  ['raised', 'Raised by me'],
  ['open', 'All open'],
  ['closed', 'Closed'],
];
export const VIEW_KEYS = VIEWS.map(([k]) => k);

/** [title, line] of the empty state of each view. */
export const EMPTY = {
  waiting: ['Nothing is waiting on you', 'When someone escalates a task to you it appears here, and you get an alert.'],
  raised: ['You have not escalated anything', 'If a task is stuck, use “Escalate a task” and name who can unblock it.'],
  open: ['No open escalations', 'Every task is moving. That is the goal.'],
  closed: ['Nothing closed yet', 'Resolved and withdrawn escalations are kept here as a record.'],
};

/** The words for the action dialog, by kind. */
export const ACTION_TITLE = { resolve: 'Resolve this escalation', push: 'Escalate further', withdraw: 'Withdraw this escalation' };
export const ACTION_GO = { resolve: 'Mark resolved', push: 'Escalate', withdraw: 'Withdraw' };
export const ACTION_PLACEHOLDER = {
  resolve: 'What was decided?', push: 'Why does this need to go higher?', withdraw: 'Why is it no longer needed?',
};
export function actionHelp(kind, e) {
  return {
    resolve: 'Say what was decided. The task goes back to where it was before it was put on hold.',
    push: `This moves it up to step ${Math.min(e.level + 1, MAX_LEVEL)} of ${MAX_LEVEL} and tells the next person.`,
    withdraw: 'Use this if the roadblock cleared by itself. The task goes back to where it was.',
  }[kind];
}

const CLOSED_TASK = new Set(['Completed', 'Dropped']);
const sameId = (a, b) => a != null && b != null && String(a) === String(b);

/* ── the lists ─────────────────────────────────────────────────────────────── */

export const openEscalations = (list) => (list || []).filter((e) => e.status === 'open');
export const waitingOnMe = (list, me) => openEscalations(list).filter((e) => !!me && e.assigned_to === me);
export const raisedByMe = (list, me) => openEscalations(list).filter((e) => !!me && e.raised_by === me);
export const closedEscalations = (list) => (list || []).filter((e) => e.status !== 'open');

/** The four lists and their counts for the tabs. */
export function splitEscalations(list, me) {
  const waiting = waitingOnMe(list, me);
  const raised = raisedByMe(list, me);
  const open = openEscalations(list);
  const closed = closedEscalations(list);
  return { waiting, raised, open, closed };
}

/** Where /escalations goes: Waiting on me when anything waits on me, else All open. */
export const defaultView = (list, me) => (waitingOnMe(list, me).length ? 'waiting' : 'open');

/** "just now" / "5m ago" / "3h ago" / "yesterday" / "4d ago". */
export function ago(iso, now = Date.now()) {
  const m = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000));
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  if (m < 1440) return `${Math.round(m / 60)}h ago`;
  const d = Math.round(m / 1440);
  return d === 1 ? 'yesterday' : `${d}d ago`;
}

/** One line of the history: the verb for a trail action. */
export const TRAIL_VERB = { raised: 'raised this to', escalated: 'passed it to', resolved: 'resolved it', withdrawn: 'withdrew it' };

/* ── who to send it to ─────────────────────────────────────────────────────── */

/**
 * The next person up from `fromCode`: their reporting line first, then an admin. Never the same person,
 * never anyone already on the trail.
 * @param {object[]} people  public.people rows
 * @param {string[]} adminCodes  person codes of the active admins
 */
export function nextUpFrom(people, fromCode, avoid, adminCodes) {
  const skip = new Set([fromCode, ...(avoid || [])].filter(Boolean));
  const boss = (people || []).find((p) => p.code === fromCode)?.reports_to;
  if (boss && !skip.has(boss)) return boss;
  return (adminCodes || []).find((c) => !skip.has(c)) || null;
}

/** The suggestion line under "Who should handle it?". */
export function suggestionHint(to, me, people, nameOf) {
  if (!to) return 'No reporting line is set for you, so choose who should handle it.';
  const line = (people || []).find((p) => p.code === me)?.reports_to === to ? ' (your reporting line)' : ' (an admin)';
  return `Suggested: ${nameOf(to)}${line}.`;
}

/** The people the recipient list offers: internal, not excluded. `internal` is internalPeople(). */
export const recipientsOf = (internal, exclude = []) => {
  const skip = new Set(exclude.filter(Boolean));
  return internal.filter((p) => !skip.has(p.code));
};

/* ── raising ───────────────────────────────────────────────────────────────── */

/**
 * The tasks the picker offers when no task was fixed: open tasks without an open escalation, mine first
 * (owner or co-owner), P1 first, then by title; the rest are capped at 150.
 */
export function pickableTasks(tasks, escalations, me) {
  const open = (tasks || []).filter((t) => !CLOSED_TASK.has(t.status)
    && !openEscalations(escalations).some((e) => sameId(e.entity_id, t.id)));
  const rank = (t) => (t.priority === 'P1' ? 0 : 1);
  const mine = open.filter((t) => me && (t.ownerCode === me || (t.coOwnerCodes || []).includes(me)));
  const rest = open.filter((t) => !mine.includes(t));
  const byRank = (a, b) => rank(a) - rank(b) || String(a.task).localeCompare(String(b.task));
  return { mine: mine.sort(byRank), rest: rest.sort(byRank).slice(0, 150) };
}

/** What the form checks before it writes. @returns {string} the message, or '' when it is fine */
export function raiseProblem({ taskId, to, me, task }) {
  if (!taskId) return 'Choose the task first.';
  if (!to) return 'Choose who should handle it.';
  if (to === me) return 'An escalation has to go to someone else.';
  if (!task) return 'That task is no longer available. Refresh and try again.';
  return '';
}

/** The row inserted into public.escalations (level 1, trail with the "raised" hop). */
export function escalationInsert({ task, me, to, reason, notes, previousStatus, now }) {
  return {
    entity_id: Number(task.id),
    task_title: task.task || 'Untitled task',
    raised_by: me,
    assigned_to: to,
    level: 1,
    reason,
    notes: notes || null,
    previous_status: previousStatus,
    trail: [{ at: now, by: me, action: 'raised', to, note: notes || reason }],
  };
}

/** The sentence for a refused insert: a second open escalation on one task has its own. */
export function raiseErrorText(message) {
  return /duplicate key|escalations_one_open/i.test(message || '')
    ? 'This task already has an open escalation.'
    : String(message || '').replace(/^INSERT escalations failed: /, '');
}

/* ── moving an open escalation: resolve / push up / withdraw ───────────────── */

/**
 * The PATCH for one action, or the sentence for why it cannot be made.
 * @returns {{patch: object}|{error: string}}
 */
export function actionPatch(kind, e, { me, note, to, now }) {
  if (kind === 'push') {
    if (!to) return { error: 'Choose who it goes to.' };
    if (e.level >= MAX_LEVEL) return { error: 'This is already at the final step.' };
    return {
      patch: {
        assigned_to: to, level: e.level + 1,
        trail: [...(e.trail || []), { at: now, by: me, action: 'escalated', to, note: note || null }],
      },
    };
  }
  if (kind === 'resolve' && !note) return { error: 'Add a line on what was decided.' };
  return {
    patch: {
      status: kind === 'resolve' ? 'resolved' : 'withdrawn',
      resolution: note || null, resolved_by: me, resolved_at: now,
      trail: [...(e.trail || []), { at: now, by: me, action: kind === 'resolve' ? 'resolved' : 'withdrawn', note: note || null }],
    },
  };
}

export const actionErrorText = (message) => String(message || '').replace(/^UPDATE escalations failed: /, '');

/** What status the held task goes back to when its escalation closes (never back onto hold). */
export const statusAfterRelease = (e) => (e.previous_status && e.previous_status !== 'on_hold' ? e.previous_status : 'in_progress');

/** Who may act on / withdraw an open escalation (the old card()). */
export function cardRights(e, { me, canWrite, isAdmin }) {
  const open = e.status === 'open';
  const withMe = open && e.assigned_to === me;
  const mine = e.raised_by === me;
  return {
    open,
    withMe,
    canAct: open && canWrite && (withMe || isAdmin),
    canWithdraw: open && canWrite && (mine || isAdmin),
  };
}
