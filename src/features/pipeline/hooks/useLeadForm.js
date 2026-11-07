'use client';

import { useContext } from 'react';
import { LeadFormContext } from '../LeadFormProvider.jsx';

/**
 * { open, openAdd(), openEdit(id), openConvert(taskId), close, confirmDelete(id, onDeleted?) }
 * The lead form is component state mounted once in the (app) layout (LeadFormProvider).
 * `open` is whether the form is showing.
 */
export function useLeadForm() {
  return useContext(LeadFormContext);
}
