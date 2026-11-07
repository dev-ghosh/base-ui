/**
 * The Matrix model (src/features/work/matrix/model.js): grid, status split, KPI row, ink, palette,
 * filters, drill scope and pivot axes on the fixture in tests/helpers/matrix-fixture.js.
 *
 * Every expected number below was worked out by hand from the rules in the old
 * rie-dashboard2/js/matrix.js, not read back from the implementation. "Today" is 2026-11-10,
 * so "this week" is 2026-11-10 .. 2026-11-17 inclusive. Live = Pending, In Progress, On Hold.
 *
 * Run with: node tests/matrix-model.test.mjs   (no network, no keys)
 */
import {
  createModel, cellInk, statusColor, STATUS_COLORS, STATUSES, LIVE_PRESET, CLOSED_PRESET, PIVOT_AXES, DUE_BUCKETS,
  funcRows, companyList, dueBucket, sortTasks, KANBAN_PAGE_SIZE,
} from '../src/features/work/matrix/model.js';
import { defaultFilters } from '../src/features/work/matrix/params.js';
import { NOW, TODAY, ME, REGISTRY, TASKS } from './helpers/matrix-fixture.js';

let passed = 0, failed = 0;
const assert = (c, m) => c ? (console.log(`  ✓ ${m}`), passed++) : (console.error(`  ✗ ${m}`), failed++);
const eq = (a, b, m) => {
  const ok = JSON.stringify(a) === JSON.stringify(b);
  assert(ok, `${m}${ok ? '' : `\n      got      ${JSON.stringify(a)}\n      expected ${JSON.stringify(b)}`}`);
};

const model = (over = {}, filters = {}) => createModel({
  registry: REGISTRY, tasks: TASKS, scope: 'everyone', me: ME, now: NOW,
  filters: { ...defaultFilters(), ...filters }, ...over,
});
const ids = (list) => list.map((t) => t.id);

console.log('\nregistry drives the axes (nothing in code)\n');
{
  const m = model();
  eq(m.companies, ['Acme', 'Beta'], 'companies come from the registry, sorted');
  eq(m.funcs.map((f) => f.func), ['Ops', 'Sales', 'Legal'], 'functions in sort_order; a function inactive everywhere (Old) is no column');
  eq(m.funcs[1].definition, 'Win business', 'definitions come from the registry');
  const grown = createModel({ registry: [...REGISTRY, { company: 'Acme', func: 'Zeta', active: true, sort_order: 0, definition: 'New' }], tasks: TASKS, scope: 'everyone', me: ME, now: NOW, filters: defaultFilters() });
  eq(grown.funcs.map((f) => f.func), ['Zeta', 'Ops', 'Sales', 'Legal'], 'a new registry row is a new column with zero code change');
  eq(grown.cellData('Beta', 'Zeta'), { state: 'inactive' }, '...and greyed for a company that does not run it');
  const off = createModel({ registry: REGISTRY.map((r) => (r.company === 'Beta' && r.func === 'Ops' ? { ...r, active: false } : r)), tasks: TASKS, scope: 'everyone', me: ME, now: NOW, filters: defaultFilters() });
  eq(off.cellData('Beta', 'Ops'), { state: 'inactive' }, 'deactivating a function for a company greys its cell');
  eq(off.rows.filter(off.isUntagged).map((t) => t.id), ['B1', 'U1', 'U2'], '...and its task becomes untagged');
  eq(funcRows([]), [], 'an empty registry has no functions');
  eq(companyList([]), [], 'and no companies');
}

console.log('\ngrid: counts, status split, risk (everyone, Live)\n');
{
  const m = model();
  eq(ids(m.rows), ['A1', 'A2', 'A4', 'B1', 'B2', 'U1', 'U2'], 'Live rows: Completed (A3) and Dropped (D1) are out');
  const ao = m.cellData('Acme', 'Ops');
  eq([ao.state, ao.n, ao.od, ao.p1, ao.fire, ao.review], ['cell', 2, 1, 1, true, false], 'Acme/Ops: 2 tasks, 1 overdue, 1 P1, fire (P1 + overdue + mine)');
  eq(ao.composition, [{ status: 'Pending', n: 1 }, { status: 'In Progress', n: 1 }], 'Acme/Ops status split');
  const as = m.cellData('Acme', 'Sales');
  eq([as.n, as.od, as.p1, as.fire], [1, 1, 1, false], 'Acme/Sales: P1 and overdue but not mine = amber, not red');
  eq(as.composition, [{ status: 'On Hold', n: 1 }], 'Acme/Sales status split');
  eq(m.cellData('Acme', 'Legal'), { state: 'inactive' }, 'Acme/Legal is not applicable (inactive), not zero');
  eq(m.cellData('Beta', 'Sales'), { state: 'inactive' }, 'Beta/Sales is not applicable');
  const bo = m.cellData('Beta', 'Ops');
  eq([bo.n, bo.od, bo.p1, bo.fire], [1, 0, 0, false], 'Beta/Ops: undated is not overdue');
  const bl = m.cellData('Beta', 'Legal');
  eq([bl.n, bl.review], [1, true], 'Beta/Legal carries the review dot');
  eq(m.cellData('Acme', 'Ops').tasks.map((t) => t.id), ['A1', 'A2'], 'cell tasks are only the selected statuses');
  eq(m.grid.rowTotal('Ops').n, 3, 'row total Ops = 3');
  eq(m.grid.rowTotal('Sales').n, 1, 'row total Sales = 1');
  eq(m.grid.rowTotal('Legal').n, 1, 'row total Legal = 1');
  const acme = m.grid.colTotal('Acme');
  eq([acme.n, acme.od, acme.p1, acme.fire], [3, 2, 2, true], 'column total Acme: 3 tasks, 2 overdue, 2 P1');
  eq(m.grid.colTotal('Beta').n, 2, 'column total Beta = 2');
  const grand = m.grid.grand();
  eq([grand.n, grand.od, grand.p1], [5, 2, 2], 'grand total: 5 placed tasks (untagged ones are in no cell)');
  eq(m.emptyKind, null, 'the grid is not empty');
}

console.log('\nKPI row\n');
{
  const row = (m) => m.kpis().map((t) => `${t.k}:${t.n}`);
  eq(row(model()), ['scope:7', 'week:2', 'overdue:3', 'nodue:2', 'p1:2', 'unowned:1', 'review:1', 'untagged:2'], 'Everyone: all eight tiles');
  eq(row(model({ scope: 'mine' })), ['scope:3', 'week:1', 'overdue:1', 'nodue:1', 'review:1', 'untagged:1'], 'Mine: my week; P1 and Unowned are team facts and are absent');
  eq(row(model({ scope: 'team' })), ['scope:4', 'week:1', 'overdue:2', 'nodue:1', 'p1:1', 'unowned:1', 'untagged:1'], 'Team: P1 and Unowned appear; Needs review hidden at zero');
  const tiles = model().kpis();
  eq(tiles.filter((t) => t.drills).map((t) => t.k), ['review', 'untagged'], 'only Needs review and Untagged drill');
  eq(model({}, { statuses: ['Pending'] }).kpis().map((t) => t.n).slice(0, 4), [4, 1, 2, 1], 'KPIs follow the status selection (Pending only: A1 B1 B2 U1)');
}

console.log('\nstatus chips and presets\n');
{
  const m = model();
  eq(m.chipCounts, { 'Pending': 4, 'In Progress': 2, 'On Hold': 1, 'Completed': 1, 'Dropped': 1 }, 'chip counts ignore the status selection');
  eq(model().preset, 'live', 'default = live preset');
  eq(model({}, { statuses: [...STATUSES] }).preset, 'all', 'all five = all');
  eq(model({}, { statuses: [...CLOSED_PRESET] }).preset, 'closed', 'Completed + Dropped = closed');
  eq(model({}, { statuses: ['Pending'] }).preset, '', 'anything else = no preset lit');
  const closed = model({}, { statuses: [...CLOSED_PRESET] });
  eq([closed.cellData('Acme', 'Ops').n, closed.cellData('Acme', 'Ops').od, closed.cellData('Acme', 'Sales').n], [1, 0, 1], 'Closed grid: a Completed task is never overdue');
  eq(model({}, { statuses: [...STATUSES] }).rows.length, 9, 'All statuses: nine tasks');
}

console.log('\nfilters narrow the grid\n');
{
  const p1 = model({}, { priority: 'P1' });
  eq(ids(p1.rows), ['A1', 'A4'], 'priority P1 -> A1, A4');
  eq([p1.cellData('Acme', 'Ops').n, p1.cellData('Acme', 'Sales').n, p1.cellData('Beta', 'Ops').state], [1, 1, 'zero'], 'the grid follows');
  eq(p1.chipCounts, { 'Pending': 1, 'In Progress': 0, 'On Hold': 1, 'Completed': 0, 'Dropped': 0 }, 'chips respect secondary filters');
  eq(ids(model({}, { overdueOnly: true }).rows), ['A1', 'A4', 'U1'], 'overdue only (live statuses only are overdue)');
  eq(ids(model({}, { reviewOnly: true }).rows), ['B2'], 'needs review');
  eq(ids(model({}, { q: 'ALPHA' }).rows), ['A1', 'A2', 'A4'], 'search is case-insensitive over the title');
  eq(ids(model({}, { q: 'zed' }).rows), ['A2'], 'search reads the counterparty too');
  eq(ids(model({}, { owner: 'Pat Third' }).rows), ['A2'], 'owner matches any part of a shared assignee');
  eq(ids(model({ scope: 'mine' }, { owner: 'Pat Third' }).rows), ['A1', 'B2', 'U2'], 'under Mine the owner filter is ignored');
  eq(model({}, { q: 'nothing-matches-this' }).emptyKind, 'nomatch', 'no tasks match -> the "No tasks match" empty state');
  eq(model({}, { q: 'Unsorted' }).emptyKind, 'untagged', 'matches exist but none is placed -> the untagged explanation');
  eq(model({ scope: 'team' }).rows.map((t) => t.id), ['A2', 'A4', 'B1', 'U1'], 'Team = everyone else, including unowned work');
}

console.log('\nink and palette\n');
{
  eq(cellInk(), { ink: 'var(--tx)', risk: 'var(--txd)', crit: 'var(--hot)', warn: 'var(--warm)' }, 'ink is theme tokens (the heat fill and its flip thresholds are gone from the old file)');
  eq(statusColor('Pending', 'light'), '#2a78d6', 'light palette');
  eq(statusColor('Pending', 'dark'), '#3987e5', 'dark palette');
  eq(statusColor('Pending', 'spc'), '#3987e5', 'the other themes use the dark palette (as the old themeName())');
  eq(statusColor('Nonsense', 'dark'), 'var(--txd)', 'an unknown status falls back to a token');
  eq(Object.keys(STATUS_COLORS.light), STATUSES, 'every status has a colour in both palettes');
  eq(Object.keys(STATUS_COLORS.dark), STATUSES, '(dark)');
  eq(LIVE_PRESET, ['Pending', 'In Progress', 'On Hold'], 'Live preset');
  eq(CLOSED_PRESET, ['Completed', 'Dropped'], 'Closed preset');
  eq(PIVOT_AXES.map((a) => a.key), ['assignedTo', 'priority', 'dueBucket', 'func', 'company', 'contactOrg'], 'pivot axes');
  eq(KANBAN_PAGE_SIZE, 60, 'kanban page size');
}

console.log('\ndrill scope ignores the status chips\n');
{
  const m = model();
  eq(ids(m.drillTasks({ company: 'Acme', func: 'Ops', kind: 'cell' })), ['A1', 'A2', 'A3'], 'Acme/Ops drill holds every status, A3 (Completed) included');
  eq(ids(model({}, { statuses: ['Completed'] }).drillTasks({ company: 'Acme', func: 'Ops', kind: 'cell' })), ['A1', 'A2', 'A3'], 'even with the chips on Completed only');
  eq(ids(m.drillTasks({ company: 'Acme', func: '', kind: 'cell' })), ['A1', 'A2', 'A3', 'A4', 'D1'], 'a company row drill');
  eq(ids(m.drillTasks({ company: '', func: 'Sales', kind: 'cell' })), ['A4', 'D1'], 'a function column drill (U2 is untagged, so not here)');
  eq(ids(m.drillTasks({ company: '', func: '', kind: 'cell' })), ['A1', 'A2', 'A3', 'A4', 'B1', 'B2', 'D1'], 'the All drill: every tagged task');
  eq(ids(m.drillTasks({ company: '', func: '', kind: 'untagged' })), ['U1', 'U2'], 'untagged tile');
  eq(ids(m.drillTasks({ company: '', func: '', kind: 'review' })), ['B2'], 'review tile');
  eq(ids(model({ scope: 'mine' }).drillTasks({ company: 'Acme', func: 'Ops', kind: 'cell' })), ['A1', 'A3'], 'the drill honours the Work scope');
  eq(ids(model({}, { priority: 'P3' }).drillTasks({ company: 'Acme', func: 'Ops', kind: 'cell' })), ['A3'], 'and the secondary filters');
  const d = m.drillTasks({ company: 'Acme', func: 'Ops', kind: 'cell' });
  eq([d.length, d.filter(m.isOverdue).length, d.filter((t) => t.priority === 'P1').length], [3, 1, 1], 'header numbers: 3 tasks, 1 overdue, 1 P1');
  eq(m.scopeTitle({ company: 'Acme', func: 'Ops', kind: 'cell' }), 'Acme · Ops', 'title: cell');
  eq(m.scopeTitle({ company: 'Acme', func: '', kind: 'cell' }), 'Acme · All functions', 'title: company');
  eq(m.scopeTitle({ company: '', func: 'Ops', kind: 'cell' }), 'All companies · Ops', 'title: function');
  eq(m.scopeTitle({ company: '', func: '', kind: 'untagged' }), 'Untagged tasks', 'title: untagged');
  eq(m.scopeTitle({ company: '', func: '', kind: 'review' }), 'Needs review', 'title: review');
  eq(m.validDrill({ company: 'Gone', func: '', kind: 'cell' }), null, 'a company the registry no longer has: ignored');
  eq(m.validDrill({ company: 'Acme', func: 'Old', kind: 'cell' }), null, 'a retired function: ignored');
  eq(m.validDrill({ company: 'Beta', func: 'Legal', kind: 'cell' }) !== null, true, 'a live pair is kept');
  eq(m.validDrill(null), null, 'no drill, no drill');
}

console.log('\npivot axes, due buckets, list order\n');
{
  const m = model();
  const acmeOps = m.drillTasks({ company: 'Acme', func: 'Ops', kind: 'cell' });
  eq(m.pivotEntries(acmeOps, 'assignedTo').map((e) => [e.label, ids(e.items)]),
    [['Me Myself', ['A1', 'A3']], ['Olive Other', ['A2']], ['Pat Third', ['A2']]],
    'Owner: a shared task sits under each of its people, biggest group first');
  eq(m.pivotEntries(acmeOps, 'priority').map((e) => e.label), ['P1', 'P2', 'P3'], 'Priority');
  eq(m.pivotEntries(acmeOps, 'dueBucket').map((e) => e.label), ['Overdue 30d+', 'Overdue 8-30d', 'Due this week'], 'Due bucket is in bucket order, not size order');
  eq(m.pivotEntries(acmeOps, 'contactOrg').map((e) => [e.label, e.items.length]), [['— none —', 2], ['Zed Corp', 1]], 'Counterparty: blank = "— none —"');
  eq(m.pivotEntries(m.drillTasks({ company: '', func: '', kind: 'cell' }), 'company').map((e) => [e.label, e.items.length]), [['Acme', 5], ['Beta', 2]], 'Company');
  eq(m.pivotEntries([TASKS.find((t) => t.id === 'B1')], 'assignedTo').map((e) => e.label), ['— none —'], 'an unowned task pivots under "— none —"');

  const due = (d) => dueBucket({ nextFollowUp: d }, TODAY);
  eq([due('2026-10-01'), due('2026-11-01'), due('2026-11-05'), due('2026-11-10'), due('2026-11-12'), due('2026-11-17'), due('2026-11-18'), due('')],
    ['Overdue 30d+', 'Overdue 8-30d', 'Overdue 1-7d', 'Due today', 'Due this week', 'Due this week', 'Later', 'No date'], 'due buckets at the boundaries');
  eq(DUE_BUCKETS.length, 7, 'seven buckets');

  const some = ['A1', 'B1', 'A4'].map((id) => TASKS.find((t) => t.id === id));
  eq(ids(sortTasks(some, 'nextFollowUp', 1)), ['A1', 'A4', 'B1'], 'list sorted by due ascending, no date last');
  eq(ids(sortTasks(some, 'nextFollowUp', -1)), ['A4', 'A1', 'B1'], 'descending: no date still last');
  eq(ids(sortTasks(some, 'task', 1)), ['A4', 'A1', 'B1'], 'list sorted by title ("Alpha four" before "Alpha one")');
}

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
