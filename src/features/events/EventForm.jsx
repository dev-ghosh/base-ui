'use client';

import { useState } from 'react';
import { EVENT_STATUSES, EVENT_TYPES } from './model.js';

/**
 * The body and footer of the event form (`#mo-ef`: buildEventForm + the .mf buttons in the old index.html).
 * Mounted by EventFormProvider only while the form is open, so its state starts fresh each time. `init` is
 * { form } (see formFromEvent); `onSubmit(fields)` gets the form's fields, which the provider turns into
 * the row saveEvent() writes.
 */
export default function EventForm({ init, onSubmit, onCancel }) {
  const [f, setF] = useState(init.form);
  const bind = (key) => ({ value: f[key], onChange: (e) => setF((cur) => ({ ...cur, [key]: e.target.value })) });
  return (
    <>
      <div id="ef-body">
        <div className="fg2">
          <div className="fg1 full"><label className="fl2" htmlFor="ef-title-f">Event Title *</label>
            <input className="fi" id="ef-title-f" {...bind('title')} /></div>
          <div className="fg1"><label className="fl2" htmlFor="ef-type-f">Type</label>
            <select className="fsel2" id="ef-type-f" {...bind('type')}>
              {EVENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select></div>
          <div className="fg1"><label className="fl2" htmlFor="ef-status-f">Status</label>
            <select className="fsel2" id="ef-status-f" {...bind('status')}>
              {EVENT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select></div>
          <div className="fg1"><label className="fl2" htmlFor="ef-date">Date</label>
            <input type="date" className="fi" id="ef-date" {...bind('date')} /></div>
          <div className="fg1"><label className="fl2" htmlFor="ef-time">Time</label>
            <input className="fi" id="ef-time" placeholder="e.g. 7:30 PM" {...bind('time')} /></div>
          <div className="fg1 full"><label className="fl2" htmlFor="ef-venue">Venue</label>
            <input className="fi" id="ef-venue" {...bind('venue')} /></div>
          <div className="fg1 full"><label className="fl2" htmlFor="ef-desc">Notes / Description</label>
            <textarea className="fta" id="ef-desc" {...bind('description')} /></div>
        </div>
      </div>
      <div className="mf">
        <button type="button" className="btn b-pr" onClick={() => onSubmit(f)}>Save Event</button>
        <button type="button" className="btn b-gh" onClick={onCancel}>Cancel</button>
      </div>
    </>
  );
}
