'use client';

import { useMemo, useReducer, useRef } from 'react';
import { useStore } from '../../../store/useStore.js';
import { sbUpdate } from '../../../lib/rest.js';
import { setStatus } from '../../../lib/status.js';
import { patchTaskLocal } from '../../../lib/task-actions.js';
import { classifyQueue } from '../../../lib/classify.js';

/**
 * Classify state (port of the module state in the old classify.js). Same shape as Triage:
 * the queue is snapshotted on open, every pick is optimistic, a failure puts the task back
 * and says so, undo steps back one pick. (An empty snapshot is re-taken while the task list
 * is still arriving, as in useTriage.)
 *
 * The cards are copies of the store's tasks: a pick changes the copy, and the store through
 * patchTaskLocal, so the Matrix and Today see it at once. Rolling back restores both.
 */
export function useClassify() {
  const tasks = useStore((s) => s.tasks);
  const model = useRef(null);
  const [, bump] = useReducer((v) => v + 1, 0);

  if (model.current === null) {
    model.current = { queue: classifyQueue(tasks).map((t) => ({ ...t })), index: 0, history: [], snapTasks: tasks };
  } else if (model.current.queue.length === 0 && model.current.history.length === 0 && model.current.snapTasks !== tasks) {
    model.current.queue = classifyQueue(tasks).map((t) => ({ ...t }));
    model.current.snapTasks = tasks;
  }
  const m = model.current;

  const actions = useMemo(() => {
    /** Set a card's fields and mirror them into the store. */
    const apply = (t, fields) => {
      Object.assign(t, fields);
      patchTaskLocal(t.id, fields);
    };

    /**
     * Set the function (and company if it was missing) and clear the review flag. Picking a
     * function IS the human confirmation the flag was waiting for, so func_review clears in
     * the same write.
     */
    const pick = async (func, company) => {
      const s = model.current;
      const t = s.queue[s.index];
      if (!t) return;
      const before = { func: t.func, company: t.company, funcReview: t.funcReview };
      s.history.push({ t, before });

      apply(t, { func, ...(company ? { company } : {}), funcReview: false });
      s.index++;
      bump();

      try {
        await sbUpdate('entities', t.id, {
          func,
          ...(company ? { company } : {}),
          func_review: false,
          func_review_note: null,
        });
      } catch (e) {
        apply(t, before);
        s.history = s.history.filter((h) => h.t.id !== t.id);
        setStatus('error', `Could not classify "${(t.task || '').slice(0, 40)}": ${e.message}`);
        s.queue.splice(s.index, 0, t);
        bump();
      }
    };

    const undo = async () => {
      const s = model.current;
      const last = s.history.pop();
      if (!last) return;
      s.index = Math.max(0, s.index - 1);
      apply(last.t, last.before);
      bump();
      try {
        await sbUpdate('entities', last.t.id, {
          func: last.before.func || null,
          company: last.before.company || null,
          func_review: Boolean(last.before.funcReview),
        });
      } catch (e) {
        setStatus('error', 'Undo failed: ' + e.message);
      }
    };

    /** Setting the company first narrows the function list to that company's set. */
    const setCompany = (company) => {
      const s = model.current;
      const t = s.queue[s.index];
      if (!t) return;
      apply(t, { company });
      bump();
    };

    return { pick, undo, setCompany, skip: () => { model.current.index++; bump(); } };
  }, []);

  return {
    current: m.queue[m.index] ?? null,
    index: m.index,
    total: m.queue.length,
    finished: m.index >= m.queue.length,
    canUndo: m.history.length > 0,
    ...actions,
  };
}
