/* task-form.js — the pure half of the task form: turning a task into form fields and the
 * fields back into the `data` object saveTask() writes, plus the validation rules.
 * Port of buildTaskForm / initTaskMultiSelects (reading) and saveTask (building and checking)
 * in rie-dashboard2/js/tasks.js.
 *
 * No store, no DOM: everything it needs is passed in, so plain Node can run it.
 */

export const STATUS_OPTIONS = ['Pending', 'In Progress', 'On Hold', 'Completed', 'Dropped'];
export const RECURRENCE_OPTIONS = ['daily', 'weekly', 'bi-weekly', 'monthly', 'quarterly'];

export const NAME_REQUIRED = 'Task name is required';
export const FUNC_REQUIRED = 'Company and Function are both required on a new task';
export const SELF_ONLY = 'You can only create tasks assigned to yourself. Add yourself as an assignee and try again.';

const displayName = (p) => p.display_name || p.displayName || p.code;
const nameOf = (people, code) => {
  const p = (people || []).find((x) => x.code === code);
  return p ? displayName(p) : code;
};
const codeOf = (people, name) => {
  const n = (name || '').trim().toLowerCase();
  if (!n) return '';
  const p = (people || []).find((x) => (x.display_name || x.displayName || '').toLowerCase() === n || (x.code || '').toLowerCase() === n);
  return p ? p.code : '';
};

/**
 * Task (or {}) -> the form's fields.
 * ctx: { registry (task_functions rows), people, contacts, defaultOwner }
 */
export function formFromTask(t = {}, { registry = [], people = [], contacts = [], defaultOwner = null } = {}) {
  // Contacts (initTaskMultiSelects)
  const sel = [];
  if (t.contactIds?.length) {
    t.contactIds.forEach((cid, i) => {
      const c = contacts.find((x) => x.id === cid);
      if (c) sel.push({ id: c.id, name: c.name, org: c.org || '' });
      else if (t.contactNames?.[i]) sel.push({ id: cid, name: t.contactNames[i], org: '' });
    });
  } else if (t.contactName) {
    const c = contacts.find((x) => x.name === t.contactName);
    sel.push({ id: c?.id || null, name: t.contactName, org: t.contactOrg || '' });
  }

  // Assignees: first is the owner, the rest are co-owners.
  const assignees = [t.ownerCode, ...(t.coOwnerCodes || [])].filter(Boolean);
  // A legacy row with only a free-text name and no code: keep what was there, mapped to a code where one matches.
  if (!assignees.length && t.assignedTo) {
    t.assignedTo.split(',').map((s) => codeOf(people, s)).filter(Boolean)
      .forEach((c) => { if (!assignees.includes(c)) assignees.push(c); });
  }
  // A new task for an assigned-scope user starts owned by them (RLS only lets them create their own).
  if (!assignees.length && defaultOwner) assignees.push(defaultOwner);

  // Only the functions ACTIVE for the chosen company are offered; a stored one that
  // is not among them reads as unset (the old <select> had no matching <option>).
  const company = t.company || '';
  const active = registry.filter((r) => r.company === company && r.active).map((r) => r.func);
  // (While the registry has not loaded there is nothing to compare with, so the stored function is kept.)
  const func = registry.length === 0 ? (t.func || '') : (company && active.includes(t.func || '') ? (t.func || '') : '');

  return {
    id: t.id != null ? String(t.id) : null,
    task: t.task || '',
    frontCode: t.frontCode || '',
    category: t.category || '',
    status: STATUS_OPTIONS.includes(t.status) ? t.status : 'Pending',
    company,
    func,
    followup: t.nextFollowUp || '',
    lastMtg: t.lastMtg || '',
    start: t.startDate || '',
    end: t.endDate || '',
    priority: ['P1', 'P2', 'P3'].includes(t.priority) ? t.priority : '',
    action: t.actionItem || '',
    keys: t.keyInputs || '',
    recurrence: RECURRENCE_OPTIONS.includes(t.recurrenceRule || '') ? t.recurrenceRule : '',
    tags: (t.tags || []).join(', '),
    contacts: sel,
    assignees,
  };
}

/** The follow-up used when the field is left empty: three days on. (toISOString, as the old code did.) */
const defaultFollowUp = (now) => { const d = new Date(now); d.setDate(d.getDate() + 3); return d.toISOString().slice(0, 10); };

/**
 * The form's fields -> the `data` object saveTask() takes (the old saveTask `data`, plus
 * `id` when editing and `leadId` when the task is spawned from a lead).
 * ctx: { fronts, people, now }
 */
export function taskFromForm(f, { fronts = [], people = [], now = new Date() } = {}) {
  const trim = (v) => (v || '').trim();
  const contacts = f.contacts || [];
  const primary = contacts[0] || null;
  const assignees = f.assignees || [];
  const frontCodeSelected = trim(f.frontCode);
  const frontName = fronts.find((o) => o.code === frontCodeSelected)?.name || '';
  return {
    id: f.id ?? null,
    leadId: f.leadId ?? null,
    task: trim(f.task),
    project: frontName,
    frontCode: frontCodeSelected || null,
    category: trim(f.category),
    status: trim(f.status) || 'Pending',
    contactName: primary?.name || '',
    contactOrg: primary?.org || '',
    contactId: primary?.id || null,
    contactNames: contacts.map((c) => c.name),
    contactIds: contacts.map((c) => c.id).filter(Boolean),
    nextFollowUp: trim(f.followup) || defaultFollowUp(now),
    lastMtg: trim(f.lastMtg) || null,
    startDate: trim(f.start) || null,
    endDate: trim(f.end) || null,
    actionItem: trim(f.action),
    keyInputs: trim(f.keys),
    assignedTo: assignees.map((c) => nameOf(people, c)).join(', '),
    ownerCode: assignees[0] || '',
    coOwnerCodes: assignees.slice(1),
    priority: trim(f.priority),
    recurrenceRule: trim(f.recurrence) || '',
    company: trim(f.company),
    func: trim(f.func),
    tags: (f.tags || '').split(',').map((t) => t.trim()).filter(Boolean),
  };
}

/**
 * The checks the old saveTask ran before it closed the form, in the same order.
 * @returns {string|null} the message to show, or null
 * ctx: { registryReady, access }
 */
export function validateTask(data, { registryReady = false, access = null } = {}) {
  if (!data.task) return NAME_REQUIRED;
  const isNew = !data.id;
  // func is REQUIRED on every task INSERT. There is no default and no "Other"
  // bucket. Not enforced while the registry is not loaded (nothing to choose from).
  if (isNew && registryReady && (!data.company || !data.func)) return FUNC_REQUIRED;
  // Assigned-scope users can only create tasks owned by themselves (RLS rule).
  if (isNew && access?.task_scope === 'assigned' && data.ownerCode !== access?.person_code) return SELF_ONLY;
  return null;
}
