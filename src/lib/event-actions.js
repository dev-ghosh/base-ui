/* event-actions.js — every write Events makes. Port of updateGuestRSVP, updateGuestPlusOne, saveEvent,
 * saveGuest, executeDeleteGuest, executeDeleteEvent, sendInvitesViaEdge, syncRSVPsViaEdge, copyInvitePrompt
 * and copyRSVPPrompt in rie-dashboard2/js/events.js.
 *
 * The old "Write flow": memory first (the store), then the REST call, and on failure put it back and say
 * so in the status bar. The store is never mutated in place: a changed row is a new object in a new array.
 * Read-only users: the REST writes go through rest.js, whose assertCanWrite() throws the "view-only"
 * sentence before any fetch; the two edge functions (which write guests and send e-mail) are guarded the
 * same way here.
 *
 * Plain JS with relative imports so plain Node can import it.
 */
import { store } from '../store/store.js';
import { assertCanWrite, sbInsert, sbUpdate, sbDelete } from './rest.js';
import { callEdgeFunction } from './edge.js';
import { syncData } from './load-data.js';
import { setStatus } from './status.js';
import { rowToEvent, rowToGuest } from './mappers.js';
import {
  guestFromForm, invitePrompt, plusOneOf, rsvpPrompt, sentenceCount, validateEvent, validateGuest,
} from '../features/events/model.js';

const sameId = (a, b) => a != null && b != null && String(a) === String(b);
const findGuest = (id) => store.getState().guests.find((g) => sameId(g.id, id)) || null;
const findEvent = (id) => store.getState().events.find((e) => sameId(e.id, id)) || null;

/** Replace fields on one guest (new object, new array). */
function patchGuest(id, fields) {
  store.setState((s) => ({ guests: s.guests.map((g) => (sameId(g.id, id) ? { ...g, ...fields } : g)) }));
}

/** Put a row into a list, replacing the one with its id (a realtime echo may have added it first). */
function upsert(key, row) {
  store.setState((s) => (s[key].some((x) => sameId(x.id, row.id))
    ? { [key]: s[key].map((x) => (sameId(x.id, row.id) ? row : x)) }
    : { [key]: [...s[key], row] }));
}

/**
 * A guest's RSVP. Optimistic (the old code waited for the server): the store changes first and is put
 * back, with an error in the status bar, if the write fails. @returns {Promise<boolean>} true when saved
 */
export async function setRsvp(guestId, rsvp) {
  const g = findGuest(guestId);
  if (!g) return false;
  const prev = { rsvp: g.rsvp, rsvpUpdatedAt: g.rsvpUpdatedAt };
  const now = new Date().toISOString();
  patchGuest(g.id, { rsvp, rsvpUpdatedAt: now });
  try {
    await sbUpdate('event_guests', g.id, { rsvp, rsvp_updated_at: now });
    setStatus('online', 'RSVP updated');
    return true;
  } catch (e) {
    patchGuest(g.id, prev);
    setStatus('error', 'RSVP update failed: ' + e.message);
    return false;
  }
}

/** A guest's number of +1s (`parseInt(val) || 0`). Optimistic with rollback, like setRsvp. */
export async function setPlusOne(guestId, val) {
  const g = findGuest(guestId);
  if (!g) return false;
  const plus_one = plusOneOf(val);
  const prev = { plusOne: g.plusOne };
  patchGuest(g.id, { plusOne: plus_one });
  try {
    await sbUpdate('event_guests', g.id, { plus_one });
    setStatus('online', '+1 updated');
    return true;
  } catch (e) {
    patchGuest(g.id, prev);
    setStatus('error', 'Update failed: ' + e.message);
    return false;
  }
}

/**
 * Create or update an event from the form's data (see eventFromForm). `editId` set = update, null = insert
 * (with created_by). A missing title is reported in the status bar and nothing is written. A failing write
 * is reported (a 404 as "Events table not found"). @returns {Promise<boolean>}
 */
export async function saveEvent(data, editId = null) {
  const problem = validateEvent(data);
  if (problem) { setStatus('error', problem); return false; }
  setStatus('syncing', 'Saving event…');
  try {
    if (editId != null) {
      const [updated] = await sbUpdate('events', editId, data);
      if (findEvent(editId)) upsert('events', rowToEvent(updated));
    } else {
      const [inserted] = await sbInsert('events', { ...data, created_by: store.getState().currentUser || 'unknown' });
      upsert('events', rowToEvent(inserted));
    }
    setStatus('online', 'Event saved');
    return true;
  } catch (e) {
    setStatus('error', e.message.includes('404') ? 'Events table not found — create it in Supabase first' : 'Save failed: ' + e.message);
    return false;
  }
}

/** Delete the event's guests, then the event. Not optimistic, as before. @returns {Promise<boolean>} */
export async function deleteEvent(id) {
  setStatus('syncing', 'Deleting event…');
  try {
    const eventGuests = store.getState().guests.filter((g) => sameId(g.eventId, id));
    await Promise.all(eventGuests.map((g) => sbDelete('event_guests', g.id)));
    await sbDelete('events', id);
    store.setState((s) => ({
      guests: s.guests.filter((g) => !sameId(g.eventId, id)),
      events: s.events.filter((e) => !sameId(e.id, id)),
    }));
    setStatus('online', 'Event deleted');
    return true;
  } catch (e) {
    setStatus('error', 'Delete failed: ' + e.message);
    return false;
  }
}

/**
 * Add a guest from the guest form's fields (see guestFromForm). A missing name is reported and nothing is
 * written. @returns {Promise<boolean>} true when added
 */
export async function addGuest(eventId, fields) {
  const data = guestFromForm(eventId, fields);
  const problem = validateGuest(data);
  if (problem) { setStatus('error', problem); return false; }
  setStatus('syncing', 'Adding guest…');
  try {
    const [inserted] = await sbInsert('event_guests', data);
    upsert('guests', rowToGuest(inserted));
    setStatus('online', 'Guest added');
    return true;
  } catch (e) {
    setStatus('error', 'Failed to add guest: ' + e.message);
    return false;
  }
}

/** Remove a guest. Not optimistic, as before. @returns {Promise<boolean>} */
export async function deleteGuest(guestId) {
  setStatus('syncing', 'Removing guest…');
  try {
    await sbDelete('event_guests', guestId);
    store.setState((s) => ({ guests: s.guests.filter((g) => !sameId(g.id, guestId)) }));
    setStatus('online', 'Guest removed');
    return true;
  } catch (e) {
    setStatus('error', 'Remove failed: ' + e.message);
    return false;
  }
}

/**
 * Edge function `send-invites`, body { eventId, template }: Claude personalises and sends the invites and
 * answers { guestIds, count }; those guests are marked as invited. @returns {Promise<boolean>}
 */
export async function sendInvites(eventId, template) {
  const text = (template || '').trim();
  if (!text) { setStatus('error', 'Paste your invite template first'); return false; }
  setStatus('syncing', 'Sending invites via Claude…');
  try {
    assertCanWrite();
    const data = await callEdgeFunction('send-invites', { eventId, template: text });
    const sentAt = new Date().toISOString();
    for (const gId of data.guestIds || []) patchGuest(gId, { inviteSentAt: sentAt });
    setStatus('online', `Invites sent to ${sentenceCount(data.count, 'guest')}`);
    return true;
  } catch (e) {
    setStatus('error', 'Send failed: ' + e.message);
    return false;
  }
}

/**
 * Edge function `sync-rsvps`, body { eventId, emailText }: Claude reads the pasted e-mail thread and updates
 * the guests' RSVPs, answering { updated }; everything is then reloaded. @returns {Promise<boolean>}
 */
export async function syncRsvps(eventId, emailText) {
  const text = (emailText || '').trim();
  if (!text) { setStatus('error', 'Paste the email thread text first'); return false; }
  setStatus('syncing', 'Parsing RSVPs with Claude…');
  try {
    assertCanWrite();
    const data = await callEdgeFunction('sync-rsvps', { eventId, emailText: text });
    await syncData();
    setStatus('online', `RSVPs synced — ${sentenceCount(data.updated, 'update')}`);
    return true;
  } catch (e) {
    setStatus('error', 'Sync failed: ' + e.message);
    return false;
  }
}

/** navigator.clipboard, falling back to a hidden textarea and execCommand (writeClipboard). */
async function writeClipboard(text, successMsg) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.cssText = 'position:fixed;opacity:0';
    document.body.appendChild(ta); ta.select(); document.execCommand?.('copy'); document.body.removeChild(ta);
  }
  setStatus('online', successMsg);
}

/** Copy the "send the invites" prompt for pasting into Claude chat. */
export async function copyInvitePrompt(eventId, template) {
  const ev = findEvent(eventId);
  if (!ev) return false;
  const text = (template || '').trim();
  if (!text) { setStatus('error', 'Please paste your invite template first'); return false; }
  await writeClipboard(invitePrompt(ev, eventId, text), 'Prompt copied — paste it into Claude chat to send invites');
  return true;
}

/** Copy the "sync the RSVPs" prompt for pasting into Claude chat. */
export async function copyRsvpPrompt(eventId) {
  const ev = findEvent(eventId);
  if (!ev) return false;
  await writeClipboard(rsvpPrompt(ev, eventId), 'Prompt copied — paste it into Claude chat to sync RSVPs');
  return true;
}

/** The actions as one stable object. */
export const eventActions = {
  saveEvent, deleteEvent, addGuest, deleteGuest, setRsvp, setPlusOne, sendInvites, syncRsvps, copyInvitePrompt, copyRsvpPrompt,
};
