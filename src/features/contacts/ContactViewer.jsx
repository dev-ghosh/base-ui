'use client';

import { useEffect, useState } from 'react';
import Modal from '../../components/Modal.jsx';
import { useStore } from '../../store/useStore.js';
import { fmtD } from '../../lib/format.js';
import { getContactHistory } from '../../lib/rest.js';
import { rowToHistory } from '../../lib/mappers.js';
import { useContactForm } from './hooks/useContactForm.js';

/** A label/value pair (detRow): "—" and a muted value when empty. */
function Row({ label, value, full = false }) {
  return (
    <div className={'fro' + (full ? ' full' : '')}>
      <div className="fla">{label}</div>
      <div className={'fva' + (value ? '' : ' fva-empty')}>{value || '—'}</div>
    </div>
  );
}

/** A label/value pair whose value is a link (detLink). */
function LinkRow({ label, value, href }) {
  return (
    <div className="fro">
      <div className="fla">{label}</div>
      <div className={'fva' + (value ? '' : ' fva-empty')}>
        {value ? <a href={href || undefined} target="_blank" rel="noreferrer">{value}</a> : '—'}
      </div>
    </div>
  );
}

/** Activity History: Loading…, then the touchpoints (newest first) or the old "no history" sentence. */
function History({ id }) {
  const [rows, setRows] = useState(null);   // null = loading
  useEffect(() => {
    let live = true;
    setRows(null);
    getContactHistory(id).then((r) => { if (live) setRows(r.map(rowToHistory)); }).catch(() => {});
    return () => { live = false; };
  }, [id]);
  return (
    <div className="ms" id="det-history-section"><div className="msl">Activity History</div>
      <div id="det-history" style={{ fontSize: '.78rem', color: 'var(--txm)', padding: '6px 0' }}>
        {rows == null ? 'Loading…'
          : !rows.length ? 'No history yet — create contact_history table in Supabase to enable this.'
            : rows.map((h) => (
              <div key={h.id} style={{ display: 'flex', gap: 8, padding: '5px 0', borderBottom: '1px solid var(--bd)' }}>
                <span style={{ color: 'var(--txd)', flexShrink: 0 }}>{new Date(h.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
                <span style={{ color: 'var(--txm)', textTransform: 'uppercase', fontSize: '.68rem', flexShrink: 0 }}>{h.type}</span>
                <span>{h.notes}</span>
              </div>
            ))}
      </div>
    </div>
  );
}

/** The body of the contact viewer (openContact): identity, contact info, relationship, notes, audit, history. */
function ContactBody({ c }) {
  return (
    <>
      <div className="ms"><div className="msl">Identity</div><div className="fg">
        <Row label="Name" value={c.name} /> <Row label="Organisation" value={c.org} />
        <Row label="Designation" value={c.designation} /> <Row label="Category" value={c.category} />
        <Row label="ABC" value={c.priority ? `[${c.priority}] ${c.priorityFull || ''}` : ''} /> <Row label="Location" value={c.location} />
        <Row label="Assigned To" value={c.assignedTo} />
      </div></div>
      <div className="ms"><div className="msl">Contact Info</div><div className="fg">
        <LinkRow label="Email" value={c.email} href={'mailto:' + c.email} /> <Row label="Phone" value={c.phone} />
        <LinkRow label="LinkedIn" value="View Profile" href={c.linkedin} /> <Row label="Source" value={c.source} />
        <Row label="2nd POC Email" value={c.poc2Email} /> <Row label="2nd POC Phone" value={c.poc2Phone} />
      </div></div>
      <div className="ms"><div className="msl">Relationship</div><div className="fg">
        <Row label="Last Meeting" value={fmtD(c.lastMtg)} /> <Row label="Next Follow-up" value={fmtD(c.nextFollowUp)} />
        <Row label="Next Step" value={c.nextStep} full />
        <Row label="Key Inputs" value={c.keyInputs} full />
        <Row label="Action Item" value={c.actionItem} full />
        <Row label="Current Status" value={c.status} /> <Row label="Work Status" value={c.workStatus} />
      </div></div>
      <div className="ms"><div className="msl">Notes</div><div className="fg">
        <Row label="Remarks" value={c.remarks} full />
        <Row label="Remarks 2" value={c.remarks2} full />
        <Row label="Intro" value={c.intro} full />
        <Row label="Birthday" value={c.birthday} /> <Row label="Interests" value={c.interests} />
      </div></div>
      <div className="ms"><div className="msl">Audit</div><div className="fg">
        <Row label="Created By" value={c.createdBy} /> <Row label="Updated By" value={c.updatedBy} />
        <Row label="Last Updated" value={c.updatedAt ? new Date(c.updatedAt).toLocaleString('en-IN') : ''} />
      </div></div>
      <History id={c.id} />
      <div className="ms"><div className="msl">AI Actions</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', padding: '6px 0' }}></div>
      </div>
    </>
  );
}

/**
 * The contact viewer (`mo-det`, openContact): every field, the activity history, and Edit / Delete /
 * Close. `framed` renders it inside the page frame (a direct visit to /contacts/people/<id>); otherwise
 * it is the modal over the page that opened it (the intercepted route). The id is a route parameter,
 * so it is turned into a number to find the (numeric) contact id; an id that is not a loaded contact
 * shows a message instead of the card, never a crash.
 *
 * Edit opens the form; Delete first closes the viewer and then asks, as the old confirmDeleteContact did.
 */
export default function ContactViewer({ id, framed = false, onClose }) {
  const numeric = /^\d+$/.test(String(id)) ? Number(id) : null;
  const contact = useStore((s) => (numeric == null ? null : s.contacts.find((c) => c.id === numeric) ?? null));
  const dataLoaded = useStore((s) => s.dataLoaded);
  const form = useContactForm();

  const edit = () => { form.openEdit(contact.id); if (!framed) onClose(); };
  const remove = () => { const cid = contact.id; onClose(); form.confirmDelete(cid); };

  const title = contact ? (contact.name || 'Contact') + ' — ' + (contact.org || '') : 'Contact';
  const body = contact ? (
    <div id="det-body" style={{ maxHeight: framed ? undefined : '70vh', overflowY: framed ? undefined : 'auto' }}>
      <ContactBody c={contact} />
    </div>
  ) : (
    <div id="det-body">
      <p style={{ margin: '12px 0', fontSize: '.82rem', color: 'var(--txm)' }}>
        {dataLoaded ? <>Contact not found. It may have been deleted, or it is not one you can see.<br /><span style={{ color: 'var(--txd)' }}>{String(id)}</span></> : 'Loading…'}
      </p>
    </div>
  );
  const foot = (
    <div className="mf">
      {contact ? <button type="button" className="btn b-ol" onClick={edit}>Edit</button> : null}
      {contact ? <button type="button" className="btn b-dn" onClick={remove}>Delete</button> : null}
      <button type="button" className="btn b-gh" onClick={onClose}>Close</button>
    </div>
  );

  if (framed) {
    return (
      <div className="tp active">
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 16px' }}>
          <div className="mb mb-lg" style={{ margin: '0 auto', maxWidth: 760 }}>
            <div className="mh">
              <div className="mti" id="det-title">{title}</div>
              <button type="button" className="mx" onClick={onClose} aria-label="Close">✕</button>
            </div>
            {body}
            {foot}
          </div>
        </div>
      </div>
    );
  }
  return (
    <Modal id="mo-det" open wide title={title} onClose={onClose}>
      {body}
      {foot}
    </Modal>
  );
}
