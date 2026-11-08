// The Access admin (mo-access): who can use BASE and what they can do. Port of the "Access page" part
// of rie-dashboard2/js/access.js (the signed-in user's own access is already ported in ./access.js).
//
// IMPORTANT: nothing in this file enforces anything. RLS does: writes to `rie_allowed_users` (and the
// `people` rows added with a person) require rie_is_admin(), and a trigger stops the last admin being
// demoted. The client checks below only make the interface honest, and stop a non-admin from opening
// the overlay at all. Plain JS, relative imports, no DOM: importable in Node.
import { store } from '../store/store.js';
import { sbUrl, getHeaders } from './config.js';
import { sbRpc, safeGet } from './rest.js';
import { isAdminOf, roleLabel, scopeLabel } from './access.js';
import { openMo, closeMo } from './modals.js';
import { fmtD } from './format.js';

export const ACCESS_MODAL_ID = 'mo-access';

const NOT_ADMIN_MSG = 'Only an admin can change who has access.';

/**
 * Open the Access overlay. Admins only: for anyone else this does nothing and says so (the sidebar item
 * is not even drawn for them; this is the second lock, for Profile, Help or a stray caller).
 * @returns {boolean} whether it opened
 */
export function openAccess() {
  if (!isAdminOf(store.getState().access)) return false;
  openMo(ACCESS_MODAL_ID);
  return true;
}

export function closeAccess() { closeMo(ACCESS_MODAL_ID); }

/* ── reads ─────────────────────────────────────────────────────────────────── */

/**
 * The people with access, the company vocabulary and the people rows.
 * v_rie_access adds last_sign_in_at from auth.users, which the client cannot read directly (it is
 * guarded by rie_can_read() inside the view). The company vocabulary is data (rie_companies), never
 * hard-coded here, so adding a fifth company needs no front-end deploy. Same rule as the Matrix.
 * @returns {Promise<{rows: object[], companies: string[], people: object[]|null}>}
 */
export async function fetchAccessData() {
  const [rows, cos, ppl] = await Promise.all([
    safeGet('v_rie_access', 'order=active.desc,role.asc,display_name.asc'),
    sbRpc('rie_companies', {}).catch(() => []),
    safeGet('people', 'archived_at=is.null&order=code.asc').catch(() => null),
  ]);
  return {
    rows,
    companies: (Array.isArray(cos) ? cos : []).map((c) => c.company || c).filter(Boolean),
    people: Array.isArray(ppl) ? ppl : null,
  };
}

/* ── writes ────────────────────────────────────────────────────────────────── */

/**
 * Every write on this page goes through PostgREST under the caller's JWT, so an admin-only policy is
 * what actually decides. Errors are surfaced verbatim because they are the useful part (the last-admin
 * guard, for instance). A non-admin is refused here too, before any request.
 */
export async function writeAccess(method, path, body) {
  if (!isAdminOf(store.getState().access)) throw new Error(NOT_ADMIN_MSG);
  const res = await fetch(`${sbUrl()}/rest/v1/${path}`, {
    method,
    headers: { ...(await getHeaders()), Prefer: 'return=representation' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!res.ok) {
    const t = await res.text();
    let msg = t;
    try { msg = JSON.parse(t).message || JSON.parse(t).hint || t; } catch { /* raw */ }
    throw new Error(msg);
  }
  return res.json().catch(() => null);
}

/** `rie_allowed_users?email=eq.<email>` */
export const allowedUserPath = (email) => `rie_allowed_users?email=eq.${encodeURIComponent(email)}`;

/**
 * Derive a person code from a name: letters only, upper-cased, first name, and a numeric suffix if
 * that code is already taken (what was done by hand for the first three people).
 */
export function proposePersonCode(name, email, people = []) {
  const base = ((name || '').trim().split(/\s+/)[0] || email.split('@')[0])
    .replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 24) || 'PERSON';
  const taken = new Set((people || []).map((p) => p.code));
  let code = base;
  let n = 2;
  while (taken.has(code)) code = `${base}${n++}`;
  return code;
}

/**
 * The checks the Add form runs before anything is sent, in the old order. '' when the entry is fine.
 * Deliberately loose on the address: one this fails is almost certainly a typo, and a stricter pattern
 * rejects valid addresses more often than it catches errors.
 */
export function validateNewPerson({ email, name, scope }, rows) {
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return 'That does not look like an email address.';
  if (rows.some((r) => r.email.toLowerCase() === email)) return 'That address already has access. Change their role below instead.';
  if (scope === 'assigned' && !name) return 'A name is needed so tasks can be assigned to them.';
  return '';
}

/** The `extra_access` list after switching one kind on or off. */
export const nextExtras = (current, kind) => {
  const cur = Array.isArray(current) ? current : [];
  return cur.includes(kind) ? cur.filter((k) => k !== kind) : [...cur, kind];
};

/**
 * Which companies a person can see after toggling one. `null` means every company, including rows that
 * carry no company at all; an array restricts them to exactly those. Toggling the last company back on
 * returns the row to null rather than leaving an all-companies array, so "all" stays a single state
 * instead of two states that drift the moment a fifth company is added.
 * @returns {{error: string}|{value: string[]|null}}
 */
export function nextCompanies(rowCompanies, allCompanies, company) {
  const current = rowCompanies === null ? allCompanies.slice() : rowCompanies.slice();
  const next = current.includes(company) ? current.filter((c) => c !== company) : [...current, company];
  if (next.length === 0) return { error: 'Someone must be able to see at least one company.' };
  return { value: allCompanies.every((c) => next.includes(c)) ? null : next };
}

/** Open tasks owned or co-owned by a person, from what is already loaded. */
export function openCount(tasks, code) {
  return (tasks || []).filter((t) => !t.archivedAt && ['Pending', 'In Progress', 'On Hold'].includes(t.status)
    && (t.ownerCode === code || (t.coOwnerCodes || []).includes(code))).length;
}

/** "Seen today", "Seen 3 days ago" ... for the last sign-in. */
export function lastSeen(r, now = Date.now()) {
  if (!r.last_sign_in_at) return 'Never signed in';
  const days = Math.floor((now - Date.parse(r.last_sign_in_at)) / 86400000);
  if (days === 0) return 'Seen today';
  if (days === 1) return 'Seen yesterday';
  if (days < 30) return `Seen ${days} days ago`;
  return `Seen ${fmtD(r.last_sign_in_at.slice(0, 10))}`;
}

/** The status-bar sentences of the writes (old wording). */
export const accessMessages = {
  added: (email, scope, name) => (scope === 'assigned'
    ? `${email} can sign in and will see tasks assigned to ${name}`
    : `${email} can now sign in`),
  scope: (email, scope) => `${email} now sees ${scopeLabel(scope).toLowerCase()}`,
  needPerson: 'Bind this sign-in to a person first (the "as" selector), or nothing would be visible to them.',
  extras: (email, next) => (next.length ? `${email} can also see ${next.join(', ')}` : `${email} sees only their tasks`),
  person: (email, code) => (code ? `${email} is ${code}` : `${email} is not linked to a person`),
  role: (email, role) => `${email} is now ${roleLabel(role)}`,
  companies: (email, value) => (value === null ? `${email} can see all companies` : `${email} can see ${value.join(', ')}`),
  active: (email, active) => (active ? `${email} restored` : `${email} can no longer sign in`),
};
