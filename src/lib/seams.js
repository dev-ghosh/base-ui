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
