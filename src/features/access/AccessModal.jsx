'use client';

import { useState } from 'react';
import Modal from '../../components/Modal.jsx';
import { useAccess } from '../../hooks/useAccess.js';
import { useModal } from '../../hooks/useModal.js';
import { useStore } from '../../store/useStore.js';
import { EXTRAS, ROLES, SCOPES, roleLabel } from '../../lib/access.js';
import { ACCESS_MODAL_ID, lastSeen, openCount } from '../../lib/access-admin.js';
import { internalPeople } from '../../lib/mappers.js';
import { useAccessAdmin } from './hooks/useAccessAdmin.js';

/** "Give someone access": e-mail, name, role, what they see. */
function AddForm({ add }) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState('member');
  const [scope, setScope] = useState('assigned');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (busy) return;
    setErr('');
    setBusy(true);
    const problem = await add(email, { name, role, scope });
    setBusy(false);
    if (problem) { setErr(problem); return; }
    setEmail('');
    setName('');
  };

  return (
    <div className="ax-add">
      <div className="msl" style={{ marginBottom: 10 }}>Give someone access</div>
      <div className="ax-add-grid">
        <input
          className="fi" id="ax-email" type="email" placeholder="name@company.com" value={email}
          autoCapitalize="off" autoCorrect="off" spellCheck="false"
          onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
        />
        <input className="fi" id="ax-name" type="text" placeholder="Name (shown on tasks)" value={name} onChange={(e) => setName(e.target.value)} />
        <select className="fsel" id="ax-role" value={role} onChange={(e) => setRole(e.target.value)}>
          {ROLES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select className="fsel" id="ax-scope" aria-label="What they see" value={scope} onChange={(e) => setScope(e.target.value)}>
          {SCOPES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <button type="button" className="btn b-pr" onClick={submit}>Add</button>
      </div>
      <div id="ax-err" className="ax-err">{err}</div>
      <p className="ax-hint">They sign in with this address at the normal sign-in screen.
        New people start as <strong>Editor</strong> seeing <strong>assigned tasks only</strong>:
        they can work their own tasks and nothing else. Assign them work from the Work board.</p>
    </div>
  );
}

/** One person: role, revoke/restore, what they see, which person they are, companies. */
function PersonRow({ r, me, admin, activeAdmins, companies, ops }) {
  const tasks = useStore((s) => s.tasks);
  useStore((s) => s.people);   // the "as" picker follows the people list
  const isMe = r.email.toLowerCase() === (me || '').toLowerCase();
  // Two separate reasons a control is locked, and they need different words.
  const lastAdmin = r.role === 'admin' && r.active && activeAdmins === 1;
  const lockNote = isMe ? 'You cannot change your own role' : lastAdmin ? 'BASE must keep at least one admin' : '';
  const locked = !admin || isMe || lastAdmin;
  const who = r.display_name || r.email;
  const canEdit = admin && !isMe;

  return (
    <div className={'ax-row' + (r.active ? '' : ' off')}>
      <div className="ax-av">{(r.display_name || r.email)[0].toUpperCase()}</div>
      <div className="ax-who">
        <div className="ax-name">{r.display_name || '—'}{isMe ? <span className="ax-you">you</span> : null}</div>
        <div className="ax-mail">{r.email}</div>
      </div>
      <div className="ax-seen">{r.active ? lastSeen(r) : 'Access revoked'}</div>
      <div className="ax-roles">
        {ROLES.map((o) => (
          <button
            key={o.value} type="button" className={'ax-role' + (r.role === o.value ? ' on' : '')}
            disabled={locked} title={lockNote || o.blurb} onClick={() => ops.setRole(r.email, o.value)}
          >{o.label}</button>
        ))}
      </div>
      <div className="ax-act">
        {admin && !isMe && !lastAdmin ? (r.active
          ? <button type="button" className="ax-revoke" onClick={() => ops.toggleActive(r.email, false)}>Revoke</button>
          : <button type="button" className="ax-restore" onClick={() => ops.toggleActive(r.email, true)}>Restore</button>)
          : <span className="ax-locked" title={lockNote}>—</span>}
      </div>
      <div className="ax-cos ax-scope-row">
        <span className="ax-cos-label">Sees</span>
        <div className="ax-roles ax-scopes">
          {SCOPES.map((o) => (
            <button
              key={o.value} type="button" className={'ax-role' + ((r.task_scope || 'all') === o.value ? ' on' : '')}
              disabled={!canEdit} title={o.blurb} onClick={() => ops.setScope(r.email, o.value)}
            >{o.label}</button>
          ))}
        </div>
        {r.task_scope === 'assigned' ? (
          <>
            <span className="ax-cos-label" style={{ marginLeft: 6 }}>plus</span>
            {EXTRAS.map((x) => {
              const on = (r.extra_access || []).includes(x.value);
              return (
                <button
                  key={x.value} type="button" className={'ax-co' + (on ? ' on' : '')} disabled={!canEdit}
                  title={on ? `Hide ${x.label.toLowerCase()} from ${who}` : `Let ${who} see ${x.label.toLowerCase()}`}
                  onClick={() => ops.toggleExtra(r.email, x.value)}
                >{x.label}</button>
              );
            })}
          </>
        ) : null}
        <span className="ax-as">
          <span className="ax-cos-label">as</span>
          <select
            className="ax-person" disabled={!canEdit} value={r.person_code || ''}
            onChange={(e) => ops.setPerson(r.email, e.target.value)} aria-label="Which person this sign-in is"
          >
            <option value="">nobody</option>
            {internalPeople().map((p) => <option key={p.code} value={p.code}>{p.display_name || p.code}</option>)}
          </select>
          {r.person_code ? <span className="ax-count">{openCount(tasks, r.person_code)} open</span> : null}
        </span>
      </div>
      <div className="ax-cos">
        <span className="ax-cos-label">Companies</span>
        {companies.map((c) => {
          const on = r.companies === null || r.companies.includes(c);
          return (
            <button
              key={c} type="button" className={'ax-co' + (on ? ' on' : '')} disabled={!canEdit}
              title={canEdit ? (on ? `Hide ${c} from ${who}` : `Show ${c}`) : (isMe ? 'You cannot change your own access' : 'Only an admin can change this')}
              onClick={() => ops.toggleCompany(r.email, c)}
            >{c}</button>
          );
        })}
        {r.companies === null ? <span className="ax-co-all">all</span> : null}
      </div>
    </div>
  );
}

function Body() {
  const { access, isAdmin } = useAccess();
  const adminApi = useAccessAdmin();
  const { people, companies, loading, error, add } = adminApi;
  const me = access?.email || '';
  const activeAdmins = people.filter((r) => r.active && r.role === 'admin').length;
  const active = people.filter((r) => r.active);
  const revoked = people.filter((r) => !r.active);
  const row = (r) => (
    <PersonRow key={r.email} r={r} me={me} admin={isAdmin} activeAdmins={activeAdmins} companies={companies} ops={adminApi} />
  );

  if (loading) return <div id="access-body"><div className="ax-loading">Loading…</div></div>;
  if (error && !people.length) return <div id="access-body"><div className="ax-err">{error}</div></div>;

  return (
    <div id="access-body">
      <AddForm add={add} />
      <div className="msl" style={{ margin: '22px 0 10px' }}>{active.length} {active.length === 1 ? 'person' : 'people'} with access</div>
      <div className="ax-list">{active.map(row)}</div>
      {revoked.length ? (
        <>
          <div className="msl" style={{ margin: '22px 0 10px' }}>Revoked</div>
          <div className="ax-list">{revoked.map(row)}</div>
        </>
      ) : null}
      <div className="ax-legend">
        {ROLES.map((o) => <div key={o.value}><strong>{o.label}</strong> {o.blurb}</div>)}
        {SCOPES.map((o) => <div key={o.value}><strong>{o.label}</strong> {o.blurb}</div>)}
        <div><strong>plus</strong> Opens contacts, leads or events to an assigned-only person, one at a time.</div>
        <div className="ax-legend-note">Access is per email address and takes effect on their next
          request. Revoking someone does not delete anything they created.</div>
      </div>
    </div>
  );
}

/**
 * Access (old mo-access): who can sign in and what they can do. Opened by the admin-only sidebar item
 * "Manage access" (openAccess(), which refuses everyone else); an overlay, not a route. The body is
 * mounted only while open, so the list is read afresh every time it opens, as the old openAccess().
 */
export default function AccessModal() {
  const { hide } = useModal(ACCESS_MODAL_ID);
  const { access, isAdmin } = useAccess();
  return (
    <Modal id={ACCESS_MODAL_ID} title="Access" className="ax-shell" onClose={hide}>
      <p className="ax-lede">Everyone here signs in with their email address. Roles decide
        what they can do once they are in.</p>
      {isAdmin ? <Body /> : (
        <p className="ax-hint" style={{ marginBottom: 18 }}>Only an admin can change who has access. You are signed in as <strong>{roleLabel(access?.role)}</strong>.</p>
      )}
    </Modal>
  );
}
