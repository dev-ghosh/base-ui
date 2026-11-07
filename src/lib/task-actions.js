/* task-actions.js — every write a task screen makes. Port of todayAct (js/today.js),
 * triageAct's PATCH and applyLocally (js/triage.js), hSetStatus, saveTask, syncCoOwners,
 * syncParentStatus and executeDeleteTask (js/tasks.js).
 *
 * The old "Write flow": update memory first, then the REST call, and on failure put it
 * back and say so in the status bar. Memory here is the store; the queue is derived from
 * `store.tasks` at render time, so updating that one list is all a screen needs.
 * The store is never mutated in place: a changed task is a new object in a new array.
 *
 * Read-only users: every call goes through rest.js, whose assertCanWrite() throws the
 * "view-only" sentence BEFORE any fetch. The optimistic update is rolled back and the
 * sentence lands in the status bar, exactly as the old app showed it.
 *
 * Plain JS with relative imports so plain Node can import it.
 */
import { store } from '../store/store.js';
import { sbInsert, sbUpdate, sbDelete, sbPatchWhere } from './rest.js';
import { setStatus } from './status.js';
import { DISPLAY_TO_V3, V3_TO_DISPLAY, entityToRow, rowToEntity, personName } from './mappers.js';
import { addDaysISO, nextMondayISO } from './today.js';
import { registryReady } from './registry.js';
import { validateTask } from './task-form.js';
import { writeEntityEvent } from './entity-events.js';
import { pushNotification, recordActivity } from './seams.js';

const sameId = (a, b) => a != null && b != null && String(a) === String(b);
const findTask = (id) => store.getState().tasks.find((t) => sameId(t.id, id)) || null;

/** Replace fields on one task (new object, new array). */
export function patchTaskLocal(id, fields) {
  store.setState((s) => ({ tasks: s.tasks.map((t) => (sameId(t.id, id) ? { ...t, ...fields } : t)) }));
}

/** An entities PATCH ({status: raw v3, next_follow_up}) as the fields the store holds.
 *  state.tasks holds the DISPLAY status ('Pending'); the PATCH uses the raw v3 one
 *  ('pending'). Writing the raw value straight in would drop the card out of every board column. */
function localFields(patch) {
  const f = {};
  if (patch.status) f.status = V3_TO_DISPLAY[patch.status] || patch.status;
  if ('next_follow_up' in patch) f.nextFollowUp = patch.next_follow_up || '';
  return f;
}

/**
 * PATCH one task's status / follow-up date, with the old Write flow.
 *  optimistic (Today): memory first; rolled back if the write fails.
 *  not optimistic (Triage): memory after the write; Triage keeps its own snapshot, so
 *  its card advances at once without touching memory.
 * @returns {Promise<boolean>} true when the write landed
 */
export async function writeTaskPatch(id, patch, { optimistic = true, okMsg, failMsg } = {}) {
  const t = findTask(id);
  if (optimistic && !t) return false;
  const before = t ? { status: t.status, nextFollowUp: t.nextFollowUp } : null;
  if (optimistic) patchTaskLocal(id, localFields(patch));
  try {
    await sbUpdate('entities', id, patch);
    if (!optimistic) patchTaskLocal(id, localFields(patch));
    if (okMsg) setStatus('online', okMsg);
    return true;
  } catch (e) {
    if (optimistic) patchTaskLocal(id, before);
    setStatus('error', failMsg ? failMsg(e) : `Could not update that task: ${e.message}`);
    return false;
  }
}

/** ✓ on a Today row (and `D`). */
export const markDone = (id) =>
  writeTaskPatch(id, { status: DISPLAY_TO_V3.Completed }, { okMsg: 'Marked done' });

/** → on a Today row (and `2`): next Monday, so "next week" means a week that has started. */
export const pushWeek = (id) =>
  writeTaskPatch(id, { next_follow_up: nextMondayISO() }, { okMsg: 'Pushed to next week' });

/** Push the follow-up date n calendar days from today. */
export const pushDays = (id, n) =>
  writeTaskPatch(id, { next_follow_up: addDaysISO(n) }, { okMsg: n === 1 ? 'Pushed to tomorrow' : `Pushed ${n} days` });

/**
 * Change a task's status. The viewer / Hierarchy rows (hSetStatus) and the Board's drag-and-drop
 * (kbDrop) are the same write: optimistic, then PATCH entities, rolled back with an error status.
 * Options: `notes` is what the audit event says ('Hierarchy' by default; the Board passes
 * 'Kanban drag-drop'); `rollUp` also re-computes the parent workstream's status afterwards (kbDrop did).
 * @returns {Promise<boolean>} true when the write landed
 */
export async function setTaskStatus(id, newStatus, { notes = 'Hierarchy', rollUp = false } = {}) {
  const t = findTask(id);
  if (!t || t.status === newStatus) return false;
  const prev = t.status;
  patchTaskLocal(t.id, { status: newStatus });
  setStatus('syncing', 'Updating status…');
  try {
    const v3 = DISPLAY_TO_V3[newStatus] || newStatus;
    await sbUpdate('entities', t.id, {
      status: v3, updated_by: store.getState().currentUser || 'unknown', updated_at: new Date().toISOString(),
    });
    patchTaskLocal(t.id, { v3Status: v3 });
    setStatus('online', `Moved to ${newStatus}`);
    writeEntityEvent(t.id, 'status_changed', {
      fieldName: 'status', oldValue: prev, newValue: newStatus, notes,
    }).catch(() => {});
    recordActivity(newStatus === 'Completed' ? 'marked completed' : `moved to ${newStatus}`, t.task,
      store.getState().currentUser || t.assignedTo || 'Team Member', 'task');
    if (rollUp) await syncParentStatus(t.id);
    return true;
  } catch (e) {
    patchTaskLocal(t.id, { status: prev });
    setStatus('error', 'Update failed: ' + e.message);
    return false;
  }
}

/**
 * Hand a task to another person (bulk Reassign, batchReassign in js/bulk-ops.js): PATCH owner_code
 * only, as the old code did. Optimistic like the other task writes (the old code reloaded everything
 * afterwards); rolled back on failure. Co-owners are not touched.
 * @returns {Promise<boolean>} true when the write landed
 */
export async function reassignTask(id, personCode) {
  const t = findTask(id);
  if (!t) return false;
  const before = { ownerCode: t.ownerCode, assignedTo: t.assignedTo };
  const names = [personCode, ...(t.coOwnerCodes || [])].filter(Boolean).map(personName);
  patchTaskLocal(t.id, { ownerCode: personCode, assignedTo: names.join(', ') });
  try {
    await sbUpdate('entities', t.id, { owner_code: personCode });
    return true;
  } catch (e) {
    patchTaskLocal(t.id, before);
    setStatus('error', 'Reassign failed: ' + e.message);
    return false;
  }
}

/* ── saving ───────────────────────────────────────────────────────────────── */

/** Replace fields on an entity in whichever list holds it. */
function patchEntityLocal(id, fields) {
  store.setState((s) => {
    const patch = {};
    for (const key of ['tasks', 'workstreams', 'actions']) {
      if (s[key].some((e) => sameId(e.id, id))) patch[key] = s[key].map((e) => (sameId(e.id, id) ? { ...e, ...fields } : e));
    }
    return patch;
  });
}

/**
 * Persist co-owners to entity_owners so a shared assignment survives as data instead of
 * as a comma in a string. Diff against store.coOwners, then update that index so
 * rowToEntity and the Board agree without a refetch. Failures are reported but do not
 * undo the task save: the owner_code write already landed.
 */
async function syncCoOwners(entityId, ownerCode, coOwnerCodes = []) {
  const want = [...new Set(coOwnerCodes.filter((c) => c && c !== ownerCode))];
  const have = store.getState().coOwners.get(entityId) || [];
  const add = want.filter((c) => !have.includes(c));
  const remove = have.filter((c) => !want.includes(c));
  if (!add.length && !remove.length) return;
  try {
    if (add.length) {
      await sbInsert('entity_owners', add.map((person_code) => ({
        entity_id: entityId, person_code, role: 'owner', added_by: store.getState().currentUser || 'dashboard',
      })));
    }
    for (const code of remove) {
      await sbPatchWhere('entity_owners',
        `entity_id=eq.${entityId}&person_code=eq.${encodeURIComponent(code)}&removed_at=is.null`,
        { removed_at: new Date().toISOString() });
    }
    const next = new Map(store.getState().coOwners);
    if (want.length) next.set(entityId, want); else next.delete(entityId);
    store.setState({ coOwners: next });
  } catch (e) {
    setStatus('error', `Task saved, but co-owners were not: ${e.message}`);
  }
}

/** Status roll-up: a parent's status follows its children (best effort, never fails a save). */
async function syncParentStatus(childEntityId) {
  const s = store.getState();
  const link = s.entityLinks.find((l) => sameId(l.childId, childEntityId));
  if (!link) return;

  const all = [...s.workstreams, ...s.tasks, ...s.actions];
  const parent = all.find((e) => sameId(e.id, link.parentId));
  if (!parent) return;

  const siblings = s.entityLinks
    .filter((l) => sameId(l.parentId, link.parentId))
    .map((l) => all.find((e) => sameId(e.id, l.childId)))
    .filter(Boolean);
  if (!siblings.length) return;

  const allDone = siblings.every((x) => x.v3Status === 'completed');
  const anyActive = siblings.some((x) => x.v3Status === 'in_progress');
  const anyHold = siblings.some((x) => x.v3Status === 'on_hold');
  const computed = allDone ? 'completed' : anyActive ? 'in_progress' : anyHold ? 'on_hold' : 'pending';
  if (computed === parent.v3Status) return;

  try {
    await sbUpdate('entities', parent.id, { status: computed, updated_by: store.getState().currentUser || 'RIE-Auto' });
    patchEntityLocal(parent.id, { v3Status: computed, status: V3_TO_DISPLAY[computed] || 'Pending' });
    await syncParentStatus(parent.id);
  } catch { /* roll-up is best-effort */ }
}

/**
 * Save the task form's data (see taskFromForm in task-form.js). `data.id` set = update,
 * absent = insert; `data.leadId` links a new task to a lead.
 *
 * Rejects (without any request) when the data fails the old checks: a name, a company and
 * function on every new task, and the assigned-scope self-ownership rule. A failing WRITE does
 * not reject: it is reported in the status bar ("Save failed: …") and resolves null, as the
 * old saveTask did after it had closed the form.
 *
 * @returns {Promise<{id: string, created: boolean}|null>}
 */
export async function saveTask(data) {
  const problem = validateTask(data, { registryReady: registryReady(), access: store.getState().access });
  if (problem) throw new Error(problem);

  const savedId = data.id || null;
  const prev = savedId ? findTask(savedId) : null;
  const prevStatus = prev ? prev.status : null;
  const who = () => store.getState().currentUser || data.assignedTo || 'Team Member';
  setStatus('syncing', 'Saving task…');
  try {
    let resultId = savedId;
    if (savedId) {
      // R6: write directly to entities using the entity id
      await sbUpdate('entities', savedId, entityToRow(data, false));
      await syncCoOwners(savedId, data.ownerCode, data.coOwnerCodes);
      if (prev) {
        const v3 = DISPLAY_TO_V3[data.status] || 'pending';
        patchTaskLocal(savedId, {
          task: data.task, project: data.project, frontCode: data.frontCode || '', category: data.category,
          status: data.status, v3Status: v3, priority: data.priority, nextFollowUp: data.nextFollowUp,
          lastMtg: data.lastMtg, startDate: data.startDate, endDate: data.endDate,
          actionItem: data.actionItem, keyInputs: data.keyInputs, assignedTo: data.assignedTo,
          ownerCode: data.ownerCode, coOwnerCodes: data.coOwnerCodes, recurrenceRule: data.recurrenceRule,
          tags: data.tags, contactName: data.contactName, contactOrg: data.contactOrg, contactId: data.contactId,
        });
      }
      if (prev && prevStatus !== data.status) {
        writeEntityEvent(savedId, 'status_changed', {
          fieldName: 'status', oldValue: prevStatus, newValue: data.status, notes: 'Edited via task form',
        }).catch(() => {});
        pushNotification('Task Status Updated', `"${data.task}" moved to ${data.status}`, 'info');
        recordActivity(data.status === 'Completed' ? 'marked completed' : `moved to ${data.status}`, data.task, who(), 'task');
      } else {
        writeEntityEvent(savedId, 'updated', { notes: 'Edited via task form' }).catch(() => {});
        pushNotification('Task Updated', `"${data.task}" updated successfully`, 'info');
        recordActivity('updated deliverable', data.task, who(), 'task');
      }
    } else {
      // R6: new tasks are created directly in entities (no tasks row, no trigger)
      const row = entityToRow(data, true);
      if (data.leadId) row.lead_id = data.leadId;
      const [inserted] = await sbInsert('entities', row);
      await syncCoOwners(inserted.id, data.ownerCode, data.coOwnerCodes);
      const newRow = rowToEntity(inserted);
      store.setState((s) => ({ tasks: [...s.tasks, newRow] }));
      resultId = newRow.id;
      writeEntityEvent(newRow.id, 'created', { notes: 'Created via task form' }).catch(() => {});
      pushNotification('New Task Created', `"${newRow.task}" assigned to ${newRow.assignedTo || 'Unassigned'}`, 'info');
      recordActivity('created new deliverable', newRow.task, store.getState().currentUser || newRow.assignedTo || 'Team Member', 'task');
    }
    setStatus('online', 'Task saved');
    if (savedId) await syncParentStatus(savedId);
    return { id: resultId, created: !savedId };
  } catch (e) {
    setStatus('error', 'Save failed: ' + e.message);
    return null;
  }
}

/** Delete a task (admins only; RLS is what refuses anyone else). @returns {Promise<boolean>} */
export async function deleteTask(id) {
  const task = findTask(id);
  setStatus('syncing', 'Deleting task…');
  try {
    // Delete the entity itself. It used to delete only the legacy `tasks` row when there was one,
    // but the tasks->entities mirror trigger is INSERT/UPDATE only, so the entity survived and the
    // task reappeared on the next load. Owners, links, events, escalations and queue rows cascade.
    await sbDelete('entities', task?.entityId ?? id);
    if (task?.legacyTaskId) {
      try { await sbDelete('tasks', task.legacyTaskId); } catch { /* the entity is gone; the mirror row is harmless */ }
    }
  } catch (e) {
    const msg = e.message || '';
    const why = /foreign key|23503/i.test(msg)
      ? 'This task is linked to task history or a daily opening move, so it cannot be deleted. Mark it Dropped instead.'
      : /RLS|row-level|42501/i.test(msg)
        ? 'Only an admin can delete tasks.'
        : 'Delete failed: ' + msg;
    setStatus('error', why);
    pushNotification('Task not deleted', why, 'alert');
    return false;
  }
  // The delete succeeded: reflect it in memory.
  store.setState((s) => {
    const coOwners = new Map(s.coOwners);
    coOwners.delete(task?.entityId);
    return { tasks: s.tasks.filter((t) => !sameId(t.id, id)), coOwners };
  });
  setStatus('online', 'Task deleted');
  pushNotification('Task deleted', task?.task || '', 'info');
  return true;
}

/* ── workstreams (Hierarchy group headers) ───────────────────────────────── */

/** Push On Hold / Dropped down to every unfinished descendant (cascadeStatusDown in js/tasks.js). */
async function cascadeStatusDown(parentEntityId, newV3Status) {
  const s = store.getState();
  const all = [...s.tasks, ...s.actions];
  for (const link of s.entityLinks.filter((l) => sameId(l.parentId, parentEntityId))) {
    const child = all.find((e) => sameId(e.id, link.childId));
    if (!child || child.v3Status === 'completed') continue;
    try {
      await sbUpdate('entities', child.id, { status: newV3Status, updated_by: store.getState().currentUser || 'RIE-Auto' });
      patchEntityLocal(child.id, { v3Status: newV3Status, status: V3_TO_DISPLAY[newV3Status] || 'Pending' });
    } catch { /* continue with siblings */ }
    await cascadeStatusDown(child.id, newV3Status);
  }
}

/**
 * Change a workstream's status from its Hierarchy header (changeWorkstreamStatus). Not optimistic,
 * as before: the write first, then memory; On Hold and Dropped cascade to the children.
 * @returns {Promise<boolean>}
 */
export async function setWorkstreamStatus(wsId, displayStatus) {
  const ws = store.getState().workstreams.find((w) => sameId(w.id, wsId));
  if (!ws) return false;
  const v3 = DISPLAY_TO_V3[displayStatus] || 'pending';
  setStatus('syncing', `Setting workstream to ${displayStatus}…`);
  try {
    await sbUpdate('entities', wsId, { status: v3, updated_by: store.getState().currentUser || 'RIE-Auto' });
    patchEntityLocal(wsId, { v3Status: v3, status: displayStatus });
    if (v3 === 'on_hold' || v3 === 'dropped') await cascadeStatusDown(wsId, v3);
    setStatus('online', `Workstream set to ${displayStatus}`);
    return true;
  } catch (e) {
    setStatus('error', 'Status update failed: ' + e.message);
    return false;
  }
}

/** The actions as one stable object (useTaskActions returns it). */
export const taskActions = {
  markDone, pushWeek, pushDays, setStatus: setTaskStatus, reassign: reassignTask, setWorkstreamStatus, saveTask, deleteTask,
};
