'use client';

import { useMemo } from 'react';
import { useStore } from '../../../store/useStore.js';
import { eventActions } from '../../../lib/event-actions.js';
import { eventIdFromParam } from '../model.js';

const NONE = [];

/**
 * { guests, addGuest(fields), setRsvp(guestId, rsvp), setPlusOne(guestId, value), removeGuest(guestId),
 *   sendInvites(template), syncRsvps(emailText) } for one event. `eventId` may be a route param (a string).
 *
 * setRsvp and setPlusOne are optimistic: the store changes first and is put back, with an error in the
 * status bar, if the write fails. sendInvites calls the edge function `send-invites` with
 * { eventId, template }; syncRsvps calls `sync-rsvps` with { eventId, emailText } and then reloads the data.
 * All of them resolve true when it worked. A view-only user's writes are refused before any request, with
 * the "view-only" sentence.
 */
export function useGuests(eventId) {
  const id = eventIdFromParam(eventId);
  const all = useStore((s) => s.guests);
  const guests = useMemo(() => (id == null ? NONE : all.filter((g) => String(g.eventId) === String(id))), [all, id]);
  const actions = useMemo(() => ({
    addGuest: (fields) => eventActions.addGuest(id, fields),
    setRsvp: eventActions.setRsvp,
    setPlusOne: eventActions.setPlusOne,
    removeGuest: eventActions.deleteGuest,
    sendInvites: (template) => eventActions.sendInvites(id, template),
    syncRsvps: (emailText) => eventActions.syncRsvps(id, emailText),
  }), [id]);
  return { guests, ...actions };
}
