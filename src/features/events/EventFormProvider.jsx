'use client';

import { createContext, useCallback, useMemo, useState } from 'react';
import Modal from '../../components/Modal.jsx';
import { store } from '../../store/store.js';
import { setStatus } from '../../lib/status.js';
import { addGuest, deleteEvent, deleteGuest, saveEvent } from '../../lib/event-actions.js';
import { fmtD } from '../../lib/format.js';
import EventForm from './EventForm.jsx';
import GuestForm from './GuestForm.jsx';
import { eventFromForm, formFromEvent, guestFromForm, validateEvent, validateGuest } from './model.js';

const sameId = (a, b) => a != null && b != null && String(a) === String(b);

/** What useEventForm() returns outside a provider: nothing opens (a component rendered alone in a test). */
export const NO_EVENT_FORM = {
  open: false, openAdd: () => {}, openEdit: () => {}, openAddGuest: () => {}, confirmDeleteGuest: () => {},
  confirmDeleteEvent: () => {}, close: () => {},
};
export const EventFormContext = createContext(NO_EVENT_FORM);

const boxStyle = { padding: '10px 14px', background: 'var(--sf2)', border: '1px solid var(--hot)', borderRadius: 'var(--rs)' };

/**
 * Owns the event form (`#mo-ef`), the guest form (`#mo-guest`) and the two delete confirmations, mounted
 * once in the (app) layout. They are component state, not routes (spec C7 rule 5), and several places open
 * them: the header's New > Event, and the event viewer's Edit, + Add Guest, trash buttons and Delete event.
 *
 *   openAdd()                              a blank event
 *   openEdit(id)                           an existing event
 *   openAddGuest(eventId, onDone?)         the guest form; onDone runs after the guest was added
 *   confirmDeleteGuest(guestId, onDone?)   "Remove guest from this event?"; onDone runs after it was removed
 *   confirmDeleteEvent(id, onDeleted?)     "Permanently delete this event?"; onDeleted runs after it was deleted
 *   close()                                close the event form
 *
 * Saving works as the old saveEvent / saveGuest did: the title (name) is checked first (the form stays open
 * with the error in the status bar), then the form closes and the write runs in the background.
 */
export function EventFormProvider({ children }) {
  const [state, setState] = useState(null);       // null | { title, editId, init }
  const [guestFor, setGuestFor] = useState(null); // null | { eventId, onDone }
  const [delGuest, setDelGuest] = useState(null); // null | { guest, onDone }
  const [delEvent, setDelEvent] = useState(null); // null | { event, gCount, onDeleted }

  const close = useCallback(() => setState(null), []);

  const openAdd = useCallback(() => {
    setState({ title: 'Create Event', editId: null, init: { form: formFromEvent({}) } });
  }, []);

  const openEdit = useCallback((id) => {
    const ev = store.getState().events.find((e) => sameId(e.id, id)) || {};
    setState({ title: 'Edit Event', editId: ev.id ?? id, init: { form: formFromEvent(ev) } });
  }, []);

  const submit = useCallback(async (fields) => {
    const data = eventFromForm(fields);
    const problem = validateEvent(data);
    if (problem) { setStatus('error', problem); return; }   // stays open, as the old saveEvent returned before closeMo
    const editId = state?.editId ?? null;
    close();
    await saveEvent(data, editId);
  }, [state, close]);

  const openAddGuest = useCallback((eventId, onDone) => setGuestFor({ eventId, onDone }), []);

  const submitGuest = async (fields) => {
    const problem = validateGuest(guestFromForm(guestFor.eventId, fields));
    if (problem) { setStatus('error', problem); return; }
    const { eventId, onDone } = guestFor;
    setGuestFor(null);                             // closeMo('mo-guest')
    if (await addGuest(eventId, fields)) onDone?.();
  };

  const confirmDeleteGuest = useCallback((guestId, onDone) => {
    const guest = store.getState().guests.find((g) => sameId(g.id, guestId));
    if (!guest) return;
    setDelGuest({ guest, onDone });
  }, []);

  const runDeleteGuest = async () => {
    const { guest, onDone } = delGuest;
    setDelGuest(null);                             // closeMo('mo-del')
    if (await deleteGuest(guest.id)) onDone?.();
  };

  const confirmDeleteEvent = useCallback((id, onDeleted) => {
    const s = store.getState();
    const event = s.events.find((e) => sameId(e.id, id));
    if (!event) return;
    setDelEvent({ event, gCount: s.guests.filter((g) => sameId(g.eventId, id)).length, onDeleted });
  }, []);

  const runDeleteEvent = async () => {
    const { event, onDeleted } = delEvent;
    setDelEvent(null);
    if (await deleteEvent(event.id)) onDeleted?.();
  };

  const api = useMemo(
    () => ({ open: state != null, openAdd, openEdit, openAddGuest, confirmDeleteGuest, confirmDeleteEvent, close }),
    [state, openAdd, openEdit, openAddGuest, confirmDeleteGuest, confirmDeleteEvent, close],
  );

  const g = delGuest?.guest;
  const ev = delEvent?.event;
  const n = delEvent?.gCount ?? 0;
  return (
    <EventFormContext.Provider value={api}>
      {children}
      <Modal id="mo-ef" open={state != null} maxWidth={560} title={state?.title ?? 'Create Event'} onClose={close}>
        {state ? <EventForm key={`${state.title}:${state.editId ?? ''}`} init={state.init} onSubmit={submit} onCancel={close} /> : null}
      </Modal>
      <Modal id="mo-guest" open={guestFor != null} maxWidth={500} title="Add Guest" onClose={() => setGuestFor(null)}>
        {guestFor ? <GuestForm key={guestFor.eventId} onSubmit={submitGuest} onCancel={() => setGuestFor(null)} /> : null}
      </Modal>
      <Modal id="mo-del-guest" open={delGuest != null} maxWidth={420} ariaLabel="Confirm delete" onClose={() => setDelGuest(null)}
        title={<span style={{ color: 'var(--hot)' }}>Confirm delete</span>}>
        {g ? (
          <>
            <div id="del-body-guest" style={{ fontSize: '.82rem', color: 'var(--tx)', lineHeight: 1.7, marginBottom: 4 }}>
              <p style={{ marginBottom: 10 }}>Remove guest from this event?</p>
              <div style={boxStyle}>
                <strong>{g.name}</strong><br />
                <span style={{ fontSize: '.77rem', color: 'var(--txm)' }}>{g.email || '—'}</span>
              </div>
            </div>
            <div className="mf">
              <button type="button" className="btn b-dn" id="del-confirm-btn-guest" onClick={runDeleteGuest}>Delete permanently</button>
              <button type="button" className="btn b-gh" onClick={() => setDelGuest(null)}>Cancel</button>
            </div>
          </>
        ) : null}
      </Modal>
      <Modal id="mo-del-event" open={delEvent != null} maxWidth={420} ariaLabel="Confirm delete" onClose={() => setDelEvent(null)}
        title={<span style={{ color: 'var(--hot)' }}>Confirm delete</span>}>
        {ev ? (
          <>
            <div id="del-body-event" style={{ fontSize: '.82rem', color: 'var(--tx)', lineHeight: 1.7, marginBottom: 4 }}>
              <p style={{ marginBottom: 10 }}>Permanently delete this event?</p>
              <div style={{ ...boxStyle, marginBottom: 10 }}>
                <strong>{ev.title}</strong> · {ev.type}<br />
                <span style={{ fontSize: '.77rem', color: 'var(--txm)' }}>{ev.date ? fmtD(ev.date) : ''}</span>
              </div>
              {n ? <p style={{ color: 'var(--hot)', fontSize: '.77rem' }}>This will also remove {n} guest record{n > 1 ? 's' : ''}.</p> : null}
              <p style={{ color: 'var(--txm)', fontSize: '.77rem' }}>This cannot be undone.</p>
            </div>
            <div className="mf">
              <button type="button" className="btn b-dn" id="del-confirm-btn-event" onClick={runDeleteEvent}>Delete permanently</button>
              <button type="button" className="btn b-gh" onClick={() => setDelEvent(null)}>Cancel</button>
            </div>
          </>
        ) : null}
      </Modal>
    </EventFormContext.Provider>
  );
}
