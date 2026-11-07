'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { store } from '../../../../store/store.js';
import { assertCanWrite } from '../../../../lib/rest.js';
import { setStatus } from '../../../../lib/status.js';
import { useTaskActions } from '../../../tasks/hooks/useTaskActions.js';

const sameId = (a, b) => a != null && b != null && String(a) === String(b);

/**
 * Bulk mode for the Board and Hierarchy (js/bulk-ops.js): turn it on, tick tasks, then change all
 * their status or hand them to one person. Component state, not a route (spec C7 rule 5).
 *
 *   mode, selected (Set of task ids), count
 *   toggleMode()          toggleTaskBulkMode: flips the mode and always starts from an empty selection
 *   toggle(id)            toggleTaskSelect
 *   selectAll(ids)        selectAllVisibleTasks (see the note in the report: the ids passed are the visible ones)
 *   clear()               clearTaskSelection
 *   changeStatus(status)  batchChangeStatus: one status PATCH per task, in order
 *   reassign(code)        batchReassign: one owner_code PATCH per task, in order
 *
 * Both batches write through useTaskActions (optimistic, rolled back per task on failure), so the
 * lists move at once and no reload is needed. A view-only user is refused up front with the
 * assertCanWrite sentence, before any request.
 */
export function useBulk() {
  const actions = useTaskActions();
  const [mode, setMode] = useState(false);
  const [selected, setSelected] = useState(() => new Set());
  const busy = useRef(false);

  const toggleMode = useCallback(() => { setMode((m) => !m); setSelected(new Set()); }, []);
  const toggle = useCallback((id) => setSelected((s) => {
    const next = new Set(s);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  }), []);
  const selectAll = useCallback((ids) => setSelected((s) => new Set([...s, ...ids])), []);
  const clear = useCallback(() => setSelected(new Set()), []);

  const batch = useCallback(async (verb, doOne) => {
    const ids = [...selected];
    if (!ids.length || busy.current) return;
    try { assertCanWrite(); } catch (e) { setStatus('error', e.message); return; }
    busy.current = true;
    try {
      setStatus('syncing', `${verb.ing} ${ids.length} tasks...`);
      let success = 0;
      let failed = 0;
      for (const id of ids) {
        if (await doOne(id)) success++; else failed++;
      }
      setStatus(failed > 0 ? 'error' : 'online', `${verb.done} ${success} tasks${failed > 0 ? ` (${failed} failed)` : ''}`);
      setSelected(new Set());
    } finally {
      busy.current = false;
    }
  }, [selected]);

  const changeStatus = useCallback((newStatus) => batch(
    { ing: 'Updating', done: 'Updated' },
    // A task already at that status needs no write; it is not a failure.
    async (id) => {
      const t = store.getState().tasks.find((x) => sameId(x.id, id));
      if (t && t.status === newStatus) return true;
      return actions.setStatus(id, newStatus, { notes: 'Bulk edit' });
    },
  ), [batch, actions]);

  const reassign = useCallback((personCode) => batch(
    { ing: 'Reassigning', done: 'Reassigned' },
    (id) => actions.reassign(id, personCode),
  ), [batch, actions]);

  return useMemo(() => ({
    mode, selected, count: selected.size, toggleMode, toggle, selectAll, clear, changeStatus, reassign,
  }), [mode, selected, toggleMode, toggle, selectAll, clear, changeStatus, reassign]);
}
