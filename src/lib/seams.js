// Seams for features that belong to later tasks. The task writes in task-actions.js call these
// where the old tasks.js called pushNotification() / recordActivity() (js/notifications.js,
// js/activity.js) and where the viewer / form offered "Escalate…" (js/escalations.js). Until
// the owning task replaces a body, each is a named no-op, exactly like the buttons in the
// header that wait for their task.

// TODO(Task 13): toast notifications (js/notifications.js pushNotification)
export function pushNotification(_title, _message, _type = 'info') {}

// TODO(Task 11/13): the activity feed (js/activity.js recordActivity)
export function recordActivity(_action, _target, _person, _type = 'task') {}

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
