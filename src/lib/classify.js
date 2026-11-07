/* classify.js — the pure half of Classify: which tasks need a company / function, and what
 * to offer. Port of classifyQueue / funcsFor / the "why" line of rie-dashboard2/js/classify.js.
 *
 * The vocabulary comes from the task_functions registry (registry.js) at runtime, never
 * from a list here.
 */
import { companiesOf, activeFuncsOf } from './registry.js';

const OPEN_DISPLAY = ['Pending', 'In Progress', 'On Hold'];

/** Everything that needs a human to look at it, worst first. */
export function classifyQueue(tasks = []) {
  return tasks
    .filter((t) => !t.archivedAt
      && OPEN_DISPLAY.includes(t.status)
      && (t.funcReview || !t.func || !t.company))
    // Untagged before merely flagged: a task with no function at all is
    // invisible to the Matrix, which is worse than one filed on thin evidence.
    .sort((a, b) => {
      const ax = (!a.func || !a.company) ? 0 : 1;
      const bx = (!b.func || !b.company) ? 0 : 1;
      if (ax !== bx) return ax - bx;
      return (a.priority || 'P9').localeCompare(b.priority || 'P9');
    });
}

export const classifyCount = (tasks) => classifyQueue(tasks).length;

/** Why this card is here. */
export function classifyReason(t) {
  return !t.func ? 'No function set'
    : !t.company ? 'No company set'
    : (t.funcReviewNote || 'Filed on thin evidence and never confirmed');
}

/** The functions to offer for a task. A company with its own active set gets that set;
 *  with no company yet we cannot know, so offer the union and let the pick set both. */
export function funcsFor(t, rows = []) {
  const c = t.company || null;
  if (c) return activeFuncsOf(rows, c) || [];
  const all = new Set();
  companiesOf(rows).forEach((co) => activeFuncsOf(rows, co).forEach((f) => all.add(f)));
  return [...all].sort();
}

/** Number keys pick a function by position: 1-9 then 0 for the tenth. */
export const keyToIndex = (k) => (k === '0' ? 9 : Number(k) - 1);
