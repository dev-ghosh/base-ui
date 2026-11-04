/* queue.js — what is on someone's plate, derived from what is already in memory.
 *
 * WHY THIS REPLACED A FETCHED ARRAY
 * ---------------------------------
 * Today and Triage used to read `state.queue`, a separate array fetched from
 * v_task_queue. It had exactly two writers: the initial load, and the realtime
 * handler. Every direct user action bypassed both.
 *
 * Measured 2026-09-07: editing a task from Today and saving it wrote
 * `next_follow_up = 2027-03-15` to the database and to `state.tasks`, and Today
 * carried on rendering "107d late". Dragging a card on the Board did the same.
 * The data was right everywhere except the screen the user was looking at.
 *
 * Deriving the queue at render time removes the cache, and with it the whole
 * class of bug: every write path already updates `state.tasks`, so every write
 * path is now correct by construction, including ones not written yet.
 *
 * v_task_queue still exists and is still the definition of record for anything
 * server-side. `tests/queue-parity.test.mjs` asserts this function and that view
 * agree row for row, so the two cannot drift.
 */
import { DISPLAY_TO_V3, OPEN_STATUSES } from './vocab.js';

const OPEN = new Set(OPEN_STATUSES);

/** Local YYYY-MM-DD. toISOString() would roll over a day early in +05:30. */
export function todayISO(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function daysBetween(fromISO, toISO) {
  const a = Date.parse(fromISO + 'T00:00:00Z');
  const b = Date.parse(toISO + 'T00:00:00Z');
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((b - a) / 86400000);
}

/**
 * The ordering, kept identical to the `queue_rank` expression in
 * supabase/migrations/20260906_task_queue_owner_fallback.sql:
 *   1. P1 before P2 before P3, everything else last.
 *   2. Older due date first.
 *   3. No due date sorts last. 77 open tasks have none, and putting a missing
 *      date at the front would bury everything genuinely late.
 */
export function queueRank(priority, dueDate, today) {
  const p = priority === 'P1' ? 0 : priority === 'P2' ? 1 : priority === 'P3' ? 2 : 3;
  const datePart = !dueDate
    ? 999999
    : Math.max(0, 99999 - Math.min(99999, daysBetween(dueDate, today) ?? 0));
  return p * 1000000 + datePart;
}

/**
 * Derive the open-work queue from in-memory task entities.
 *
 * @param {Array} tasks  state.tasks (rowToEntity shape)
 * @returns {Array} rows shaped like v_task_queue, sorted by queue_rank
 */
export function buildQueue(tasks = [], now = new Date()) {
  const today = todayISO(now);

  return tasks
    .filter(t => !t.archivedAt && OPEN.has(DISPLAY_TO_V3[t.status] || t.status))
    .map(t => {
      const due = t.nextFollowUp || null;
      // Mirrors the view's COALESCE(owner_code, owner_label, legacy name).
      // rowToEntity already collapses the last two into `assignedTo`: when
      // ownerCode is empty, assignedTo IS the raw legacy string.
      const owner = t.ownerCode || t.assignedTo || null;
      const co_owners = (t.coOwnerCodes || []).filter(c => c && c !== owner);
      const overdue = Boolean(due) && due < today;
      return {
        id:              t.id,
        title:           t.task || '',
        status:          DISPLAY_TO_V3[t.status] || t.status,
        priority:        t.priority || null,
        company:         t.company || null,
        func:            t.func || null,
        func_review:     Boolean(t.funcReview),
        contact_name:    t.contactName || null,
        action_item:     t.actionItem || null,
        due_date:        due,
        end_date:        t.endDate || null,
        owner,
        co_owners,
        unowned:         !owner,
        owner_is_legacy: !t.ownerCode && Boolean(t.assignedTo),
        overdue,
        days_overdue:    due ? daysBetween(due, today) : null,
        queue_rank:      queueRank(t.priority, due, today),
      };
    })
    .sort((a, b) => a.queue_rank - b.queue_rank
      || String(a.due_date || '9999').localeCompare(String(b.due_date || '9999')));
}
