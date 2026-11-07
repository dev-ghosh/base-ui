// Pure logic behind the Pipeline: ported from rie-dashboard2 js/leads.js. Expected values are worked out
// by hand from the old code (filteredLeads, sortForBoard, SORT_ACCESSORS, renderLeadTable, saveLead,
// convertTaskToLead, openAddTaskForLead), not read back from the implementation.
import {
  LEAD_STAGES, STAGE_NAMES, LEAD_TYPES, fmtAmt, daysInStage, filterLeads, sortForBoard, groupByStage,
  visibleStages, sortLeadsForTable, nextSort, DEFAULT_SORT, parseLeadParams, serializeLeadParams,
  mergeLeadParams, filterQuery, tpIconName, TOUCHPOINT_TYPES,
} from '../src/features/pipeline/model.js';
import { formFromLead, formFromTask, leadFromForm, validateLead, taskPrefillFromLead, TITLE_REQUIRED } from '../src/lib/lead-form.js';

let passed = 0, failed = 0;
const assert = (c, m) => { if (c) { passed++; console.log('  ok  ' + m); } else { failed++; console.log('  FAIL  ' + m); } };
const eq = (a, b, m) => assert(JSON.stringify(a) === JSON.stringify(b), `${m}${JSON.stringify(a) === JSON.stringify(b) ? '' : '  got ' + JSON.stringify(a) + ' want ' + JSON.stringify(b)}`);

// ── stages and types: the old constants, in the old order ──────────────────────
eq(STAGE_NAMES, ['Identified', 'Applied/Contacted', 'In Conversation', 'On Hold', 'Won', 'Lost'], 'stage columns, old order');
eq(LEAD_STAGES.filter((s) => s.closed).map((s) => s.stage), ['Won', 'Lost'], 'Won and Lost are the closed stages');
eq(LEAD_STAGES.map((s) => s.cls), ['kb-wo', 'kb-ip', 'kb-cv', 'kb-oh', 'kb-co', 'kb-dr'], 'column classes');
eq(visibleStages(false).map((s) => s.stage), ['Identified', 'Applied/Contacted', 'In Conversation', 'On Hold'], 'closed columns hidden by default');
eq(visibleStages(true).length, 6, 'all six columns behind Closed');
eq(LEAD_TYPES, ['Investor', 'Grant', 'Tender', 'Govt/Official Pitch', 'Sales/BD', 'Award/Program', 'Other'], 'lead types');
eq(TOUCHPOINT_TYPES.map((t) => t.type), ['note', 'call', 'meeting', 'email', 'pitch', 'submission', 'follow-up', 'stage'], 'touchpoint types');
eq(tpIconName('call'), 'phone', 'call icon');
eq(tpIconName('unknown'), 'note', 'unknown touchpoint falls back to the note icon');

// ── formats ───────────────────────────────────────────────────────────────────
eq(fmtAmt(null), '', 'no amount is empty');
eq(fmtAmt(''), '', 'empty amount is empty');
eq(fmtAmt(0), '₹0', 'zero is shown');
eq(fmtAmt(1234567), '₹12,34,567', 'Indian digit grouping');
const NOW = Date.UTC(2026, 10, 10, 12, 0, 0);
eq(daysInStage({ stageChangedAt: '2026-11-07T12:00:00Z' }, NOW), 3, 'three whole days in stage');
eq(daysInStage({ stageChangedAt: '2026-11-10T11:00:00Z' }, NOW), 0, 'under a day is 0');
eq(daysInStage({ stageChangedAt: '2026-11-12T12:00:00Z' }, NOW), 0, 'a date in the future is clamped to 0');
eq(daysInStage({ stageChangedAt: '' }, NOW), null, 'unknown stage change is null');
eq(daysInStage({ stageChangedAt: 'garbage' }, NOW), null, 'unparseable stage change is null');

// ── filters ───────────────────────────────────────────────────────────────────
const L = (o) => ({ id: 0, title: '', type: 'Other', stage: 'Identified', org: '', contactName: '', nextStep: '', notes: '', assignedTo: '', priority: '', nextFollowUp: '', amount: null, ...o });
const leads = [
  L({ id: 1, title: 'Seed round', type: 'Investor', org: 'Acme Capital', assignedTo: 'Ann Lee' }),
  L({ id: 2, title: 'Grant X', type: 'Grant', contactName: 'Bob', notes: 'Needs a SEED plan', assignedTo: 'Ann Lee, Cy Dee' }),
  L({ id: 3, title: 'Tender', type: 'Tender', nextStep: 'send seed docs', assignedTo: 'Cy Dee' }),
  L({ id: 4, title: 'Other thing', type: 'Investor' }),
];
eq(filterLeads(leads, {}).map((l) => l.id), [1, 2, 3, 4], 'no filter keeps everything');
eq(filterLeads(leads, { type: 'Investor' }).map((l) => l.id), [1, 4], 'type filter is exact');
eq(filterLeads(leads, { at: 'Cy Dee' }).map((l) => l.id), [2, 3], 'owner filter is a substring match, so a shared lead matches each person');
eq(filterLeads(leads, { q: 'SEED' }).map((l) => l.id), [1, 2, 3], 'search is case-insensitive over title, org, contact, next step and notes');
eq(filterLeads(leads, { q: 'seed', type: 'Investor', at: 'Ann' }).map((l) => l.id), [1], 'filters combine');
eq(filterLeads(leads, { q: 'nope' }), [], 'nothing matches');
eq(leads.length, 4, 'filtering does not touch its input');

// ── grouping and ordering ─────────────────────────────────────────────────────
const g = groupByStage([L({ id: 1, stage: 'Won' }), L({ id: 2, stage: 'Identified' }), L({ id: 3, stage: 'Weird' }), L({ id: 4, stage: 'Won' })]);
eq(Object.keys(g), STAGE_NAMES, 'every stage is a key, in column order');
eq(g.Won.map((l) => l.id), [1, 4], 'a lead is in the group of its stage');
eq(g.Identified.map((l) => l.id), [2], 'another stage');
eq(Object.values(g).flat().map((l) => l.id).sort(), [1, 2, 4], 'a lead with an unknown stage is in no column');

// Board order: P1 < P2 < P3 < none, then soonest follow-up, undated last, otherwise stable.
const col = [
  L({ id: 1, priority: '', nextFollowUp: '2026-01-01' }),
  L({ id: 2, priority: 'P2', nextFollowUp: '' }),
  L({ id: 3, priority: 'P1', nextFollowUp: '2026-03-01' }),
  L({ id: 4, priority: 'P1', nextFollowUp: '2026-02-01' }),
  L({ id: 5, priority: 'P2', nextFollowUp: '2026-05-01' }),
  L({ id: 6, priority: 'P3' }),
  L({ id: 7, priority: 'P1', nextFollowUp: '' }),
];
eq(sortForBoard(col).map((l) => l.id), [4, 3, 7, 5, 2, 6, 1], 'priority first, then soonest follow-up, undated last');
eq(col.map((l) => l.id), [1, 2, 3, 4, 5, 6, 7], 'sortForBoard returns a copy');

// ── table ─────────────────────────────────────────────────────────────────────
const rows = [
  L({ id: 1, title: 'beta', stage: 'Won', amount: 500, updatedAt: '2026-01-02', deadline: '2026-06-01', org: 'Zed' }),
  L({ id: 2, title: 'Alpha', stage: 'In Conversation', amount: null, updatedAt: '2026-03-01', nextFollowUp: '2026-04-01', contactName: 'amy' }),
  L({ id: 3, title: 'gamma', stage: 'Identified', amount: 100, updatedAt: '2026-02-01', org: 'Ace' }),
  L({ id: 4, title: 'delta', stage: 'Lost', amount: 900, updatedAt: '2026-04-01' }),
];
eq(DEFAULT_SORT, { col: 'updatedAt', dir: -1 }, 'default sort: last updated, newest first');
eq(sortLeadsForTable(rows, DEFAULT_SORT, false).map((l) => l.id), [2, 3], 'closed rows are hidden by default; newest first');
eq(sortLeadsForTable(rows, DEFAULT_SORT, true).map((l) => l.id), [4, 2, 3, 1], 'closed rows shown behind Closed');
eq(sortLeadsForTable(rows, { col: 'title', dir: 1 }, true).map((l) => l.id), [2, 1, 4, 3], 'title sorts case-insensitively');
eq(sortLeadsForTable(rows, { col: 'amount', dir: 1 }, true).map((l) => l.id), [2, 3, 1, 4], 'no amount sorts first (-1)');
eq(sortLeadsForTable(rows, { col: 'amount', dir: -1 }, true).map((l) => l.id), [4, 1, 3, 2], 'descending reverses it');
eq(sortLeadsForTable(rows, { col: 'stage', dir: 1 }, true).map((l) => l.id), [3, 2, 1, 4], 'stage sorts by column order, not alphabetically');
eq(sortLeadsForTable(rows, { col: 'org', dir: 1 }, true).map((l) => l.id), [4, 3, 2, 1], 'org: "" (lead 4) < "ace" < "amy" < "zed"');
eq(sortLeadsForTable(rows, { col: 'deadline', dir: 1 }, true).map((l) => l.id), [1, 2, 3, 4], 'no deadline sorts last (9999), then original order');
eq(sortLeadsForTable(rows, { col: 'nextFollowUp', dir: 1 }, true).map((l) => l.id), [2, 1, 3, 4], 'no follow-up sorts last');
eq(sortLeadsForTable(rows, { col: 'nope', dir: 1 }, true).map((l) => l.id), [1, 3, 2, 4], 'an unknown column sorts by last updated');
eq(nextSort({ col: 'title', dir: 1 }, 'title'), { col: 'title', dir: -1 }, 'the same column flips');
eq(nextSort({ col: 'title', dir: -1 }, 'title'), { col: 'title', dir: 1 }, 'and flips back');
eq(nextSort({ col: 'title', dir: -1 }, 'stage'), { col: 'stage', dir: 1 }, 'a new column starts ascending');

// ── search params ─────────────────────────────────────────────────────────────
const D = { q: '', type: '', at: '', showClosed: false, sort: DEFAULT_SORT };
eq(parseLeadParams(''), D, 'no params is the old empty state');
eq(parseLeadParams('?q=hi&type=Grant&at=Ann+Lee&closed=1&sort=title&dir=desc'),
  { q: 'hi', type: 'Grant', at: 'Ann Lee', showClosed: true, sort: { col: 'title', dir: -1 } }, 'every param parsed');
eq(parseLeadParams('type=Bogus&closed=yes&sort=nope&dir=desc'), D, 'unknown or stale values are ignored');
eq(parseLeadParams('sort=title').sort, { col: 'title', dir: 1 }, 'a sort with no dir is ascending');
eq(serializeLeadParams(D), '', 'defaults are never written');
eq(serializeLeadParams({ ...D, sort: { col: 'updatedAt', dir: 1 } }), 'sort=updatedAt&dir=asc', 'the default column in the other direction is written');
const rt = { q: 'a b', type: 'Sales/BD', at: 'Cy', showClosed: true, sort: { col: 'amount', dir: -1 } };
eq(parseLeadParams(serializeLeadParams(rt)), rt, 'parse(serialize(x)) round-trips');
eq(mergeLeadParams('scope=team&q=old&sort=title&dir=asc', { ...D, q: 'new' }), 'scope=team&q=new', "other params are kept, the Pipeline's are replaced");
eq(filterQuery({ ...rt }), 'q=a+b&type=Sales%2FBD&at=Cy&closed=1', 'the Kanban / Table link carries the filters but not the sort');

// ── lead form: lead -> fields -> data ─────────────────────────────────────────
eq(formFromLead({}).type, 'Other', 'a new lead defaults to type Other');
eq(formFromLead({}).stage, 'Identified', 'and stage Identified');
const f1 = formFromLead({ id: 5, title: 'T', type: 'Grant', stage: 'Won', org: 'O', contactName: 'C', amount: 0, deadline: '2026-01-01',
  nextFollowUp: '2026-02-02', assignedTo: 'A', priority: 'P2', nextStep: 'ns', notes: 'n', outcome: 'o', sourceTaskId: 'task-1' });
eq([f1.id, f1.followup, f1.amount, f1.sourceTaskId], [5, '2026-02-02', 0, 'task-1'], 'an existing lead fills the form (amount 0 is kept)');
const contacts = [{ id: 11, name: 'Bob Stone' }];
const d1 = leadFromForm({ ...formFromLead({}), title: '  New lead ', contactName: 'bob stone', amount: ' 250.5 ', deadline: '', followup: '2026-03-03', notes: ' hi ' }, { contacts });
eq([d1.title, d1.contactId, d1.contactName, d1.amount, d1.deadline, d1.nextFollowUp, d1.notes], ['New lead', 11, 'bob stone', 250.5, null, '2026-03-03', 'hi'],
  'the form is trimmed; the typed contact is matched by name, ignoring case; an empty date is null');
const d2 = leadFromForm({ ...formFromLead({}), title: 'x', contactName: 'Nobody', amount: '' }, { contacts });
eq([d2.contactId, d2.amount, d2.type, d2.stage, d2.sourceTaskId, d2.id], [null, null, 'Other', 'Identified', null, null], 'an unmatched contact has no id; no amount is null; defaults');
eq(validateLead({ title: '' }), TITLE_REQUIRED, 'a lead needs a title');
eq(validateLead({ title: 'a' }), null, 'a title is enough');

// ── convert from a task ───────────────────────────────────────────────────────
const t = { id: 'e9', task: 'Pitch deck', contactOrg: 'Org', contactName: 'Cy', nextFollowUp: '2026-05-05', actionItem: 'Draft', keyInputs: 'Numbers', assignedTo: 'Ann Lee, Bob Stone', priority: 'P1' };
const ft = formFromTask(t);
eq([ft.title, ft.org, ft.contactName, ft.followup, ft.notes, ft.assignedTo, ft.priority, ft.sourceTaskId, ft.id],
  ['Pitch deck', 'Org', 'Cy', '2026-05-05', 'Draft\nNumbers', 'Ann Lee', 'P1', 'e9', null], 'a task prefills the form: title, org, contact, follow-up, notes, first assignee, priority; source task set; no lead id');
eq(formFromTask({ id: 'e1', task: 'x', actionItem: '', keyInputs: 'K' }).notes, 'K', 'notes skip an empty action item');
eq(leadFromForm(ft, { contacts: [] }).sourceTaskId, 'e9', 'the data to save carries source_task_id');

// ── "+ Task" from a lead ──────────────────────────────────────────────────────
eq(taskPrefillFromLead({ id: 7, title: 'Big', nextStep: 'Call', nextFollowUp: '2026-06-06', contactId: 3, contactName: 'Cy' }),
  { title: 'Add Task — Big', task: 'Call', nextFollowUp: '2026-06-06', leadId: 7, contactIds: [3], contactNames: ['Cy'] }, 'the task form is prefilled from the lead');
eq(taskPrefillFromLead({ id: 7, title: 'Big', nextStep: '', nextFollowUp: '', contactId: null, contactName: '' }),
  { title: 'Add Task — Big', task: undefined, nextFollowUp: undefined, leadId: 7, contactIds: undefined, contactNames: undefined }, 'nothing is prefilled that the lead does not have');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
