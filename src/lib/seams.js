// Seams for features that belong to later tasks. The task writes in task-actions.js call these
// where the old tasks.js called pushNotification() / recordActivity() (js/notifications.js,
// js/activity.js) and where the viewer / form offered "Escalate…" (js/escalations.js). Until
// the owning task replaces a body, each is a named no-op, exactly like the buttons in the
// header that wait for their task.

// Toast notifications (js/notifications.js pushNotification) are real now: features/notifications (Task 13).
// pushNotification(title, message, type = 'info') draws in <ToastHost>, mounted in the (app) layout.
export { pushNotification } from '../features/notifications/toasts.js';

// The activity feed (js/activity.js recordActivity) is real now: src/lib/activity.js (Task 14).
export { recordActivity } from './activity.js';


// TODO(Task 13): the alerts panel (js/notifications.js openAlertsPanel), opened by the bell and by Help's
// "Open Alerts", with the unread badge on #notif-btn
export function openAlertsPanel() {}

// TODO(Task 13): the Escalate dialog (js/escalations.js openEscalateModal)
export function openEscalateModal(_taskId) {}

// Turn a task into a lead (js/leads.js convertTaskToLead), the Board card's chart button. The lead
// form lives in LeadFormProvider (mounted in the (app) layout), which registers itself here while it
// is mounted; with no provider (a component rendered alone) the call is a no-op.
let convertTaskToLeadHandler = null;
export function registerConvertTaskToLead(fn) {
  convertTaskToLeadHandler = fn;
  return () => { if (convertTaskToLeadHandler === fn) convertTaskToLeadHandler = null; };
}
export function convertTaskToLead(taskId) {
  convertTaskToLeadHandler?.(taskId);
}
