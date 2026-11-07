'use client';

import { useState } from 'react';
import { ABC_OPTIONS } from '../../lib/contact-form.js';

/**
 * The body and footer of the contact form (`#mo-cf`: buildContactForm + the .mf buttons in the old
 * index.html). Mounted by ContactFormProvider only while the form is open, so its state starts fresh each
 * time. `init` is { form } (see formFromContact); `onSubmit(fields)` gets the form's fields.
 */
export default function ContactForm({ init, onSubmit, onCancel }) {
  const [f, setF] = useState(init.form);
  const bind = (key) => ({ value: f[key], onChange: (e) => setF((cur) => ({ ...cur, [key]: e.target.value })) });
  const text = (id, label, key) => (
    <div className="fg1"><label className="fl2" htmlFor={id}>{label}</label><input className="fi" id={id} {...bind(key)} /></div>
  );
  const area = (id, label, key) => (
    <div className="fg1 full"><label className="fl2" htmlFor={id}>{label}</label><textarea className="fta" id={id} {...bind(key)} /></div>
  );

  return (
    <>
      <div id="cf-body">
        <div className="ms"><div className="msl">Identity</div><div className="fg2">
          {text('cf-n', 'Name *', 'name')}
          {text('cf-o', 'Organisation', 'org')}
          {text('cf-d', 'Designation', 'designation')}
          {text('cf-cat', 'Category', 'category')}
          <div className="fg1"><label className="fl2" htmlFor="cf-abcFull">ABC Priority</label>
            <select className="fsel2" id="cf-abcFull" {...bind('abcFull')}>
              <option value="">— Not set —</option>
              {ABC_OPTIONS.map((v) => <option key={v} value={v}>{v}</option>)}
            </select></div>
          {text('cf-loc', 'Location', 'location')}
        </div></div>
        <div className="ms"><div className="msl">Contact Info</div><div className="fg2">
          {text('cf-e', 'Email', 'email')}
          {text('cf-p', 'Phone', 'phone')}
          {text('cf-li', 'LinkedIn URL', 'linkedin')}
          {text('cf-src', 'Source', 'source')}
          {text('cf-at', 'Lead Assigned To', 'assignedTo')}
          {text('cf-proj', 'Project', 'project')}
        </div></div>
        <div className="ms"><div className="msl">Relationship</div><div className="fg2">
          <div className="fg1"><label className="fl2" htmlFor="cf-lastMtg">Last Meeting</label><input type="date" className="fi" id="cf-lastMtg" {...bind('lastMtg')} /></div>
          <div className="fg1"><label className="fl2" htmlFor="cf-nextFollowUp">Next Follow-up</label><input type="date" className="fi" id="cf-nextFollowUp" {...bind('nextFollowUp')} /></div>
          {area('cf-ns', 'Next Step', 'nextStep')}
          {area('cf-keyInputs', 'Key Inputs', 'keyInputs')}
          <div className="fg1 full"><label className="fl2" htmlFor="cf-curStatus">Current Status</label><input className="fi" id="cf-curStatus" {...bind('curStatus')} /></div>
        </div></div>
        <div className="ms"><div className="msl">Notes</div><div className="fg2">
          {area('cf-rem', 'Remarks', 'remarks')}
          {area('cf-rem2', 'Remarks 2', 'remarks2')}
          {text('cf-bday', 'Birthday (DD/MM/YYYY)', 'bday')}
          {text('cf-int', 'Interests', 'interests')}
          <div className="fg1 full"><label className="fl2" htmlFor="cf-tags">Manual Tags <span style={{ color: 'var(--txd)', fontWeight: 400, fontSize: '.7rem' }}>— comma-separated (e.g. VIP, Partner, Delhi)</span></label>
            <input className="fi" id="cf-tags" placeholder="tag1, tag2, tag3" {...bind('tags')} /></div>
        </div></div>
      </div>
      <div className="mf">
        <button type="button" className="btn b-pr" onClick={() => onSubmit(f)}>Save</button>
        <button type="button" className="btn b-gh" onClick={onCancel}>Cancel</button>
      </div>
    </>
  );
}
