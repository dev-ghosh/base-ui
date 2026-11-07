'use client';

import { useContext } from 'react';
import { ContactFormContext } from '../ContactFormProvider.jsx';

/**
 * { open, openAdd(), openEdit(id), close(), confirmDelete(id), pendingContactData }
 * The contact form (`#mo-cf`), its duplicate dialog (`#mo-dedup`) and delete confirmation are component
 * state mounted once in the (app) layout (ContactFormProvider). `open` is whether the form is showing;
 * `pendingContactData` is the data held while the duplicate dialog asks what to do (null otherwise).
 */
export function useContactForm() {
  return useContext(ContactFormContext);
}
