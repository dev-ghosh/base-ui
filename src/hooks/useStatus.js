'use client';

import { useMemo, useSyncExternalStore } from 'react';
import { statusStore, setStatus } from '../lib/status.js';

/** { status: { kind, msg, meta }, setStatus(kind, msg, meta) } for the status bar. */
export function useStatus() {
  const status = useSyncExternalStore(statusStore.subscribe, statusStore.getState, statusStore.getState);
  return useMemo(() => ({ status, setStatus }), [status]);
}
