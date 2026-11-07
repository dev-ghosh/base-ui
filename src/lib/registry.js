/* registry.js — the task_functions registry: the Level-1 (company) / Level-2 (function)
 * vocabulary. Port of the registry part of rie-dashboard2/js/matrix.js
 * (loadRegistry, mxCompanies, mxActiveFuncs, mxRegistryReady).
 *
 * The vocabulary is DATA, never a list in code. The old app loaded it inside loadData();
 * here it is loaded on demand by whatever needs it first (the task form, Classify, the
 * Matrix) with ensureRegistry(), and shared through this store.
 *
 * Plain JS with relative imports so plain Node can import the pure helpers.
 */
import { createStore } from '../store/store.js';
import { sbGet } from './rest.js';

export const registryStore = createStore({ rows: [], error: null });

/** Ordered, de-duplicated company list. */
export function companiesOf(rows = []) {
  return [...new Set(rows.map((r) => r.company))].sort((a, b) => a.localeCompare(b));
}

/** Functions a company still runs, in registry order (sort_order, never code). */
export function activeFuncsOf(rows = [], company) {
  return rows
    .filter((r) => r.company === company && r.active)
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((r) => r.func);
}

export const registryRows = () => registryStore.getState().rows;
export const registryReady = () => registryStore.getState().rows.length > 0;
export const mxCompanies = () => companiesOf(registryRows());
export const mxActiveFuncs = (company) => activeFuncsOf(registryRows(), company);

let inflight = null;

export async function loadRegistry() {
  try {
    const rows = await sbGet('task_functions', 'select=*&order=sort_order.asc');
    registryStore.setState({ rows: Array.isArray(rows) ? rows : [], error: null });
  } catch (err) {
    registryStore.setState({ rows: [], error: err.message || String(err) });
  }
  return registryRows();
}

/** Load once; a failed or empty load is tried again by the next caller. */
export function ensureRegistry() {
  if (registryReady()) return Promise.resolve(registryRows());
  if (inflight) return inflight;
  const run = loadRegistry();
  inflight = run;
  run.finally(() => { if (inflight === run) inflight = null; });
  return run;
}
