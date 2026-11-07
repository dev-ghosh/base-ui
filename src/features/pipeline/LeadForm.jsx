'use client';

import { useState } from 'react';
import { useStore } from '../../store/useStore.js';
import { peopleNames } from '../../lib/mappers.js';
import { LEAD_STAGES, LEAD_TYPES } from './model.js';

/**
 * The body and footer of the lead form (`#mo-lf`: buildLeadForm + the .mf buttons in the old
 * index.html). Mounted by LeadFormProvider only while the form is open, so its state starts fresh
 * each time. `init` is { form } (see formFromLead / formFromTask); `onSubmit(fields)` gets the
 * form's fields, which the provider turns into the data object saveLead() writes.
 */
export default function LeadForm({ init, onSubmit, onCancel }) {
  const contacts = useStore((s) => s.contacts);
  useStore((s) => s.people);                    // the owner options follow the people list
  const [f, setF] = useState(init.form);
  const set = (patch) => setF((cur) => ({ ...cur, ...patch }));
  const bind = (key) => ({ value: f[key], onChange: (e) => set({ [key]: e.target.value }) });

  const owners = ['', ...peopleNames([init.form.assignedTo])];

  return (
    <>
      <div id="lf-body">
        <div className="fg2">
          <div className="fg1 full"><label className="fl2" htmlFor="lf-name">Lead Title *</label>
            <input className="fi" id="lf-name" placeholder="e.g. Seed round — Blume Ventures / BIRAC BIG grant" {...bind('title')} /></div>
          <div className="fg1"><label className="fl2" htmlFor="lf-type-f">Type</label>
            <select className="fsel2" id="lf-type-f" {...bind('type')}>
              {LEAD_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select></div>
          <div className="fg1"><label className="fl2" htmlFor="lf-stage-f">Stage</label>
            <select className="fsel2" id="lf-stage-f" {...bind('stage')}>
              {LEAD_STAGES.map((s) => <option key={s.stage} value={s.stage}>{s.stage}</option>)}
            </select></div>
          <div className="fg1"><label className="fl2" htmlFor="lf-org">Organisation</label>
            <input className="fi" id="lf-org" {...bind('org')} /></div>
          <div className="fg1"><label className="fl2" htmlFor="lf-contact">Contact (POC)</label>
            <input className="fi" id="lf-contact" list="lf-contact-list" placeholder="Type to search contacts…" {...bind('contactName')} />
            <datalist id="lf-contact-list">{contacts.map((c) => <option key={c.id} value={c.name} />)}</datalist>
          </div>
          <div className="fg1"><label className="fl2" htmlFor="lf-amount">Amount (₹)</label>
            <input className="fi" id="lf-amount" type="number" min="0" step="any" {...bind('amount')} /></div>
          <div className="fg1"><label className="fl2" htmlFor="lf-deadline">Deadline</label>
            <input type="date" className="fi" id="lf-deadline" {...bind('deadline')} /></div>
          <div className="fg1"><label className="fl2" htmlFor="lf-followup">Next Follow-up</label>
            <input type="date" className="fi" id="lf-followup" {...bind('followup')} /></div>
          <div className="fg1"><label className="fl2" htmlFor="lf-at-f">Assigned To</label>
            <select className="fsel2" id="lf-at-f" {...bind('assignedTo')}>
              {owners.map((a) => <option key={a} value={a}>{a || '—'}</option>)}
            </select></div>
          <div className="fg1"><label className="fl2" htmlFor="lf-priority">Priority</label>
            <select className="fsel2" id="lf-priority" {...bind('priority')}>
              <option value="">—</option>
              <option value="P1">P1 (Highest)</option>
              <option value="P2">P2</option>
              <option value="P3">P3 (Lowest)</option>
            </select>
          </div>
          <div className="fg1 full"><label className="fl2" htmlFor="lf-next-step">Next Step</label>
            <input className="fi" id="lf-next-step" placeholder="What needs to happen next?" {...bind('nextStep')} /></div>
          <div className="fg1 full"><label className="fl2" htmlFor="lf-notes">Notes</label>
            <textarea className="fta" id="lf-notes" {...bind('notes')} /></div>
          <div className="fg1 full"><label className="fl2" htmlFor="lf-outcome">Outcome <span style={{ color: 'var(--txd)', fontWeight: 400, fontSize: '.7rem' }}>— fill when Won or Lost</span></label>
            <textarea className="fta" id="lf-outcome" {...bind('outcome')} /></div>
        </div>
      </div>
      <div className="mf">
        <button type="button" className="btn b-pr" onClick={() => onSubmit(f)}>Save</button>
        <button type="button" className="btn b-gh" onClick={onCancel}>Cancel</button>
      </div>
    </>
  );
}
