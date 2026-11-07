'use client';

import { useMemo } from 'react';
import { leadActions } from '../../../lib/lead-actions.js';
import { useLeadForm } from './useLeadForm.js';

/**
 * { saveLead(data), moveStage(id, stage), addTouchpoint(id, { type, notes, next }), deleteLead(id),
 *   convertFromTask(taskId) }
 *
 * Optimistic where the old code was (moveStage: the store changes first and is put back, with an error
 * in the status bar, if the write fails); a view-only user's writes are refused before any request,
 * with the "view-only" sentence. convertFromTask opens the lead form prefilled from the task; saving
 * it writes leads.source_task_id. The writes themselves are stable; the object changes only with the form.
 */
export function useLeadActions() {
  const { openConvert } = useLeadForm();
  return useMemo(() => ({ ...leadActions, convertFromTask: openConvert }), [openConvert]);
}
