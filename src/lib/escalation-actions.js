/* escalation-actions.js — every write Escalations makes. Port of submitEscalation, emailEscalation,
 * confirmEscAction, releaseTask, setReportsTo, loadAdminCodes and nextUp in rie-dashboard2/js/escalations.js.
 *
 * Source of truth is the `escalations` table. The old flow, kept: WRITE FIRST and only change the screen once
 * the database has agreed, so the page can never show an escalation that was not stored. The store is never
 * mutated in place: a changed row is a new object in a new array.
 *
 * Read-only users: every write goes through rest.js, whose assertCanWrite() throws the "view-only" sentence
 * before any request (and the screens do not offer the buttons).
 *
 * Plain JS with relative imports so plain Node can import it.
 */
import { store } from '../store/store.js';
import { sbUrl, getHeaders } from './config.js';
import { assertCanWrite, sbGet, sbInsert, sbRpc, sbUpdate } from './rest.js';
import { setStatus } from './status.js';
import { DISPLAY_TO_V3, V3_TO_DISPLAY, personName } from './mappers.js';
import { writeEntityEvent } from './entity-events.js';
import {
  actionErrorText, actionPatch, escalationInsert, nextUpFrom, raiseErrorText, raiseProblem, statusAfterRelease,
} from '../features/escalations/model.js';

const sameId = (a, b) => a != null && b != null && String(a) === String(b);
const myCode = () => store.getState().access?.person_code || null;
const findEscalation = (id) => store.getState().escalations.find((x) => sameId(x.id, id)) || null;

/** Replace fields on one task (new object, new array). Not task-actions' patchTaskLocal: that module reaches
 *  the Escalate dialog through seams.js, and an import cycle back here is not worth three lines. */
const patchTaskLocal = (id, fields) =>
  store.setState((s) => ({ tasks: s.tasks.map((t) => (sameId(t.id, id) ? { ...t, ...fields } : t)) }));

/** Put a row into the list, replacing the one with its id (a realtime echo may have added it first). */
function upsertEscalation(row) {
  store.setState((s) => (s.escalations.some((x) => sameId(x.id, row.id))
    ? { escalations: s.escalations.map((x) => (sameId(x.id, row.id) ? { ...x, ...row } : x)) }
    : { escalations: [row, ...s.escalations] }));
}

/* ── who to send it to ─────────────────────────────────────────────────────── */

let adminCodes = null;   // person codes of active admins, fetched once per sign-in

/** Forget the cached admins (sign-in changes the answer). */
export function resetAdminCodes() { adminCodes = null; }

async function loadAdminCodes() {
  if (adminCodes) return adminCodes;
  try {
    const rows = await sbGet('rie_allowed_users', 'active=eq.true&role=eq.admin&select=person_code');
    adminCodes = rows.map((r) => r.person_code).filter(Boolean);
  } catch { adminCodes = []; }
  return adminCodes;
}

/** The next person up from `fromCode`: their reporting line first, then an admin; never anyone in `avoid`. */
export async function nextUp(fromCode, avoid = []) {
  const people = store.getState().people || [];
  const boss = nextUpFrom(people, fromCode, avoid, []);
  if (boss) return boss;
  return nextUpFrom(people, fromCode, avoid, await loadAdminCodes());
}

/* ── e-mail (best effort) ──────────────────────────────────────────────────── */

/** Best effort. The escalation is already saved; e-mail failing must not look like the escalation failing. */
export async function emailEscalation(id) {
  try {
    const res = await fetch(`${sbUrl()}/functions/v1/send-alerts`, {
      method: 'POST',
      headers: { ...(await getHeaders()), 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'escalation', escalationId: id }),
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.status);
  } catch (e) {
    setStatus('online', `Escalated. The e-mail could not be sent (${e.message}); they will still see it in BASE.`);
  }
}

/* ── raising ───────────────────────────────────────────────────────────────── */

/**
 * Raise an escalation: insert the row, then put the task on hold (the escalation stands even if that fails;
 * the person is told), then e-mail the recipient if asked.
 * @param {{taskId: *, to: string, reason: string, notes?: string, email?: boolean}} f
 * @returns {Promise<{ok: boolean, error?: string, row?: object}>} `error` is the sentence for the form
 */
export async function raiseEscalation({ taskId, to, reason, notes = '', email = false }) {
  const me = myCode();
  const task = taskId ? store.getState().tasks.find((t) => sameId(t.id, taskId)) : null;
  const note = String(notes || '').trim();
  const problem = raiseProblem({ taskId, to, me, task });
  if (problem) return { ok: false, error: problem };

  const now = new Date().toISOString();
  const prev = DISPLAY_TO_V3[task.status] || 'pending';
  let row;
  try {
    [row] = await sbInsert('escalations', escalationInsert({ task, me, to, reason, notes: note, previousStatus: prev, now }));
    upsertEscalation(row);

    // The escalation is stored. Putting the task on hold is the second half; if it fails the escalation
    // still stands, and the user is told.
    try {
      if (prev !== 'on_hold') {
        await sbUpdate('entities', task.id, { status: 'on_hold' });
        patchTaskLocal(task.id, { status: 'On Hold' });
        await writeEntityEvent(task.id, 'status_changed', {
          fieldName: 'status', oldValue: prev, newValue: 'on_hold',
          notes: `Escalated to ${personName(to)}: ${reason}`,
        });
      }
    } catch (e) {
      setStatus('error', 'Escalation saved, but the task could not be put on hold: ' + e.message);
    }

    if (email) emailEscalation(row.id);
    setStatus('online', `Escalated to ${personName(to)}`);
    return { ok: true, row };
  } catch (e) {
    return { ok: false, error: raiseErrorText(e.message) };
  }
}

/* ── moving an open escalation: resolve / push up / withdraw ───────────────── */

/**
 * Put the task back where it was, but only if it is still on hold: someone may have moved it on in the
 * meantime and that should win.
 */
async function releaseTask(e) {
  const task = store.getState().tasks.find((t) => sameId(t.id, e.entity_id));
  if (!task || task.status !== 'On Hold') return;
  const back = statusAfterRelease(e);
  try {
    await sbUpdate('entities', task.id, { status: back });
    patchTaskLocal(task.id, { status: V3_TO_DISPLAY[back] || 'In Progress' });
    await writeEntityEvent(task.id, 'status_changed', {
      fieldName: 'status', oldValue: 'on_hold', newValue: back,
      notes: `Escalation ${e.status}${e.resolution ? ': ' + e.resolution : ''}`,
    });
  } catch (x) {
    setStatus('error', 'Escalation closed, but the task status could not be restored: ' + x.message);
  }
}

/**
 * Resolve, push further up, or withdraw an open escalation. Resolve and withdraw send the task back to its
 * previous status; push re-assigns (level + 1) and e-mails the next person.
 * @param {'resolve'|'push'|'withdraw'} kind
 * @param {{note?: string, to?: string}} [f]
 * @returns {Promise<{ok: boolean, error?: string}>}
 */
export async function applyEscalationAction(kind, id, { note = '', to = '' } = {}) {
  const e = findEscalation(id);
  if (!e) return { ok: false };
  const text = String(note || '').trim();
  const res = actionPatch(kind, e, { me: myCode(), note: text, to, now: new Date().toISOString() });
  if (res.error) return { ok: false, error: res.error };

  try {
    const [row] = await sbUpdate('escalations', id, res.patch);
    if (!row) throw new Error('You do not have permission to change this escalation.');
    const merged = { ...e, ...row };
    upsertEscalation(merged);

    if (kind !== 'push') await releaseTask(merged);
    if (kind === 'push') emailEscalation(merged.id);
    setStatus('online', kind === 'push' ? `Escalated to ${personName(merged.assigned_to)}` : kind === 'resolve' ? 'Escalation resolved' : 'Escalation withdrawn');
    return { ok: true };
  } catch (x) {
    return { ok: false, error: actionErrorText(x.message) };
  }
}

/* ── reporting lines (admin) ───────────────────────────────────────────────── */

/**
 * Who a person escalates to by default (public.people.reports_to, through the rie_set_reports_to RPC).
 * @returns {Promise<boolean>} true when saved; false when refused (the status bar says why)
 */
export async function setReportsTo(code, value) {
  try {
    assertCanWrite();
    await sbRpc('rie_set_reports_to', { p_code: code, p_reports_to: value || null });
    store.setState((s) => ({ people: s.people.map((p) => (p.code === code ? { ...p, reports_to: value || null } : p)) }));
    setStatus('online', `${personName(code)} now escalates to ${value ? personName(value) : 'no one by default'}`);
    return true;
  } catch (e) {
    setStatus('error', e.message.replace(/^RPC rie_set_reports_to failed: /, ''));
    return false;
  }
}
