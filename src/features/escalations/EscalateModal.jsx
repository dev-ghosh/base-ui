'use client';

import { useState, useSyncExternalStore } from 'react';
import Modal from '../../components/Modal.jsx';
import { useModal } from '../../hooks/useModal.js';
import { useStore } from '../../store/useStore.js';
import { raiseEscalation } from '../../lib/escalation-actions.js';
import { internalPeople, personName } from '../../lib/mappers.js';
import { ESCALATE_MODAL_ID, escalateStore } from './escalate-state.js';
import { ESCALATION_REASONS, pickableTasks, recipientsOf, suggestionHint } from './model.js';

/** The body of the Escalate form. Mounted only while the dialog is open, so every open starts fresh. */
function EscalateForm({ onClose }) {
  const { taskId, suggested } = useSyncExternalStore(escalateStore.subscribe, escalateStore.getState, escalateStore.getState);
  const tasks = useStore((s) => s.tasks);
  const escalations = useStore((s) => s.escalations);
  const people = useStore((s) => s.people);
  const me = useStore((s) => s.access?.person_code || null);

  // With a task id the task is fixed; an id that is not in the store falls back to the picker (as the old form did).
  const fixedTask = taskId != null ? tasks.find((t) => String(t.id) === String(taskId)) : null;
  const { mine, rest } = pickableTasks(tasks, escalations, me);

  const [pick, setPick] = useState('');
  const [reason, setReason] = useState(ESCALATION_REASONS[0]);
  const [to, setTo] = useState(suggested || '');
  const [notes, setNotes] = useState('');
  const [email, setEmail] = useState(true);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const option = (t) => <option key={t.id} value={String(t.id)}>{t.priority === 'P1' ? '[P1] ' : ''}{t.task || 'Untitled'}</option>;

  const submit = async () => {
    setErr('');
    setBusy(true);
    try {
      const res = await raiseEscalation({ taskId: fixedTask ? fixedTask.id : pick, to, reason, notes, email });
      if (res.ok) onClose(); else setErr(res.error || '');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="fg1 fgap">
        <label className="fl2" htmlFor="esc-task-pick">Task</label>
        <div className="esc-fixed" id="esc-task-fixed" hidden={!fixedTask}>{fixedTask ? (fixedTask.task || 'Untitled task') : ''}</div>
        <select className="fsel2" id="esc-task-pick" hidden={!!fixedTask} value={pick} onChange={(e) => setPick(e.target.value)}>
          <option value="">Choose the task that is stuck…</option>
          {mine.length ? <optgroup label="Your tasks">{mine.map(option)}</optgroup> : null}
          {rest.length ? <optgroup label="Other open tasks">{rest.map(option)}</optgroup> : null}
        </select>
      </div>
      <div className="fg1 fgap">
        <label className="fl2" htmlFor="esc-reason">What is the problem?</label>
        <select className="fsel2" id="esc-reason" value={reason} onChange={(e) => setReason(e.target.value)}>
          {ESCALATION_REASONS.map((r) => <option key={r}>{r}</option>)}
        </select>
      </div>
      <div className="fg1 fgap">
        <label className="fl2" htmlFor="esc-to-senior">Who should handle it?</label>
        <select className="fsel2" id="esc-to-senior" value={to} onChange={(e) => setTo(e.target.value)}>
          <option value="">Choose who should handle it…</option>
          {recipientsOf(internalPeople(), [me]).map((p) => <option key={p.code} value={p.code}>{p.display_name || p.code}</option>)}
        </select>
        <div className="fhint" id="esc-hint">{suggestionHint(suggested, me, people, personName)}</div>
      </div>
      <div className="fg1 fgap">
        <label className="fl2" htmlFor="esc-notes">Details (optional)</label>
        <textarea className="fta" id="esc-notes" placeholder="What have you tried, and what do you need from them?" style={{ minHeight: '76px' }} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      <label className="chk-line"><input type="checkbox" id="esc-email" checked={email} onChange={(e) => setEmail(e.target.checked)} /> Also e-mail them</label>
      <div className="ferr" id="esc-err" role="alert">{err}</div>
      <div className="mf">
        <button type="button" className="btn b-pr" id="esc-submit" onClick={submit} disabled={busy}>Escalate</button>
        <button type="button" className="btn b-gh" onClick={onClose}>Cancel</button>
      </div>
    </>
  );
}

/**
 * "Escalate a task" (old #mo-escalate), opened by openEscalateModal(taskId): the task viewer's and task
 * form's "Escalate…" (the task is fixed) and the Escalations page's "Escalate a task" (the person picks).
 * An overlay (component state), not a route. Mounted once in the (app) layout.
 */
export default function EscalateModal() {
  const { hide } = useModal(ESCALATE_MODAL_ID);
  return (
    <Modal id={ESCALATE_MODAL_ID} title="Escalate a task" maxWidth="480px">
      <EscalateForm onClose={hide} />
    </Modal>
  );
}
