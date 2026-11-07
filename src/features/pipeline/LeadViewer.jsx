'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Modal from '../../components/Modal.jsx';
import { useStore } from '../../store/useStore.js';
import { fmtD } from '../../lib/format.js';
import { taskPrefillFromLead } from '../../lib/lead-form.js';
import { useTaskForm } from '../tasks/hooks/useTaskForm.js';
import { daysInStage, fmtAmt } from './model.js';
import { useLeadForm } from './hooks/useLeadForm.js';
import TouchpointLog from './TouchpointLog.jsx';

const linkStyle = { color: 'var(--ac2)', cursor: 'pointer' };

/** A label/value pair, absent when there is no value (the old row()). */
function Row({ label, children }) {
  if (children == null || children === '' || children === false) return null;
  return (
    <div>
      <div style={{ fontSize: '.66rem', color: 'var(--txd)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: '.82rem' }}>{children}</div>
    </div>
  );
}

/** The body of the lead viewer (ldetHtml): details, next step, notes, outcome, linked tasks, touchpoints. */
function LeadBody({ lead: l }) {
  const router = useRouter();
  const contacts = useStore((s) => s.contacts);
  const tasks = useStore((s) => s.tasks);
  const dis = daysInStage(l);
  const contact = l.contactId ? contacts.find((c) => c.id === l.contactId) : null;
  const linkedTasks = tasks.filter((t) => t.leadId && Number(t.leadId) === Number(l.id));
  const sourceTask = l.sourceTaskId ? tasks.find((t) => String(t.id) === String(l.sourceTaskId)) : null;

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))', gap: 12, marginBottom: 14 }}>
        <Row label="Type">{l.type}</Row>
        <Row label="Stage">{l.stage}{dis != null ? <> <span style={{ color: 'var(--txd)', fontSize: '.7rem' }}>· {dis}d</span></> : null}</Row>
        <Row label="Organisation">{l.org}</Row>
        <Row label="Contact">
          {contact ? <Link style={linkStyle} href={`/contacts/people/${contact.id}`}>{contact.name}</Link> : l.contactName}
        </Row>
        <Row label="Amount">{fmtAmt(l.amount)}</Row>
        <Row label="Deadline">{l.deadline ? fmtD(l.deadline) : ''}</Row>
        <Row label="Next Follow-up">{l.nextFollowUp ? fmtD(l.nextFollowUp) : ''}</Row>
        <Row label="Assigned To">{l.assignedTo}</Row>
        <Row label="Priority">{l.priority}</Row>
        <Row label="Created">{fmtD(l.createdAt?.slice(0, 10))}{l.createdBy ? ' by ' + l.createdBy : ''}</Row>
      </div>
      {l.nextStep ? (
        <div style={{ padding: '9px 12px', background: 'var(--acg)', border: '1px solid var(--ac-ring)', borderRadius: 'var(--rs)', fontSize: '.8rem', marginBottom: 12 }}>
          <strong>Next step:</strong> {l.nextStep}
        </div>
      ) : null}
      {l.notes ? <div style={{ fontSize: '.8rem', color: 'var(--txm)', whiteSpace: 'pre-wrap', marginBottom: 12 }}>{l.notes}</div> : null}
      {l.outcome ? (
        <div style={{ padding: '9px 12px', background: 'var(--sf2)', border: '1px solid var(--bd)', borderRadius: 'var(--rs)', fontSize: '.8rem', marginBottom: 12 }}>
          <strong>Outcome:</strong> {l.outcome}
        </div>
      ) : null}
      {sourceTask ? (
        <div style={{ fontSize: '.74rem', color: 'var(--txm)', marginBottom: 12 }}>
          Converted from task: <Link style={linkStyle} href={`/work/tasks/${sourceTask.id}`}>{sourceTask.task}</Link>
        </div>
      ) : null}

      <div style={{ borderTop: '1px solid var(--bd)', paddingTop: 12, marginBottom: 12 }}>
        <div style={{ fontWeight: 700, fontSize: '.82rem', marginBottom: 8 }}>
          Linked tasks {linkedTasks.length ? <span style={{ color: 'var(--txd)', fontWeight: 400 }}>({linkedTasks.length})</span> : null}
        </div>
        {linkedTasks.length ? linkedTasks.map((t) => (
          <div
            key={t.id}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: 'var(--sf2)', borderRadius: 'var(--rs)', fontSize: '.78rem', marginBottom: 5, cursor: 'pointer' }}
            onClick={() => router.push(`/work/tasks/${t.id}`)}
          >
            <span style={{ flex: 1 }}>{t.task || 'Untitled'}</span>
            <span style={{ fontSize: '.7rem', color: 'var(--txm)' }}>{t.status}</span>
            {t.nextFollowUp ? <span style={{ fontSize: '.7rem', color: 'var(--txm)' }}>{fmtD(t.nextFollowUp)}</span> : null}
          </div>
        )) : <div style={{ fontSize: '.74rem', color: 'var(--txd)' }}>No linked tasks yet — use “+ Task” below to spawn a follow-up task from this lead.</div>}
      </div>

      <TouchpointLog leadId={l.id} />
    </>
  );
}

/**
 * The lead viewer (`mo-ldet`, openLeadDetail): every field of the lead, the tasks linked to it and the
 * touchpoint timeline, with Edit, + Task, Delete and Close. `framed` renders it inside the page frame (a
 * direct visit to /pipeline/leads/<id>); otherwise it is the modal over the page that opened it (the
 * intercepted route). The id is a route parameter, so it is compared as a string with the (numeric)
 * lead id; an id that is not a loaded lead shows a message instead of the card, never a crash.
 */
export default function LeadViewer({ id, framed = false, onClose }) {
  const lead = useStore((s) => s.leads.find((l) => String(l.id) === String(id)) ?? null);
  const dataLoaded = useStore((s) => s.dataLoaded);
  const leadForm = useLeadForm();
  const taskForm = useTaskForm();

  const edit = () => { leadForm.openEdit(lead.id); if (!framed) onClose(); };
  const addTask = () => { taskForm.openAdd(taskPrefillFromLead(lead)); if (!framed) onClose(); };

  const title = lead ? (lead.title || 'Untitled lead') : 'Lead';
  const body = lead ? (
    <div id="ldet-body" style={{ maxHeight: framed ? undefined : '70vh', overflowY: framed ? undefined : 'auto' }}>
      <LeadBody lead={lead} />
    </div>
  ) : (
    <div id="ldet-body">
      <p style={{ margin: '12px 0', fontSize: '.82rem', color: 'var(--txm)' }}>
        {dataLoaded ? <>Lead not found. It may have been deleted, or it is not one you can see.<br /><span style={{ color: 'var(--txd)' }}>{String(id)}</span></> : 'Loading…'}
      </p>
    </div>
  );
  const foot = (
    <div className="mf">
      {lead ? <button type="button" className="btn b-ol" onClick={edit}>Edit</button> : null}
      {lead ? <button type="button" className="btn b-ol" onClick={addTask}>+ Task</button> : null}
      {lead ? <button type="button" className="btn b-dn" onClick={() => leadForm.confirmDelete(lead.id, onClose)}>Delete</button> : null}
      <button type="button" className="btn b-gh" onClick={onClose}>Close</button>
    </div>
  );

  if (framed) {
    return (
      <div className="tp active">
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 16px' }}>
          <div className="mb mb-lg" style={{ margin: '0 auto', maxWidth: 760 }}>
            <div className="mh">
              <div className="mti" id="ldet-title">{title}</div>
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
    <Modal id="mo-ldet" open wide maxWidth={760} title={title} onClose={onClose}>
      {body}
      {foot}
    </Modal>
  );
}
