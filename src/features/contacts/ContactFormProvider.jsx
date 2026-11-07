'use client';

import { createContext, useCallback, useMemo, useState } from 'react';
import Modal from '../../components/Modal.jsx';
import { store } from '../../store/store.js';
import { setStatus } from '../../lib/status.js';
import { formFromContact, contactFromForm, validateContact } from '../../lib/contact-form.js';
import {
  confirmDedupInsert, confirmDedupPatch, deleteContact, linkedTasksFor, saveContact,
} from '../../lib/contact-actions.js';
import ContactForm from './ContactForm.jsx';
import DedupDialog from './DedupDialog.jsx';

const sameId = (a, b) => a != null && b != null && String(a) === String(b);

/** What useContactForm() returns outside a provider: nothing opens (a component rendered alone in a test). */
export const NO_CONTACT_FORM = {
  open: false, openAdd: () => {}, openEdit: () => {}, close: () => {}, confirmDelete: () => {}, pendingContactData: null,
};
export const ContactFormContext = createContext(NO_CONTACT_FORM);

/**
 * Owns the contact form (`#mo-cf`), the duplicate dialog (`#mo-dedup`) and the delete confirmation,
 * mounted once in the (app) layout. They are component state, not routes (spec C7 rule 5), and several
 * places open them: the header's New > Contact, the contact viewer's Edit and Delete.
 *
 *   openAdd()            a blank contact
 *   openEdit(id)         an existing contact
 *   close()
 *   confirmDelete(id)    the "Confirm delete" dialog for one contact
 *   pendingContactData   the data waiting in the duplicate dialog (old state.pendingContactData)
 *
 * Saving works as the old saveContact did: the name is checked first (the form stays open with the
 * error in the status bar), then the form closes and the write runs in the background. A new contact
 * that looks like an existing one is not written: the duplicate dialog asks first.
 */
export function ContactFormProvider({ children }) {
  const [state, setState] = useState(null);       // null | { title, editId, init }
  const [pending, setPending] = useState(null);   // null | { data, dup }: kept after the dialog closes, like the old global
  const [dedupOpen, setDedupOpen] = useState(false);
  const [del, setDel] = useState(null);           // null | { contact, linked }

  const close = useCallback(() => setState(null), []);

  const openAdd = useCallback(() => {
    setState({ title: 'Add Contact', editId: null, init: { form: formFromContact({}) } });
  }, []);

  const openEdit = useCallback((id) => {
    const c = store.getState().contacts.find((x) => sameId(x.id, id)) || {};
    setState({ title: 'Edit Contact', editId: c.id ?? id, init: { form: formFromContact(c) } });
  }, []);

  const submit = useCallback(async (fields) => {
    const data = contactFromForm(fields);
    const problem = validateContact(data);
    if (problem) { setStatus('error', problem); return; }   // stays open, as the old saveContact returned before closeMo
    const editId = state?.editId ?? null;
    close();
    const result = await saveContact(data, editId);
    if (result?.duplicate) {
      setPending({ data, dup: result.duplicate });
      setDedupOpen(true);
    }
  }, [state, close]);

  const patchExisting = useCallback(async (existingId) => {
    setDedupOpen(false);
    await confirmDedupPatch(existingId, pending?.data);
  }, [pending]);

  const insertAnyway = useCallback(async () => {
    setDedupOpen(false);
    await confirmDedupInsert(pending?.data);
  }, [pending]);

  const confirmDelete = useCallback((id) => {
    const contact = store.getState().contacts.find((x) => sameId(x.id, id));
    if (!contact) return;
    setDel({ contact, linked: linkedTasksFor([contact.id]) });
  }, []);

  const runDelete = async () => {
    const { contact } = del;
    setDel(null);                                  // closeMo('mo-del')
    await deleteContact(contact.id);
  };

  const api = useMemo(
    () => ({ open: state != null, openAdd, openEdit, close, confirmDelete, pendingContactData: pending?.data ?? null }),
    [state, pending, openAdd, openEdit, close, confirmDelete],
  );

  const c = del?.contact;
  const n = del?.linked.length ?? 0;
  return (
    <ContactFormContext.Provider value={api}>
      {children}
      <Modal id="mo-cf" open={state != null} wide title={state?.title ?? 'Add Contact'} onClose={close}>
        {state ? <ContactForm key={`${state.title}:${state.editId ?? ''}`} init={state.init} onSubmit={submit} onCancel={close} /> : null}
      </Modal>
      <Modal id="mo-dedup" open={dedupOpen} maxWidth={480} title="Possible duplicate found" onClose={() => setDedupOpen(false)}>
        {pending ? <DedupDialog pending={pending} onPatch={patchExisting} onInsert={insertAnyway} onCancel={() => setDedupOpen(false)} /> : null}
      </Modal>
      <Modal id="mo-del-contact" open={del != null} maxWidth={420} ariaLabel="Confirm delete" onClose={() => setDel(null)}
        title={<span style={{ color: 'var(--hot)' }}>Confirm delete</span>}>
        {c ? (
          <>
            <div id="del-body-contact" style={{ fontSize: '.82rem', color: 'var(--tx)', lineHeight: 1.7, marginBottom: 4 }}>
              <p style={{ marginBottom: 10 }}>You are about to permanently delete:</p>
              <div style={{ padding: '10px 14px', background: 'var(--sf2)', border: '1px solid var(--hot)', borderRadius: 'var(--rs)', marginBottom: 10 }}>
                <strong>{c.name}</strong> · {c.org || '—'}<br />
                <span style={{ fontSize: '.77rem', color: 'var(--txm)' }}>{c.email || ''} {c.phone ? '· ' + c.phone : ''}</span>
              </div>
              {n ? <p style={{ color: 'var(--hot)', fontSize: '.77rem' }}>This will also delete {n} linked task{n > 1 ? 's' : ''}.</p> : null}
              <p style={{ color: 'var(--txm)', fontSize: '.77rem' }}>This cannot be undone.</p>
            </div>
            <div className="mf">
              <button type="button" className="btn b-dn" id="del-confirm-btn-contact" onClick={runDelete}>Delete permanently</button>
              <button type="button" className="btn b-gh" onClick={() => setDel(null)}>Cancel</button>
            </div>
          </>
        ) : null}
      </Modal>
    </ContactFormContext.Provider>
  );
}
