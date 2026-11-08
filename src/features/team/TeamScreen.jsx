'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Avatar, Badge, Dialog, EmptyCard, Field } from '../../components/ui.jsx';
import { useStore } from '../../store/useStore.js';
import { useAccess } from '../../hooks/useAccess.js';
import { personName, internalPeople } from '../../lib/mappers.js';
import { todayISO } from '../../lib/queue.js';
import { fmtDate } from '../../lib/ui-format.js';
import { deleteEmployee, fetchPrivate, saveEmployee, seedTeam } from '../../lib/team-actions.js';
import { SEARCH_DEBOUNCE_MS } from '../work/matrix/model.js';
import {
  STATUSES, STATUS_LABEL, STATUS_TONE, TEAM_VIEW_KEY, TYPES, TYPE_LABEL,
  companiesOf, companyOptions, departmentsOf, directReports, employeeFromForm, employeeSaveError,
  formFromEmployee, mergeTeamParams, teamStats, visibleEmployees, workOf,
} from './model.js';
import { useTeam } from './hooks/useTeam.js';
import { useTeamFilters } from './hooks/useTeamFilters.js';

const MISSING = 'An admin needs to apply the database migration 20261011_expenses_team.sql, then refresh.';

/** "3 open · 1 overdue · 2 due this week", or the note for an employee with no sign-in. */
function WorkLine({ w }) {
  if (!w) return <span className="emp-work muted">Not linked to a sign-in</span>;
  return (
    <span className="emp-work">
      <b>{w.open.length}</b> open
      {w.overdue ? <> · <span className="emp-od">{w.overdue} overdue</span></> : null}
      {w.week ? ` · ${w.week} due this week` : ''}
    </span>
  );
}

const Kv = ({ label, children }) => (
  <div className="kv"><span>{label}</span><b>{children || <i>—</i>}</b></div>
);

/* ── detail ───────────────────────────────────────────────────────────────── */

/** Their open work, due soonest first; each row opens the task view. */
function WorkSection({ w, onOpenTask }) {
  const today = todayISO();
  return (
    <div className="emp-work-sec">
      <div className="priv-h">Open work <span>{w.open.length} open{w.overdue ? ` · ${w.overdue} overdue` : ''}</span></div>
      {w.open.length ? (
        <>
          <div className="emp-tasks">
            {w.open.slice(0, 20).map((t) => (
              <button type="button" className="emp-task" key={t.id} onClick={() => onOpenTask(t.id)}>
                <span className="emp-task-t">{t.task || 'Untitled'}</span>
                <span className={'emp-task-m' + (t.nextFollowUp && t.nextFollowUp < today ? ' emp-od' : '')}>
                  {t.nextFollowUp ? fmtDate(t.nextFollowUp) : 'No date'}{t.priority ? ' · ' + t.priority : ''}
                </span>
              </button>
            ))}
          </div>
          {w.open.length > 20 ? <div className="muted" style={{ marginTop: 6 }}>Showing the 20 due soonest.</div> : null}
        </>
      ) : <div className="muted">Nothing open right now.</div>}
    </div>
  );
}

/** The admin-only personal block: loaded when the detail opens. */
function PrivateBox({ employeeId }) {
  const [state, setState] = useState({ loading: true, p: null, error: null });
  useEffect(() => {
    let live = true;
    fetchPrivate(employeeId)
      .then((p) => { if (live) setState({ loading: false, p, error: null }); })
      .catch((err) => { if (live) setState({ loading: true, p: null, error: err.message }); });
    return () => { live = false; };
  }, [employeeId]);
  const { p } = state;
  return (
    <div className="priv" id="emp-priv">
      <div className="priv-h">Personal &amp; emergency <span>Visible to admins only</span></div>
      {state.loading ? <div className="muted">Loading…</div> : (
        <div className="kv-grid">
          <Kv label="Personal e-mail">{p?.personal_email}</Kv><Kv label="Personal phone">{p?.personal_phone}</Kv>
          <Kv label="Emergency contact">{p?.emergency_name}</Kv><Kv label="Emergency phone">{p?.emergency_phone}</Kv>
          <Kv label="Address">{p?.address}</Kv><Kv label="HR notes">{p?.notes}</Kv>
        </div>
      )}
      {state.error ? <div className="muted">Could not load: {state.error}</div> : null}
    </div>
  );
}

function EmployeeDetail({ employee: e, employees, tasks, admin, onClose, onEdit, onOpenTask }) {
  const w = workOf(e, tasks);
  const reports = directReports(employees, e);
  return (
    <Dialog
      open wide title={e.full_name} onClose={onClose}
      footer={admin ? (
        <>
          <button type="button" className="btn b-pr" onClick={onEdit}>Edit</button>
          <button type="button" className="btn b-gh" onClick={onClose}>Close</button>
        </>
      ) : <button type="button" className="btn b-gh" onClick={onClose}>Close</button>}
    >
      <div className="emp-head">
        <Avatar name={e.full_name} size={56} />
        <div>
          <div className="emp-h-n">{e.full_name}</div>
          <div className="muted">{e.designation || ''}{e.department ? ` · ${e.department}` : ''}</div>
          <div style={{ marginTop: 6 }}>
            <Badge text={STATUS_LABEL[e.status]} tone={STATUS_TONE[e.status]} />{' '}
            <Badge text={TYPE_LABEL[e.employment_type]} tone="outline" />
          </div>
        </div>
      </div>
      <div className="kv-grid">
        <Kv label="Work e-mail">{e.work_email ? <a href={`mailto:${e.work_email}`}>{e.work_email}</a> : ''}</Kv>
        <Kv label="Phone">{e.phone ? <a href={`tel:${e.phone}`}>{e.phone}</a> : ''}</Kv>
        <Kv label="Company">{e.company}</Kv><Kv label="Location">{e.location}</Kv>
        <Kv label="Reports to">{e.manager_code ? personName(e.manager_code) : ''}</Kv>
        <Kv label="Direct reports">{reports.map((r) => r.full_name).join(', ')}</Kv>
        <Kv label="Joined">{e.joined_on ? fmtDate(e.joined_on) : ''}</Kv>
        {e.exited_on
          ? <Kv label="Left">{fmtDate(e.exited_on)}</Kv>
          : <Kv label="Birthday">{e.birthday ? fmtDate(e.birthday) : ''}</Kv>}
        <Kv label="Linked sign-in">{e.person_code ? personName(e.person_code) : ''}</Kv>
      </div>
      {w ? <WorkSection w={w} onOpenTask={onOpenTask} /> : null}
      {admin ? <PrivateBox employeeId={e.id} /> : null}
    </Dialog>
  );
}

/* ── add / edit (admin) ───────────────────────────────────────────────────── */

function EmployeeFormDialog({ employee: e, priv, employees, tasks, onClose, onSaved, onDeleted }) {
  const [form, setForm] = useState(() => formFromEmployee(e, priv));
  const [err, setErr] = useState('');
  const set = (name) => (value) => setForm((f) => ({ ...f, [name]: value }));
  const f = (name, label, extra = {}) => <Field name={name} label={label} value={form[name]} onChange={set(name)} {...extra} />;

  const taken = new Set(employees.filter((x) => x.person_code && (!e || x.id !== e.id)).map((x) => x.person_code));
  const ppl = internalPeople();
  const label = (x) => x.display_name || x.code;
  const depts = [...new Set(employees.map((x) => x.department).filter(Boolean))];

  const save = async () => {
    setErr('');
    const out = employeeFromForm(form);
    if (out.error) { setErr(out.error); return; }
    try {
      await saveEmployee(e ? e.id : null, out.main, out.priv);
      onSaved();
    } catch (error) { setErr(employeeSaveError(error)); }
  };

  const remove = () => {
    if (!window.confirm(`Delete ${e?.full_name}? Their personal details are deleted too. To keep a record, set their status to Exited instead.`)) return;
    deleteEmployee(e.id).then((ok) => { if (ok) onDeleted(); });
  };

  return (
    <Dialog
      open wide title={e ? `Edit ${e.full_name}` : 'Add employee'} onClose={onClose}
      footer={(
        <>
          {e ? <button type="button" className="btn b-dn" style={{ marginRight: 'auto' }} onClick={remove}>Delete</button> : null}
          <button type="button" className="btn b-pr" onClick={save}>{e ? 'Save changes' : 'Add employee'}</button>
          <button type="button" className="btn b-gh" onClick={onClose}>Cancel</button>
        </>
      )}
    >
      <div className="ui-form">
        <div className="two">{f('full_name', 'Full name', { required: true })}{f('designation', 'Designation')}</div>
        <div className="two">{f('work_email', 'Work e-mail', { type: 'email' })}{f('phone', 'Phone', { type: 'tel' })}</div>
        <div className="two">
          {f('department', 'Department', { inputProps: { list: 'team-depts', autoComplete: 'off' } })}
          {f('company', 'Company', { options: [['', 'Not specified'], ...companyOptions(employees, tasks).map((c) => [c, c])] })}
        </div>
        <datalist id="team-depts">{depts.map((d) => <option key={d} value={d} />)}</datalist>
        <div className="two">
          {f('employment_type', 'Employment type', { options: TYPES })}
          {f('status', 'Status', { options: STATUSES })}
        </div>
        <div className="two">
          {f('manager_code', 'Reports to', { options: [['', 'No one'], ...ppl.filter((x) => x.code !== e?.person_code).map((x) => [x.code, label(x)])] })}
          {f('person_code', 'Linked sign-in', { options: [['', 'Not linked'], ...ppl.filter((x) => !taken.has(x.code)).map((x) => [x.code, label(x)])], hint: 'Ties this person to task ownership and alerts.' })}
        </div>
        <div className="two">{f('location', 'Location')}{f('joined_on', 'Joined on', { type: 'date' })}</div>
        <div className="two">{f('birthday', 'Birthday', { type: 'date' })}{f('exited_on', 'Left on', { type: 'date' })}</div>
        <div className="priv">
          <div className="priv-h">Personal &amp; emergency <span>Visible to admins only</span></div>
          <div className="two">{f('personal_email', 'Personal e-mail', { type: 'email' })}{f('personal_phone', 'Personal phone', { type: 'tel' })}</div>
          <div className="two">{f('emergency_name', 'Emergency contact')}{f('emergency_phone', 'Emergency phone', { type: 'tel' })}</div>
          {f('address', 'Address', { type: 'textarea' })}
          {f('notes', 'HR notes', { type: 'textarea' })}
          <small className="muted">Salary, bank and ID numbers are intentionally not stored here.</small>
        </div>
        <div className="ferr" id="emp-err" role="alert">{err}</div>
      </div>
    </Dialog>
  );
}

/* ── the lists ────────────────────────────────────────────────────────────── */

function TeamBody({ all, shown, view, tasks, admin, onOpen }) {
  if (!all.length) {
    return (
      <EmptyCard title="No employees yet" text={admin ? 'Add the first one, or import everyone who already has a sign-in.' : 'Nobody has been added yet.'}>
        {admin ? <button type="button" className="btn b-pr" onClick={seedTeam}>Import from people</button> : null}
      </EmptyCard>
    );
  }
  if (!shown.length) return <EmptyCard title="Nobody matches" text="Try clearing a filter or the search." />;
  if (view === 'table') {
    return (
      <div className="ui-card"><div className="table-scroll"><table className="ui-table">
        <thead><tr><th>Name</th><th>Role</th><th>Department</th><th>Reports to</th><th>Work</th><th>Contact</th><th>Status</th></tr></thead>
        <tbody>
          {shown.map((e) => (
            <tr className="click" key={e.id} onClick={() => onOpen(e.id)}>
              <td><div className="who"><Avatar name={e.full_name} size={30} /><div><div className="cell-main">{e.full_name}</div><div className="cell-sub">{e.company || ''}</div></div></div></td>
              <td>{e.designation || '—'}</td><td>{e.department || '—'}</td>
              <td>{e.manager_code ? personName(e.manager_code) : '—'}</td>
              <td><WorkLine w={workOf(e, tasks)} /></td>
              <td><div className="cell-sub">{e.work_email || ''}</div><div className="cell-sub">{e.phone || ''}</div></td>
              <td><Badge text={STATUS_LABEL[e.status]} tone={STATUS_TONE[e.status]} /></td>
            </tr>
          ))}
        </tbody>
      </table></div></div>
    );
  }
  return (
    <div className="emp-grid">
      {shown.map((e) => (
        <button type="button" className="ui-card emp" key={e.id} onClick={() => onOpen(e.id)}>
          <span className="emp-top">
            <Avatar name={e.full_name} size={44} />
            <span className="emp-id"><b>{e.full_name}</b><small>{e.designation || 'No title yet'}</small></span>
          </span>
          <WorkLine w={workOf(e, tasks)} />
          <span className="emp-tags">
            {e.department ? <Badge text={e.department} tone="outline" /> : null}
            {e.company ? <Badge text={e.company} tone="neutral" /> : null}
            <Badge text={STATUS_LABEL[e.status]} tone={STATUS_TONE[e.status]} />
          </span>
          <span className="emp-meta">
            {e.work_email ? <span>{e.work_email}</span> : null}
            {e.phone ? <span>{e.phone}</span> : null}
            {e.location ? <span>{e.location}</span> : null}
          </span>
        </button>
      ))}
    </div>
  );
}

/**
 * The Team screen (old `#tab-team`): the stat tiles, the search and filters, the Cards / Table
 * switch and the employee dialogs. `view` is the routed sub-view ('cards' | 'table'); the filters are
 * search params and the dialogs are component state (spec C7). The choice is also kept in the old
 * localStorage key `rie_team_view` ('grid' | 'table'), which /team reads to pick a sub-view.
 */
export default function TeamScreen({ view }) {
  const router = useRouter();
  const { isAdmin: admin } = useAccess();
  const { employees, loaded, error, reload } = useTeam();
  const tasks = useStore((s) => s.tasks);
  useStore((s) => s.people);                    // names (reports to, linked sign-in) follow the people list
  const { filters, search, update } = useTeamFilters();
  const [dialog, setDialog] = useState(null);   // null | { kind: 'detail', id } | { kind: 'form', id, priv }

  useEffect(() => {
    try { localStorage.setItem(TEAM_VIEW_KEY, view === 'table' ? 'table' : 'grid'); } catch { /* ignore */ }
  }, [view]);

  // The search box filters as you type; the URL follows after a short pause.
  const [q, setQ] = useState(filters.q);
  const written = useRef(filters.q);
  const timer = useRef(null);
  useEffect(() => {
    if (filters.q !== written.current) { written.current = filters.q; setQ(filters.q); }
  }, [filters.q]);
  useEffect(() => () => clearTimeout(timer.current), []);
  const onSearch = (v) => {
    setQ(v);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => { written.current = v; update({ q: v }); }, SEARCH_DEBOUNCE_MS);
  };

  const shown = useMemo(
    () => visibleEmployees(employees, { ...filters, q }),
    [employees, filters, q],
  );
  const depts = useMemo(() => departmentsOf(employees), [employees]);
  const cos = useMemo(() => companiesOf(employees), [employees]);
  const stats = useMemo(() => teamStats(employees, tasks), [employees, tasks]);

  if (!loaded && !error) {
    return <Frame><div className="pg-wrap"><div className="empty-state sm"><p>Loading team…</p></div></div></Frame>;
  }
  if (error === 'missing') {
    return <Frame><div className="pg-wrap"><EmptyCard title="The team directory is not set up yet" text={MISSING} /></div></Frame>;
  }
  if (error) {
    return (
      <Frame><div className="pg-wrap">
        <EmptyCard title="Could not load the team" text={error}>
          <button type="button" className="btn b-pr" onClick={reload}>Try again</button>
        </EmptyCard>
      </div></Frame>
    );
  }

  const switchTo = (v) => {
    const qs = mergeTeamParams(search, { ...filters, q });
    router.push(`/team/${v}` + (qs ? `?${qs}` : ''));
  };
  const detailEmployee = dialog?.kind === 'detail' ? employees.find((e) => String(e.id) === String(dialog.id)) : null;
  const formEmployee = dialog?.kind === 'form' && dialog.id ? employees.find((e) => String(e.id) === String(dialog.id)) : null;

  const openEmployee = (id) => setDialog({ kind: 'detail', id });
  // The private row is read first, so the form opens filled in (a failed read opens it empty, as before).
  const openForm = async (id) => {
    if (!admin) return;
    let priv = null;
    if (id) { try { priv = await fetchPrivate(id); } catch { /* none yet */ } }
    setDialog({ kind: 'form', id: id || null, priv });
  };
  const closeDialog = () => setDialog(null);

  return (
    <Frame>
      <div className="pg-wrap wide">
        <header className="pg-head">
          <div><h1>Team</h1><p>Everyone at the company: role, department, who they report to, and how to reach them.</p></div>
          <div className="head-actions">
            {admin ? (
              <>
                <button type="button" className="btn b-ol" onClick={seedTeam}>Import from people</button>
                <button type="button" className="btn b-pr" onClick={() => openForm()}>Add employee</button>
              </>
            ) : null}
          </div>
        </header>

        <div className="stat-grid">
          <div className="ui-card stat"><div className="stat-l">Headcount</div><div className="stat-v">{stats.headcount}</div><div className="stat-s">{stats.onRecord} on record</div></div>
          <div className="ui-card stat"><div className="stat-l">Departments</div><div className="stat-v">{stats.departments}</div><div className="stat-s">{stats.deptSample}</div></div>
          <div className="ui-card stat"><div className="stat-l">On leave / notice</div><div className="stat-v">{stats.leave}</div><div className="stat-s">right now</div></div>
          <div className="ui-card stat"><div className="stat-l">Overdue across the team</div><div className="stat-v">{stats.overdue}</div><div className="stat-s">open tasks past their date</div></div>
        </div>

        <div className="toolbar">
          <input className="ui-input search" type="search" placeholder="Search name, role, department…" value={q} onChange={(ev) => onSearch(ev.target.value)} aria-label="Search the team" />
          <div className="filters">
            <select className="ui-input sm" value={filters.department} onChange={(ev) => update({ department: ev.target.value })} aria-label="Department">
              <option value="">All departments</option>
              {depts.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
            {cos.length ? (
              <select className="ui-input sm" value={filters.company} onChange={(ev) => update({ company: ev.target.value })} aria-label="Company">
                <option value="">All companies</option>
                {cos.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            ) : null}
            <select className="ui-input sm" value={filters.status} onChange={(ev) => update({ status: ev.target.value })} aria-label="Status">
              <option value="">Any status</option>
              {STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <div className="seg sm nm">
              <button type="button" className={view === 'cards' ? 'on' : ''} onClick={() => switchTo('cards')}>Cards</button>
              <button type="button" className={view === 'table' ? 'on' : ''} onClick={() => switchTo('table')}>Table</button>
            </div>
          </div>
        </div>

        <div id="team-body">
          <TeamBody all={employees} shown={shown} view={view} tasks={tasks} admin={admin} onOpen={openEmployee} />
        </div>
      </div>

      {detailEmployee ? (
        <EmployeeDetail
          employee={detailEmployee} employees={employees} tasks={tasks} admin={admin}
          onClose={closeDialog} onEdit={() => openForm(detailEmployee.id)}
          onOpenTask={(id) => { closeDialog(); router.push(`/work/tasks/${encodeURIComponent(String(id))}`); }}
        />
      ) : null}
      {dialog?.kind === 'form' && admin ? (
        <EmployeeFormDialog
          key={dialog.id ?? 'new'} employee={formEmployee} priv={dialog.priv}
          employees={employees} tasks={tasks}
          onClose={closeDialog} onSaved={closeDialog} onDeleted={closeDialog}
        />
      ) : null}
    </Frame>
  );
}

/** The page frame: `.tp.page` with the old root id. */
function Frame({ children }) {
  return <div className="tp page active" id="tab-team"><div id="team-root">{children}</div></div>;
}
