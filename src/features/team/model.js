/* model.js — the Team directory's pure logic. Port of the constants, workOf(), visible() and the
 * save payloads of rie-dashboard2/js/team.js, plus the filter row as URL search params (spec C7
 * rule 4: the old `q` and `fl` were module state).
 *
 * Tables: employees (directory fields) and employee_private (admin only). Not stored on purpose:
 * salary, bank details, government IDs.
 *
 * No store, no DOM: plain Node can import it.
 */
import { isMine } from '../../lib/scope.js';
import { todayISO } from '../../lib/queue.js';
import { normalizeForm } from '../../lib/ui-format.js';

export const TYPES = [['full_time', 'Full-time'], ['part_time', 'Part-time'], ['contract', 'Contract'], ['intern', 'Intern'], ['consultant', 'Consultant']];
export const STATUSES = [['active', 'Active'], ['on_leave', 'On leave'], ['notice', 'Serving notice'], ['exited', 'Exited']];
export const TYPE_LABEL = Object.fromEntries(TYPES);
export const STATUS_LABEL = Object.fromEntries(STATUSES);
export const STATUS_TONE = { active: 'success', on_leave: 'warn', notice: 'warn', exited: 'neutral' };

/** The old localStorage key for the Cards / Table choice; its values are 'grid' (default) and 'table'. */
export const TEAM_VIEW_KEY = 'rie_team_view';

const OPEN = new Set(['Pending', 'In Progress', 'On Hold']);

/**
 * Each person's work, from the tasks already loaded. By person CODE through isMine(), so a shared
 * task counts for everyone on it (the same rule as Today, the Matrix and Team workload). Only
 * employees linked to a sign-in have a code; the rest get null (no numbers, rather than zeros).
 * `open` is sorted by next follow-up, no date last.
 */
export function workOf(e, tasks, now = new Date()) {
  if (!e?.person_code) return null;
  const today = todayISO(now);
  const d = new Date(now); d.setDate(d.getDate() + 7);
  const in7 = todayISO(d);
  const open = (tasks || [])
    .filter((t) => OPEN.has(t.status) && !t.archivedAt && isMine(t, e.person_code))
    .sort((a, b) => (a.nextFollowUp || '9999').localeCompare(b.nextFollowUp || '9999'));
  return {
    open,
    overdue: open.filter((t) => t.nextFollowUp && t.nextFollowUp < today).length,
    week: open.filter((t) => t.nextFollowUp && t.nextFollowUp >= today && t.nextFollowUp <= in7).length,
  };
}

/** Rows after the filters. `q` matches name, designation, department, work e-mail, location, company. */
export function visibleEmployees(list, { q = '', department = '', company = '', status = '' } = {}) {
  const s = (q || '').toLowerCase();
  return list.filter((e) =>
    (!department || e.department === department)
    && (!company || e.company === company)
    && (!status || e.status === status)
    && (!s || [e.full_name, e.designation, e.department, e.work_email, e.location, e.company].some((x) => (x || '').toLowerCase().includes(s))));
}

const distinctSorted = (list, key) => [...new Set(list.map((e) => e[key]).filter(Boolean))].sort();
export const departmentsOf = (list) => distinctSorted(list, 'department');
export const companiesOf = (list) => distinctSorted(list, 'company');

/** The four stat tiles. */
export function teamStats(list, tasks, now = new Date()) {
  const active = list.filter((e) => e.status === 'active');
  const depts = departmentsOf(list);
  return {
    headcount: active.length,
    onRecord: list.length,
    departments: depts.length,
    deptSample: depts.slice(0, 3).join(', ') || '—',
    leave: list.filter((e) => e.status === 'on_leave' || e.status === 'notice').length,
    overdue: active.reduce((n, e) => n + (workOf(e, tasks, now)?.overdue || 0), 0),
  };
}

/** Employees sorted by name, as the old code kept state.employees after an add. */
export const sortByName = (list) => [...list].sort((a, b) => a.full_name.localeCompare(b.full_name));

/** "404"-style errors mean the migration has not been applied: the screen says so instead of the raw error. */
export const isMissingTable = (message) => /404|42P01|relation|PGRST205|schema cache/i.test(message || '');

/* ── the filter row as search params ──────────────────────────────────────────
 * q, dept, company and status. The default status is Active, so a missing `status` means Active and
 * "Any status" is written as status=any. */

const KEYS = ['q', 'dept', 'company', 'status'];
const toParams = (s) => (s instanceof URLSearchParams ? s : new URLSearchParams(s || ''));

export function parseTeamParams(search) {
  const p = toParams(search);
  const status = p.get('status');
  return {
    q: p.get('q') || '',
    department: p.get('dept') || '',
    company: p.get('company') || '',
    status: status == null ? 'active' : status === 'any' ? '' : status,
  };
}

export function serializeTeamParams(f) {
  const p = new URLSearchParams();
  if (f.q) p.set('q', f.q);
  if (f.department) p.set('dept', f.department);
  if (f.company) p.set('company', f.company);
  if (f.status !== 'active') p.set('status', f.status || 'any');
  return p.toString();
}

/** The current search string with the filter params replaced by `f`'s; other params are kept. */
export function mergeTeamParams(currentSearch, f) {
  const next = new URLSearchParams();
  for (const [key, value] of toParams(currentSearch)) if (!KEYS.includes(key)) next.append(key, value);
  for (const [key, value] of new URLSearchParams(serializeTeamParams(f))) next.append(key, value);
  return next.toString();
}

/* ── the add / edit form ───────────────────────────────────────────────────── */

const MAIN_FIELDS = ['full_name', 'designation', 'work_email', 'phone', 'department', 'company', 'employment_type', 'status', 'manager_code', 'person_code', 'location', 'joined_on', 'exited_on', 'birthday'];
const PRIV_FIELDS = ['personal_email', 'personal_phone', 'emergency_name', 'emergency_phone', 'address', 'notes'];

/** The form's starting values (all strings) from an employee (or none) and its private row (or none). */
export function formFromEmployee(e, p) {
  return {
    full_name: e?.full_name || '', designation: e?.designation || '',
    work_email: e?.work_email || '', phone: e?.phone || '',
    department: e?.department || '', company: e?.company || '',
    employment_type: e?.employment_type || 'full_time', status: e?.status || 'active',
    manager_code: e?.manager_code || '', person_code: e?.person_code || '',
    location: e?.location || '', joined_on: e?.joined_on || '',
    birthday: e?.birthday || '', exited_on: e?.exited_on || '',
    personal_email: p?.personal_email || '', personal_phone: p?.personal_phone || '',
    emergency_name: p?.emergency_name || '', emergency_phone: p?.emergency_phone || '',
    address: p?.address || '', notes: p?.notes || '',
  };
}

/**
 * The two payloads saveEmployee() wrote, or the error to show: `main` goes to employees, `priv` to
 * employee_private. Blank values are null (readForm). Key order is the old one.
 */
export function employeeFromForm(form) {
  const v = normalizeForm(form);
  if (!v.full_name) return { error: 'Enter the employee’s name.' };
  return {
    main: Object.fromEntries(MAIN_FIELDS.map((k) => [k, v[k]])),
    priv: Object.fromEntries(PRIV_FIELDS.map((k) => [k, v[k]])),
  };
}

/** The sentence under the form for a failed save. */
export function employeeSaveError(err) {
  const m = err?.message || String(err);
  return /duplicate key.*person_code/i.test(m) ? 'That sign-in is already linked to another employee.' : m.replace(/^(INSERT|UPDATE) employees failed: /, '');
}

/** The options of the Company select: companies on record plus those on tasks. */
export function companyOptions(employees, tasks) {
  return [...new Set([...employees.map((e) => e.company), ...(tasks || []).map((t) => t.company)].filter(Boolean))].sort();
}

/** People who report to `e` (matched by person code, so only linked employees have reports). */
export function directReports(list, e) {
  return list.filter((x) => x.manager_code && x.manager_code === e.person_code && e.person_code);
}
