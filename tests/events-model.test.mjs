// Pure logic behind Events: ported from rie-dashboard2 js/events.js (applyEF, openEventDetail, buildEventForm,
// saveEvent, saveGuest, prefillGuest, copyInvitePrompt, copyRSVPPrompt). Expected values are worked out by hand
// from the old code, not read back from the implementation.
import {
  EVENT_TYPES, EVENT_STATUSES, RSVP_VALUES, filterEvents, cardCounts, detailCounts, statusClass,
  parseEventParams, serializeEventParams, mergeEventParams, eventIdFromParam, groupGuestsByEvent,
  formFromEvent, eventFromForm, validateEvent, EVENT_TITLE_REQUIRED, formFromGuest, guestFromForm,
  validateGuest, GUEST_NAME_REQUIRED, prefillFromContact, invitePrompt, rsvpPrompt, plusOneOf,
  sentenceCount,
} from '../src/features/events/model.js';

let passed = 0, failed = 0;
const assert = (c, m) => { if (c) { passed++; console.log('  ok  ' + m); } else { failed++; console.log('  FAIL  ' + m); } };
const eq = (a, b, m) => assert(JSON.stringify(a) === JSON.stringify(b), `${m}${JSON.stringify(a) === JSON.stringify(b) ? '' : '  got ' + JSON.stringify(a) + ' want ' + JSON.stringify(b)}`);

// ── the old vocabularies, in the old order ────────────────────────────────────
eq(EVENT_TYPES, ['Birthday', 'Party', 'Cricket', 'Golf', 'Other'], 'event types');
eq(EVENT_STATUSES, ['Draft', 'Invites Sent', 'Completed', 'Cancelled'], 'event statuses');
eq(RSVP_VALUES, ['Pending', 'Yes', 'No', 'Maybe'], 'RSVP values');

// ── filters: type and status exact, search over title / venue / type ──────────
const E = (o) => ({ id: 1, title: 'T', type: 'Party', date: '', time: '', venue: '', description: '', status: 'Draft', ...o });
const evs = [
  E({ id: 1, title: 'Annual Dinner', type: 'Party', venue: 'Lake House', status: 'Draft' }),
  E({ id: 2, title: 'Founders Match', type: 'Cricket', venue: 'Oval', status: 'Completed' }),
  E({ id: 3, title: 'Q3 Offsite', type: 'Golf', venue: 'The Links', status: 'Draft' }),
];
eq(filterEvents(evs, {}).map((e) => e.id), [1, 2, 3], 'no filters keeps every event, in order');
eq(filterEvents(evs, { type: 'Cricket' }).map((e) => e.id), [2], 'type is exact');
eq(filterEvents(evs, { status: 'Draft' }).map((e) => e.id), [1, 3], 'status is exact');
eq(filterEvents(evs, { q: 'LAKE' }).map((e) => e.id), [1], 'search is case-insensitive and reads the venue');
eq(filterEvents(evs, { q: 'golf' }).map((e) => e.id), [3], 'search reads the type');
eq(filterEvents(evs, { q: 'dinner', type: 'Party', status: 'Draft' }).map((e) => e.id), [1], 'filters combine');
eq(filterEvents(evs, { q: 'oval', status: 'Draft' }).map((e) => e.id), [], 'filters combine to nothing');
eq(filterEvents([E({ id: 9, title: undefined, venue: null })], { q: 'x' }).map((e) => e.id), [], 'missing fields do not throw');
const before = JSON.stringify(evs);
filterEvents(evs, { q: 'a' });
eq(JSON.stringify(evs), before, 'the input list is not mutated');

// ── card counts: Yes (with +1s), No, Maybe, everything else is pending ────────
const G = (o) => ({ id: 1, eventId: 1, rsvp: 'Pending', plusOne: 0, email: '', inviteSentAt: '', ...o });
eq(cardCounts([G({ rsvp: 'Yes', plusOne: 2 }), G({ rsvp: 'Yes', plusOne: 1 }), G({ rsvp: 'No' }), G({ rsvp: 'Maybe' }), G({ rsvp: 'Pending' }), G({ rsvp: 'weird' })]),
  { yes: 2, no: 1, maybe: 1, pending: 2, plusOnes: 3 }, 'card counts, +1s only counted for Yes');
eq(cardCounts([G({ rsvp: 'No', plusOne: 4 })]), { yes: 0, no: 1, maybe: 0, pending: 0, plusOnes: 0 }, 'a +1 on a No is not counted');
eq(cardCounts([]), { yes: 0, no: 0, maybe: 0, pending: 0, plusOnes: 0 }, 'no guests, no counts');

// ── detail counts: attending = Yes + their +1s; invited / awaiting ────────────
const d = detailCounts([
  G({ id: 1, rsvp: 'Yes', plusOne: 2, email: 'a@x', inviteSentAt: '2026-01-01' }),
  G({ id: 2, rsvp: 'No', email: 'b@x' }),
  G({ id: 3, rsvp: 'Maybe' }),
  G({ id: 4, rsvp: 'Pending', email: 'd@x', inviteSentAt: '2026-01-01' }),
  G({ id: 5, rsvp: 'Pending', email: 'e@x' }),
  G({ id: 6, rsvp: 'Pending', email: '' }),
]);
eq(d.attending, 3, 'attending = 1 Yes + 2 plus-ones');
eq([d.yes, d.no, d.maybe, d.pending], [1, 1, 1, 3], 'yes / no / maybe / pending');
eq(d.notInvited, 2, 'not invited = no invite sent and has an email (guests 2 and 5)');
eq(d.pendingRSVP, 1, 'awaiting RSVP = invite sent and still Pending');
eq(d.total, 6, 'guest list size');

// ── the status class, as the old code built it ────────────────────────────────
eq(statusClass('Draft'), 'ev-status-draft', 'Draft class');
eq(statusClass('Completed'), 'ev-status-completed', 'Completed class');
eq(statusClass('Cancelled'), 'ev-status-cancelled', 'Cancelled class');
eq(statusClass('Invites Sent'), 'ev-status-invites-sent', 'Invites Sent class (old code: the CSS only has ev-status-sent, so it is unstyled)');

// ── search params ─────────────────────────────────────────────────────────────
eq(parseEventParams(''), { q: '', type: '', status: '' }, 'no params');
eq(parseEventParams('?q=dinner&type=Party&status=Invites%20Sent'), { q: 'dinner', type: 'Party', status: 'Invites Sent' }, 'all three params');
eq(parseEventParams('type=Nonsense&status=Nope'), { q: '', type: '', status: '' }, 'unknown values are ignored');
eq(serializeEventParams({ q: 'a b', type: 'Golf', status: '' }), 'q=a+b&type=Golf', 'serialise leaves out defaults');
eq(serializeEventParams({ q: '', type: 'Bad', status: 'Bad' }), '', 'serialise drops unknown values');
eq(mergeEventParams('foo=1&type=Golf', { q: 'x', type: '', status: 'Draft' }), 'foo=1&q=x&status=Draft', 'merge keeps foreign params and replaces ours');

// ── route ids ─────────────────────────────────────────────────────────────────
eq(eventIdFromParam('12'), 12, 'numeric string -> number');
eq(eventIdFromParam(7), 7, 'number stays');
eq(eventIdFromParam('abc'), null, 'not a number -> null');
eq(eventIdFromParam(''), null, 'empty -> null');
eq(eventIdFromParam(undefined), null, 'undefined -> null');
eq(eventIdFromParam('1.5'), null, 'fraction -> null');

eq(Object.keys(groupGuestsByEvent([G({ id: 1, eventId: 1 }), G({ id: 2, eventId: 2 }), G({ id: 3, eventId: 1 })])).map((k) => [k, groupGuestsByEvent([G({ id: 1, eventId: 1 }), G({ id: 2, eventId: 2 }), G({ id: 3, eventId: 1 })])[k].length]),
  [['1', 2], ['2', 1]], 'guests grouped by event, in order');

// ── the event form ────────────────────────────────────────────────────────────
eq(formFromEvent({}), { title: '', type: 'Birthday', status: 'Draft', date: '', time: '', venue: '', description: '' }, 'a blank form: first type, Draft');
eq(formFromEvent(E({ title: 'X', type: 'Golf', status: 'Completed', date: '2026-12-01', time: '7 PM', venue: 'V', description: 'D' })),
  { title: 'X', type: 'Golf', status: 'Completed', date: '2026-12-01', time: '7 PM', venue: 'V', description: 'D' }, 'an existing event fills the form');
eq(formFromEvent(E({ type: 'Mystery', status: 'Gone' })).type, 'Birthday', 'a type that is not an option falls to the first option, as the old select did');
eq(formFromEvent(E({ type: 'Mystery', status: 'Gone' })).status, 'Draft', 'a status that is not an option falls to the first option');
eq(eventFromForm({ title: '  T  ', type: 'Party', status: 'Draft', date: '', time: ' 7 PM ', venue: ' V ', description: ' D ' }),
  { title: 'T', type: 'Party', status: 'Draft', date: null, time: '7 PM', venue: 'V', description: 'D' }, 'trimmed; an empty date becomes null');
eq(eventFromForm({ title: 'T', type: 'Party', status: 'Draft', date: '2026-01-02', time: '', venue: '', description: '' }).date, '2026-01-02', 'a date stays');
eq(validateEvent({ title: '' }), EVENT_TITLE_REQUIRED, 'title required');
eq(EVENT_TITLE_REQUIRED, 'Event title is required', 'the old sentence');
eq(validateEvent({ title: 'x' }), null, 'a title is enough');

// ── the guest form ────────────────────────────────────────────────────────────
eq(formFromGuest(), { contactId: '', name: '', email: '', phone: '', rsvp: 'Pending', plusOne: '0', notes: '' }, 'a blank guest');
eq(guestFromForm(7, { contactId: '12', name: ' Ann ', email: ' a@x ', phone: ' 1 ', rsvp: 'Yes', plusOne: '2', notes: ' n ' }),
  { event_id: 7, contact_id: 12, name: 'Ann', email: 'a@x', phone: '1', rsvp: 'Yes', plus_one: 2, notes: 'n' }, 'the insert body');
eq(guestFromForm(7, { contactId: '', name: 'B', email: '', phone: '', rsvp: '', plusOne: 'x', notes: '' }),
  { event_id: 7, contact_id: null, name: 'B', email: '', phone: '', rsvp: 'Pending', plus_one: 0, notes: '' }, 'no contact -> null, rsvp defaults, bad +1 -> 0');
eq(validateGuest({ name: '' }), GUEST_NAME_REQUIRED, 'guest name required');
eq(GUEST_NAME_REQUIRED, 'Guest name is required', 'the old sentence');
eq(validateGuest({ name: 'x' }), null, 'a name is enough');
eq(plusOneOf('3'), 3, '+1 parses');
eq(plusOneOf(''), 0, 'empty +1 is 0');
eq(plusOneOf('abc'), 0, 'junk +1 is 0');
eq(plusOneOf('2.9'), 2, '+1 is parseInt');

// ── prefill from a contact ────────────────────────────────────────────────────
eq(prefillFromContact({ name: 'Ann', email: 'a@x.com, b@x.com', phone: '99' }), { name: 'Ann', email: 'a@x.com', phone: '99' }, 'first of several emails');
eq(prefillFromContact({ name: '', email: '', phone: '' }), { name: '', email: '', phone: '' }, 'blank contact');
eq(prefillFromContact(null), null, 'no contact -> null');

// ── prompts ───────────────────────────────────────────────────────────────────
eq(invitePrompt({ title: 'Dinner' }, 5, 'Hi {{name}}'), 'Send invites for the event "Dinner" (ID: 5). Here is the invite template:\n\nHi {{name}}', 'invite prompt');
eq(rsvpPrompt({ title: 'Dinner' }, 5), 'Sync RSVPs for the event "Dinner" (ID: 5)', 'RSVP prompt');

// ── the status-bar sentences with a count ─────────────────────────────────────
eq(sentenceCount(1, 'guest'), '1 guest', 'singular');
eq(sentenceCount(2, 'guest'), '2 guests', 'plural');
eq(sentenceCount(0, 'update'), '0 updates', 'zero is plural');
eq(sentenceCount(undefined, 'update'), 'undefined updates', 'a missing count is printed as the old template did');

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
