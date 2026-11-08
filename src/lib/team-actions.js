/* team-actions.js — loading and every write of the Team directory. Port of loadTeam, saveEmployee,
 * deleteEmployee and teamSeed in rie-dashboard2/js/team.js.
 *
 * The store is never mutated in place: a changed employee is a new object in a new array. Writes
 * go through rest.js, whose assertCanWrite() refuses a view-only user before any request (the
 * screen also only offers them to admins, as the old one did).
 *
 * Plain JS with relative imports so plain Node can import it.
 */
import { store } from '../store/store.js';
import { sbUrl, getHeaders } from './config.js';
import { sbGet, sbInsert, sbUpdate, sbDelete } from './rest.js';
import { setStatus } from './status.js';
import { internalPeople } from './mappers.js';
import { beginLoad, isCurrentLoad } from './user-data.js';
import { isMissingTable, sortByName } from '../features/team/model.js';

const sameId = (a, b) => a != null && b != null && String(a) === String(b);

let inflight = null;

/**
 * Load the directory once (the old `loaded` flag); `force` reloads. Never throws: a failure sets
 * `teamError` ('missing' when the table is not there, else the message) and keeps what was loaded.
 * A result that arrives after a sign-out (or another person's sign-in) is dropped (R25).
 */
export function loadTeam(force = false) {
  const s = store.getState();
  if (s.teamLoaded && !force) return Promise.resolve();
  if (inflight) return inflight;
  const token = beginLoad();
  const run = (async () => {
    try {
      const employees = await sbGet('employees', 'order=full_name.asc&limit=1000');
      if (!isCurrentLoad(token)) return;
      store.setState({ employees, teamError: null, teamLoaded: true });
    } catch (e) {
      if (!isCurrentLoad(token)) return;
      store.setState((cur) => ({ teamError: isMissingTable(e.message) ? 'missing' : e.message, employees: cur.employees || [] }));
    }
  })();
  inflight = run;
  run.finally(() => { if (inflight === run) inflight = null; });
  return run;
}

/** An employee's admin-only row, or undefined when there is none yet. Rejects on a failed read. */
export async function fetchPrivate(employeeId) {
  const [p] = await sbGet('employee_private', `employee_id=eq.${employeeId}`);
  return p;
}

async function upsertPrivate(employeeId, p) {
  const res = await fetch(`${sbUrl()}/rest/v1/employee_private?on_conflict=employee_id`, {
    method: 'POST',
    headers: { ...(await getHeaders()), Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ employee_id: employeeId, ...p }),
  });
  if (!res.ok) throw new Error(await res.text());
}

/**
 * Add (no id) or update an employee, then upsert the private row. Throws the raw error for the
 * form to show (see employeeSaveError). Like the old code the directory row is written first, so a
 * failed private write leaves the employee saved.
 */
export async function saveEmployee(id, main, priv) {
  let row;
  if (id) {
    [row] = await sbUpdate('employees', id, main);
    store.setState((s) => ({ employees: s.employees.map((e) => (sameId(e.id, id) ? { ...e, ...row } : e)) }));
  } else {
    [row] = await sbInsert('employees', main);
    store.setState((s) => ({ employees: sortByName([...s.employees, row]) }));
  }
  await upsertPrivate(row.id, priv);
  setStatus('online', id ? 'Employee updated' : 'Employee added');
}

/** Delete an employee (their private row goes with it). @returns {Promise<boolean>} true when deleted */
export async function deleteEmployee(id) {
  try {
    await sbDelete('employees', id);
    store.setState((s) => ({ employees: s.employees.filter((x) => !sameId(x.id, id)) }));
    setStatus('online', 'Employee deleted');
    return true;
  } catch (err) {
    setStatus('error', err.message);
    return false;
  }
}

/**
 * One employee row per internal person who has none yet, with the e-mail from their sign-in where
 * there is one. Only people with a sign-in (one without is an automation or an org, not an
 * employee); the active sign-in's e-mail wins when someone has two. Admin only (the screen offers
 * it to admins).
 */
export async function seedTeam() {
  const have = new Set(store.getState().employees.map((e) => e.person_code).filter(Boolean));
  let signins = [];
  try { signins = await sbGet('rie_allowed_users', 'select=email,person_code,active'); } catch { /* fall back to everyone */ }
  const mails = {};
  for (const u of signins) if (u.person_code && (u.active || !mails[u.person_code])) mails[u.person_code] = u.email;
  const todo = internalPeople().filter((p) => !have.has(p.code) && (!signins.length || p.code in mails));
  if (!todo.length) { setStatus('online', 'Everyone with a sign-in already has an employee record.'); return; }
  try {
    const rows = await sbInsert('employees', todo.map((p) => ({ person_code: p.code, full_name: p.display_name || p.code, work_email: mails[p.code] || null })));
    store.setState((s) => ({ employees: sortByName([...s.employees, ...rows]) }));
    setStatus('online', `Added ${rows.length} ${rows.length === 1 ? 'person' : 'people'}. Fill in their details next.`);
  } catch (e) { setStatus('error', e.message); }
}
