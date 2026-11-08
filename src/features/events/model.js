/* model.js — Events' pure logic. Port of the constants, the list filter (applyEF), the RSVP counts
 * (applyEF cards, openEventDetail), the two forms (buildEventForm, openAddGuest / saveGuest /
 * prefillGuest) and the copy-prompt texts of rie-dashboard2/js/events.js, plus the filter row as
 * URL search params (spec C7 rule 4: the old `ev-search`, `ev-type-f`, `ev-status-f` were DOM values).
 *
 * No store, no DOM: plain Node can import it.
 */

export const EVENT_TYPES = ['Birthday', 'Party', 'Cricket', 'Golf', 'Other'];
export const EVENT_STATUSES = ['Draft', 'Invites Sent', 'Completed', 'Cancelled'];
export const RSVP_VALUES = ['Pending', 'Yes', 'No', 'Maybe'];

export const EVENT_TITLE_REQUIRED = 'Event title is required';
export const GUEST_NAME_REQUIRED = 'Guest name is required';

/** The `parseInt(x) || 0` the old code used for every +1 value. */
export const plusOneOf = (v) => parseInt(v) || 0;

/** Route params are strings; event ids are numbers. null when it is not a whole number. */
export function eventIdFromParam(id) {
  if (typeof id === 'number') return Number.isInteger(id) ? id : null;
  if (typeof id !== 'string' || !/^\d+$/.test(id.trim())) return null;
  return Number(id.trim());
}

/** Type and status are exact; the search text matches title, venue or type (applyEF). */
export function filterEvents(events, { q = '', type = '', status = '' } = {}) {
  const needle = (q || '').toLowerCase();
  let list = [...events];
  if (type) list = list.filter((e) => e.type === type);
  if (status) list = list.filter((e) => e.status === status);
  if (needle) list = list.filter((e) => [e.title, e.venue, e.type].some((v) => (v || '').toLowerCase().includes(needle)));
  return list;
}

/** eventId -> guests of that event, in list order. */
export function groupGuestsByEvent(guests) {
  const by = {};
  for (const g of guests) (by[g.eventId] ||= []).push(g);
  return by;
}

/** What a card shows: Yes (and the +1s of those), No, Maybe; anything else counts as pending. */
export function cardCounts(guests) {
  const c = { yes: 0, no: 0, maybe: 0, pending: 0, plusOnes: 0 };
  for (const g of guests) {
    if (g.rsvp === 'Yes') { c.yes++; c.plusOnes += g.plusOne; }
    else if (g.rsvp === 'No') c.no++;
    else if (g.rsvp === 'Maybe') c.maybe++;
    else c.pending++;
  }
  return c;
}

/** What the viewer shows (openEventDetail). `attending` = Yes guests plus their +1s. */
export function detailCounts(guests) {
  const c = { yes: 0, no: 0, maybe: 0, pending: 0, notInvited: 0, pendingRSVP: 0, plusOnes: 0 };
  for (const g of guests) {
    if (g.rsvp === 'Yes') { c.yes++; c.plusOnes += g.plusOne; }
    else if (g.rsvp === 'No') c.no++;
    else if (g.rsvp === 'Maybe') c.maybe++;
    else c.pending++;
    if (!g.inviteSentAt && g.email) c.notInvited++;
    if (g.inviteSentAt && g.rsvp === 'Pending') c.pendingRSVP++;
  }
  return { ...c, attending: c.yes + c.plusOnes, total: guests.length };
}

/** The status line's class, built exactly as the old card did ("Invites Sent" becomes ev-status-invites-sent,
 *  which the CSS does not style: old defect, ported). */
export const statusClass = (status) => 'ev-status-' + (status || '').toLowerCase().replace(' ', '-');

/** "1 guest" / "2 guests" (`${n} guest${n !== 1 ? 's' : ''}`). */
export const sentenceCount = (n, noun) => `${n} ${noun}${n !== 1 ? 's' : ''}`;

/* ── search params ───────────────────────────────────────────────────────── */

/**
 *   q       search text
 *   type    one of EVENT_TYPES
 *   status  one of EVENT_STATUSES
 * Unknown values are ignored, never an error; a default is never written.
 */
export const EVENT_KEYS = ['q', 'type', 'status'];

const toParams = (search) => {
  if (search == null) return new URLSearchParams();
  if (typeof search === 'string') return new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  return new URLSearchParams(search.toString());
};

export function parseEventParams(search) {
  const p = toParams(search);
  const type = p.get('type') || '';
  const status = p.get('status') || '';
  return {
    q: p.get('q') || '',
    type: EVENT_TYPES.includes(type) ? type : '',
    status: EVENT_STATUSES.includes(status) ? status : '',
  };
}

export function serializeEventParams(f) {
  const p = new URLSearchParams();
  if (f.q) p.set('q', f.q);
  if (f.type && EVENT_TYPES.includes(f.type)) p.set('type', f.type);
  if (f.status && EVENT_STATUSES.includes(f.status)) p.set('status', f.status);
  return p.toString();
}

/** The next query string: every param that is not Events' is kept, Events' are replaced by `f`. */
export function mergeEventParams(currentSearch, f) {
  const next = new URLSearchParams();
  for (const [key, value] of toParams(currentSearch)) if (!EVENT_KEYS.includes(key)) next.append(key, value);
  for (const [key, value] of new URLSearchParams(serializeEventParams(f))) next.append(key, value);
  return next.toString();
}

/* ── the event form ──────────────────────────────────────────────────────── */

/** An event (or {}) -> the form's fields. A type or status that is not an option shows the first option, as the old select did. */
export function formFromEvent(ev = {}) {
  return {
    title: ev.title || '',
    type: EVENT_TYPES.includes(ev.type) ? ev.type : EVENT_TYPES[0],
    status: EVENT_STATUSES.includes(ev.status) ? ev.status : EVENT_STATUSES[0],
    date: ev.date || '',
    time: ev.time || '',
    venue: ev.venue || '',
    description: ev.description || '',
  };
}

/** The form's fields -> the row saveEvent writes (every value trimmed, an empty date is null). */
export function eventFromForm(f) {
  const t = (v) => (v || '').trim();
  return {
    title: t(f.title), type: t(f.type), status: t(f.status), date: t(f.date) || null,
    time: t(f.time), venue: t(f.venue), description: t(f.description),
  };
}

export const validateEvent = (data) => (data.title ? null : EVENT_TITLE_REQUIRED);

/* ── the guest form ──────────────────────────────────────────────────────── */

export const formFromGuest = () => ({ contactId: '', name: '', email: '', phone: '', rsvp: 'Pending', plusOne: '0', notes: '' });

/** The form's fields -> the row saveGuest inserts. */
export function guestFromForm(eventId, f) {
  const t = (v) => (v || '').trim();
  return {
    event_id: eventId,
    contact_id: parseInt(f.contactId) || null,
    name: t(f.name), email: t(f.email), phone: t(f.phone),
    rsvp: t(f.rsvp) || 'Pending',
    plus_one: plusOneOf(t(f.plusOne)),
    notes: t(f.notes),
  };
}

export const validateGuest = (data) => (data.name ? null : GUEST_NAME_REQUIRED);

/** Picking a BASE contact fills name, first e-mail and phone (prefillGuest). */
export function prefillFromContact(c) {
  if (!c) return null;
  return { name: c.name || '', email: c.email ? c.email.split(',')[0].trim() : '', phone: c.phone || '' };
}

/* ── the "copy prompt" texts ─────────────────────────────────────────────── */

export const invitePrompt = (ev, eventId, template) =>
  `Send invites for the event "${ev.title}" (ID: ${eventId}). Here is the invite template:\n\n${template}`;
export const rsvpPrompt = (ev, eventId) => `Sync RSVPs for the event "${ev.title}" (ID: ${eventId})`;
