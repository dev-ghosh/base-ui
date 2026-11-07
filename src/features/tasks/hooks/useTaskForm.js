'use client';

import { useContext } from 'react';
import { TaskFormContext } from '../TaskFormProvider.jsx';

/**
 * { open, openAdd(prefill?), openEdit(id, opts?), close, confirmDelete(id, onDeleted?) }
 * The task form is component state mounted once in the (app) layout (TaskFormProvider).
 * `open` is whether the form is showing.
 */
export function useTaskForm() {
  return useContext(TaskFormContext);
}
