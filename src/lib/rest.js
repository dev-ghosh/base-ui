// Hand-rolled Supabase REST client. Port of the REST part of rie-dashboard2/js/db.js.
// The row <-> app mappers live in ./mappers.js.
import { sbUrl, getHeaders } from './config.js';
import { store } from '../store/store.js';

const AUTH_EXPIRED_MSG = 'Your session has expired — please sign in again.';

function isAuthFailure(status, body) {
  if (status === 401) return true;
  return /42501|row-level security|JWT expired|invalid JWT/i.test(body || '');
}

async function handleAuthExpired() {
  try {
    const { refreshSession, getSession } = await import('./auth.js');
    const refreshed = await refreshSession();
    if (refreshed?.accessToken) return;
    if (getSession()?.accessToken) return;
  } catch { /* fall through */ }
}

export async function sbGet(table, params = '') {
  const res = await fetch(`${sbUrl()}/rest/v1/${table}?${params}`, { headers: await getHeaders() });
  if (!res.ok) {
    if (isAuthFailure(res.status, '')) { handleAuthExpired(); throw new Error(AUTH_EXPIRED_MSG); }
    throw new Error(`GET ${table} failed: ${res.status}`);
  }
  return res.json();
}

/**
 * Refuse a write locally when the signed-in user is read-only.
 *
 * RLS is the actual boundary and it is already closed; this exists so a viewer
 * gets a sentence they can act on instead of a PostgREST permission error, and
 * so a stray write path that forgot to hide its button fails in one obvious
 * place rather than 20 unobvious ones. Every write goes through the functions
 * below, which is what makes this a complete guard rather than a hopeful one.
 */
const READ_ONLY_MSG = 'You have view-only access to BASE, so this change was not saved.';

export function assertCanWrite() {
  // `access` is null until rie_my_access() resolves. null means "not known yet",
  // not "denied": blocking during boot would break the first render for
  // everyone, and RLS covers that window anyway.
  if (store.getState().access?.can_write === false) throw new Error(READ_ONLY_MSG);
}

export async function sbInsert(table, data) {
  assertCanWrite();
  const res = await fetch(`${sbUrl()}/rest/v1/${table}`, {
    method: 'POST', headers: await getHeaders(), body: JSON.stringify(data),
  });
  if (!res.ok) {
    const e = await res.text();
    if (isAuthFailure(res.status, e)) { handleAuthExpired(); throw new Error(AUTH_EXPIRED_MSG); }
    throw new Error(`INSERT ${table} failed: ${e}`);
  }
  return res.json();
}

export async function sbUpdate(table, id, data) {
  assertCanWrite();
  const res = await fetch(`${sbUrl()}/rest/v1/${table}?id=eq.${id}`, {
    method: 'PATCH', headers: await getHeaders(), body: JSON.stringify(data),
  });
  if (!res.ok) {
    const e = await res.text();
    if (isAuthFailure(res.status, e)) { handleAuthExpired(); throw new Error(AUTH_EXPIRED_MSG); }
    throw new Error(`UPDATE ${table} failed: ${e}`);
  }
  return res.json();
}

export async function sbDelete(table, id) {
  assertCanWrite();
  // return=representation: without it PostgREST answers an RLS-refused DELETE
  // with an empty 204, indistinguishable from success, and the check below
  // never fired. The UI then dropped the row and it came back on reload.
  const res = await fetch(`${sbUrl()}/rest/v1/${table}?id=eq.${id}`, {
    method: 'DELETE', headers: { ...(await getHeaders()), Prefer: 'return=representation' },
  });
  if (!res.ok) {
    const e = await res.text();
    if (isAuthFailure(res.status, e)) { handleAuthExpired(); throw new Error(AUTH_EXPIRED_MSG); }
    throw new Error(`DELETE ${table} failed: ${e}`);
  }
  const text = await res.text();
  if (text) {
    try {
      const deleted = JSON.parse(text);
      if (Array.isArray(deleted) && deleted.length === 0)
        throw new Error(`Row not deleted — likely blocked by RLS on ${table}.`);
    } catch (parseErr) {
      if (parseErr.message.includes('RLS')) throw parseErr;
    }
  }
}

/** PATCH every row matching a PostgREST filter. Used where the target has no
 *  single `id` (entity_owners is keyed by entity + person). Same guard, same
 *  auth handling as sbUpdate. */
export async function sbPatchWhere(table, filter, data) {
  assertCanWrite();
  const res = await fetch(`${sbUrl()}/rest/v1/${table}?${filter}`, {
    method: 'PATCH',
    headers: { ...(await getHeaders()), Prefer: 'return=representation' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const e = await res.text();
    if (isAuthFailure(res.status, e)) { handleAuthExpired(); throw new Error(AUTH_EXPIRED_MSG); }
    throw new Error(`PATCH ${table} failed: ${e}`);
  }
  return res.json().catch(() => null);
}

export async function safeGet(table, params) {
  try { return await sbGet(table, params); }
  catch (e) {
    if (e.message.includes('404') || e.message.includes('42P01') || e.message.includes('relation')) {
      console.warn(`Table '${table}' not found — using empty list.`);
      return [];
    }
    throw e;
  }
}

export async function sbRpc(fnName, body = {}) {
  const res = await fetch(`${sbUrl()}/rest/v1/rpc/${fnName}`, {
    method: 'POST',
    headers: { ...(await getHeaders()), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const e = await res.text();
    if (isAuthFailure(res.status, e)) { handleAuthExpired(); throw new Error(AUTH_EXPIRED_MSG); }
    throw new Error(`RPC ${fnName} failed: ${e}`);
  }
  return res.json();
}

export async function getContactHistory(contactId) {
  return safeGet('contact_history', `contact_id=eq.${contactId}&order=created_at.desc&limit=20`);
}

export async function getLeadHistory(leadId) {
  return safeGet('lead_history', `lead_id=eq.${leadId}&order=created_at.desc&limit=100`);
}
