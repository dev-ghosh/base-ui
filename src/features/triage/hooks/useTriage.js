'use client';

import { useEffect, useMemo, useReducer, useRef } from 'react';
import { useStore } from '../../../store/useStore.js';
import { DISPLAY_TO_V3 } from '../../../lib/vocab.js';
import { addDaysISO, currentOwnerCode, nextMondayISO, triageQueue } from '../../../lib/today.js';
import { writeTaskPatch } from '../../../lib/task-actions.js';

export const UNDO_MS = 10000;

// Each outcome is the same PATCH /entities the task form issues: no new endpoint, no new privilege.
const PATCHES = {
  done: () => ({ status: DISPLAY_TO_V3.Completed || 'completed' }),
  drop: () => ({ status: DISPLAY_TO_V3.Dropped || 'dropped' }),
  tomorrow: () => ({ next_follow_up: addDaysISO(1) }),
  nextWeek: () => ({ next_follow_up: nextMondayISO() }),
  nextMonth: () => ({ next_follow_up: addDaysISO(30) }),
};
/** 1 / 2 / 3 -> tomorrow / next week (Monday) / next month (+30 days). */
const PUSH = { 1: 'tomorrow', 2: 'nextWeek', 3: 'nextMonth' };

/**
 * Triage state (port of the module state in the old triage.js).
 *
 * The queue is SNAPSHOTTED when Triage opens and deliberately not live, so it never
 * re-sorts under the user's hands; the only live part is the store, which each write
 * updates once it lands. One exception: a snapshot that is still empty is taken again when
 * the task list changes, because a direct visit to /today/triage can open before the data
 * has arrived. Once there is a card the queue is frozen.
 *
 * Every outcome is optimistic: the card advances at once and the write follows. A failed
 * write puts the card back where it was and says so. Undo lasts ten seconds from the last
 * render (an action, a skip, an undo), as in the old file.
 *
 * @param {'mine'|'all'} scope
 */
export function useTriage(scope = 'mine') {
  const tasks = useStore((s) => s.tasks);
  const me = currentOwnerCode(useStore((s) => s.access));
  const model = useRef(null);
  const [version, bump] = useReducer((v) => v + 1, 0);

  if (model.current === null) {
    model.current = { queue: triageQueue(tasks, me, scope), index: 0, history: [], snapTasks: tasks };
  } else if (model.current.queue.length === 0 && model.current.history.length === 0 && model.current.snapTasks !== tasks) {
    model.current.queue = triageQueue(tasks, me, scope);
    model.current.snapTasks = tasks;
  }
  const m = model.current;

  // The ten seconds restart on every re-render the model asked for (the old render() reset its timer).
  const canUndo = m.history.length > 0;
  useEffect(() => {
    if (!canUndo) return undefined;
    const id = setTimeout(() => { model.current.history = []; bump(); }, UNDO_MS);
    return () => clearTimeout(id);
  }, [version, canUndo]);

  const actions = useMemo(() => {
    const act = async (kind) => {
      const s = model.current;
      const task = s.queue[s.index];
      if (!task) return;
      const patch = PATCHES[kind]?.();
      if (!patch) return;

      const before = { status: task.status, next_follow_up: task.due_date };
      s.history.push({ task, patch, before });
      s.index++;
      bump();

      const ok = await writeTaskPatch(task.id, patch, {
        optimistic: false,
        failMsg: (e) => `Could not update "${(task.title || '').slice(0, 40)}": ${e.message}`,
      });
      if (!ok) {
        // Put it back where the user left it and say so. A silent failure here would mean
        // triaging the same task again next week with no idea why.
        s.history = s.history.filter((h) => h.task.id !== task.id);
        s.queue.splice(s.index, 0, task);
        bump();
      }
    };

    /** Step back and restore the previous values explicitly, so it is idempotent even if the
     *  realtime echo of the original write has already landed. */
    const undo = async () => {
      const s = model.current;
      const last = s.history.pop();
      if (!last) return;
      s.index = Math.max(0, s.index - 1);
      bump();
      await writeTaskPatch(last.task.id, {
        status: last.before.status,
        next_follow_up: last.before.next_follow_up || null,
      }, { optimistic: false, failMsg: (e) => 'Undo failed: ' + e.message });
    };

    return {
      act,
      undo,
      done: () => act('done'),
      drop: () => act('drop'),
      push: (days) => act(PUSH[days]),
      skip: () => { model.current.index++; bump(); },
    };
  }, []);

  return {
    current: m.queue[m.index] ?? null,
    index: m.index,
    total: m.queue.length,
    remaining: Math.max(0, m.queue.length - m.index),
    finished: m.index >= m.queue.length,
    canUndo,
    ...actions,
  };
}
