'use client';

import { createContext, useCallback, useEffect, useMemo, useState } from 'react';
import Modal from '../../components/Modal.jsx';
import { store } from '../../store/store.js';
import { setStatus } from '../../lib/status.js';
import { deleteLead, saveLead } from '../../lib/lead-actions.js';
import { formFromLead, formFromTask, leadFromForm, validateLead } from '../../lib/lead-form.js';
import { registerConvertTaskToLead } from '../../lib/seams.js';
import LeadForm from './LeadForm.jsx';

const sameId = (a, b) => a != null && b != null && String(a) === String(b);

/** What useLeadForm() returns outside a provider: nothing opens (a component rendered alone in a test). */
export const NO_LEAD_FORM = {
  open: false, openAdd: () => {}, openEdit: () => {}, openConvert: () => {}, close: () => {}, confirmDelete: () => {},
};
export const LeadFormContext = createContext(NO_LEAD_FORM);

/**
 * Owns the lead form (`#mo-lf`) and its delete confirmation, mounted once in the (app) layout. The
 * form is component state, not a route (spec C7 rule 5), and several places open it: the Pipeline's
 * "+ Lead" and card pencils, the header's New > Lead, the lead viewer's Edit, and the Work Board's
 * "Convert to lead" button (through the seam in lib/seams.js).
 *
 *   openAdd()               a blank lead
 *   openEdit(id)            an existing lead
 *   openConvert(taskId)     a lead prefilled from a task; saving it sets leads.source_task_id
 *   close()
 *   confirmDelete(id, onDeleted?)
 *
 * Saving works as the old saveLead did: the title is checked first (the form stays open with the
 * error in the status bar), then the form closes and the write runs in the background.
 */
export function LeadFormProvider({ children }) {
  const [state, setState] = useState(null);       // null | { title, init }
  const [del, setDel] = useState(null);           // null | { lead, onDeleted }

  const close = useCallback(() => setState(null), []);

  const openAdd = useCallback(() => {
    setState({ title: 'Add Lead', init: { form: formFromLead({}) } });
  }, []);

  const openEdit = useCallback((id) => {
    const l = store.getState().leads.find((x) => sameId(x.id, id));
    if (!l) return;
    setState({ title: 'Edit Lead', init: { form: formFromLead(l) } });
  }, []);

  const openConvert = useCallback((taskId) => {
    const t = store.getState().tasks.find((x) => sameId(x.id, taskId));
    if (!t) return;
    setState({ title: 'Convert Task to Lead', init: { form: formFromTask(t) } });
  }, []);

  // The Work Board's "Convert to lead" button reaches the form through the seam.
  useEffect(() => registerConvertTaskToLead(openConvert), [openConvert]);

  const submit = useCallback(async (fields) => {
    const data = leadFromForm(fields, { contacts: store.getState().contacts });
    const problem = validateLead(data);
    if (problem) { setStatus('error', problem); return; }   // stays open, as the old saveLead returned before closeMo
    close();
    await saveLead(data);
  }, [close]);

  const confirmDelete = useCallback((id, onDeleted) => {
    const lead = store.getState().leads.find((x) => sameId(x.id, id));
    if (!lead) return;
    setDel({ lead, onDeleted });
  }, []);

  const runDelete = async () => {
    const { lead, onDeleted } = del;
    setDel(null);                                  // closeMo('mo-del')
    onDeleted?.();                                 // closeMo('mo-ldet'): the old code closed the viewer before the write
    await deleteLead(lead.id);
  };

  const api = useMemo(() => ({ open: state != null, openAdd, openEdit, openConvert, close, confirmDelete }),
    [state, openAdd, openEdit, openConvert, close, confirmDelete]);

  const delLead = del?.lead;
  return (
    <LeadFormContext.Provider value={api}>
      {children}
      <Modal id="mo-lf" open={state != null} title={state?.title ?? 'Add Lead'} onClose={close}>
        {state ? <LeadForm key={`${state.title}:${state.init.form.id ?? ''}`}init={state.init} onSubmit={submit} onCancel={close} /> : null}
      </Modal>
      <Modal id="mo-del-lead" open={del != null} maxWidth={420} ariaLabel="Confirm delete" onClose={() => setDel(null)}
        title={<span style={{ color: 'var(--hot)' }}>Confirm delete</span>}>
        {delLead ? (
          <>
            <div id="del-body-lead" style={{ fontSize: '.82rem', color: 'var(--tx)', lineHeight: 1.7, marginBottom: 4 }}>
              <p style={{ marginBottom: 10 }}>You are about to permanently delete this lead and its touchpoint history:</p>
              <div style={{ padding: '10px 14px', background: 'var(--sf2)', border: '1px solid var(--hot)', borderRadius: 'var(--rs)', marginBottom: 10 }}>
                <strong>{delLead.title || 'Untitled lead'}</strong><br />
                <span style={{ fontSize: '.77rem', color: 'var(--txm)' }}>{delLead.stage}{delLead.org ? ' · ' + delLead.org : ''}</span>
              </div>
              <p style={{ color: 'var(--txm)', fontSize: '.77rem' }}>This cannot be undone.</p>
            </div>
            <div className="mf">
              <button type="button" className="btn b-dn" id="del-confirm-btn-lead" onClick={runDelete}>Delete permanently</button>
              <button type="button" className="btn b-gh" onClick={() => setDel(null)}>Cancel</button>
            </div>
          </>
        ) : null}
      </Modal>
    </LeadFormContext.Provider>
  );
}
