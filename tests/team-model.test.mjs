// Team directory pure logic: each person's work, the filters, the stat tiles, the URL params and the
// save payloads. Expected values are worked out by hand from rie-dashboard2/js/team.js.
import {
  workOf, visibleEmployees, teamStats, parseTeamParams, serializeTeamParams, mergeTeamParams,
  formFromEmployee, employeeFromForm, employeeSaveError, companyOptions, directReports, isMissingTable, sortByName,
} from '../src/features/team/model.js';

let bad = 0;
const check = (c, m) => { console.log((c ? '  ok  ' : '  FAIL') + '  ' + m); if (!c) bad++; };
const same = (a, b, m) => {
  const ok = JSON.stringify(a) === JSON.stringify(b);
  check(ok, m + (ok ? '' : '  got ' + JSON.stringify(a)));
};

// Tue 10 Nov 2026, local. today = 2026-11-10, the "this week" window ends 2026-11-17 (inclusive).
const now = new Date(2026, 10, 10, 12, 0);
const task = (id, o) => ({ id, task: 'T' + id, status: 'Pending', archivedAt: '', ownerCode: 'ME', coOwnerCodes: [], nextFollowUp: '', ...o });
const tasks = [
  task(1, { nextFollowUp: '2026-11-05' }),                                 // overdue
  task(2, { status: 'In Progress', nextFollowUp: '2026-11-12' }),          // this week
  task(3, { status: 'On Hold', ownerCode: 'OT', coOwnerCodes: ['ME'] }),   // shared, no date
  task(4, { status: 'Completed', nextFollowUp: '2026-11-01' }),            // closed
  task(5, { archivedAt: '2026-10-01', nextFollowUp: '2026-11-01' }),       // archived
  task(6, { ownerCode: 'OT', nextFollowUp: '2026-11-20' }),                // not theirs
  task(7, { nextFollowUp: '2026-11-17' }),                                 // last day of the window
  task(8, { nextFollowUp: '2026-11-18' }),                                 // one day past it
];

const w = workOf({ person_code: 'ME' }, tasks, now);
same(w.open.map((t) => t.id), [1, 2, 7, 8, 3], 'open work is due soonest first, no date last; closed, archived and others\' tasks are out');
check(w.overdue === 1, 'one overdue (5 Nov)');
check(w.week === 2, 'two due in the next 7 days (12 Nov and 17 Nov, inclusive); the undated shared task and 18 Nov do not count');
check(workOf({ person_code: null }, tasks, now) === null, 'an employee with no sign-in has no numbers (null, not zeros)');
same(workOf({ person_code: 'OT' }, tasks, now).open.map((t) => t.id), [6, 3], 'the owner of a shared task counts it too; their dated task sorts before the undated one');
check(workOf({ person_code: 'NOBODY' }, tasks, now).open.length === 0, 'a linked person with nothing open has zero');

// Filters
const emps = [
  { id: 1, full_name: 'Asha Rao', designation: 'Designer', department: 'Design', company: 'Acme', status: 'active', work_email: 'asha@x.test', location: 'Pune', person_code: 'ME' },
  { id: 2, full_name: 'Ben Cole', designation: 'Engineer', department: 'Engineering', company: 'Beta', status: 'on_leave', work_email: 'ben@x.test', location: 'Delhi', person_code: 'OT' },
  { id: 3, full_name: 'Cy Dunn', designation: '', department: 'Engineering', company: 'Acme', status: 'exited', work_email: null, location: null, person_code: null },
];
same(visibleEmployees(emps, { status: 'active' }).map((e) => e.id), [1], 'status filter');
same(visibleEmployees(emps, {}).map((e) => e.id), [1, 2, 3], 'no filter shows everyone');
same(visibleEmployees(emps, { department: 'Engineering', company: 'Acme' }).map((e) => e.id), [3], 'department and company combine');
same(visibleEmployees(emps, { q: 'DELHI' }).map((e) => e.id), [2], 'search matches location, case-insensitively');
same(visibleEmployees(emps, { q: 'asha@' }).map((e) => e.id), [1], 'search matches the work e-mail');
same(visibleEmployees(emps, { q: 'zzz' }), [], 'no match is empty');

// Stat tiles: headcount counts active only; leave counts on_leave + notice; overdue sums active people's overdue.
const st = teamStats(emps, tasks, now);
check(st.headcount === 1 && st.onRecord === 3, 'headcount 1 active of 3 on record');
check(st.departments === 2 && st.deptSample === 'Design, Engineering', 'two departments, sorted');
check(st.leave === 1, 'one on leave / notice');
check(st.overdue === 1, 'overdue across the (active) team is the one active person\'s one');
check(teamStats([], [], now).deptSample === '—', 'no departments shows a dash');

// URL params
same(parseTeamParams(''), { q: '', department: '', company: '', status: 'active' }, 'defaults: status Active');
same(parseTeamParams('status=any&dept=Design&company=Acme&q=as'), { q: 'as', department: 'Design', company: 'Acme', status: '' }, 'status=any is "Any status"');
check(parseTeamParams('status=notice').status === 'notice', 'a status in the URL');
check(serializeTeamParams({ q: '', department: '', company: '', status: 'active' }) === '', 'defaults serialize to nothing');
check(serializeTeamParams({ q: '', department: '', company: '', status: '' }) === 'status=any', 'Any status is status=any');
check(serializeTeamParams({ q: 'a b', department: 'Design', company: '', status: 'exited' }) === 'q=a+b&dept=Design&status=exited', 'params in a fixed order');
check(mergeTeamParams('x=1&q=old&status=any', { q: 'new', department: '', company: '', status: 'active' }) === 'x=1&q=new', 'merge keeps other params and replaces the filter ones');

// Form payloads
const empty = formFromEmployee(null, null);
check(empty.employment_type === 'full_time' && empty.status === 'active' && empty.full_name === '', 'a new employee starts full-time and active');
const err = employeeFromForm(empty);
check(err.error === 'Enter the employee’s name.', 'the name is required');
const filled = employeeFromForm({ ...empty, full_name: '  Dee Ford ', department: ' Ops ', notes: ' ok ' });
check(filled.main.full_name === 'Dee Ford' && filled.main.department === 'Ops', 'values are trimmed');
check(filled.main.designation === null && filled.main.joined_on === null && filled.priv.address === null, 'blank values are null');
check(Object.keys(filled.main).join(',') === 'full_name,designation,work_email,phone,department,company,employment_type,status,manager_code,person_code,location,joined_on,exited_on,birthday', 'employees payload keys in the old order');
check(Object.keys(filled.priv).join(',') === 'personal_email,personal_phone,emergency_name,emergency_phone,address,notes', 'employee_private payload keys in the old order');
check(filled.priv.notes === 'ok', 'private values are trimmed');
const edit = formFromEmployee({ id: 9, full_name: 'Eve', status: 'notice', employment_type: 'intern', person_code: 'ME', joined_on: '2025-01-02' }, { notes: 'n' });
check(edit.status === 'notice' && edit.employment_type === 'intern' && edit.person_code === 'ME' && edit.joined_on === '2025-01-02' && edit.notes === 'n', 'edit starts from the row and its private row');

check(employeeSaveError(new Error('INSERT employees failed: duplicate key value violates unique constraint "employees_person_code_key" person_code')) === 'That sign-in is already linked to another employee.', 'a duplicate sign-in link has its own sentence');
check(employeeSaveError(new Error('UPDATE employees failed: nope')) === 'nope', 'the "UPDATE employees failed: " prefix is dropped');
check(isMissingTable('GET employees failed: 404') && isMissingTable('relation "x" does not exist') && !isMissingTable('GET employees failed: 500'), 'a missing table is told from other failures');

same(companyOptions(emps, [{ company: 'Zed' }, { company: 'Acme' }, {}]), ['Acme', 'Beta', 'Zed'], 'company options: employees and tasks, distinct, sorted');
same(directReports([{ id: 1, manager_code: 'ME' }, { id: 2, manager_code: 'OT' }, { id: 3, manager_code: null }], { person_code: 'ME' }).map((e) => e.id), [1], 'direct reports match by person code');
same(directReports([{ id: 1, manager_code: null }], { person_code: null }), [], 'an unlinked employee has no reports');
same(sortByName([{ full_name: 'b' }, { full_name: 'a' }]).map((e) => e.full_name), ['a', 'b'], 'sorted by name');

console.log(bad ? `\n${bad} FAILED\n` : '\nteam model ok\n');
process.exit(bad ? 1 : 0);
