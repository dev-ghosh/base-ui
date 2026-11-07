'use client';

import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { modalStore, openMo, closeMo } from '../lib/modals.js';

/** { open, show(), hide() } for the modal with this old id (for example 'mo-del'). */
export function useModal(id) {
  const get = () => modalStore.getState().open[id] === true;
  const open = useSyncExternalStore(modalStore.subscribe, get, () => false);
  const show = useCallback(() => openMo(id), [id]);
  const hide = useCallback(() => closeMo(id), [id]);
  return useMemo(() => ({ open, show, hide }), [open, show, hide]);
}
