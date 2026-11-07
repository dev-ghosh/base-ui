'use client';

import { createContext, useCallback, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Modal from '../../components/Modal.jsx';
import { store } from '../../store/store.js';
import { setStatus } from '../../lib/status.js';
import { registryRows, registryReady, ensureRegistry } from '../../lib/registry.js';
import { formFromTask, validateTask } from '../../lib/task-form.js';
import { deleteTask, saveTask } from '../../lib/task-actions.js';
import { currentOwnerCode } from '../../lib/today.js';
import TaskForm from './TaskForm.jsx';

const sameId = (a, b) => a != null && b != null && String(a) === String(b);

/** What useTaskForm() returns outside a provider: nothing opens (a component rendered alone in a test). */
export const NO_TASK_FORM = {
  open: false, openAdd: () => {}, openEdit: () => {}, close: () => {}, confirmDelete: () => {},
};
export const TaskFormContext = createContext(NO_TASK_FORM);

/**
 * Owns the task form (`#mo-tf`) and its delete confirmation (`#mo-del`), mounted once in the
 * (app) layout. The form is component state, not a route (spec C7 rule 5), and several
 * places open it: the header's New > Task, the viewer's Edit, and a lead's "add a task".
 *
 *   openAdd(prefill?)         prefill: { title, task, nextFollowUp, leadId, contactIds, contactNames }
 *   openEdit(id, opts?)       opts.fromViewer: come back to the viewer after a successful save
 *   close()
 *   confirmDelete(id, onDeleted?)
 *
 * Saving works as the old saveTask did: checks first (the form stays open with an error in the
 * status bar), then the form closes and the write runs in the background.
 */
export function TaskFormProvider({ children }) {
  const router = useRouter();
  const pathname = usePathname();
  const [state, setState] = useState(null);       // null | { title, init }
  const [del, setDel] = useState(null);           // null | { id, task, onDeleted }
  const viewAfterSave = useRef(null);             // old state.viewAfterSave
  const pathRef = useRef(pathname);
  pathRef.current = pathname;

  const close = useCallback(() => setState(null), []);

  const openAdd = useCallback((prefill = {}) => {
    viewAfterSave.current = null;                  // a new task has no reading view to return to
    ensureRegistry();
    const s = store.getState();
    // Assigned-scope users can only create tasks they own (RLS), so start as the owner.
    const defaultOwner = s.access?.task_scope === 'assigned' ? s.access.person_code : null;
    const form = formFromTask({
      task: prefill.task, nextFollowUp: prefill.nextFollowUp,
      contactIds: prefill.contactIds, contactNames: prefill.contactNames,
    }, { registry: registryRows(), people: s.people, contacts: s.contacts, defaultOwner });
    setState({ title: prefill.title || 'Add Task', init: { id: null, leadId: prefill.leadId ?? null, form } });
  }, []);

  const openEdit = useCallback((id, opts = {}) => {
    const s = store.getState();
    const t = s.tasks.find((x) => sameId(x.id, id));
    if (!t) { setStatus('error', 'Could not find that task to edit. Press Sync and try again.'); return; }
    if (opts.fromViewer) viewAfterSave.current = t.id;
    ensureRegistry();
    const form = formFromTask(t, { registry: registryRows(), people: s.people, contacts: s.contacts });
    setState({ title: 'Edit Task #' + (t.legacyTaskId || id), init: { id: String(t.id), leadId: null, form } });
  }, []);

  const submit = useCallback(async (data) => {
    // A new task needs a Company and a Function, and that gate only holds once the registry is
    // known: Save pressed while the fetch is still in flight must wait for it, not skip the check.
    // (Nothing awaits when the registry is already loaded, so the checks stay synchronous then.)
    if (!data.id && !registryReady()) await ensureRegistry();
    const s = store.getState();
    const problem = validateTask(data, { registryReady: registryReady(), access: s.access });
    if (problem) { setStatus('error', problem); return; }   // stays open, as the old saveTask returned before closeMo
    close();
    const res = await saveTask(data);
    // Opened from the reading view (Edit): go back to it, now showing the update.
    if (res && !res.created && viewAfterSave.current != null && sameId(viewAfterSave.current, res.id)) {
      viewAfterSave.current = null;
      const href = `/work/tasks/${res.id}`;
      if (pathRef.current !== href) router.push(href);
    }
  }, [close, router]);

  const confirmDelete = useCallback((id, onDeleted) => {
    // String compare: callers pass ids as strings or numbers. Never fail silently.
    const t = store.getState().tasks.find((x) => sameId(x.id, id));
    if (!t) { setStatus('error', 'Could not find that task to delete. Press Sync and try again.'); return; }
    setDel({ id: t.id, task: t, onDeleted });
  }, []);

  const runDelete = async () => {
    const { id, onDeleted } = del;
    setDel(null);                                   // closeMo('mo-del')
    if (await deleteTask(id)) {
      close();                                      // closeMo('mo-tf')
      onDeleted?.();                                // and the reading view, if that is where it began
    }
  };

  const api = useMemo(() => ({ open: state != null, openAdd, openEdit, close, confirmDelete }),
    [state, openAdd, openEdit, close, confirmDelete]);

  const delTask = del?.task;
  return (
    <TaskFormContext.Provider value={api}>
      {children}
      <Modal id="mo-tf" open={state != null} title={state?.title ?? 'Add Task'} onClose={close}>
        {state ? (
          <TaskForm key={state.init.id ?? 'new'} init={state.init} onSubmit={submit} onCancel={close} onDelete={(id) => confirmDelete(id)} />
        ) : null}
      </Modal>
      <Modal id="mo-del" open={del != null} maxWidth={420} ariaLabel="Confirm delete" onClose={() => setDel(null)}
        title={<span style={{ color: 'var(--hot)' }}>Confirm delete</span>}>
        {delTask ? (
          <>
            <div id="del-body" style={{ fontSize: '.82rem', color: 'var(--tx)', lineHeight: 1.7, marginBottom: 4 }}>
              <p style={{ marginBottom: 10 }}>You are about to permanently delete:</p>
              <div style={{ padding: '10px 14px', background: 'var(--sf2)', border: '1px solid var(--hot)', borderRadius: 'var(--rs)', marginBottom: 10 }}>
                <strong>{delTask.task || 'Untitled task'}</strong><br />
                <span style={{ fontSize: '.77rem', color: 'var(--txm)' }}>
                  {delTask.contactName ? delTask.contactName + (delTask.contactOrg ? ' · ' + delTask.contactOrg : '') : <em>No contact</em>}
                </span>
              </div>
              <p style={{ color: 'var(--txm)', fontSize: '.77rem' }}>This cannot be undone.</p>
            </div>
            <div className="mf">
              <button type="button" className="btn b-dn" id="del-confirm-btn" onClick={runDelete}>Delete permanently</button>
              <button type="button" className="btn b-gh" onClick={() => setDel(null)}>Cancel</button>
            </div>
          </>
        ) : null}
      </Modal>
    </TaskFormContext.Provider>
  );
}
