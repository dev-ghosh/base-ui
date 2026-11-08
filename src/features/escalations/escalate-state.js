// What the two escalation dialogs open with, and the functions that open them. Port of openEscalateModal()
// and openEscAction() in rie-dashboard2/js/escalations.js. The dialogs themselves are EscalateModal and
// EscActionModal, mounted once in the (app) layout; this module is their (component-free) state, so the
// task viewer, the task form and the Escalations page can open them without a component in between.
//
// Plain JS with relative imports: importable in Node.
import { createStore, store } from '../../store/store.js';
import { canWriteOf } from '../../lib/access.js';
import { nextUp } from '../../lib/escalation-actions.js';
import { openMo } from '../../lib/modals.js';
import { setStatus } from '../../lib/status.js';

export const ESCALATE_MODAL_ID = 'mo-escalate';
export const ESC_ACTION_MODAL_ID = 'mo-esc-action';

/** { taskId, suggested, nonce }: the task the form is fixed to (or null = the person picks) and the suggested recipient. */
export const escalateStore = createStore({ taskId: null, suggested: null, nonce: 0 });
/** { kind, id, suggested, nonce }: the open action dialog (resolve / push / withdraw) and the suggested recipient for a push. */
export const escActionStore = createStore({ kind: null, id: null, suggested: null, nonce: 0 });

const myCode = () => store.getState().access?.person_code || null;
const sameId = (a, b) => a != null && b != null && String(a) === String(b);

/**
 * Open the Escalate form. With a task id the task is fixed; without one the person picks.
 * Refused, with a sentence in the status bar, for a view-only user, when the escalations table is not set up,
 * and when the sign-in is not linked to a person (an escalation is raised in a person's name).
 */
export async function openEscalateModal(taskId) {
  if (!canWriteOf(store.getState().access)) { setStatus('error', 'View-only access: you cannot raise an escalation.'); return; }
  if (store.getState().escalationsError === 'missing') {
    setStatus('error', 'Escalations are not set up yet. Ask an admin to apply the latest database migration.');
    return;
  }
  const me = myCode();
  if (!me) {
    setStatus('error', 'Your sign-in is not linked to a person yet, so an escalation cannot be raised in your name. Ask an admin to link it.');
    return;
  }
  const suggested = await nextUp(me);
  escalateStore.setState((s) => ({ taskId: taskId != null ? String(taskId) : null, suggested, nonce: s.nonce + 1 }));
  openMo(ESCALATE_MODAL_ID);
}

/** Open the Resolve / Escalate further / Withdraw dialog for one escalation. */
export async function openEscAction(kind, id) {
  const e = store.getState().escalations.find((x) => sameId(x.id, id));
  if (!e) return;
  let suggested = null;
  if (kind === 'push') {
    const onTrail = (e.trail || []).map((t) => t.by).filter(Boolean);
    suggested = await nextUp(e.assigned_to, [e.raised_by, ...onTrail]);
  }
  escActionStore.setState((s) => ({ kind, id: e.id, suggested, nonce: s.nonce + 1 }));
  openMo(ESC_ACTION_MODAL_ID);
}
