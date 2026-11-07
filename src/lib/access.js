// Who the signed-in user is allowed to be, as far as the interface is concerned.
// Port of the first part of rie-dashboard2/js/access.js (roles, canWrite/isAdmin,
// loadMyAccess, applyAccessMode). The Access admin page is a later task.
//
// Nothing here enforces anything: RLS does (see access.js in the old app). This
// makes the interface honest about a boundary the database already holds.
import { sbRpc } from './rest.js';
import { store } from '../store/store.js';

/**
 * Deliberately not the database's words. "member" means nothing to a person being
 * told what they can do; "Editor" does. The stored values stay admin/member/viewer
 * because the policies key off them.
 */
export const ROLES = [
  { value: 'admin', label: 'Admin',
    blurb: 'Can change what they see, and can manage who else has access.' },
  { value: 'member', label: 'Editor',
    blurb: 'Can change what they see. Cannot manage access.' },
  { value: 'viewer', label: 'Viewer',
    blurb: 'Can look at what they see. Cannot change anything.' },
];

export const roleFor = (access) => ROLES.find((r) => r.value === access?.role) || null;

export const canWriteOf = (access) => access?.can_write === true;
export const isAdminOf = (access) => access?.is_admin === true;
export const seesAssignedOnlyOf = (access) => access?.task_scope === 'assigned';

// One request per sign-in. `generation` is bumped by resetAccess() so an answer
// that arrives after a sign-out cannot repaint the next person with the last one's rights.
let inflight = null;
let generation = 0;

/**
 * Ask the database what this user may do, once. Callers can call it freely: while a
 * request is in flight they share it, and once an answer is stored it is reused until
 * resetAccess().
 *
 * Fails CLOSED: if the call errors we assume read-only rather than write. A viewer
 * briefly shown edit buttons is a bug; an editor briefly shown a read-only banner is
 * an inconvenience. (`access` stays null and `accessLoaded` becomes true, which
 * applyAccessMode reads as "cannot write".)
 */
export function loadMyAccess() {
  const s = store.getState();
  if (s.accessLoaded) return Promise.resolve(s.access);
  if (inflight) return inflight;
  const mine = generation;
  const run = (async () => {
    let access = null;
    try {
      const rows = await sbRpc('rie_my_access', {});
      access = Array.isArray(rows) ? rows[0] || null : rows || null;
    } catch {
      access = null;
    }
    if (mine === generation) store.setState({ access, accessLoaded: true });
    return mine === generation ? access : null;
  })();
  inflight = run;
  run.finally(() => { if (inflight === run) inflight = null; });
  return run;
}

/** Forget the answer (sign-out), so the next sign-in asks again. */
export function resetAccess() {
  generation += 1;
  inflight = null;
  store.setState({ access: null, accessLoaded: false });
}

/**
 * Reflect the role in the interface. Classes on <html> drive the CSS (C15):
 *   ro        the answer is in and the user cannot write (also when it failed)
 *   is-admin  admin
 *   scoped    sees assigned tasks only (shell.css hides the Team item)
 * Before the answer arrives nothing is set, as in the old app.
 */
export function applyAccessMode(access, loaded, root = document.documentElement) {
  root.classList.toggle('ro', Boolean(loaded) && !canWriteOf(access));
  root.classList.toggle('is-admin', isAdminOf(access));
  root.classList.toggle('scoped', seesAssignedOnlyOf(access));
}
