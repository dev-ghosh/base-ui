// Pure logic behind Contacts: ported from rie-dashboard2 js/contacts.js (applyF, sort, the infinite-scroll
// window, findDuplicate, the bulk-select helpers), js/tags.js (computeContactTags) and js/saved-filters.js.
// Expected values are worked out by hand from the old code, not read back from the implementation.
import {
  PAGE_SIZE, PRIORITIES, SORT_COLUMNS, DEFAULT_SORT, defaultContactFilters, parseContactParams,
  serializeContactParams, mergeContactParams, filterContacts, sortContacts, paginate, filterOptions,
  nextSort, findDuplicate, dedupFields, mergePatchRow, toggleId, toggleAllIds, bulkDeleteMessage,
  linkedTasksOf,
} from '../src/features/contacts/model.js';
import { computeContactTags, allContactTags, contactTagClass, tagPool } from '../src/lib/tags.js';
import { formFromContact, contactFromForm, validateContact, NAME_REQUIRED, ABC_OPTIONS } from '../src/lib/contact-form.js';
import { contactToRow } from '../src/lib/mappers.js';
import { store } from '../src/store/store.js';

let passed = 0, failed = 0;
const assert = (c, m) => { if (c) { passed++; console.log('  ok  ' + m); } else { failed++; console.log('  FAIL  ' + m); } };
const eq = (a, b, m) => assert(JSON.stringify(a) === JSON.stringify(b), `${m}${JSON.stringify(a) === JSON.stringify(b) ? '' : '  got ' + JSON.stringify(a) + ' want ' + JSON.stringify(b)}`);

const NOW = new Date(2026, 10, 10, 12, 0);   // 10 Nov 2026, local
let n = 0;
const mk = (o = {}) => ({ id: ++n, name: 'C' + n, org: '', designation: '', category: '', priority: '', priorityFull: '', location: '', email: '', phone: '',
  linkedin: '', source: '', project: '', assignedTo: '', lastMtg: '', nextFollowUp: '', nextStep: '', keyInputs: '', remarks: '', actionItem: '',
  warmthMode: '', tags: [], ...o });

// ── constants ─────────────────────────────────────────────────────────────────
eq(PAGE_SIZE, 60, 'the render window is 60 rows (the old PAGE)');
eq(PRIORITIES, ['A', 'B', 'C'], 'ABC filter buttons');
eq(SORT_COLUMNS, ['priority', 'name', 'org', 'category', 'lastMtg', 'nextStep'], 'sortable columns');
eq(DEFAULT_SORT, { col: 'priority', dir: 1 }, 'default sort: priority ascending (the old sortCol/sortDir)');

// ── filters ───────────────────────────────────────────────────────────────────
const list = [
  mk({ id: 1, name: 'Asha', org: 'Acme', category: 'Investor', location: 'Pune', project: 'Alpha', priority: 'A', email: 'asha@x.test, a2@x.test' }),
  mk({ id: 2, name: 'Bo', org: 'Beta', category: 'Media', location: 'Delhi', project: 'Beta', priority: 'B', remarks: 'met at the GALA' }),
  mk({ id: 3, name: 'Cy', org: 'Acme', category: 'Investor', location: 'Pune', project: 'Alpha', priority: '', assignedTo: 'Ann Lee', tags: ['VIP'] }),
];
const f = (patch) => ({ ...defaultContactFilters(), ...patch });
const names = (l) => l.map((c) => c.name);
eq(names(filterContacts(list, f({}), { now: NOW })), ['Asha', 'Bo', 'Cy'], 'no filter keeps everyone');
eq(names(filterContacts(list, f({ priority: 'A' }), { now: NOW })), ['Asha'], 'ABC filter is an exact match');
eq(names(filterContacts(list, f({ project: 'Alpha' }), { now: NOW })), ['Asha', 'Cy'], 'project filter');
eq(names(filterContacts(list, f({ category: 'Media' }), { now: NOW })), ['Bo'], 'category filter');
eq(names(filterContacts(list, f({ location: 'Pune' }), { now: NOW })), ['Asha', 'Cy'], 'location filter');
eq(names(filterContacts(list, f({ q: 'gala' }), { now: NOW })), ['Bo'], 'search is case-insensitive and reads remarks');
eq(names(filterContacts(list, f({ q: 'a2@x' }), { now: NOW })), ['Asha'], 'search reads the whole email field');
eq(names(filterContacts(list, f({ q: 'ann lee' }), { now: NOW })), [], 'search does not read assignedTo (not in the old field list)');
eq(names(filterContacts(list, f({ at: 'Ann Lee' }), { now: NOW })), ['Cy'], 'assigned-to (deep link) is an exact match');
eq(names(filterContacts(list, f({ priority: 'A', category: 'Media' }), { now: NOW })), [], 'filters combine with AND');
// tag filter: OR over the contact's tags (computed + stored)
eq(names(filterContacts(list, f({ tags: ['VIP'] }), { now: NOW })), ['Cy'], 'tag filter matches a stored tag');
eq(names(filterContacts(list, f({ tags: ['Priority-B', 'VIP'] }), { now: NOW })), ['Bo', 'Cy'], 'tag filter is OR across tags');
eq(names(filterContacts(list, f({ tags: ['Has Tasks'] }), { now: NOW, tasks: [{ contactId: 2, status: 'Pending' }, { contactId: 1, status: 'Completed' }] })), ['Bo'],
  'a computed tag reads the tasks (Has Tasks needs an open one)');

// ── sort ──────────────────────────────────────────────────────────────────────
const srt = [mk({ name: 'b', priority: 'C' }), mk({ name: 'a', priority: '' }), mk({ name: 'c', priority: 'A' }), mk({ name: 'd', priority: 'B' })];
eq(names(sortContacts(srt, { col: 'priority', dir: 1 })), ['c', 'd', 'b', 'a'], 'priority: A, B, C, then unset last');
eq(names(sortContacts(srt, { col: 'priority', dir: -1 })), ['a', 'b', 'd', 'c'], 'priority descending reverses it');
eq(names(sortContacts(srt, { col: 'name', dir: 1 })), ['a', 'b', 'c', 'd'], 'name ascending (localeCompare)');
eq(names(sortContacts(srt, { col: 'name', dir: -1 })), ['d', 'c', 'b', 'a'], 'name descending');
const dates = [mk({ name: 'x', lastMtg: '2026-05-01' }), mk({ name: 'y', lastMtg: '' }), mk({ name: 'z', lastMtg: '2025-01-01' })];
eq(names(sortContacts(dates, { col: 'lastMtg', dir: 1 })), ['y', 'z', 'x'], 'an empty value sorts as the empty string, first when ascending');
const before = srt.map((c) => c.name).join();
sortContacts(srt, { col: 'name', dir: 1 });
eq(srt.map((c) => c.name).join(), before, 'sorting does not reorder the input');
eq(nextSort({ col: 'priority', dir: 1 }, 'name'), { col: 'name', dir: 1 }, 'a new column starts ascending');
eq(nextSort({ col: 'name', dir: 1 }, 'name'), { col: 'name', dir: -1 }, 'the same column flips');
eq(nextSort({ col: 'name', dir: -1 }, 'name'), { col: 'name', dir: 1 }, 'and flips back');

// ── the window (pagination) ───────────────────────────────────────────────────
const many = Array.from({ length: 130 }, (_, i) => mk({ name: 'P' + i }));
let p = paginate(many, 1, 60);
eq([p.rows.length, p.page, p.pageSize, p.total, p.hasMore, p.shown], [60, 1, 60, 130, true, 60], 'page 1 shows pageSize rows');
eq(p.rows[0].name, 'P0', 'the window starts at the first row');
p = paginate(many, 2, 60);
eq([p.rows.length, p.page, p.hasMore], [120, 2, true], 'page 2 shows two windows (Show more grows the window)');
p = paginate(many, 3, 60);
eq([p.rows.length, p.page, p.hasMore], [130, 3, false], 'page 3 shows the rest and no more');
p = paginate(many, 9, 60);
eq([p.rows.length, p.page], [130, 3], 'a page past the end is clamped');
p = paginate(many, 0, 60);
eq([p.rows.length, p.page], [60, 1], 'page 0 is page 1');
p = paginate([], 1, 60);
eq([p.rows.length, p.total, p.page, p.hasMore], [0, 0, 1, false], 'an empty list');
eq(paginate(many.slice(0, 7), 1, 60).rows.length, 7, 'fewer rows than a window shows all of them');

// ── filter options: unique sorted non-empty values ─────────────────────────────
eq(filterOptions(list), { projects: ['Alpha', 'Beta'], categories: ['Investor', 'Media'], locations: ['Delhi', 'Pune'] }, 'populateFilters');

// ── search params ─────────────────────────────────────────────────────────────
eq(parseContactParams(''), defaultContactFilters(), 'empty URL is the default filters');
eq(serializeContactParams(defaultContactFilters()), '', 'defaults are not written');
const full = f({ q: 'x y', project: 'Alpha', category: 'Media', location: 'Pune', priority: 'B', at: 'Ann Lee', tags: ['VIP', 'Stale'], sort: { col: 'name', dir: -1 }, page: 3 });
eq(parseContactParams(serializeContactParams(full)), full, 'filters round-trip through search params');
eq(serializeContactParams(f({ q: 'a', priority: 'A', category: 'c', sort: { col: 'org', dir: 1 }, page: 2 })), 'q=a&cat=c&prio=A&sort=org&page=2', 'param names and order');
eq(serializeContactParams(f({ sort: { col: 'priority', dir: -1 } })), 'sort=priority&dir=desc', 'a non-default direction on the default column is written');
eq(parseContactParams('prio=Z&sort=bogus&dir=desc&page=abc').priority, '', 'an unknown ABC value is ignored');
eq(parseContactParams('prio=Z&sort=bogus&dir=desc&page=abc').sort, DEFAULT_SORT, 'an unknown sort column is ignored (dir with it too)');
eq(parseContactParams('page=abc').page, 1, 'a non-numeric page is 1');
eq(parseContactParams('page=-4').page, 1, 'a negative page is 1');
eq(parseContactParams('tg=A&tg=A&tg=B').tags, ['A', 'B'], 'repeated tags are de-duplicated');
eq(parseContactParams('?q=hi').q, 'hi', 'a leading ? is fine');
eq(mergeContactParams('scope=team&q=old&page=4', f({ q: 'new' })), 'scope=team&q=new', 'foreign params are kept, the contacts ones replaced');

// ── duplicates (findDuplicate) ────────────────────────────────────────────────
const book = [
  mk({ id: 10, name: 'Dee Sharma', org: 'Orbit', email: 'Dee@x.test, dee2@x.test', phone: '98 76 54' }),
  mk({ id: 11, name: 'Sam Roy', org: 'Orbit', email: '', phone: '' }),
  mk({ id: 12, name: 'Sam Roy', org: 'Nova', email: '', phone: '' }),
  mk({ id: 13, name: 'Lee', org: 'Solo', email: '', phone: '' }),
];
let d = findDuplicate({ name: 'Other', email: ' DEE2@x.test ' }, book);
eq([d.match?.id, d.reason, d.ambiguous], [10, { kind: 'email', value: 'Dee@x.test, dee2@x.test' }, null], 'email match: any of the comma-separated addresses, case-insensitive');
d = findDuplicate({ name: 'Other', phone: '987654' }, book);
eq([d.match?.id, d.reason.kind, d.reason.value], [10, 'phone', '98 76 54'], 'phone match ignores spaces');
d = findDuplicate({ name: 'sam roy', org: 'nova' }, book);
eq([d.match?.id, d.reason, d.ambiguous], [12, { kind: 'name', name: 'Sam Roy', org: 'Nova' }, null], 'two same-name contacts: the org picks one');
d = findDuplicate({ name: 'Sam Roy', org: 'Elsewhere' }, book);
eq([d.match, d.ambiguous?.map((c) => c.id)], [null, [11, 12]], 'two same-name contacts and no org match is ambiguous');
d = findDuplicate({ name: 'Lee', org: '' }, book);
eq([d.match?.id, d.reason.kind], [13, 'name'], 'one same-name contact and no org given matches it');
d = findDuplicate({ name: 'Lee', org: 'Solo' }, book);
eq(d.match?.id, 13, 'one same-name contact with the same org matches it');
d = findDuplicate({ name: 'Lee', org: 'Other Co' }, book);
eq([d.match, d.ambiguous?.map((c) => c.id)], [null, [13]], 'one same-name contact with a different org is ambiguous (one candidate)');
d = findDuplicate({ name: 'Brand New', org: 'X', email: 'new@x.test', phone: '1' }, book);
eq([d.match, d.ambiguous], [null, null], 'no duplicate');
d = findDuplicate({ name: '', email: '', phone: '' }, book);
eq([d.match, d.ambiguous], [null, null], 'an empty record matches nothing');
d = findDuplicate({ name: 'Sam Roy', org: 'Orbit', email: 'dee@x.test' }, book);
eq(d.match?.id, 10, 'email is checked before the name');

// dedup table rows
eq(dedupFields({ name: 'A', org: 'O', designation: '', email: 'e', phone: '', priority: '', location: '', assignedTo: '', project: '', nextStep: '' },
  { name: 'A', org: 'O2', designation: '', email: '', phone: '', priority: 'B', location: '', assignedTo: '', project: '', nextStep: '' }),
[{ label: 'Name', existing: 'A', incoming: 'A', diff: false }, { label: 'Org', existing: 'O', incoming: 'O2', diff: true },
  { label: 'Email', existing: 'e', incoming: '', diff: false }, { label: 'Priority', existing: '', incoming: 'B', diff: true }],
'rows with a value on either side; a row differs only when the incoming value is non-empty and different');
// patching: the existing e / p / bday / li survive an empty incoming value
const row = mergePatchRow(contactToRow({ name: 'A', email: '', phone: '', birthday: '', linkedin: '' }, false),
  { email: 'old@x.test', phone: '555', birthday: '01/02/1990', linkedin: 'https://li/x' });
eq([row.e, row.p, row.bday, row.li], ['old@x.test', '555', '01/02/1990', 'https://li/x'], 'an empty incoming email/phone/birthday/linkedin keeps the existing one');
const row2 = mergePatchRow(contactToRow({ name: 'A', email: 'new@x.test' }, false), { email: 'old@x.test' });
eq(row2.e, 'new@x.test', 'a non-empty incoming value wins');
eq(mergePatchRow({ e: '' }, null).e, '', 'no existing contact: the row is unchanged');

// ── bulk selection helpers ────────────────────────────────────────────────────
eq([...toggleId(new Set([1]), 2)], [1, 2], 'toggle adds');
eq([...toggleId(new Set([1, 2]), 2)], [1], 'toggle removes');
eq([...toggleAllIds(new Set(), [3, 4])].sort(), [3, 4], 'select-all adds every visible id');
eq([...toggleAllIds(new Set([3, 4, 9]), [3, 4])], [9], 'all visible selected: select-all clears just those, a hidden selection stays');
eq([...toggleAllIds(new Set([3]), [3, 4])].sort(), [3, 4], 'some selected: select-all completes the set');
eq([...toggleAllIds(new Set([1]), [])], [1], 'no visible ids: nothing changes');
eq(bulkDeleteMessage(['Ann', 'Bo', 'Cy'], 3, 0), 'Delete 3 contacts (Ann, Bo, Cy)? Cannot be undone.', 'bulk delete message, three names');
eq(bulkDeleteMessage(['Ann', 'Bo', 'Cy', 'Di'], 4, 2), 'Delete 4 contacts (Ann, Bo, Cy…) and 2 linked tasks? Cannot be undone.', 'more than three names are cut with an ellipsis; linked tasks are counted');
eq(linkedTasksOf([{ id: 'a', contactId: 5 }, { id: 'b', contactId: 6 }, { id: 'c', contactId: 5 }], [5]).map((t) => t.id), ['a', 'c'], 'tasks linked to the selected contacts');

// ── contact tags (computeContactTags) ─────────────────────────────────────────
const tk = (o) => computeContactTags(mk(o), NOW, o.__tasks || []);
eq(tk({ priority: 'A', warmthMode: 'Hot', nextFollowUp: '2026-11-01', lastMtg: '2026-05-01', nextStep: ' go ', category: ' Investor ', location: 'Pune', source: 'Web' }),
  ['Priority-A', 'Hot', 'Overdue', 'Stale', 'Action Pending', 'Investor', 'Loc: Pune', 'Web'], 'every rule that applies, in the old order');
eq(tk({ nextFollowUp: '2026-11-10', lastMtg: '2026-11-01' }), ['Due Today'], 'a follow-up today');
eq(tk({ nextFollowUp: '2026-11-20', lastMtg: '2026-11-01' }), [], 'a future follow-up and a recent meeting add nothing');
eq(tk({}), ['No Follow-up', 'Never Met'], 'no dates at all');
eq(tk({ nextFollowUp: '2026-11-20', lastMtg: '2026-08-12' }), [], 'a meeting exactly 90 days ago is not stale');
eq(tk({ nextFollowUp: '2026-11-20', lastMtg: '2026-08-11' }), ['Stale'], 'a meeting 91 days ago is stale');
eq(computeContactTags(mk({ id: 5, nextFollowUp: '2026-11-20', lastMtg: '2026-11-01' }), NOW, [{ contactId: 5, status: 'In Progress' }]), ['Has Tasks'], 'an open task for the contact');
eq(computeContactTags(mk({ id: 5, nextFollowUp: '2026-11-20', lastMtg: '2026-11-01' }), NOW, [{ contactId: 5, status: 'Dropped' }]), [], 'a closed task does not count');
eq(allContactTags(mk({ nextFollowUp: '2026-11-20', lastMtg: '2026-11-01', category: 'Media', tags: ['media', 'VIP'] }), NOW), ['media', 'VIP'], 'a stored tag overrides a computed one that differs by case');
eq(contactTagClass(mk({ category: 'Media' }), 'media', NOW), 'tag-rule', 'a derived tag is tag-rule (case-insensitive)');
eq(contactTagClass(mk({ category: 'Media' }), 'VIP', NOW), 'tag-stored', 'a typed tag is tag-stored');
eq(tagPool([{ tags: ['b', 'a'] }], [{ tags: ['c', 'a'] }]), ['a', 'b', 'c'], 'the stored-tag pool, sorted, unique');

// ── the form <-> the data object ──────────────────────────────────────────────
const blank = formFromContact({});
eq(blank.name, '', 'a blank form has an empty name');
eq(ABC_OPTIONS, ['A - Beneficial at Real Time', 'B - Beneficial in Short-Mid Term', 'C - Beneficial in Long Term'], 'ABC options');
const filled = formFromContact({ name: 'Dee', tags: ['VIP', 'Pune'], priorityFull: 'B - Beneficial in Short-Mid Term', status: 'Active', birthday: '15/03/1990', lastMtg: '2026-01-02' });
eq([filled.tags, filled.abcFull, filled.curStatus, filled.bday, filled.lastMtg], ['VIP, Pune', 'B - Beneficial in Short-Mid Term', 'Active', '15/03/1990', '2026-01-02'], 'a contact into form fields');
const data = contactFromForm({ ...blank, name: '  Dee  ', abcFull: 'C - Beneficial in Long Term', tags: ' VIP, ,Pune ,', bday: ' 15/03/1990 ', lastMtg: '', nextFollowUp: '2026-02-03' });
eq([data.name, data.priority, data.priorityFull, data.tags, data.birthday, data.lastMtg, data.nextFollowUp], ['Dee', 'C', 'C - Beneficial in Long Term', ['VIP', 'Pune'], '15/03/1990', '', '2026-02-03'],
  'form fields into data: trimmed, ABC letter from the full text, tags split on commas');
eq(contactFromForm({ ...blank, name: 'x' }).priority, '', 'no ABC selected: empty priority');
eq(validateContact({ name: '' }), NAME_REQUIRED, 'the name is required');
eq(validateContact({ name: 'x' }), null, 'a name passes');
eq(NAME_REQUIRED, 'Name is required', 'the old message');
// the row (backend payload): dates empty -> null, birthday stays DD/MM/YYYY text
store.setState({ currentUser: 'Tester' });
const r = contactToRow(data, true);
eq([r.last_mtg, r.next_follow_up, r.intro_date, r.bday, r.abc, r.abc_full, r.tags, r.created_by, r.updated_by],
  [null, '2026-02-03', null, '15/03/1990', 'C', 'C - Beneficial in Long Term', ['VIP', 'Pune'], 'Tester', 'Tester'], 'contactToRow: empty dates null, birthday text kept');
eq(Object.keys(contactToRow({ name: 'x' }, false)).includes('created_by'), false, 'an update does not send created_by');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
