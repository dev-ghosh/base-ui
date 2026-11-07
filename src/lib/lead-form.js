/* lead-form.js — the pure half of the lead form: a lead (or a task being converted) into the
 * form's fields, and the fields back into the `data` object saveLead() writes.
 * Port of buildLeadForm / convertTaskToLead (reading) and saveLead (building) in
 * rie-dashboard2/js/leads.js.
 *
 * No store, no DOM: everything it needs is passed in, so plain Node can import it.
 */

export const TITLE_REQUIRED = 'Lead title is required';

/** A lead (or {}) -> the form's fields. The type and stage default as the old select did. */
export function formFromLead(l = {}) {
  return {
    id: l.id ?? null,
    sourceTaskId: l.sourceTaskId ?? null,
    title: l.title || '',
    type: l.type || 'Other',
    stage: l.stage || 'Identified',
    org: l.org || '',
    contactName: l.contactName || '',
    amount: l.amount ?? '',
    deadline: l.deadline || '',
    followup: l.nextFollowUp || '',
    assignedTo: l.assignedTo || '',
    priority: l.priority || '',
    nextStep: l.nextStep || '',
    notes: l.notes || '',
    outcome: l.outcome || '',
  };
}

/**
 * "Convert to lead": the lead form prefilled from a task, with `sourceTaskId` set so the saved
 * lead points back at it (leads.source_task_id). Notes are the task's action item and key
 * inputs, the owner is the first of the task's assignees.
 */
export function formFromTask(t) {
  return {
    ...formFromLead({
      title: t.task || '',
      org: t.contactOrg || '',
      contactName: t.contactName || '',
      nextFollowUp: t.nextFollowUp || '',
      notes: [t.actionItem, t.keyInputs].filter(Boolean).join('\n'),
      assignedTo: (t.assignedTo || '').split(',')[0].trim(),
      priority: t.priority || '',
    }),
    sourceTaskId: t.id,
  };
}

/** The form's fields -> the `data` saveLead() takes. ctx: { contacts } (the typed contact is matched by name). */
export function leadFromForm(f, { contacts = [] } = {}) {
  const g = (v) => (v == null ? '' : String(v)).trim();
  const contactTyped = g(f.contactName);
  const match = contactTyped
    ? contacts.find((c) => (c.name || '').toLowerCase() === contactTyped.toLowerCase())
    : null;
  return {
    id: f.id ?? null,
    title:        g(f.title),
    type:         g(f.type) || 'Other',
    stage:        g(f.stage) || 'Identified',
    org:          g(f.org),
    contactId:    match?.id || null,
    contactName:  contactTyped,
    amount:       g(f.amount) === '' ? null : Number(g(f.amount)),
    deadline:     g(f.deadline) || null,
    nextStep:     g(f.nextStep),
    nextFollowUp: g(f.followup) || null,
    notes:        g(f.notes),
    outcome:      g(f.outcome),
    assignedTo:   g(f.assignedTo),
    priority:     g(f.priority),
    sourceTaskId: f.sourceTaskId ?? null,
  };
}

/** The check the old saveLead ran before it closed the form. @returns {string|null} */
export function validateLead(data) {
  return data.title ? null : TITLE_REQUIRED;
}

/** The "+ Task" button on a lead: the task form prefill (openAddTaskForLead). */
export function taskPrefillFromLead(lead) {
  return {
    title: `Add Task — ${lead.title}`,
    task: lead.nextStep || undefined,
    nextFollowUp: lead.nextFollowUp || undefined,
    leadId: lead.id,
    contactIds: lead.contactId ? [lead.contactId] : undefined,
    contactNames: lead.contactId ? [lead.contactName] : undefined,
  };
}
