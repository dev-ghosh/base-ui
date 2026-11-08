'use client';

import { useContext } from 'react';
import { EventFormContext } from '../EventFormProvider.jsx';

/**
 * { open, openAdd(), openEdit(id), openAddGuest(eventId, onDone?), confirmDeleteGuest(guestId, onDone?),
 *   confirmDeleteEvent(id, onDeleted?), close }
 * The event form, the guest form and the two delete confirmations are component state mounted once in the
 * (app) layout (EventFormProvider). `open` is whether the event form is showing.
 */
export function useEventForm() {
  return useContext(EventFormContext);
}
