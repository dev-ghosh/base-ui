/* tags.js — the tags a task or a contact shows and filters on. Port of rie-dashboard2/js/tags.js:
 * the task half (computeTaskTags, allTags) and the contact half (computeContactTags,
 * allContactTags, contactTagClass, tagPool). The old functions took an entity type ('contact' |
 * 'task'); here each kind has its own function. The DOM half (toggleTag, clearTagFilter,
 * renderTagFilterBar) became the `tg` search param and the TagFilterBar component.
 *
 * Pure: `now` (and, for contacts, `tasks`) are parameters (the old code read the clock and
 * state.tasks inside), so a test can pin the day.
 * Relative imports with explicit .js extensions so plain Node can import it.
 */
import { parseD } from './format.js';

const TASK_CLOSED = new Set(['Completed', 'Dropped']);
const TASK_PAUSED = new Set(['On Hold']);

/** The tags derived from a task's fields. */
export function computeTaskTags(t, now = new Date()) {
  const tags = [];
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  const status = t.status || 'Pending';
  const isClosed = TASK_CLOSED.has(status);
  const isPaused = TASK_PAUSED.has(status);

  if (t.priority) tags.push(t.priority);

  // Date tags only meaningful while the task is still being worked
  if (!isClosed && !isPaused) {
    if (t.nextFollowUp) {
      const d = parseD(t.nextFollowUp);
      if (d) {
        d.setHours(0, 0, 0, 0);
        if (d < today) tags.push('Overdue');
        else if (d.getTime() === today.getTime()) tags.push('Due Today');
      }
    } else {
      tags.push('No Date');
    }
  }

  // Symmetric status tagging (skip 'Pending': it's the default column header)
  if (status !== 'Pending') tags.push(status);

  if (t.recurrenceRule?.trim()) tags.push('Recurring');
  // Unassigned only matters while the task is actionable
  if (!t.assignedTo?.trim() && !isClosed) tags.push('Unassigned');
  // Project is already shown on the card meta row: skip a duplicate tag
  if (t.category?.trim()) tags.push(t.category.trim());

  return tags;
}

/** Computed + stored tags. A stored tag overrides a computed one that differs only by case. */
export function allTags(task, now = new Date()) {
  const computed = computeTaskTags(task, now);
  const stored = Array.isArray(task.tags) ? task.tags : [];
  const map = new Map();
  computed.forEach((t) => map.set(t.toLowerCase(), t));
  stored.forEach((t) => map.set(t.toLowerCase(), t));
  return [...map.values()];
}

/* ── contacts ────────────────────────────────────────────────────────────── */

/** The tags derived from a contact's fields. `tasks` is the task list (the old state.tasks). */
export function computeContactTags(c, now = new Date(), tasks = []) {
  const tags = [];
  const today = new Date(now); today.setHours(0, 0, 0, 0);

  if (c.priority) tags.push('Priority-' + c.priority);

  if (c.warmthMode) tags.push(c.warmthMode);

  if (c.nextFollowUp) {
    const d = parseD(c.nextFollowUp);
    if (d) {
      d.setHours(0, 0, 0, 0);
      if (d < today) tags.push('Overdue');
      else if (d.getTime() === today.getTime()) tags.push('Due Today');
    }
  } else {
    tags.push('No Follow-up');
  }

  if (c.lastMtg) {
    const d = parseD(c.lastMtg);
    if (d && (today - d) / 86400000 > 90) tags.push('Stale');
  } else {
    tags.push('Never Met');
  }

  const hasActive = tasks.some(
    (t) => t.contactId === c.id && t.status !== 'Completed' && t.status !== 'Dropped',
  );
  if (hasActive) tags.push('Has Tasks');

  if (c.nextStep?.trim()) tags.push('Action Pending');

  if (c.category?.trim()) tags.push(c.category.trim());
  if (c.location?.trim()) tags.push('Loc: ' + c.location.trim());
  if (c.source?.trim()) tags.push(c.source.trim());

  return tags;
}

/** Computed + stored tags of a contact. A stored tag overrides a computed one that differs only by case. */
export function allContactTags(c, now = new Date(), tasks = []) {
  const computed = computeContactTags(c, now, tasks);
  const stored = Array.isArray(c.tags) ? c.tags : [];
  const map = new Map();
  computed.forEach((t) => map.set(t.toLowerCase(), t));
  stored.forEach((t) => map.set(t.toLowerCase(), t));
  return [...map.values()];
}

/** CSS class of a contact's tag chip: `tag-rule` when it is derived, `tag-stored` when typed in. */
export function contactTagClass(c, tag, now = new Date(), tasks = []) {
  const isComputed = computeContactTags(c, now, tasks).some((t) => t.toLowerCase() === tag.toLowerCase());
  return isComputed ? 'tag-rule' : 'tag-stored';
}

/** Every stored tag on any contact or task, sorted (the old getAllTagPool, for autocomplete). */
export function tagPool(contacts = [], tasks = []) {
  const all = new Set();
  contacts.forEach((c) => (c.tags || []).forEach((t) => all.add(t)));
  tasks.forEach((t) => (t.tags || []).forEach((t2) => all.add(t2)));
  return [...all].sort();
}
