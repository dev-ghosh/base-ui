'use client';

import { useEffect, useRef, useState } from 'react';
import { useStore } from '../../store/useStore.js';
import { useAccess } from '../../hooks/useAccess.js';
import { useRegistry } from '../../hooks/useRegistry.js';
import { internalPeople, personName } from '../../lib/mappers.js';
import { safeGet } from '../../lib/rest.js';
import { openEscalateModal } from '../../lib/seams.js';
import { RECURRENCE_OPTIONS, STATUS_OPTIONS, taskFromForm } from '../../lib/task-form.js';

/** Label for a multi-select button: the names when there are one or two, else a count. */
function pickLabel(items, emptyText, nameFn = (x) => x) {
  if (!items.length) return emptyText;
  const names = items.map(nameFn);
  return names.length <= 2 ? names.join(', ') : `${names.length} selected`;
}

const dropStyle = {
  position: 'absolute', top: '110%', left: 0, right: 0, background: 'var(--sf)', border: '1px solid var(--bd)',
  borderRadius: 'var(--rs)', padding: '8px', zIndex: 100, boxShadow: 'var(--shadow-md)',
};
const dropHeadStyle = {
  fontSize: '.65rem', color: 'var(--txd)', padding: '2px 4px 6px', borderBottom: '1px solid var(--bd)',
  marginBottom: '6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
};
const pickBtnStyle = { fontSize: '.78rem', width: '100%', justifyContent: 'space-between', padding: '8px 12px' };
const optLabelStyle = { display: 'flex', gap: '7px', padding: '5px 6px', borderRadius: '6px', cursor: 'pointer', fontSize: '.74rem', color: 'var(--tx)' };
const checkStyle = { accentColor: 'var(--ac)', width: 13, height: 13 };

/**
 * The body and footer of the task form (`#mo-tf`, buildTaskForm + the .mf buttons in the old
 * index.html). Mounted by TaskFormProvider only while the form is open, so its state starts
 * fresh each time. `init` is { id, leadId, form } (see formFromTask); `onSubmit(data)` gets the
 * data object saveTask() takes.
 */
export default function TaskForm({ init, onSubmit, onCancel, onDelete }) {
  const { isAdmin } = useAccess();
  const { companies, activeFuncs, ready: registryLoaded } = useRegistry();
  const fronts = useStore((s) => s.fronts);
  const contacts = useStore((s) => s.contacts);
  const people = useStore((s) => s.people);

  const [f, setF] = useState(init.form);
  const [contactsOpen, setContactsOpen] = useState(false);
  const [assignedOpen, setAssignedOpen] = useState(false);
  const [contactQ, setContactQ] = useState('');
  const contactsRef = useRef(null);
  const assignedRef = useRef(null);
  const set = (patch) => setF((cur) => ({ ...cur, ...patch }));
  const editing = init.id != null;

  // Contacts and tags attached to the entity itself (loadEntityExtras): non-critical, so a
  // failure just leaves what the task row already carried.
  useEffect(() => {
    if (!editing) return undefined;
    let live = true;
    (async () => {
      try {
        const [contactLinks, tagLinks] = await Promise.all([
          safeGet('entity_contacts', `entity_id=eq.${init.id}&select=contact_id`),
          safeGet('entity_tags', `entity_id=eq.${init.id}&select=tag`),
        ]);
        if (!live) return;
        const patch = {};
        if (contactLinks.length) {
          patch.contacts = contactLinks
            .map((l) => contacts.find((x) => x.id === l.contact_id))
            .filter(Boolean)
            .map((c) => ({ id: c.id, name: c.name, org: c.org || '' }));
        }
        const tags = tagLinks.map((r) => r.tag).filter(Boolean);
        setF((cur) => ({
          ...cur,
          ...(patch.contacts ? { contacts: patch.contacts } : {}),
          ...(tags.length && !cur.tags ? { tags: tags.join(', ') } : {}),
        }));
      } catch { /* non-critical — falls back to legacy_pk and extra.manual_tags */ }
    })();
    return () => { live = false; };
  }, [init.id]);

  // A dropdown closes on a click outside it (the old toggleDropdown's document listener).
  useEffect(() => {
    if (!contactsOpen && !assignedOpen) return undefined;
    const onClick = (e) => {
      if (contactsOpen && !contactsRef.current?.contains(e.target)) setContactsOpen(false);
      if (assignedOpen && !assignedRef.current?.contains(e.target)) setAssignedOpen(false);
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, [contactsOpen, assignedOpen]);

  const funcs = f.company ? activeFuncs(f.company) : [];

  // The form can open before the registry has loaded (formFromTask then keeps the stored function).
  // Once it is known, a function that is not active for the company reads as unset, as the old
  // <select> did, so it cannot be saved unseen.
  useEffect(() => {
    if (registryLoaded && f.func && !(f.company && activeFuncs(f.company).includes(f.func))) set({ func: '' });
  }, [registryLoaded, f.company, f.func]);
  const projOptions = [{ code: '', name: '— None —' }, ...fronts];

  // Contacts dropdown: selected first, then by name; at most 50 shown.
  const q = contactQ.toLowerCase().trim();
  const selectedIds = new Set(f.contacts.map((c) => c.id).filter(Boolean));
  let pool = contacts.slice();
  if (q) pool = pool.filter((c) => (c.name || '').toLowerCase().includes(q) || (c.org || '').toLowerCase().includes(q) || (c.email || '').toLowerCase().includes(q));
  pool.sort((a, b) => {
    const as = selectedIds.has(a.id) ? 0 : 1; const bs = selectedIds.has(b.id) ? 0 : 1;
    if (as !== bs) return as - bs;
    return (a.name || '').localeCompare(b.name || '');
  });
  pool = pool.slice(0, 50);

  const toggleContact = (c, checked) => {
    if (checked) {
      if (!f.contacts.find((s) => s.id === c.id)) set({ contacts: [...f.contacts, { id: c.id, name: c.name, org: c.org || '' }] });
    } else {
      set({ contacts: f.contacts.filter((s) => s.id !== c.id) });
    }
  };
  const toggleAssignee = (code, checked) => {
    if (checked) { if (!f.assignees.includes(code)) set({ assignees: [...f.assignees, code] }); }
    else set({ assignees: f.assignees.filter((a) => a !== code) });
  };

  const peopleList = internalPeople();   // reads the store; the `people` subscription above re-renders it

  const submit = () => onSubmit(taskFromForm({ ...f, id: init.id, leadId: init.leadId }, {
    fronts, people: people || [],
  }));

  return (
    <>
      <div id="tf-body">
        <div className="fg2">
          <div className="fg1"><label className="fl2" htmlFor="tf-task-name">Task Name *</label>
            <input className="fi" id="tf-task-name" value={f.task} onChange={(e) => set({ task: e.target.value })} /></div>
          <div className="fg1"><label className="fl2" htmlFor="tf-proj-f">Project</label>
            <select className="fsel2" id="tf-proj-f" value={f.frontCode} onChange={(e) => set({ frontCode: e.target.value })}>
              {projOptions.map((o) => <option key={o.code} value={o.code}>{o.name}</option>)}
            </select></div>
          <div className="fg1"><label className="fl2" htmlFor="tf-cat-f">Category</label>
            <input className="fi" id="tf-cat-f" value={f.category} onChange={(e) => set({ category: e.target.value })} /></div>
          <div className="fg1"><label className="fl2" htmlFor="tf-status-f">Status</label>
            <select className="fsel2" id="tf-status-f" value={f.status} onChange={(e) => set({ status: e.target.value })}>
              {STATUS_OPTIONS.map((s) => <option key={s}>{s}</option>)}
            </select></div>
          <div className="fg1"><label className="fl2" htmlFor="tf-company">Company <span style={{ color: 'var(--hot)' }}>*</span> <span style={{ color: 'var(--txd)', fontWeight: 400, fontSize: '.7rem' }}>— Level 1</span></label>
            <select className="fsel2" id="tf-company" value={f.company} onChange={(e) => set({ company: e.target.value, func: '' })}>
              <option value="">— Select —</option>
              {companies.map((c) => <option key={c} value={c}>{c}</option>)}
            </select></div>
          <div className="fg1"><label className="fl2" htmlFor="tf-func">Function <span style={{ color: 'var(--hot)' }}>*</span> <span style={{ color: 'var(--txd)', fontWeight: 400, fontSize: '.7rem' }}>— Level 2</span></label>
            <select className="fsel2" id="tf-func" value={f.func} onChange={(e) => set({ func: e.target.value })}>
              <option value="">— Select —</option>
              {funcs.map((fn) => <option key={fn} value={fn}>{fn}</option>)}
            </select></div>
          <div className="fg1 full"><label className="fl2">Contacts <span style={{ color: 'var(--txd)', fontWeight: 400, fontSize: '.7rem' }}>— optional, multi-select</span></label>
            <div style={{ position: 'relative' }} ref={contactsRef}>
              <button type="button" className="btn b-ol" id="tf-contacts-btn" style={{ ...pickBtnStyle, ...(f.contacts.length ? { borderColor: 'var(--ac)', color: 'var(--ac2)' } : {}) }}
                onClick={() => { if (!contactsOpen) setContactQ(''); setContactsOpen(!contactsOpen); }}>
                <span id="tf-contacts-label">{pickLabel(f.contacts, '+ Pick contacts', (c) => c.name)}</span><span style={{ opacity: 0.6 }}>▾</span>
              </button>
              <div id="tf-contacts-drop" style={{ ...dropStyle, display: contactsOpen ? 'block' : 'none', minWidth: 280, maxHeight: 280, overflowY: 'auto' }}>
                <div style={dropHeadStyle}>
                  <span>Select contacts</span><span style={{ cursor: 'pointer', color: 'var(--ac2)' }} onClick={() => set({ contacts: [] })}>Clear</span>
                </div>
                <input type="text" id="tf-contacts-search" placeholder="Search contacts…" value={contactQ} onChange={(e) => setContactQ(e.target.value)}
                  style={{ width: '100%', padding: '5px 8px', background: 'var(--sf2)', border: '1px solid var(--bd)', borderRadius: 'var(--rs)', color: 'var(--tx)', fontSize: '.74rem', marginBottom: 6, fontFamily: 'inherit' }} />
                <div id="tf-contacts-options">
                  {pool.length ? pool.map((c) => (
                    <label key={c.id} style={{ ...optLabelStyle, alignItems: 'flex-start' }}>
                      <input type="checkbox" value={c.id} checked={selectedIds.has(c.id)} onChange={(e) => toggleContact(c, e.target.checked)}
                        style={{ ...checkStyle, marginTop: 2, flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 500 }}>{c.name || '?'}</div>
                        {c.org ? <div style={{ fontSize: '.65rem', color: 'var(--txm)' }}>{c.org}{c.category ? ' · ' + c.category : ''}</div> : null}
                      </div>
                    </label>
                  )) : <div style={{ fontSize: '.72rem', color: 'var(--txd)', padding: '8px 6px', textAlign: 'center' }}>No contacts match</div>}
                </div>
              </div>
            </div>
          </div>
          <div className="fg1"><label className="fl2" htmlFor="tf-followup">Next Follow-up</label>
            <input type="date" className="fi" id="tf-followup" value={f.followup} onChange={(e) => set({ followup: e.target.value })} /></div>
          <div className="fg1"><label className="fl2" htmlFor="tf-lastmtg">Last Meeting</label>
            <input type="date" className="fi" id="tf-lastmtg" value={f.lastMtg} onChange={(e) => set({ lastMtg: e.target.value })} /></div>
          <div className="fg1"><label className="fl2" htmlFor="tf-start">Start Date</label>
            <input type="date" className="fi" id="tf-start" value={f.start} onChange={(e) => set({ start: e.target.value })} /></div>
          <div className="fg1"><label className="fl2" htmlFor="tf-end">Expected End</label>
            <input type="date" className="fi" id="tf-end" value={f.end} onChange={(e) => set({ end: e.target.value })} /></div>
          <div className="fg1" id="tf-assigned-wrap"><label className="fl2">Assigned To</label>
            <div style={{ position: 'relative' }} ref={assignedRef}>
              <button type="button" className="btn b-ol" id="tf-assigned-btn" style={{ ...pickBtnStyle, ...(f.assignees.length ? { borderColor: 'var(--ac)', color: 'var(--ac2)' } : {}) }}
                onClick={() => setAssignedOpen(!assignedOpen)}>
                <span id="tf-assigned-label">{pickLabel(f.assignees, '+ Pick assignees', (c) => personName(c) || c)}</span><span style={{ opacity: 0.6 }}>▾</span>
              </button>
              <div id="tf-assigned-drop" style={{ ...dropStyle, display: assignedOpen ? 'block' : 'none', minWidth: 240 }}>
                <div style={dropHeadStyle}>
                  <span>Select assignees</span><span style={{ cursor: 'pointer', color: 'var(--ac2)' }} onClick={() => set({ assignees: [] })}>Clear</span>
                </div>
                <div id="tf-assigned-options">
                  {peopleList.length ? (
                    <>
                      {peopleList.map((p) => (
                        <label key={p.code} style={{ ...optLabelStyle, alignItems: 'center' }}>
                          <input type="checkbox" value={p.code} checked={f.assignees.includes(p.code)} onChange={(e) => toggleAssignee(p.code, e.target.checked)} style={checkStyle} />
                          <span>{p.display_name || p.code}{f.assignees[0] === p.code && f.assignees.length > 1
                            ? <> <span style={{ color: 'var(--txd)', fontSize: '.66rem' }}>(owner)</span></> : null}</span>
                        </label>
                      ))}
                      <div style={{ fontSize: '.64rem', color: 'var(--txd)', padding: '6px 4px 0', borderTop: '1px solid var(--bd)', marginTop: 6 }}>
                        First pick is the owner; the rest are co-owners. New people are added under Account {'→'} Manage access.
                      </div>
                    </>
                  ) : <div style={{ fontSize: '.72rem', color: 'var(--txd)', padding: 6 }}>No people loaded yet.</div>}
                </div>
              </div>
            </div>
          </div>
          <div className="fg1"><label className="fl2" htmlFor="tf-priority">Priority</label>
            <select className="fsel2" id="tf-priority" value={f.priority} onChange={(e) => set({ priority: e.target.value })}>
              <option value="">—</option>
              <option value="P1">P1 (Highest)</option>
              <option value="P2">P2</option>
              <option value="P3">P3 (Lowest)</option>
            </select>
          </div>
          <div className="fg1 full"><label className="fl2" htmlFor="tf-action">Action Item</label>
            <textarea className="fta" id="tf-action" value={f.action} onChange={(e) => set({ action: e.target.value })} /></div>
          <div className="fg1 full"><label className="fl2" htmlFor="tf-keys">Key Inputs</label>
            <textarea className="fta" id="tf-keys" value={f.keys} onChange={(e) => set({ keys: e.target.value })} /></div>
          <div className="fg1"><label className="fl2" htmlFor="tf-recurrence">Recurrence</label>
            <select className="fsel2" id="tf-recurrence" value={f.recurrence} onChange={(e) => set({ recurrence: e.target.value })}>
              <option value="">— None —</option>
              {RECURRENCE_OPTIONS.map((v) => <option key={v} value={v}>{v.charAt(0).toUpperCase() + v.slice(1)}</option>)}
            </select>
          </div>
          <div className="fg1 full"><label className="fl2" htmlFor="tf-tags">Manual Tags <span style={{ color: 'var(--txd)', fontWeight: 400, fontSize: '.7rem' }}>— comma-separated</span></label>
            <input className="fi" id="tf-tags" placeholder="tag1, tag2" value={f.tags} onChange={(e) => set({ tags: e.target.value })} /></div>
        </div>
      </div>
      <div className="mf">
        <button type="button" className="btn b-pr" onClick={submit}>Save</button>
        <button type="button" className="btn b-gh" onClick={onCancel}>Cancel</button>
        {/* Stuck? Hand it to someone senior. Only offered for an existing task. */}
        {editing ? (
          <button type="button" className="btn b-ol" id="tf-escalate" style={{ marginRight: 'auto' }}
            onClick={() => { onCancel(); openEscalateModal(init.id); }}>Escalate…</button>
        ) : null}
        {/* Admins only. RLS refuses the DELETE for anyone else. */}
        {editing && isAdmin ? <button type="button" className="btn b-dn" id="tf-delete" onClick={() => onDelete(init.id)}>Delete</button> : null}
      </div>
    </>
  );
}
