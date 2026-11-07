'use client';

import { taskActions } from '../../../lib/task-actions.js';

/**
 * { markDone(id), pushWeek(id), pushDays(id, n), setStatus(id, status, opts?), reassign(id, personCode),
 *   setWorkstreamStatus(wsId, status), saveTask(task), deleteTask(id) }
 *
 * Optimistic: the store changes first (the queue is derived from it, so a row moves or
 * disappears at once), the REST write follows, and on failure the change is put back and
 * an error is set in the status bar. A view-only user's writes are refused before any
 * request, with the "view-only" sentence. The object is stable across renders.
 */
export function useTaskActions() {
  return taskActions;
}
