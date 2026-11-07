'use client';

import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { registryStore, ensureRegistry, companiesOf, activeFuncsOf } from '../lib/registry.js';

/**
 * The task_functions registry (companies and the functions each runs), loaded on first use.
 * { rows, error, ready, companies, activeFuncs(company) }
 */
export function useRegistry() {
  const { rows, error } = useSyncExternalStore(registryStore.subscribe, registryStore.getState, registryStore.getState);
  useEffect(() => { ensureRegistry(); }, []);
  return useMemo(() => ({
    rows,
    error,
    ready: rows.length > 0,
    companies: companiesOf(rows),
    activeFuncs: (company) => activeFuncsOf(rows, company),
  }), [rows, error]);
}
