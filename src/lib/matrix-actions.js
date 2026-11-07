/* matrix-actions.js — the three writes the Matrix drill makes. Port of mxSetTaskStatus, mxSetFunc
 * and mxConfirmReview in rie-dashboard2/js/matrix.js ("WRITES, spec 6.2").
 *
 * Optimistic in-memory update, then PATCH; on failure roll back and surface the error in the
 * status bar. They differ from task-actions.js on purpose: the audit rows say "Matrix drill",
 * and database constraint names are turned into a sentence (friendlyError).
 *
 * Read-only users: rest.js refuses before any fetch with the "view-only" sentence, which
 * lands in the status bar after the rollback, as in the old app.
 *
 * Plain JS with relative imports so plain Node can import it.
 */
import { store } from '../store/store.js';
import { sbUpdate } from './rest.js';
import { setStatus } from './status.js';
import { DISPLAY_TO_V3 } from './vocab.js';
import { writeEntityEvent } from './entity-events.js';
import { patchTaskLocal } from './task-actions.js';

const localTask = (id) => store.getState().tasks.find((t) => String(t.id) === String(id));
const actor = () => store.getState().currentUser || 'unknown';

export function friendlyError(msg = '') {
  if (/entities_func_check|tasks_func_check/.test(msg))     return 'Invalid function value';
  if (/entities_company_check/.test(msg))                   return 'Invalid company value';
  if (/entities_status_check|tasks_status_check/.test(msg)) return 'Invalid status value';
  return msg;
}

/** Move a task to another status column (drag, or the status select). */
export async function setMatrixTaskStatus(id, newStatus) {
  const t = localTask(id);
  if (!t || t.status === newStatus) return false;
  const prev = t.status;
  patchTaskLocal(t.id, { status: newStatus });
  setStatus('syncing', 'Updating task status...');
  try {
    const v3 = DISPLAY_TO_V3[newStatus] || newStatus;
    // entities_autoclose stamps closed_at on completed/dropped server-side.
    await sbUpdate('entities', t.id, { status: v3, updated_by: actor(), updated_at: new Date().toISOString() });
    patchTaskLocal(t.id, { v3Status: v3 });
    setStatus('online', `Moved to ${newStatus}`);
    writeEntityEvent(t.id, 'status_changed', {
      fieldName: 'status', oldValue: prev, newValue: newStatus, notes: 'Matrix drill',
    }).catch(() => {});
    return true;
  } catch (err) {
    patchTaskLocal(t.id, { status: prev });
    setStatus('error', 'Update failed: ' + friendlyError(err.message));
    return false;
  }
}

/** Pick a function for a task. Picking is a human confirmation, so it clears the review flag. */
export async function setMatrixFunc(id, func) {
  const t = localTask(id);
  if (!t || !func || t.func === func) return false;
  const prev = { func: t.func, funcReview: t.funcReview, funcReviewNote: t.funcReviewNote };
  patchTaskLocal(t.id, { func, funcReview: false, funcReviewNote: '' });
  setStatus('syncing', 'Updating function...');
  try {
    await sbUpdate('entities', t.id, {
      func, func_review: false, func_review_note: null, updated_by: actor(), updated_at: new Date().toISOString(),
    });
    setStatus('online', `Function set to ${func}`);
    writeEntityEvent(t.id, 'updated', {
      fieldName: 'func', oldValue: prev.func || '', newValue: func, notes: 'Matrix drill reclassification',
    }).catch(() => {});
    return true;
  } catch (err) {
    patchTaskLocal(t.id, prev);
    setStatus('error', 'Update failed: ' + friendlyError(err.message));
    return false;
  }
}

/** "Confirm" on a task flagged for review: keep its classification, clear the flag. */
export async function confirmMatrixReview(id) {
  const t = localTask(id);
  if (!t) return false;
  const prev = { funcReview: t.funcReview, funcReviewNote: t.funcReviewNote };
  patchTaskLocal(t.id, { funcReview: false, funcReviewNote: '' });
  try {
    await sbUpdate('entities', t.id, { func_review: false, func_review_note: null, updated_by: actor(), updated_at: new Date().toISOString() });
    setStatus('online', 'Classification confirmed');
    return true;
  } catch (err) {
    patchTaskLocal(t.id, prev);
    setStatus('error', 'Update failed: ' + friendlyError(err.message));
    return false;
  }
}

/** The actions as one stable object. */
export const matrixActions = { setStatus: setMatrixTaskStatus, setFunc: setMatrixFunc, confirmReview: confirmMatrixReview };
