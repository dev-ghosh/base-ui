// Pure logic behind Today, Triage, Classify and the task form: ported from
// rie-dashboard2 js/today.js, js/triage.js, js/classify.js and js/tasks.js.
import {
  SHOW, addDaysISO, nextMondayISO, buildToday, decisionQuestion, decisionSubject, decisionAge,
  weekShape, triageQueue, todayHref,
} from '../src/lib/today.js';
import { classifyQueue, classifyReason, funcsFor } from '../src/lib/classify.js';
import { companiesOf, activeFuncsOf } from '../src/lib/registry.js';
import { formFromTask, taskFromForm, validateTask, NAME_REQUIRED, FUNC_REQUIRED, SELF_ONLY } from '../src/lib/task-form.js';

let passed = 0, failed = 0;
const assert = (c, m) => { if (c) { passed++; console.log('  ok  ' + m); } else { failed++; console.log('  FAIL  ' + m); } };
const eq = (a, b, m) => assert(JSON.stringify(a) === JSON.stringify(b), `${m}${JSON.stringify(a) === JSON.stringify(b) ? '' : '  got ' + JSON.stringify(a) + ' want ' + JSON.stringify(b)}`);

// A fixed "now": Wednesday 2026-11-04 (local noon, so no timezone rollover can bite).
const NOW = new Date(2026, 10, 4, 12, 0, 0);
const ME = 'ME1';

let seq = 0;
const task = (o = {}) => ({
  id: String(++seq), task: 'T' + seq, status: 'Pending', priority: 'P2', company: 'Co', func: 'Ops',
  ownerCode: ME, assignedTo: 'Me', coOwnerCodes: [], nextFollowUp: '', archivedAt: '', ...o,
});

// ── dates ─────────────────────────────────────────────────────────────────────
eq(addDaysISO(1, NOW), '2026-11-05', 'addDaysISO(1) is tomorrow, local date');
eq(addDaysISO(30, NOW), '2026-12-04', 'addDaysISO(30)');
eq(nextMondayISO(NOW), '2026-11-09', 'next Monday from a Wednesday');
eq(nextMondayISO(new Date(2026, 10, 9, 12)), '2026-11-16', 'from a Monday it is the Monday after');
eq(nextMondayISO(new Date(2026, 10, 8, 12)), '2026-11-09', 'from a Sunday it is tomorrow');
eq(nextMondayISO(new Date(2026, 10, 7, 12)), '2026-11-09', 'from a Saturday it is in two days');

// ── buildToday: the groups ────────────────────────────────────────────────────
const tasks = [
  task({ id: 'a', priority: 'P1', nextFollowUp: '2026-10-01' }),              // p1 overdue (mine)
  task({ id: 'b', priority: 'P2', nextFollowUp: '2026-10-20' }),              // overdue
  task({ id: 'c', priority: 'P3', nextFollowUp: '2026-11-10' }),              // due next
  task({ id: 'd', priority: 'P2', nextFollowUp: '' }),                        // undated
  task({ id: 'e', ownerCode: 'OT1', assignedTo: 'Other', nextFollowUp: '2026-10-02', priority: 'P1' }),  // someone else's, overdue p1
  task({ id: 'f', ownerCode: '', assignedTo: '', nextFollowUp: '2026-10-03' }),                          // unowned, overdue
  task({ id: 'g', ownerCode: 'OT1', assignedTo: 'Other', coOwnerCodes: [ME], nextFollowUp: '2026-11-11' }), // co-owned with me
  task({ id: 'h', status: 'Completed', nextFollowUp: '2026-10-01' }),         // closed: not in the queue
  task({ id: 'i', archivedAt: '2026-01-01', nextFollowUp: '2026-10-01' }),    // archived: not in the queue
];
const decisions = [
  { id: 1, entityId: 'a', question: 'about mine', raisedAt: '2026-10-01T00:00:00Z' },
  { id: 2, entityId: 'e', question: 'about theirs', raisedAt: '2026-10-02T00:00:00Z' },
  { id: 3, entityId: null, question: 'about nothing', raisedAt: '2026-10-03T00:00:00Z' },
  { id: 4, entityId: '', question: 'blank', raisedAt: '2026-10-04T00:00:00Z' },
];
const d = buildToday({ tasks, decisions, entityLinks: [], me: ME, now: NOW });
eq(d.p1Overdue.map(t => t.id), ['a'], 'p1Overdue: my P1 overdue only');
eq(d.overdue.map(t => t.id), ['a', 'b'], 'overdue: mine, P1 first');
eq(d.dueSoon.map(t => t.id), ['g', 'c'], 'dueSoon: mine (owner or co-owner), dated, not late');
eq(d.undated.map(t => t.id), ['d'], 'undated: mine without a date');
eq(d.unowned.map(t => t.id), ['f'], 'unowned: nobody owns it');
eq(d.decisions.map(x => x.id), [1, 3, 4], 'decisions: about my work or about nothing in particular');
eq(buildToday({ tasks, decisions, entityLinks: [], me: null, now: NOW }).decisions.length, 4, 'no person code: every decision');
eq(d.team.map(r => r.owner), ['OT1'], 'team load lists the other owner');
eq(d.team[0], { owner: 'OT1', open: 2, overdue: 1, p1: 1 }, 'team row counts open, overdue, P1 (owner and co-owner rows)');
const sorted = buildToday({ tasks: [
  task({ id: 'x1', ownerCode: 'A', nextFollowUp: '2026-10-01' }),
  task({ id: 'x2', ownerCode: 'B', nextFollowUp: '2026-10-01' }),
  task({ id: 'x3', ownerCode: 'B', nextFollowUp: '2026-10-01' }),
], decisions: [], entityLinks: [], me: ME, now: NOW }).team;
eq(sorted.map(r => r.owner), ['B', 'A'], 'team sorted by most overdue first');
assert(SHOW === 5, 'rows per section are capped at 5');

// decisions about a workstream/initiative that contains my task count as mine (myIds)
const viaLink = buildToday({
  tasks: [task({ id: 't1' })],
  decisions: [{ id: 9, entityId: 'ws', raisedAt: '' }, { id: 10, entityId: 'other', raisedAt: '' }],
  entityLinks: [{ parentId: 'ws', childId: 't1' }], me: ME, now: NOW,
});
eq(viaLink.decisions.map(x => x.id), [9], 'a decision on my task\'s workstream is mine');

// ── decision text ─────────────────────────────────────────────────────────────
eq(decisionQuestion({ question: 'PREMISE FALSIFIED — The real sentence.' }), 'The real sentence.', 'shouted lead-in is dropped');
eq(decisionQuestion({ question: '', recommendedAction: 'Do X' }), 'Do X', 'empty question falls back to the recommended action');
eq(decisionQuestion({ question: '' }), 'Decision', 'and then to "Decision"');
const long = 'word '.repeat(80).trim();
const q = decisionQuestion({ question: long });
assert(q.length <= 171 && q.endsWith('…'), 'long text is cut at a word boundary with an ellipsis');
eq(decisionQuestion({ question: 'R5 Rail-B, Day 3. Then a much longer second sentence that explains the whole situation in detail. And more.' }).startsWith('R5 Rail-B, Day 3. Then'), true, 'a short first sentence is not a stub');
eq(decisionSubject({ entityId: 'a' }, tasks), 'T1', 'subject is the task title');
eq(decisionSubject({ entityId: 'zz', signalCode: 'idle_task' }, tasks), 'idle task', 'else the signal code, humanised');
eq(decisionSubject({ entityId: 'zz' }, tasks), 'Decision', 'else "Decision"');
const ago = (days) => new Date(NOW.getTime() - days * 86400000).toISOString();
eq([decisionAge({ raisedAt: '' }, NOW.getTime()), decisionAge({ raisedAt: ago(0) }, NOW.getTime()), decisionAge({ raisedAt: ago(1) }, NOW.getTime()), decisionAge({ raisedAt: ago(16) }, NOW.getTime())],
  ['', 'today', '1d', '16d'], 'decision age');

// ── the shape line ────────────────────────────────────────────────────────────
const shapeTasks = [
  task({ id: 's1', status: 'Completed', closedAt: '2026-11-04T08:00:00Z' }),
  task({ id: 's2', status: 'Completed', updatedAt: '2026-11-04T09:00:00Z' }),
  task({ id: 's3', status: 'Completed', closedAt: '2026-11-03T09:00:00Z' }),
  task({ id: 's4', status: 'Completed', ownerCode: 'OT1', closedAt: '2026-11-04T08:00:00Z' }),
];
const shape = weekShape(buildToday({ tasks: [...tasks, ...shapeTasks], decisions: [], entityLinks: [], me: ME, now: NOW }), [...tasks, ...shapeTasks], NOW);
eq(shape, { mineOpen: 5, dueWeek: 2, closedToday: 2 }, 'open / due this week / closed today (mine only)');

// ── where rows lead (todayGoto) ───────────────────────────────────────────────
eq(todayHref('decisions'), '/work/initiatives', 'decisions go to Initiatives (not Decide)');
eq(todayHref('owner', 'Rohit Kadian'), '/work/matrix?scope=everyone&o=Rohit%20Kadian', 'owner: everyone scope, owner filter = display name');
eq(todayHref('unowned'), '/work/matrix?scope=team', 'unowned: team scope');
eq(todayHref('anything'), '/work', 'default: Work');

// ── triage queue ──────────────────────────────────────────────────────────────
eq(triageQueue(tasks, ME, 'mine', NOW).map(r => r.id), ['a', 'b'], 'triage mine: my overdue, most urgent first');
eq(triageQueue(tasks, ME, 'all', NOW).map(r => r.id), ['a', 'e', 'f', 'b'], 'triage all: everyone\'s overdue');
eq(triageQueue(tasks, null, 'mine', NOW).map(r => r.id), ['a', 'e', 'f', 'b'], 'triage mine without a person code is everyone');

// ── classify queue ────────────────────────────────────────────────────────────
const cl = classifyQueue([
  task({ id: 'k1', func: '', priority: 'P1' }),                       // untagged
  task({ id: 'k2', funcReview: true, priority: 'P1' }),               // flagged
  task({ id: 'k3', company: '', priority: 'P3' }),                    // untagged (no company)
  task({ id: 'k4' }),                                                 // fine
  task({ id: 'k5', func: '', status: 'Completed' }),                  // closed
  task({ id: 'k6', func: '', archivedAt: '2026-01-01' }),             // archived
  task({ id: 'k7', func: '', status: 'On Hold', priority: '' }),      // on hold, no priority
]);
eq(cl.map(t => t.id), ['k1', 'k3', 'k7', 'k2'], 'untagged before flagged, then priority');
eq([classifyReason(task({ func: '' })), classifyReason(task({ company: '' })), classifyReason(task({ funcReview: true, funcReviewNote: 'because' })), classifyReason(task({ funcReview: true }))],
  ['No function set', 'No company set', 'because', 'Filed on thin evidence and never confirmed'], 'why a task needs classifying');

const reg = [
  { company: 'Beta', func: 'Sales', active: true, sort_order: 2 },
  { company: 'Beta', func: 'Ops', active: true, sort_order: 1 },
  { company: 'Beta', func: 'Old', active: false, sort_order: 0 },
  { company: 'Alpha', func: 'Ops', active: true, sort_order: 1 },
];
eq(companiesOf(reg), ['Alpha', 'Beta'], 'companies: de-duplicated, sorted');
eq(activeFuncsOf(reg, 'Beta'), ['Ops', 'Sales'], 'active functions for a company, by sort_order');
eq(funcsFor({ company: 'Beta' }, reg), ['Ops', 'Sales'], 'classify offers that company\'s set');
eq(funcsFor({ company: '' }, reg), ['Ops', 'Sales'], 'without a company it offers the sorted union');
eq(funcsFor({ company: 'Nope' }, reg), [], 'an unknown company has none');

// ── task form: building the data ──────────────────────────────────────────────
const people = [{ code: 'A', display_name: 'Ann' }, { code: 'B', display_name: 'Bob' }];
const fronts = [{ code: 'F1', name: 'Front One' }];
const f = formFromTask({ task: 'Hello', status: 'On Hold', company: 'Beta', func: 'Ops', ownerCode: 'A', coOwnerCodes: ['B'], tags: ['x', 'y'], priority: 'P1', nextFollowUp: '2026-12-01', frontCode: 'F1' },
  { registry: reg, people: [], contacts: [] });
eq([f.task, f.status, f.company, f.func, f.tags, f.assignees, f.followup, f.priority], ['Hello', 'On Hold', 'Beta', 'Ops', 'x, y', ['A', 'B'], '2026-12-01', 'P1'], 'formFromTask reads the task');
eq(formFromTask({ company: 'Beta', func: 'Gone' }, { registry: reg, people: [], contacts: [] }).func, '', 'a function no longer active for the company reads as unset (as the old select did)');
eq(formFromTask({ assignedTo: 'Ann, Bob' }, { registry: reg, people, contacts: [] }).assignees, ['A', 'B'], 'legacy free-text assignee maps to codes');
eq(formFromTask({}, { registry: reg, people, contacts: [], defaultOwner: 'B' }).assignees, ['B'], 'default owner for assigned-scope users');
const contacts = [{ id: 7, name: 'Cy', org: 'Org' }];
eq(formFromTask({ contactIds: [7, 8], contactNames: ['Cy', 'Di'] }, { registry: reg, people, contacts }).contacts,
  [{ id: 7, name: 'Cy', org: 'Org' }, { id: 8, name: 'Di', org: '' }], 'contacts resolved from ids, falling back to the stored name');
eq(formFromTask({ contactName: 'Cy', contactOrg: 'X' }, { registry: reg, people, contacts }).contacts, [{ id: 7, name: 'Cy', org: 'X' }], 'single legacy contact is matched by name (org as stored on the task)');

const built = taskFromForm({
  id: 'e1', task: '  Name ', frontCode: 'F1', category: 'cat', status: 'Pending', company: 'Beta', func: 'Ops', followup: '', lastMtg: '', start: '', end: '',
  assignees: ['A', 'B'], priority: 'P2', action: ' act ', keys: '', recurrence: 'weekly', tags: ' a, ,b ,',
  contacts: [{ id: 7, name: 'Cy', org: 'Org' }, { id: 8, name: 'Di', org: '' }],
}, { fronts, people, now: NOW });
eq([built.task, built.project, built.frontCode, built.ownerCode, built.coOwnerCodes, built.assignedTo], ['Name', 'Front One', 'F1', 'A', ['B'], 'Ann, Bob'], 'taskFromForm: name trimmed, project from the front, owner = first assignee');
eq([built.contactName, built.contactOrg, built.contactId, built.contactNames, built.contactIds], ['Cy', 'Org', 7, ['Cy', 'Di'], [7, 8]], 'primary contact is the first');
eq([built.tags, built.actionItem, built.recurrenceRule, built.priority, built.id], [['a', 'b'], 'act', 'weekly', 'P2', 'e1'], 'tags split, action trimmed');
eq(built.nextFollowUp, '2026-11-07', 'no follow-up defaults to three days on');
eq([built.lastMtg, built.startDate, built.endDate], [null, null, null], 'empty optional dates are null');
eq(taskFromForm({ ...{ task: 'x', status: '', assignees: [], contacts: [], tags: '' } }, { fronts, people, now: NOW }).status, 'Pending', 'status defaults to Pending');

// ── task form: validation (old saveTask order) ────────────────────────────────
const ok = { id: null, task: 'x', company: 'Beta', func: 'Ops', ownerCode: 'A' };
eq(validateTask({ ...ok, task: '' }, { registryReady: true, access: null }), NAME_REQUIRED, 'name is required');
eq(NAME_REQUIRED, 'Task name is required', 'name message (old copy)');
eq(validateTask({ ...ok, func: '' }, { registryReady: true, access: null }), FUNC_REQUIRED, 'a new task needs a function');
eq(FUNC_REQUIRED, 'Company and Function are both required on a new task', 'function message (old copy)');
eq(validateTask({ ...ok, company: '' }, { registryReady: true, access: null }), FUNC_REQUIRED, 'and a company');
eq(validateTask({ ...ok, func: '' }, { registryReady: false, access: null }), null, 'not enforced while the registry is not loaded (old mxRegistryReady)');
eq(validateTask({ ...ok, id: 'e1', func: '' }, { registryReady: true, access: null }), null, 'not enforced when editing');
eq(validateTask(ok, { registryReady: true, access: { task_scope: 'assigned', person_code: 'B' } }), SELF_ONLY, 'assigned-scope users may only create tasks they own');
eq(SELF_ONLY, 'You can only create tasks assigned to yourself. Add yourself as an assignee and try again.', 'self-only message (old copy)');
eq(validateTask({ ...ok, ownerCode: 'B' }, { registryReady: true, access: { task_scope: 'assigned', person_code: 'B' } }), null, 'unless they own it');
eq(validateTask({ ...ok, id: 'e1', ownerCode: 'A' }, { registryReady: true, access: { task_scope: 'assigned', person_code: 'B' } }), null, 'editing is not restricted by this rule');

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
