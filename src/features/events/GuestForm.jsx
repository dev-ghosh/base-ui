'use client';

import { useEffect, useRef, useState } from 'react';
import { useStore } from '../../store/useStore.js';
import { RSVP_VALUES, formFromGuest, prefillFromContact } from './model.js';

const FLASH_MS = 1500;

/**
 * The body and footer of the guest form (`#mo-guest`: openAddGuest + the .mf buttons in the old index.html).
 * Mounted by EventFormProvider only while the form is open. Picking a BASE contact fills name, first e-mail
 * and phone (prefillGuest) and flashes those boxes green for 1.5 s; picking "External guest" empties them.
 * `onSubmit(fields)` gets the form's fields (see guestFromForm).
 */
export default function GuestForm({ onSubmit, onCancel }) {
  const contacts = useStore((s) => s.contacts);
  const [f, setF] = useState(formFromGuest);
  const [flash, setFlash] = useState(false);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);

  const set = (patch) => setF((cur) => ({ ...cur, ...patch }));
  const bind = (key) => ({ value: f[key], onChange: (e) => set({ [key]: e.target.value }) });
  const flashStyle = flash ? { borderColor: 'var(--gr)' } : undefined;

  const pick = (e) => {
    const value = e.target.value;
    const id = parseInt(value) || null;
    if (!id) { set({ contactId: value, name: '', email: '', phone: '' }); return; }
    const filled = prefillFromContact(contacts.find((x) => x.id === id));
    if (!filled) { set({ contactId: value }); return; }
    set({ contactId: value, ...filled });
    setFlash(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setFlash(false), FLASH_MS);
  };

  return (
    <>
      <div id="guest-body">
        <div className="fg1" style={{ marginBottom: 10 }}>
          <label className="fl2" htmlFor="g-contact">Pick from BASE contacts (optional)</label>
          <select className="fsel2" id="g-contact" value={f.contactId} onChange={pick}>
            <option value="">— External guest —</option>
            {contacts.map((c) => <option key={c.id} value={c.id}>{c.name} — {c.org || ''}</option>)}
          </select>
        </div>
        <div className="fg2">
          <div className="fg1"><label className="fl2" htmlFor="g-name">Name *</label>
            <input className="fi" id="g-name" style={flashStyle} {...bind('name')} /></div>
          <div className="fg1"><label className="fl2" htmlFor="g-email">Email</label>
            <input className="fi" id="g-email" style={flashStyle} {...bind('email')} /></div>
          <div className="fg1"><label className="fl2" htmlFor="g-phone">Phone</label>
            <input className="fi" id="g-phone" style={flashStyle} {...bind('phone')} /></div>
          <div className="fg1"><label className="fl2" htmlFor="g-rsvp">RSVP</label>
            <select className="fsel2" id="g-rsvp" {...bind('rsvp')}>
              {RSVP_VALUES.map((v) => <option key={v} value={v}>{v}</option>)}
            </select></div>
          <div className="fg1"><label className="fl2" htmlFor="g-plus">+1s</label>
            <input type="number" className="fi" id="g-plus" min="0" {...bind('plusOne')} /></div>
          <div className="fg1 full"><label className="fl2" htmlFor="g-notes">Notes</label>
            <input className="fi" id="g-notes" {...bind('notes')} /></div>
        </div>
      </div>
      <div className="mf">
        <button type="button" className="btn b-pr" onClick={() => onSubmit(f)}>Add Guest</button>
        <button type="button" className="btn b-gh" onClick={onCancel}>Cancel</button>
      </div>
    </>
  );
}
