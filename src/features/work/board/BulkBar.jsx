'use client';

import { useState } from 'react';
import Modal from '../../../components/Modal.jsx';
import { STATUS_OPTIONS } from './model.js';

/**
 * The old code asked with prompt(). The app's modal pattern asks the same question in the same words:
 * the text, one box, OK / Cancel. Like prompt(), an answer that is not acceptable simply does nothing.
 */
function PromptDialog({ id, title, question, hint, onSubmit, onClose }) {
  const [value, setValue] = useState('');
  const submit = (e) => {
    e.preventDefault();
    onClose();
    onSubmit(value);
  };
  return (
    <Modal id={id} title={title} open onClose={onClose} maxWidth={380}>
      <form onSubmit={submit}>
        <label className="fl2" htmlFor={id + '-input'} style={{ display: 'block', marginBottom: 6 }}>{question}</label>
        {hint ? <div style={{ fontSize: '.78rem', color: 'var(--txm)', marginBottom: 8 }}>{hint}</div> : null}
        <input className="fi" id={id + '-input'} value={value} autoFocus autoComplete="off" onChange={(e) => setValue(e.target.value)} />
        <div className="mf">
          <button type="submit" className="btn b-pr">OK</button>
          <button type="button" className="btn b-gh" onClick={onClose}>Cancel</button>
        </div>
      </form>
    </Modal>
  );
}

const barStyle = {
  position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: 'var(--sf, #1E1E1E)',
  border: '1px solid var(--bd2, #444)', boxShadow: '0 8px 32px rgba(0,0,0,0.36)', borderRadius: 12, padding: '10px 18px',
  display: 'flex', alignItems: 'center', gap: 12, zIndex: 1000, color: 'var(--tx, #fff)', fontSize: '0.85rem',
};

/**
 * The bulk bar (renderBulkToolbar): "N tasks selected", Change Status, Reassign, Clear, Exit Bulk Mode,
 * and a Select all (the old module exported selectAllVisibleTasks but never gave it a button).
 */
export default function BulkBar({ bulk, visibleIds }) {
  const [dialog, setDialog] = useState(null);       // null | 'status' | 'reassign'
  const { count } = bulk;
  return (
    <>
      <div id="task-bulk-bar" style={barStyle}>
        <span style={{ fontWeight: 600 }}>{count} task{count === 1 ? '' : 's'} selected</span>
        <button type="button" className="btn b-sm b-ol" onClick={() => bulk.selectAll(visibleIds)}>Select all</button>
        <button type="button" className="btn b-sm" disabled={count === 0} onClick={() => setDialog('status')}>Change Status</button>
        <button type="button" className="btn b-sm" disabled={count === 0} onClick={() => setDialog('reassign')}>Reassign</button>
        <button type="button" className="btn b-sm b-ol" onClick={bulk.clear}>Clear</button>
        <button type="button" className="btn b-sm b-ol" onClick={bulk.toggleMode}>Exit Bulk Mode</button>
      </div>
      {dialog === 'status' ? (
        <PromptDialog
          id="mo-bulk-status" title="Change Status" question="Enter new status:" hint={STATUS_OPTIONS.join(' / ')}
          onClose={() => setDialog(null)}
          onSubmit={(v) => { const choice = v.trim(); if (choice && STATUS_OPTIONS.includes(choice)) bulk.changeStatus(choice); }}
        />
      ) : null}
      {dialog === 'reassign' ? (
        <PromptDialog
          id="mo-bulk-reassign" title="Reassign" question="Enter Person Code to reassign to (e.g. CODE):"
          onClose={() => setDialog(null)}
          onSubmit={(v) => { const code = v.trim(); if (code) bulk.reassign(code.toUpperCase()); }}
        />
      ) : null}
    </>
  );
}
