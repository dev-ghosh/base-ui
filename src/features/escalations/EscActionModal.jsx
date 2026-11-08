'use client';

import { useState, useSyncExternalStore } from 'react';
import Modal from '../../components/Modal.jsx';
import { useModal } from '../../hooks/useModal.js';
import { useStore } from '../../store/useStore.js';
import { applyEscalationAction } from '../../lib/escalation-actions.js';
import { internalPeople } from '../../lib/mappers.js';
import { ESC_ACTION_MODAL_ID, escActionStore } from './escalate-state.js';
import { ACTION_GO, ACTION_PLACEHOLDER, ACTION_TITLE, actionHelp, recipientsOf } from './model.js';

/** The body of the action dialog. Mounted only while it is open, so every open starts fresh. */
function ActionForm({ onClose }) {
  const { kind, id, suggested } = useSyncExternalStore(escActionStore.subscribe, escActionStore.getState, escActionStore.getState);
  const e = useStore((s) => s.escalations.find((x) => String(x.id) === String(id)));
  useStore((s) => s.people);
  const [note, setNote] = useState('');
  const [to, setTo] = useState(suggested || '');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  if (!e || !kind) return null;

  const go = async () => {
    setErr('');
    setBusy(true);
    try {
      const res = await applyEscalationAction(kind, id, { note, to });
      if (res.ok) onClose(); else setErr(res.error || '');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="esc-fixed" id="esc-act-task">{e.task_title}</div>
      <p className="fhint lg" id="esc-act-help">{actionHelp(kind, e)}</p>
      <div className="fg1 fgap" id="esc-act-to-wrap" hidden={kind !== 'push'}>
        <label className="fl2" htmlFor="esc-act-to">Send to</label>
        <select className="fsel2" id="esc-act-to" value={to} onChange={(ev) => setTo(ev.target.value)}>
          <option value="">Choose who it goes to…</option>
          {recipientsOf(internalPeople(), [e.assigned_to, e.raised_by]).map((p) => <option key={p.code} value={p.code}>{p.display_name || p.code}</option>)}
        </select>
      </div>
      <div className="fg1 fgap">
        <label className="fl2" htmlFor="esc-act-note">Note</label>
        <textarea className="fta" id="esc-act-note" style={{ minHeight: '84px' }} placeholder={ACTION_PLACEHOLDER[kind]} value={note} onChange={(ev) => setNote(ev.target.value)} />
      </div>
      <div className="ferr" id="esc-act-err" role="alert">{err}</div>
      <div className="mf">
        <button type="button" className={kind === 'withdraw' ? 'btn b-ol' : 'btn b-pr'} id="esc-act-go" onClick={go} disabled={busy}>{ACTION_GO[kind]}</button>
        <button type="button" className="btn b-gh" onClick={onClose}>Cancel</button>
      </div>
    </>
  );
}

/**
 * Resolve / Escalate further / Withdraw (old #mo-esc-action), opened from a card's buttons by
 * openEscAction(kind, id). An overlay (component state), not a route. Mounted once in the (app) layout.
 */
export default function EscActionModal() {
  const { hide } = useModal(ESC_ACTION_MODAL_ID);
  const kind = useSyncExternalStore(escActionStore.subscribe, () => escActionStore.getState().kind, () => null);
  return (
    <Modal id={ESC_ACTION_MODAL_ID} title={kind ? ACTION_TITLE[kind] : 'Resolve'} maxWidth="460px">
      <ActionForm onClose={hide} />
    </Modal>
  );
}
