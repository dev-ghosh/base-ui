// Shared fixtures for the Today / Triage / task tests: task entities in the store's shape,
// a store reset, and a fetch stub that records every request and can be told to fail.
import { vi } from 'vitest';
import { store, createInitialState } from '@/store/store.js';
import { resetStatus } from '@/lib/status.js';
import { registryStore } from '@/lib/registry.js';
import { closeAllMo } from '@/lib/modals.js';

export const ME = 'ME1';

export const todayISO = (offsetDays = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

let seq = 0;
/** A task entity as rowToEntity builds it (only the fields the screens read). */
export const makeTask = (o = {}) => {
  const n = ++seq;
  const id = o.id ?? 'e' + n;
  return {
    entityId: id, id, legacyTaskId: null, tier: 'task', task: 'Task ' + n, status: 'Pending', v3Status: 'pending',
    priority: 'P2', company: 'Acme', func: 'Ops', funcReview: false, funcReviewNote: '', ownerCode: ME, coOwnerCodes: [],
    assignedTo: 'Me Myself', nextFollowUp: '', archivedAt: '', closedAt: '', updatedAt: '', createdAt: '', createdBy: '', updatedBy: '',
    contactName: '', contactOrg: '', actionItem: '', keyInputs: '', outcomeSummary: '', tags: [], recurrenceRule: '', leadId: null,
    frontCode: '', project: '', category: '', lastMtg: '', startDate: '', endDate: '', extra: {},
    ...o,
  };
};

export const PEOPLE = [
  { code: ME, display_name: 'Me Myself', is_internal: true },
  { code: 'OT1', display_name: 'Olive Other', is_internal: true },
];

/** Reset every module-level store the screens touch, then seed. */
export function seed({ tasks = [], decisions = [], access = { person_code: ME, can_write: true, is_admin: false }, ...rest } = {}) {
  store.setState({ ...createInitialState(), tasks, decisions, people: PEOPLE, access, accessLoaded: true, currentUser: 'Me Myself', dataLoaded: true, ...rest });
  resetStatus();
  registryStore.setState({ rows: [], error: null });
  closeAllMo();
}

export const REGISTRY = [
  { company: 'Acme', func: 'Ops', active: true, sort_order: 1 },
  { company: 'Acme', func: 'Sales', active: true, sort_order: 2 },
  { company: 'Beta', func: 'Ops', active: true, sort_order: 1 },
];

export const okResponse = (body = [{}]) => ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) });

/**
 * Stub global fetch. `handler(url, init)` may return a response, throw, or return a promise.
 * Default: every request succeeds with `[{}]` (and an empty list for GETs).
 * `calls()` is the list of {url, method, body} in order.
 */
export function stubFetch(handler) {
  const fn = vi.fn(async (url, init = {}) => {
    const method = init.method || 'GET';
    if (handler) {
      const r = await handler(String(url), { ...init, method });
      if (r) return r;
    }
    return okResponse(method === 'GET' ? [] : [{}]);
  });
  vi.stubGlobal('fetch', fn);
  const calls = () => fn.mock.calls.map(([url, init = {}]) => ({
    url: String(url), method: init.method || 'GET', body: init.body ? JSON.parse(init.body) : undefined,
  }));
  return { fn, calls, writes: () => calls().filter((c) => c.method !== 'GET') };
}

export const failResponse = (text = 'boom', status = 500) => ({ ok: false, status, json: async () => ({}), text: async () => text });
