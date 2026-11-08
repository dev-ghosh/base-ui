'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Modal from '../../components/Modal.jsx';
import { useStore } from '../../store/useStore.js';
import { fmtD } from '../../lib/format.js';
import { eventActions } from '../../lib/event-actions.js';
import { RSVP_VALUES, detailCounts, eventIdFromParam } from './model.js';
import { useEventForm } from './hooks/useEventForm.js';
import { useGuests } from './hooks/useGuests.js';

const SECTION_HEAD = { fontSize: '.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--txm)', marginBottom: 8 };
const CODE = { background: 'var(--sf3)', padding: '1px 4px', borderRadius: 3, fontSize: '.69rem' };
const PLUS_ONE_BOX = { width: 44, padding: '2px 4px', background: 'var(--sf2)', border: '1px solid var(--bd)', borderRadius: 4, color: 'var(--tx)', fontSize: '.75rem', textAlign: 'center' };

/** One of the four tiles (Attending, Declined, Maybe, Pending). */
function Tile({ bg, color, value, label }) {
  return (
    <div className="edet-tile" style={{ background: bg, padding: '8px 14px', borderRadius: 'var(--rs)', textAlign: 'center' }}>
      <div style={{ fontSize: '1.3rem', fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: '.65rem', color }}>{label}</div>
    </div>
  );
}

/**
 * The +1s box. The old input fired onchange when it was left (or Enter): the value is kept as a draft while
 * it is typed and saved then. A change made elsewhere (a refused save put back, a reload) replaces the draft.
 */
function PlusOneBox({ value, onCommit }) {
  const [draft, setDraft] = useState(null);
  const shown = draft ?? String(value);
  const commit = () => {
    if (draft == null) return;
    setDraft(null);
    if ((parseInt(draft) || 0) !== value) onCommit(draft);
  };
  return (
    <input
      type="number" min="0" max="9" value={shown} style={PLUS_ONE_BOX} aria-label="Plus ones"
      onChange={(e) => setDraft(e.target.value)} onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') commit(); }}
    />
  );
}

/** The body of the event viewer (openEventDetail): details, tiles, guest list, invite and RSVP sync. */
function EventBody({ ev, onEdit, closeForGuestFlow, reopen }) {
  const form = useEventForm();
  const { guests, setRsvp, setPlusOne, sendInvites, syncRsvps } = useGuests(ev.id);
  const counts = detailCounts(guests);
  const [template, setTemplate] = useState('');
  const [emailText, setEmailText] = useState('');

  const send = async () => {
    if (await sendInvites(template)) { setTemplate(''); setEmailText(''); }
  };
  const sync = async () => {
    if (await syncRsvps(emailText)) { setTemplate(''); setEmailText(''); }
  };
  const removeGuest = (g) => {
    closeForGuestFlow();
    form.confirmDeleteGuest(g.id, reopen);
  };

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
        <div className="fro"><div className="fla">Date &amp; Time</div><div className="fva">{ev.date ? fmtD(ev.date) + ' · ' + ev.time : '—'}</div></div>
        <div className="fro"><div className="fla">Venue</div><div className="fva">{ev.venue || '—'}</div></div>
        <div className="fro"><div className="fla">Type</div><div className="fva">{ev.type}</div></div>
        <div className="fro"><div className="fla">Status</div><div className="fva">{ev.status}</div></div>
        {ev.description ? <div className="fro full"><div className="fla">Notes</div><div className="fva">{ev.description}</div></div> : null}
      </div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
        <Tile bg="var(--grb)" color="var(--gr)" value={counts.attending} label="Attending" />
        <Tile bg="var(--hotb)" color="var(--hot)" value={counts.no} label="Declined" />
        <Tile bg="var(--warmb)" color="var(--warm)" value={counts.maybe} label="Maybe" />
        <Tile bg="var(--sf3)" color="var(--txm)" value={counts.pending} label="Pending" />
      </div>
      <div style={SECTION_HEAD}>Guest List ({guests.length})</div>
      <table className="guest-list">
        <thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>RSVP</th><th>+1s</th><th>Invited</th><th></th></tr></thead>
        <tbody>
          {guests.length ? guests.map((g) => (
            <tr key={g.id}>
              <td>{g.name}</td>
              <td style={{ color: 'var(--txm)' }}>{g.email || '—'}</td>
              <td style={{ color: 'var(--txm)' }}>{g.phone || '—'}</td>
              <td>
                <select className="rsvp-sel" value={g.rsvp} onChange={(e) => setRsvp(g.id, e.target.value)}>
                  {RSVP_VALUES.map((v) => <option key={v} value={v}>{v}</option>)}
                </select>
              </td>
              <td><PlusOneBox value={g.plusOne} onCommit={(v) => setPlusOne(g.id, v)} /></td>
              <td style={{ fontSize: '.68rem', color: g.inviteSentAt ? 'var(--gr)' : 'var(--txd)' }}>{g.inviteSentAt ? '✓ Sent' : '—'}</td>
              <td><button type="button" className="btn b-dn" style={{ padding: '2px 7px', fontSize: '.68rem' }} aria-label={'Remove ' + g.name} onClick={() => removeGuest(g)}>🗑</button></td>
            </tr>
          )) : (
            <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--txd)', padding: 20 }}>No guests yet</td></tr>
          )}
        </tbody>
      </table>
      <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--bd)' }}>
        <div style={SECTION_HEAD}>Invite &amp; RSVP — AI-powered</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div>
            <div style={{ fontSize: '.72rem', color: 'var(--txm)', marginBottom: 6 }}>
              Invite template — placeholders:{' '}
              <code style={CODE}>{'{{name}}'}</code>{' '}
              <code style={CODE}>{'{{event}}'}</code>{' '}
              <code style={CODE}>{'{{date}}'}</code>{' '}
              <code style={CODE}>{'{{venue}}'}</code>
            </div>
            <textarea
              id={'invite-tmpl-' + ev.id} className="fta" style={{ minHeight: 80, marginBottom: 8 }} value={template}
              onChange={(e) => setTemplate(e.target.value)}
              placeholder="Hi {{name}}, you're invited to {{event}} on {{date}} at {{venue}}. Please reply to confirm."
            />
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button type="button" className="btn b-pr" style={{ fontSize: '.75rem' }} onClick={send}>⚡ Send via Claude</button>
              <button type="button" className="btn b-ol" style={{ fontSize: '.75rem' }} onClick={() => eventActions.copyInvitePrompt(ev.id, template)}>📧 Copy prompt</button>
              {counts.notInvited > 0 ? <span style={{ fontSize: '.7rem', color: 'var(--txm)', alignSelf: 'center' }}>{counts.notInvited} not yet invited</span> : null}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '.72rem', color: 'var(--txm)', marginBottom: 6 }}>Paste email thread to sync RSVPs</div>
            <textarea
              id={'rsvp-email-text-' + ev.id} className="fta" style={{ minHeight: 80, marginBottom: 8 }} value={emailText}
              onChange={(e) => setEmailText(e.target.value)} placeholder="Paste the Gmail thread text here…"
            />
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button type="button" className="btn b-pr" style={{ fontSize: '.75rem' }} onClick={sync}>⚡ Sync RSVPs</button>
              <button type="button" className="btn b-ol" style={{ fontSize: '.75rem' }} onClick={() => eventActions.copyRsvpPrompt(ev.id)}>↻ Copy prompt</button>
              {counts.pendingRSVP > 0 ? <span style={{ fontSize: '.7rem', color: 'var(--warm)', alignSelf: 'center' }}>{counts.pendingRSVP} awaiting RSVP</span> : null}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

/**
 * The event viewer (`mo-edet`, openEventDetail): the event, its RSVP tiles and guest list, the invite and
 * RSVP-sync tools, with Edit, + Add Guest, Delete event and Close. `framed` renders it inside the page frame
 * (a direct visit to /events/<id>); otherwise it is the modal over the page that opened it (the intercepted
 * route). The id is a route parameter, coerced to the event's number; an id that is not a loaded event shows
 * a message instead of the card, never a crash.
 *
 * As in the old modal, Edit, + Add Guest, the trash buttons and Delete event close the viewer first; once a
 * guest was added or removed the event is shown again (a push to /events/<id>). A direct visit stays put.
 */
export default function EventViewer({ id, framed = false, onClose }) {
  const router = useRouter();
  const evId = eventIdFromParam(id);
  const ev = useStore((s) => (evId == null ? null : s.events.find((e) => Number(e.id) === evId) ?? null));
  const dataLoaded = useStore((s) => s.dataLoaded);
  const form = useEventForm();

  const leave = () => { if (!framed) onClose(); };
  const reopen = framed ? undefined : () => router.push(`/events/${ev.id}`);

  const title = ev ? ev.title : 'Event';
  const body = ev ? (
    <div id="edet-body" style={{ maxHeight: framed ? undefined : '70vh', overflowY: framed ? undefined : 'auto' }}>
      <EventBody ev={ev} closeForGuestFlow={leave} reopen={reopen} />
    </div>
  ) : (
    <div id="edet-body">
      <p style={{ margin: '12px 0', fontSize: '.82rem', color: 'var(--txm)' }}>
        {dataLoaded ? <>Event not found. It may have been deleted, or it is not one you can see.<br /><span style={{ color: 'var(--txd)' }}>{String(id)}</span></> : 'Loading…'}
      </p>
    </div>
  );
  const foot = (
    <div className="mf">
      {ev ? <button type="button" className="btn b-ol" onClick={() => { form.openEdit(ev.id); leave(); }}>Edit</button> : null}
      {ev ? <button type="button" className="btn b-ol" onClick={() => { form.openAddGuest(ev.id, reopen); leave(); }}>+ Add Guest</button> : null}
      {ev ? <button type="button" className="btn b-dn" onClick={() => { leave(); form.confirmDeleteEvent(ev.id, framed ? onClose : undefined); }}>Delete event</button> : null}
      <button type="button" className="btn b-gh" onClick={onClose}>Close</button>
    </div>
  );

  if (framed) {
    return (
      <div className="tp active">
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 16px' }}>
          <div className="mb mb-lg" style={{ margin: '0 auto', maxWidth: 820 }}>
            <div className="mh">
              <div className="mti" id="edet-title">{title}</div>
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
    <Modal id="mo-edet" open wide maxWidth={820} title={title} onClose={onClose}>
      {body}
      {foot}
    </Modal>
  );
}
