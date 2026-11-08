'use client';

import { useCallback, useMemo } from 'react';
import { useStore } from '../../../store/useStore.js';
import { useAccess } from '../../../hooks/useAccess.js';
import { applyEscalationAction, raiseEscalation, setReportsTo } from '../../../lib/escalation-actions.js';
import { loadEscalations } from '../../../lib/load-data.js';
import { splitEscalations } from '../model.js';

/**
 * The escalations and what the signed-in person can do with them.
 *   escalations        every row (newest first)
 *   waiting/raised/open/closed   the four lists of the sub-views
 *   escalate(taskId, f)   raise one: f = { to, reason, notes?, email? } (a bare string is taken as the notes)
 *   resolve(id, note)     resolve (the note says what was decided)
 *   push(id, to, note?)   escalate further up
 *   withdraw(id, note?)   withdraw (the roadblock cleared)
 * Each action resolves to { ok, error? } and writes nothing for a view-only user (rest.js refuses first).
 */
export function useEscalations() {
  const escalations = useStore((s) => s.escalations);
  const error = useStore((s) => s.escalationsError);
  const loaded = useStore((s) => s.escalationsLoaded);
  const { access, canWrite, isAdmin } = useAccess();
  const me = access?.person_code || null;

  const lists = useMemo(() => splitEscalations(escalations, me), [escalations, me]);

  const escalate = useCallback((taskId, f) => raiseEscalation({ taskId, ...(typeof f === 'string' ? { notes: f } : f) }), []);
  const resolve = useCallback((id, note) => applyEscalationAction('resolve', id, { note }), []);
  const push = useCallback((id, to, note) => applyEscalationAction('push', id, { to, note }), []);
  const withdraw = useCallback((id, note) => applyEscalationAction('withdraw', id, { note }), []);

  return {
    escalations, error, loaded, me, canWrite, isAdmin, ...lists,
    escalate, resolve, push, withdraw, setReportsTo, reload: loadEscalations,
  };
}

/** How many open escalations wait on me: the sidebar's count. */
export function useWaitingCount() {
  return useStore((s) => {
    const me = s.access?.person_code;
    return me ? s.escalations.filter((e) => e.status === 'open' && e.assigned_to === me).length : 0;
  });
}
