/* contact-form.js — the pure half of the contact form: a contact into the form's fields, and the
 * fields back into the `data` object saveContact() writes. Port of buildContactForm (reading) and
 * saveContact (building) in rie-dashboard2/js/contacts.js.
 *
 * No store, no DOM: plain Node can import it.
 */

export const NAME_REQUIRED = 'Name is required';

/** The ABC select, in the old order. The first letter is the stored priority. */
export const ABC_OPTIONS = [
  'A - Beneficial at Real Time',
  'B - Beneficial in Short-Mid Term',
  'C - Beneficial in Long Term',
];

/** A contact (or {}) -> the form's fields (all strings; `tags` is the comma-separated text). */
export function formFromContact(c = {}) {
  return {
    name: c.name || '',
    org: c.org || '',
    designation: c.designation || '',
    category: c.category || '',
    abcFull: c.priorityFull || '',
    location: c.location || '',
    email: c.email || '',
    phone: c.phone || '',
    linkedin: c.linkedin || '',
    source: c.source || '',
    assignedTo: c.assignedTo || '',
    project: c.project || '',
    lastMtg: c.lastMtg || '',
    nextFollowUp: c.nextFollowUp || '',
    nextStep: c.nextStep || '',
    keyInputs: c.keyInputs || '',
    curStatus: c.status || '',
    remarks: c.remarks || '',
    remarks2: c.remarks2 || '',
    bday: c.birthday || '',
    interests: c.interests || '',
    tags: (c.tags || []).join(', '),
  };
}

/** The form's fields -> the `data` saveContact() takes (every value trimmed; tags split on commas). */
export function contactFromForm(f) {
  const g = (v) => (v == null ? '' : String(v)).trim();
  const priorityFull = g(f.abcFull);
  return {
    name: g(f.name), org: g(f.org), designation: g(f.designation), category: g(f.category),
    priorityFull, priority: priorityFull ? priorityFull.charAt(0) : '',
    location: g(f.location), email: g(f.email), phone: g(f.phone),
    linkedin: g(f.linkedin), source: g(f.source), assignedTo: g(f.assignedTo), project: g(f.project),
    lastMtg: g(f.lastMtg), nextFollowUp: g(f.nextFollowUp),
    nextStep: g(f.nextStep), keyInputs: g(f.keyInputs), status: g(f.curStatus),
    remarks: g(f.remarks), remarks2: g(f.remarks2), birthday: g(f.bday), interests: g(f.interests),
    tags: String(f.tags ?? '').split(',').map((t) => t.trim()).filter(Boolean),
  };
}

/** The check the old saveContact ran before it closed the form. @returns {string|null} */
export function validateContact(data) {
  return data.name ? null : NAME_REQUIRED;
}
