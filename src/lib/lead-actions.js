/* lead-actions.js — every write the Pipeline makes. Port of changeLeadStage, saveLead,
 * executeDeleteLead, logLeadTouchpoint and logHistory in rie-dashboard2/js/leads.js.
 *
 * The old "Write flow": memory first (the store), then the REST call, and on failure put it back and
 * say so in the status bar. The store is never mutated in place: a changed lead is a new object in a
 * new array. Read-only users: every call goes through rest.js, whose assertCanWrite() throws the
 * "view-only" sentence before any fetch.
 *
 * Plain JS with relative imports so plain Node can import it.
 */
import { store } from '../store/store.js';
import { sbInsert, sbUpdate, sbDelete } from './rest.js';
import { setStatus } from './status.js';
import { rowToLead, leadToRow } from './mappers.js';
import { validateLead } from './lead-form.js';

const sameId = (a, b) => a != null && b != null && String(a) === String(b);
const findLead = (id) => store.getState().leads.find((l) => sameId(l.id, id)) || null;
const who = () => store.getState().currentUser || 'unknown';

/** Replace fields on one lead (new object, new array). */
export function patchLeadLocal(id, fields) {
  store.setState((s) => ({ leads: s.leads.map((l) => (sameId(l.id, id) ? { ...l, ...fields } : l)) }));
}

/** Put a lead into the list, replacing the one with its id (a realtime echo may have added it first). */
function upsertLeadLocal(lead) {
  store.setState((s) => (s.leads.some((l) => sameId(l.id, lead.id))
    ? { leads: s.leads.map((l) => (sameId(l.id, lead.id) ? lead : l)) }
    : { leads: [...s.leads, lead] }));
}

/** One line in the touchpoint log (lead_history). */
export function logHistory(leadId, type, notes) {
  return sbInsert('lead_history', { lead_id: leadId, type, notes, created_by: who() });
}

/**
 * Move a lead to another stage (Kanban drop). Optimistic; rolled back if the write fails. The audit
 * line ("A → B (Kanban drag-drop)") is best effort. Like the old code, a rollback restores the stage
 * only: the new stage_changed_at stays on the lead (old defect, ported).
 * @returns {Promise<boolean>} true when the write landed
 */
export async function moveStage(id, newStage, { via = 'Kanban drag-drop' } = {}) {
  const lead = findLead(id);
  if (!lead || lead.stage === newStage) return false;
  const prevStage = lead.stage;
  const stageChangedAt = new Date().toISOString();
  patchLeadLocal(lead.id, { stage: newStage, stageChangedAt });
  setStatus('syncing', 'Updating lead stage…');
  try {
    await sbUpdate('leads', lead.id, {
      stage: newStage, stage_changed_at: stageChangedAt,
      updated_by: who(), updated_at: new Date().toISOString(),
    });
    setStatus('online', `Moved to ${newStage}`);
    logHistory(lead.id, 'stage', `${prevStage} → ${newStage}${via ? ' (' + via + ')' : ''}`).catch(() => {});
    return true;
  } catch (err) {
    patchLeadLocal(lead.id, { stage: prevStage });
    setStatus('error', 'Update failed: ' + err.message);
    return false;
  }
}

/**
 * Save the lead form's data (see leadFromForm). `data.id` set = update, absent = insert.
 * A missing title is reported in the status bar and nothing is written. A failing WRITE is reported
 * ("Save failed: …") and resolves null, as the old saveLead did after it had closed the form.
 * @returns {Promise<{id: *, created: boolean}|null>}
 */
export async function saveLead(data) {
  const problem = validateLead(data);
  if (problem) { setStatus('error', problem); return null; }
  const savedId = data.id ?? null;
  setStatus('syncing', 'Saving lead…');
  try {
    let resultId = savedId;
    if (savedId != null) {
      const prev = findLead(savedId);
      const stageChanged = !!prev && prev.stage !== data.stage;
      const payload = stageChanged ? { ...data, stageChangedAt: new Date().toISOString() } : data;
      const [updated] = await sbUpdate('leads', savedId, leadToRow(payload, false));
      if (updated && prev) upsertLeadLocal(rowToLead(updated));
      if (stageChanged) logHistory(savedId, 'stage', `${prev.stage} → ${data.stage}`).catch(() => {});
    } else {
      const [inserted] = await sbInsert('leads', leadToRow(data, true));
      upsertLeadLocal(rowToLead(inserted));
      resultId = inserted.id;
      logHistory(inserted.id, 'note', `Lead created in stage ${inserted.stage || data.stage}`).catch(() => {});
    }
    setStatus('online', 'Lead saved');
    return { id: resultId, created: savedId == null };
  } catch (e) {
    setStatus('error', 'Save failed: ' + e.message);
    return null;
  }
}

/** Delete a lead and its touchpoint history (the database cascades). @returns {Promise<boolean>} */
export async function deleteLead(id) {
  setStatus('syncing', 'Deleting lead…');
  try {
    await sbDelete('leads', id);
    store.setState((s) => ({ leads: s.leads.filter((l) => !sameId(l.id, id)) }));
    setStatus('online', 'Lead deleted');
    return true;
  } catch (e) {
    setStatus('error', 'Delete failed: ' + e.message);
    return false;
  }
}

/**
 * Log a touchpoint on a lead. `entry` is { type, notes, next }: the notes are required, and `next`
 * (a date) also sets the lead's next follow-up. Not optimistic, as before: memory changes after the
 * write. @returns {Promise<boolean>} true when logged
 */
export async function addTouchpoint(id, { type = 'note', notes = '', next = '' } = {}) {
  const lead = findLead(id);
  if (!lead) return false;
  const text = (notes || '').trim();
  if (!text) { setStatus('error', 'Describe the touchpoint before logging'); return false; }
  setStatus('syncing', 'Logging touchpoint…');
  try {
    await logHistory(lead.id, type || 'note', text);
    if (next) {
      await sbUpdate('leads', lead.id, { next_follow_up: next, updated_by: who(), updated_at: new Date().toISOString() });
      patchLeadLocal(lead.id, { nextFollowUp: next });
    }
    setStatus('online', 'Touchpoint logged');
    return true;
  } catch (e) {
    setStatus('error', 'Log failed: ' + e.message);
    return false;
  }
}

/** The actions as one stable object (useLeadActions builds on it). */
export const leadActions = { saveLead, moveStage, addTouchpoint, deleteLead };
