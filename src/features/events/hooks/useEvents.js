'use client';

import { useMemo } from 'react';
import { useStore } from '../../../store/useStore.js';
import { filterEvents, groupGuestsByEvent } from '../model.js';

/**
 * { events, guestsByEvent }: the events in the store (the order they were loaded in) and the guests
 * grouped by event id (an object: guestsByEvent[eventId] is that event's guest array, absent when it has
 * none). With `filters` ({ q, type, status }) `events` is the filtered list. Events and guests are loaded
 * and kept current by the data loader and realtime; nothing is fetched here.
 */
export function useEvents(filters) {
  const all = useStore((s) => s.events);
  const guests = useStore((s) => s.guests);
  const q = filters?.q;
  const type = filters?.type;
  const status = filters?.status;
  const events = useMemo(
    () => (q || type || status ? filterEvents(all, { q, type, status }) : all),
    [all, q, type, status],
  );
  const guestsByEvent = useMemo(() => groupGuestsByEvent(guests), [guests]);
  return { events, guestsByEvent };
}
