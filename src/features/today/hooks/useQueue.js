'use client';

import { useStore } from '../../../store/useStore.js';
import { buildToday, currentOwnerCode } from '../../../lib/today.js';
import { classifyQueue } from '../../../lib/classify.js';

/**
 * What is on my plate, derived at render time from the store's task list. Nothing is
 * cached: every write path updates `store.tasks`, so every write path is reflected here
 * by construction (see lib/queue.js for the bug that taught us this).
 *
 *   decisions   pending decisions about my work, or about nothing in particular
 *   p1Overdue   my overdue P1 tasks
 *   overdue     all my overdue tasks, most urgent first
 *   dueNext     my dated, not-yet-late tasks
 *   team        per-owner load, excluding me
 *   toClassify  open tasks missing a company or function, or flagged for review
 * and, for the screen: me, undated, unowned.
 */
export function useQueue() {
  const tasks = useStore((s) => s.tasks);
  const decisions = useStore((s) => s.decisions);
  const entityLinks = useStore((s) => s.entityLinks);
  const access = useStore((s) => s.access);

  const me = currentOwnerCode(access);
  const today = buildToday({ tasks, decisions, entityLinks, me });
  return { ...today, dueNext: today.dueSoon, toClassify: classifyQueue(tasks) };
}
