'use client';

import { useEffect, useState } from 'react';
import Modal from '../../components/Modal.jsx';
import { useStore } from '../../store/useStore.js';
import { useAccess } from '../../hooks/useAccess.js';
import { useTaskActions } from './hooks/useTaskActions.js';
import { useTaskForm } from './hooks/useTaskForm.js';
import { dueCls, dueLabel, fmtD } from '../../lib/format.js';
import { personName, rowToEntityEvent } from '../../lib/mappers.js';
import { safeGet } from '../../lib/rest.js';
import { openEscalateModal } from '../../lib/seams.js';

const CLOSED = new Set(['Completed', 'Dropped']);
const STATUS_CLS = {
  Pending: 'st-pending', 'In Progress': 'st-progress', 'On Hold': 'st-hold', Completed: 'st-done', Dropped: 'st-dropped',
};

/** A label/value pair, absent when there is no value (the old row()). */
function Row({ label, children }) {
  if (children == null || children === '' || children === false) return null;
  return <div className="tv-row"><dt>{label}</dt><dd>{children}</dd></div>;
}
const Chip = ({ text, cls = '' }) => (text ? <span className={('tv-chip ' + cls).trim()}>{text}</span> : null);
/** Long free text keeps its line breaks (CSS pre-wrap); it is text, never markup. */
const Para = ({ children }) => <div className="tv-text">{children}</div>;
const Muted = ({ children }) => <span className="tv-muted">{children}</span>;

/** The body of the reading view. `framed` = inside the page frame rather than a modal. */
function TaskCard({ task: t, framed, onClose }) {
  const { isAdmin, loaded, canWrite } = useAccess();
  const { setStatus } = useTaskActions();
  const form = useTaskForm();
  const workstreams = useStore((s) => s.workstreams);
  const initiatives = useStore((s) => s.initiatives);
  const actions = useStore((s) => s.actions);
  const entityLinks = useStore((s) => s.entityLinks);
  const leads = useStore((s) => s.leads);
  const contacts = useStore((s) => s.contacts);
  useStore((s) => s.people);                  // owner names re-render with the people list

  // Read-only exactly when the shell would put `ro` on <html>: the answer is in and it is "no".
  const canEdit = !(loaded && !canWrite);

  const open = !CLOSED.has(t.status);
  const due = t.nextFollowUp;
  const owner = t.ownerCode ? personName(t.ownerCode) : '';
  const coOwners = (t.coOwnerCodes || []).filter((c) => c && c !== t.ownerCode).map(personName);
  // Legacy free-text assignee only when there is no real owner.
  const assignee = owner || t.assignedTo || '';
  const lead = t.leadId ? leads.find((l) => String(l.id) === String(t.leadId)) : null;
  const all = [...workstreams, ...initiatives, ...actions];
  const parents = entityLinks
    .filter((l) => String(l.childId) === String(t.id))
    .map((l) => all.find((e) => String(e.id) === String(l.parentId)))
    .filter(Boolean)
    .map((p) => p.task || p.title || '')
    .filter(Boolean);

  // History and the contacts attached to the entity. Reloaded when the task changes underneath us.
  const [events, setEvents] = useState(null);       // null = loading, 'error', or a list
  const [linkedContacts, setLinkedContacts] = useState([]);
  const entityKey = t.entityId ?? t.id;
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const [evs, links] = await Promise.all([
          safeGet('entity_events', `entity_id=eq.${entityKey}&order=created_at.desc&limit=15`),
          safeGet('entity_contacts', `entity_id=eq.${entityKey}&select=contact_id`),
        ]);
        if (!live) return;
        setEvents((evs || []).map(rowToEntityEvent));
        setLinkedContacts((links || [])
          .map((l) => contacts.find((c) => c.id === l.contact_id))
          .filter(Boolean)
          .map((c) => c.name + (c.org ? ' · ' + c.org : '')));
      } catch {
        if (live) setEvents('error');
      }
    })();
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityKey, t.updatedAt, t.status]);

  const edit = () => {
    form.openEdit(t.id, { fromViewer: true });
    if (!framed) onClose();                    // the modal route steps aside; it comes back after a save
  };

  return (
    <>
      <div className="tv-head">
        <div className="tv-head-main">
          <div className="tv-kicker">Task #{String(t.legacyTaskId || t.id)}{t.company ? ' · ' + t.company : ''}{t.func ? ' · ' + t.func : ''}</div>
          <h2 className="tv-title">{t.task || 'Untitled task'}</h2>
          <div className="tv-chips">
            <Chip text={t.status} cls={STATUS_CLS[t.status] || ''} />
            <Chip text={t.priority} cls={t.priority === 'P1' ? 'pr-p1' : ''} />
            {open && due ? <Chip text={dueLabel(due)} cls={dueCls(due)} /> : null}
            {t.funcReview ? <Chip text="Needs review" cls="warn" /> : null}
            {(t.tags || []).map((x) => <Chip key={x} text={'#' + x} cls="tag" />)}
          </div>
        </div>
        <button type="button" className="mx" onClick={onClose} aria-label="Close">✕</button>
      </div>

      <div className="tv-body">
        <dl className="tv-grid">
          <Row label="Owner">{assignee ? assignee : <Muted>Unassigned</Muted>}</Row>
          <Row label="Also on it">{coOwners.length ? coOwners.join(', ') : ''}</Row>
          <Row label="Due">{due ? <>{fmtD(due)} <Muted>({dueLabel(due, false)})</Muted></> : <Muted>No date</Muted>}</Row>
          <Row label="Start">{t.startDate ? fmtD(t.startDate) : ''}</Row>
          <Row label="Expected end">{t.endDate ? fmtD(t.endDate) : ''}</Row>
          <Row label="Last meeting">{t.lastMtg ? fmtD(t.lastMtg) : ''}</Row>
          <Row label="Contact">{t.contactName ? t.contactName + (t.contactOrg ? ' · ' + t.contactOrg : '') : ''}</Row>
          {linkedContacts.length && !t.contactName ? <Row label="Contacts">{linkedContacts.join(', ')}</Row> : null}
          {linkedContacts.length > 1 && t.contactName ? <Row label="Other contacts">{linkedContacts.slice(1).join(', ')}</Row> : null}
          <Row label="Lead">{lead ? lead.title : ''}</Row>
          <Row label="Part of">{parents.length ? parents.join(' › ') : ''}</Row>
          <Row label="Project">{t.project && t.project !== t.frontCode ? t.project : ''}</Row>
          <Row label="Category">{t.category || ''}</Row>
          <Row label="Repeats">{t.recurrenceRule || ''}</Row>
        </dl>

        {t.actionItem ? <section className="tv-sec"><h3>Action item</h3><Para>{t.actionItem}</Para></section> : null}
        {t.keyInputs ? <section className="tv-sec"><h3>Key inputs &amp; notes</h3><Para>{t.keyInputs}</Para></section> : null}
        {t.outcomeSummary ? <section className="tv-sec"><h3>Outcome</h3><Para>{t.outcomeSummary}</Para></section> : null}
        {t.funcReview && t.funcReviewNote ? <section className="tv-sec tv-note"><h3>Why it needs review</h3><Para>{t.funcReviewNote}</Para></section> : null}
        {!t.actionItem && !t.keyInputs
          ? <p className="tv-muted tv-empty">No details written yet.{canEdit ? ' Use Edit to add the action item and notes.' : ''}</p> : null}

        <section className="tv-sec">
          <h3>History</h3>
          <div id="tv-history" className="tv-history">
            {events === null ? <Muted>Loading…</Muted>
              : events === 'error' ? <Muted>History could not be loaded.</Muted>
              : events.length ? events.map((e) => (
                <div className="tv-ev" key={e.id}>
                  <span className="tv-ev-when">{fmtD(e.createdAt)}</span>
                  <span className="tv-ev-what">
                    {e.fieldName
                      ? <>{e.fieldName}: {e.oldValue ? <><s>{e.oldValue}</s> → </> : null}{e.newValue || '—'}</>
                      : e.eventType.replace(/_/g, ' ')}
                    {e.notes ? <> <Muted>· {e.notes}</Muted></> : null}
                  </span>
                  <span className="tv-ev-who">{e.actor || ''}</span>
                </div>
              )) : <Muted>No changes recorded yet.</Muted>}
          </div>
        </section>

        <div className="tv-meta">
          {t.createdBy || t.createdAt ? `Created${t.createdBy ? ' by ' + t.createdBy : ''}${t.createdAt ? ' on ' + fmtD(t.createdAt) : ''}` : ''}
          {t.updatedAt ? ` · Updated${t.updatedBy ? ' by ' + t.updatedBy : ''} on ${fmtD(t.updatedAt)}` : ''}
        </div>
      </div>

      <div className="tv-foot">
        {canEdit ? <button type="button" className="btn b-pr" onClick={edit}>Edit</button> : null}
        {canEdit && open ? <button type="button" className="btn b-ol" onClick={() => setStatus(t.id, 'Completed')}>Mark done</button> : null}
        {canEdit && !open ? <button type="button" className="btn b-ol" onClick={() => setStatus(t.id, 'In Progress')}>Reopen</button> : null}
        {canEdit && open ? (
          <button type="button" className="btn b-gh" onClick={() => { onClose(); openEscalateModal(String(t.id)); }}>Escalate…</button>
        ) : null}
        <span className="tv-spacer"></span>
        {isAdmin ? <button type="button" className="btn b-dn" onClick={() => form.confirmDelete(t.id, onClose)}>Delete</button> : null}
        <button type="button" className="btn b-gh" onClick={onClose}>Close</button>
      </div>
    </>
  );
}

/**
 * The task reading view (js/taskview.js): the whole task laid out for a person, with Edit,
 * Mark done / Reopen, Escalate and, for admins, Delete. Read-only by construction: nothing
 * here writes except the explicit buttons, and those reuse the paths the rest of the app uses.
 *
 * `framed` renders it inside the page frame (a direct visit to /work/tasks/<id>); otherwise it
 * is the modal over whatever page opened it (the intercepted route). An id that is not a loaded
 * task shows a message instead of the card. Ids are compared as strings.
 */
export default function TaskViewer({ id, framed = false, onClose }) {
  const task = useStore((s) => s.tasks.find((t) => String(t.id) === String(id)) ?? null);
  const dataLoaded = useStore((s) => s.dataLoaded);

  let body;
  if (task) {
    body = <TaskCard task={task} framed={framed} onClose={onClose} />;
  } else {
    // A direct visit opens before the lists arrive: wait, then say so (never a crash).
    body = (
      <div className="tv-body">
        <p className="tv-empty" style={{ margin: '12px 0' }}>
          {dataLoaded ? <>Task not found. It may have been deleted, or it is not one you can see.<br /><span className="tv-muted">{String(id)}</span></> : 'Loading…'}
        </p>
        <div className="tv-foot" style={{ padding: '14px 0 0' }}>
          <span className="tv-spacer"></span>
          <button type="button" className="btn b-gh" onClick={onClose}>Close</button>
        </div>
      </div>
    );
  }

  if (framed) {
    return (
      <div className="tp active">
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 16px' }}>
          <div className="mb tv" style={{ margin: '0 auto' }}>{body}</div>
        </div>
      </div>
    );
  }
  return <Modal id="mo-tv" open className="tv" ariaLabel="Task" onClose={onClose}>{body}</Modal>;
}
