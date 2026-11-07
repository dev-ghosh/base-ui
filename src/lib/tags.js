/* tags.js — the tags a task shows and filters on. Port of the task half of
 * rie-dashboard2/js/tags.js (computeTaskTags, allTags). The contact half (computeContactTags,
 * tagClass, the stored-tag pool) comes with Contacts (Task 11); it will take an entity type again.
 *
 * Pure: `now` is a parameter (the old code read the clock inside), so a test can pin the day.
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
