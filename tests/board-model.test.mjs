/**
 * Board / Hierarchy model: the legacy filter pipeline (applyTF), the ordering, the closed-this-week
 * count, the Hierarchy grouping. Expected values are worked out BY HAND from rie-dashboard2/js/tasks.js
 * (comments below), never read back from the implementation.
 * Run with: node tests/board-model.test.mjs   (no network, no keys)
 *
 * "Today" is Tuesday 2026-11-10 (local noon). Its week is Mon 9 Nov .. Sun 15 Nov, its month November,
 * its quarter Oct..Dec. The three-day window is 10..13 Nov.
 *
 *   id  title    project  cat    assignedTo            pr  due         created           status       owner / tags
 *   t1  Alpha    Proj A   Ops    Olive Other           P1  2026-11-01  10 Nov (today)    Pending      OT1, legacy #12, contact "Zed Contact"
 *   t2  Bravo    Proj B   Sales  Me Myself, Olive O.   P2  2026-11-10  9 Nov (Mon)       In Progress  ME1 + co-owner OT1
 *   t3  Charlie  Proj A   Sales  (nobody)              --  2026-11-12  2 Nov             Pending      unowned
 *   t4  Delta    Proj B   Ops    Pat Third             P3  (none)      15 Oct            Completed    PT3, closedAt 9 Nov
 *   t5  Echo     (none)   (none) Me Myself             P1  2026-11-14  1 Jul             On Hold      ME1, stored tag "Priority"
 *   t6  Foxtrot  (none)   (none) Pat Third             P2  2026-11-13  (no createdAt)    Dropped      PT3, stored tag "Fox"
 */
import {
  filterTasks, filterOptions, sanitizeFilters, activeFilterCount, closedThisWeek, groupHierarchy, groupInfo,
  KB_SHOW,
} from '../src/features/work/board/model.js';
import { defaultBoardFilters, UNASSIGNED } from '../src/features/work/board/params.js';
import { allTags, computeTaskTags } from '../src/lib/tags.js';
import { store } from '../src/store/store.js';

let passed = 0, failed = 0;
const assert = (c, m) => c ? (console.log(`  ✓ ${m}`), passed++) : (console.error(`  ✗ ${m}`), failed++);
const eq = (a, b, m) => {
  const ok = JSON.stringify(a) === JSON.stringify(b);
  assert(ok, `${m}${ok ? '' : `\n      got      ${JSON.stringify(a)}\n      expected ${JSON.stringify(b)}`}`);
};

const NOW = new Date(2026, 10, 10, 12, 0, 0);
const ME = 'ME1', OT = 'OT1';
store.setState({ people: [
  { code: ME, display_name: 'Me Myself', is_internal: true },
  { code: OT, display_name: 'Olive Other', is_internal: true },
] });

const base = { tier: 'task', archivedAt: '', contactName: '', contactOrg: '', coOwnerCodes: [], tags: [], recurrenceRule: '', legacyTaskId: null };
const T = {
  t1: { ...base, id: 't1', task: 'Alpha', project: 'Proj A', category: 'Ops', assignedTo: 'Olive Other', priority: 'P1', nextFollowUp: '2026-11-01', createdAt: '2026-11-10T09:00:00', status: 'Pending', v3Status: 'pending', ownerCode: OT, legacyTaskId: 12, contactName: 'Zed Contact' },
  t2: { ...base, id: 't2', task: 'Bravo', project: 'Proj B', category: 'Sales', assignedTo: 'Me Myself, Olive Other', priority: 'P2', nextFollowUp: '2026-11-10', createdAt: '2026-11-09T08:00:00', status: 'In Progress', v3Status: 'in_progress', ownerCode: ME, coOwnerCodes: [OT] },
  t3: { ...base, id: 't3', task: 'Charlie', project: 'Proj A', category: 'Sales', assignedTo: '', priority: '', nextFollowUp: '2026-11-12', createdAt: '2026-11-02T10:00:00', status: 'Pending', v3Status: 'pending', ownerCode: '' },
  t4: { ...base, id: 't4', task: 'Delta', project: 'Proj B', category: 'Ops', assignedTo: 'Pat Third', priority: 'P3', nextFollowUp: '', createdAt: '2026-10-15T10:00:00', status: 'Completed', v3Status: 'completed', ownerCode: 'PT3', closedAt: '2026-11-09T10:00:00' },
  t5: { ...base, id: 't5', task: 'Echo', project: '', category: '', assignedTo: 'Me Myself', priority: 'P1', nextFollowUp: '2026-11-14', createdAt: '2026-07-01T10:00:00', status: 'On Hold', v3Status: 'on_hold', ownerCode: ME, tags: ['Priority'] },
  t6: { ...base, id: 't6', task: 'Foxtrot', project: '', category: '', assignedTo: 'Pat Third', priority: 'P2', nextFollowUp: '2026-11-13', createdAt: '', status: 'Dropped', v3Status: 'dropped', ownerCode: 'PT3', tags: ['Fox'] },
};
const ALL = Object.values(T);
const ids = (list) => list.map((t) => t.id).sort();
const run = (f, o = {}) => ids(filterTasks(ALL, { ...defaultBoardFilters(), ...f }, { scope: 'everyone', me: ME, now: NOW, ...o }));

console.log('\nthe eight-card fold\n');
assert(KB_SHOW === 8, 'eight cards per column before the fold (KB_SHOW)');

console.log('\nno filter: everything, ordered the way Today orders (queueRank)\n');
// queueRank = priority*1e6 + (99999 - daysLate); P1 < P2 < P3 < none.
//   t1 P1 9d late 99990 | t5 P1 due in 4d 100003 | t2 P2 0d 1099999 | t6 P2 due in 3d 1100002
//   t4 P3 no date 2999999 | t3 no priority due in 2d 3100001
eq(filterTasks(ALL, defaultBoardFilters(), { scope: 'everyone', me: ME, now: NOW }).map((t) => t.id), ['t1', 't5', 't2', 't6', 't4', 't3'],
  'P1 first (oldest due first), then P2, P3, then no priority');
eq(ALL.map((t) => t.id), ['t1', 't2', 't3', 't4', 't5', 't6'], 'the input array is not reordered');

console.log('\nscope first (inScope), then the filters\n');
eq(run({}, { scope: 'mine', me: ME }), ['t2', 't5'], 'Mine (ME1) = owner or co-owner: t2, t5');
eq(run({}, { scope: 'mine', me: OT }), ['t1', 't2'], 'Mine (OT1) = t1 owned, t2 co-owned');
eq(run({}, { scope: 'team', me: ME }), ['t1', 't3', 't4', 't6'], 'Team = everything not mine, unowned included');
eq(run({}, { scope: 'mine', me: null }), [], 'Mine with nobody resolved is empty, not a crash');
eq(run({ project: 'Proj A' }, { scope: 'mine', me: OT }), ['t1'], 'a filter narrows the scoped list');

console.log('\nproject / category: exact match\n');
eq(run({ project: 'Proj A' }), ['t1', 't3'], 'project');
eq(run({ project: 'proj a' }), [], 'project is case-sensitive (=== in the old code)');
eq(run({ category: 'Sales' }), ['t2', 't3'], 'category');
eq(run({ project: 'Proj A', category: 'Sales' }), ['t3'], 'both');

console.log('\nsearch: task, contact, org, assignee; case-insensitive; or a task number\n');
eq(run({ q: 'zed' }), ['t1'], 'contact name');
eq(run({ q: 'ECHO' }), ['t5'], 'title, any case');
eq(run({ q: 'olive' }), ['t1', 't2'], 'assignee text');
eq(run({ q: 'ph' }), ['t1'], 'substring (alPHa)');
eq(run({ q: '#12' }), ['t1'], '#12 finds legacy task 12');
eq(run({ q: '12' }), ['t1'], 'a bare number finds legacy task 12');
eq(run({ q: 'task 12' }), ['t1'], '"task 12" too');
eq(run({ q: 'task-12' }), ['t1'], 'and "task-12"');
eq(run({ q: '13' }), [], 'no such number, no text hit');
eq(run({ q: 'nomatch' }), [], 'nothing');

console.log('\nassigned-to: any part of "Owner, Co-owner"; unassigned sentinel\n');
eq(run({ assignees: ['Olive Other'] }), ['t1', 't2'], 'a person finds tasks they share (t2 is "Me Myself, Olive Other")');
eq(run({ assignees: ['Me Myself'] }), ['t2', 't5'], 'the first name of a shared task counts too');
eq(run({ assignees: [UNASSIGNED] }), ['t3'], 'unassigned = nobody on the task');
eq(run({ assignees: ['Pat Third', UNASSIGNED] }), ['t3', 't4', 't6'], 'multi-select is an OR');
eq(run({ assignees: ['Olive'] }), [], 'the whole name, not a fragment');

console.log('\npriority: multi; the empty member is "no priority"\n');
eq(run({ priorities: ['P1'] }), ['t1', 't5'], 'P1');
eq(run({ priorities: [''] }), ['t3'], 'no priority');
eq(run({ priorities: ['P2', 'P3'] }), ['t2', 't4', 't6'], 'P2 or P3');
eq(run({ priorities: ['P1', ''] }), ['t1', 't3', 't5'], 'P1 or none');

console.log('\ndue: overdue / today / 3 days (closed tasks are not special-cased)\n');
eq(run({ due: 'all' }), ['t1', 't2', 't3', 't4', 't5', 't6'], 'all');
eq(run({ due: 'overdue' }), ['t1'], 'overdue = before today (t4 has no date)');
eq(run({ due: 'today' }), ['t2'], 'today');
eq(run({ due: '3days' }), ['t2', 't3', 't6'], '3 days = today..today+3 inclusive (10, 12, 13 Nov; the 14th is out)');

console.log('\ncreated: presets, custom range\n');
eq(run({ created: 'today' }), ['t1'], 'today');
eq(run({ created: 'week' }), ['t1', 't2'], 'this week is Monday..Sunday (9..15 Nov)');
eq(run({ created: 'month' }), ['t1', 't2', 't3'], 'this month');
eq(run({ created: 'quarter' }), ['t1', 't2', 't3', 't4'], 'this quarter (Oct..Dec); July is out');
eq(run({ created: 'custom', createdFrom: '2026-10-10', createdTo: '2026-11-02' }), ['t3', 't4'], 'custom from..to, the end day included (t3 created 2 Nov 10:00)');
eq(run({ created: 'custom', createdFrom: '2026-10-10', createdTo: '2026-11-01' }), ['t4'], 'the day after the end is out');
eq(run({ created: 'custom', createdFrom: '2026-10-10' }), ['t1', 't2', 't3', 't4'], 'open-ended: from only');
eq(run({ created: 'custom', createdTo: '2026-10-31' }), ['t4', 't5'], 'open-ended: to only');
eq(run({ created: 'custom' }), ['t1', 't2', 't3', 't4', 't5'], 'custom with no bounds keeps everything that has a created date');
assert(!run({ created: 'month' }).includes('t6') && !run({ created: 'custom' }).includes('t6'), 'a task with no created date never matches a created filter');

console.log('\ntags: computed + stored, case-sensitive, any of\n');
eq(computeTaskTags(T.t1, NOW), ['P1', 'Overdue', 'Ops'], 'computed: priority, Overdue, category (Pending is not tagged, assigned)');
eq(computeTaskTags(T.t3, NOW), ['Unassigned', 'Sales'], 'computed: an open task with nobody on it is Unassigned');
eq(allTags(T.t5, NOW), ['P1', 'On Hold', 'Priority'], 'stored tags join computed ones (an On Hold task gets no date tag)');
eq(run({ tags: ['Overdue'] }), ['t1'], 'a computed tag filters');
eq(run({ tags: ['Unassigned'] }), ['t3'], 'Unassigned is computed for an open, nobody task');
eq(run({ tags: ['Priority'] }), ['t5'], 'a stored tag filters');
eq(run({ tags: ['Fox', 'Priority'] }), ['t5', 't6'], 'several tags = any of');
eq(run({ tags: ['priority'] }), [], 'the filter set is matched exactly: case counts');
eq(allTags({ ...T.t1, tags: ['overdue'] }, NOW), ['P1', 'overdue', 'Ops'], 'a stored tag overrides a computed one that differs only by case');
eq(run({ tags: ['Nope'] }), [], 'no match');

console.log('\nfilters combine (AND)\n');
eq(run({ project: 'Proj B', priorities: ['P2'] }), ['t2'], 'project and priority');
eq(run({ assignees: ['Olive Other'], due: 'overdue' }), ['t1'], 'assignee and overdue');

console.log('\noptions come from ALL tasks, not the scoped list; stale values are dropped\n');
const opts = filterOptions(ALL);
eq(opts.projects, ['Proj A', 'Proj B'], 'projects: unique, sorted, empty dropped');
eq(opts.categories, ['Ops', 'Sales'], 'categories');
eq(opts.assignees, ['Me Myself', 'Olive Other', 'Pat Third'], 'assignees: people + names on tasks, sorted');
eq(sanitizeFilters({ ...defaultBoardFilters(), project: 'Gone', category: 'Ops', assignees: ['Nobody', 'Olive Other', UNASSIGNED] }, opts),
  { ...defaultBoardFilters(), category: 'Ops', assignees: ['Olive Other', UNASSIGNED] }, 'a project / person no longer in the data is ignored; the Unassigned row is always valid');

console.log('\nthe Filters button counts what is active\n');
eq(activeFilterCount(defaultBoardFilters()), 0, 'none');
eq(activeFilterCount({ ...defaultBoardFilters(), q: '   ' }), 0, 'blank search does not count');
eq(activeFilterCount({ ...defaultBoardFilters(), q: 'x', project: 'P', category: 'C', assignees: ['a', 'b'], priorities: ['P1'], due: 'today', created: 'week', tags: ['t', 'u'] }), 8,
  'one per kind: search, project, category, assigned, priority, due, created, tags');

console.log('\nclosed this week (the rail)\n');
const monday = [
  { status: 'Completed', closedAt: '2026-11-09T10:00:00' },   // Monday: counts
  { status: 'Completed', closedAt: '2026-11-08T23:00:00' },   // Sunday before: no
  { status: 'Completed', closedAt: '', updatedAt: '2026-11-10T08:00:00' },   // pre-lifecycle row counts by updatedAt
  { status: 'Dropped', closedAt: '2026-11-10T08:00:00' },     // dropped never counts
  { status: 'Pending', closedAt: '2026-11-10T08:00:00' },
];
eq(closedThisWeek(monday, NOW), 2, 'Completed since Monday; closedAt, else updatedAt');

console.log('\nHierarchy grouping\n');
const workstreams = [{ id: 'w1', task: 'WS One' }, { id: 'w2', task: '' }];
const links = [{ parentId: 'w1', childId: 't1' }, { parentId: 'w1', childId: 't2' }, { parentId: 'gone', childId: 't3' }];
const g = groupHierarchy(ALL, { entityLinks: links, workstreams });
// w1 holds t1, t2 (next due 1 Nov). Tag groups by FIRST tag: Priority (t5), Fox (t6). t3 has a parent that
// is not a workstream and no tags, t4 has neither: both fall to Unfiled. Fox holds only a Dropped task.
eq(g.live.map((x) => x.key), ['ws:w1', 'unfiled', 'tag:Priority'], 'groups with open work, soonest next due first (1 Nov, 12 Nov, 14 Nov)');
eq(g.done.map((x) => x.key), ['tag:Fox'], 'a group with nothing open goes to the "nothing open" fold');
eq(g.live[0].title, 'WS One', 'a workstream group is titled by the workstream');
eq(g.live[1].title, 'Unfiled', '"Uncategorized" is "Unfiled"');
eq(ids(g.live[1].tasks), ['t3', 't4'], 'Unfiled holds the rest');
eq(groupHierarchy(ALL, { entityLinks: [{ parentId: 'w2', childId: 't1' }], workstreams }).live.find((x) => x.key === 'ws:w2').title, 'Untitled Workstream', 'an unnamed workstream');
eq(groupHierarchy([], { entityLinks: links, workstreams }), { live: [], done: [] }, 'nothing in, nothing out');

console.log('\ngroup header facts\n');
const info = (key, me) => groupInfo([...g.live, ...g.done].find((x) => x.key === key), { me, now: NOW });
eq(info('ws:w1', OT).live.map((t) => t.id), ['t1', 't2'], 'open tasks ranked (P1 late first)');
eq(info('ws:w1', OT).next, '2026-11-01', 'next due = earliest open due date');
eq(info('ws:w1', OT).fire, true, 'P1 + overdue + mine (OT1) -> the group carries "P1 overdue"');
eq(info('ws:w1', ME).fire, false, 'the same group is not on fire for someone else');
eq(info('ws:w1', null).fire, false, 'nor with nobody resolved');
eq(info('unfiled', ME).done.map((t) => t.id), ['t4'], 'closed tasks sit behind "+ N done"');
eq(info('unfiled', ME).pct, 50, 'progress = completed / all in the group (1 of 2)');
eq(info('tag:Priority', ME).wantsOpen, true, 'starts open: my open task due within 7 days (14 Nov)');
eq(info('tag:Priority', OT).wantsOpen, false, 'not open for someone whose work is not in it');
eq(info('tag:Priority', null).wantsOpen, true, 'with nobody resolved any open task due soon counts');
eq(info('unfiled', ME).wantsOpen, false, 'nothing of mine in Unfiled (t3 is unowned)');
eq(info('ws:w1', OT).next, '2026-11-01', 'header date is the date, not a day count');

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed) process.exit(1);
