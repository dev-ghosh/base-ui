/* contact-actions.js — every write Contacts makes. Port of saveContact, confirmDedupPatch,
 * confirmDedupInsert, executeDeleteContact, bulkDelete and persistWarmth in
 * rie-dashboard2/js/contacts.js.
 *
 * The old "write flow": the REST call first, then memory (the store) from the row the server
 * answers with; a failure is reported in the status bar. The store is never mutated in place: a
 * changed contact is a new object in a new array. Read-only users: every call goes through rest.js,
 * whose assertCanWrite() throws the "view-only" sentence before any fetch.
 *
 * Plain JS with relative imports so plain Node can import it.
 */
import { store } from '../store/store.js';
import { sbInsert, sbUpdate, sbDelete } from './rest.js';
import { setStatus } from './status.js';
import { rowToContact, contactToRow } from './mappers.js';
import { computeWarmth, warmthLabel } from './warmth.js';
import { findDuplicate, mergePatchRow, linkedTasksOf } from '../features/contacts/model.js';

const sameId = (a, b) => a != null && b != null && String(a) === String(b);
const findContact = (id) => store.getState().contacts.find((c) => sameId(c.id, id)) || null;

/** Task deletes are admin-only (RLS); anyone else deletes the contacts and keeps their tasks. */
export const isAdminUser = () => store.getState().access?.is_admin === true;

/** The tasks that go with these contacts (none unless the user is an admin). */
export const linkedTasksFor = (ids) => (isAdminUser() ? linkedTasksOf(store.getState().tasks, ids) : []);

/** Put a contact into the list, replacing the one with its id (a realtime echo may have added it first). */
function upsertContactLocal(contact) {
  store.setState((s) => (s.contacts.some((c) => sameId(c.id, contact.id))
    ? { contacts: s.contacts.map((c) => (sameId(c.id, contact.id) ? contact : c)) }
    : { contacts: [...s.contacts, contact] }));
}

/** Replace a contact only if it is still there (the old `if (idx !== -1)`). */
function replaceContactLocal(contact) {
  store.setState((s) => ({ contacts: s.contacts.map((c) => (sameId(c.id, contact.id) ? contact : c)) }));
}

/**
 * Warmth is display-only: score the contact and, if the stored score or label differs, write `sc` and
 * `wm`. Silent on failure. Not part of the save's success or failure.
 */
export async function persistWarmth(contactId) {
  const c = findContact(contactId);
  if (!c) return;
  const score = computeWarmth(c);
  const wm = warmthLabel(score);
  if (c.score === score && c.warmthMode === wm) return;
  try {
    await sbUpdate('contacts', contactId, { sc: score, wm });
    store.setState((s) => ({ contacts: s.contacts.map((x) => (sameId(x.id, contactId) ? { ...x, score, warmthMode: wm } : x)) }));
  } catch { /* non-critical: warmth is display-only */ }
}

/**
 * Save the contact form's data (see contactFromForm). `editId` set = update; absent = create, which
 * first looks for a duplicate and, if there is one, writes nothing and hands the duplicate back so the
 * caller can ask (the "Possible duplicate found" dialog).
 * The name is checked by the caller (validateContact) before the form closes.
 * @returns {Promise<{id: *, created: boolean}|{duplicate: object}|null>} null when the write failed
 */
export async function saveContact(data, editId = null) {
  if (editId != null) {
    setStatus('syncing', 'Saving contact…');
    try {
      const [updated] = await sbUpdate('contacts', editId, contactToRow(data, false));
      replaceContactLocal(rowToContact(updated));
      setStatus('online', 'Contact saved');
      persistWarmth(editId);
      return { id: editId, created: false };
    } catch (e) {
      setStatus('error', 'Save failed: ' + e.message);
      return null;
    }
  }

  const dup = findDuplicate(data, store.getState().contacts);
  if (dup.match || dup.ambiguous) return { duplicate: dup };

  setStatus('syncing', 'Saving contact…');
  try {
    const [inserted] = await sbInsert('contacts', contactToRow(data, true));
    upsertContactLocal(rowToContact(inserted));
    setStatus('online', 'Contact saved');
    persistWarmth(inserted.id);
    return { id: inserted.id, created: true };
  } catch (e) {
    setStatus('error', 'Save failed: ' + e.message);
    return null;
  }
}

/** "Update Existing" in the dedup dialog: patch the typed data into the matched contact. */
export async function confirmDedupPatch(existingId, data) {
  setStatus('syncing', 'Updating existing contact…');
  try {
    const row = mergePatchRow(contactToRow(data, false), findContact(existingId));
    const [updated] = await sbUpdate('contacts', existingId, row);
    replaceContactLocal(rowToContact(updated));
    setStatus('online', 'Contact updated');
    return true;
  } catch (e) {
    setStatus('error', 'Update failed: ' + e.message);
    return false;
  }
}

/** "Save as New" in the dedup dialog: create the contact anyway. */
export async function confirmDedupInsert(data) {
  setStatus('syncing', 'Saving new contact…');
  try {
    const [inserted] = await sbInsert('contacts', contactToRow(data, true));
    upsertContactLocal(rowToContact(inserted));
    setStatus('online', 'Contact saved');
    return true;
  } catch (e) {
    setStatus('error', 'Save failed: ' + e.message);
    return false;
  }
}

/**
 * Delete a task's entity (owners, links and events cascade), then its legacy mirror row. Deleting only
 * the legacy row left the entity behind, so the task came back on the next load.
 */
async function deleteTaskRows(t) {
  await sbDelete('entities', t.entityId ?? t.id);
  if (t.legacyTaskId) { try { await sbDelete('tasks', t.legacyTaskId); } catch { /* entity gone; harmless */ } }
}

/** Delete one contact (and, for an admin, its linked tasks). @returns {Promise<boolean>} */
export async function deleteContact(id) {
  setStatus('syncing', 'Deleting contact…');
  try {
    const linked = linkedTasksFor([id]);
    await Promise.all(linked.map(deleteTaskRows));
    await sbDelete('contacts', id);
    const gone = new Set(linked.map((t) => t.id));
    store.setState((s) => ({
      tasks: s.tasks.filter((t) => !gone.has(t.id)),
      contacts: s.contacts.filter((c) => !sameId(c.id, id)),
    }));
    setStatus('online', linked.length
      ? `Contact deleted · ${linked.length} linked task${linked.length > 1 ? 's' : ''} removed`
      : 'Contact deleted');
    return true;
  } catch (e) {
    setStatus('error', 'Delete failed: ' + e.message);
    return false;
  }
}

/** Delete several contacts at once (the bulk bar). The confirmation is the caller's. @returns {Promise<boolean>} */
export async function bulkDeleteContacts(ids) {
  if (!ids.length) return false;
  setStatus('syncing', `Deleting ${ids.length} contacts…`);
  try {
    const linked = linkedTasksFor(ids);
    if (linked.length) await Promise.all(linked.map(deleteTaskRows));
    await Promise.all(ids.map((id) => sbDelete('contacts', id)));
    const gone = new Set(linked.map((t) => t.id));
    store.setState((s) => ({
      tasks: s.tasks.filter((t) => !gone.has(t.id)),
      contacts: s.contacts.filter((c) => !ids.some((id) => sameId(id, c.id))),
    }));
    setStatus('online', `Deleted ${ids.length} contacts`);
    return true;
  } catch (e) {
    setStatus('error', 'Bulk delete failed: ' + e.message);
    return false;
  }
}

export const contactActions = { saveContact, confirmDedupPatch, confirmDedupInsert, deleteContact, bulkDeleteContacts };
