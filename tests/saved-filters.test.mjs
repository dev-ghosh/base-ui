// Saved filter presets, Smart Search and the Excel export's workbook layout. Ported from
// rie-dashboard2 js/saved-filters.js and js/export.js; expected values worked out by hand from that code.
import {
  SAVED_FILTERS_KEY, getSavedFilters, saveCurrentFilter, applySavedFilter, deleteSavedFilter, globalSmartSearch, emptyFilterConfig,
} from '../src/lib/saved-filters.js';
import { buildExportSheets, exportFileName, SHEETJS_URL } from '../src/lib/export-excel.js';

let passed = 0, failed = 0;
const assert = (c, m) => { if (c) { passed++; console.log('  ok  ' + m); } else { failed++; console.log('  FAIL  ' + m); } };
const eq = (a, b, m) => assert(JSON.stringify(a) === JSON.stringify(b), `${m}${JSON.stringify(a) === JSON.stringify(b) ? '' : '  got ' + JSON.stringify(a) + ' want ' + JSON.stringify(b)}`);

// localStorage stand-in
const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => { mem.set(k, String(v)); },
  removeItem: (k) => { mem.delete(k); },
};

// ── presets ───────────────────────────────────────────────────────────────────
eq(SAVED_FILTERS_KEY, 'rie_saved_filters', 'same storage key as the old app');
eq(getSavedFilters(), [], 'no presets yet');
eq(saveCurrentFilter('   '), false, 'a blank name is not saved');
eq(saveCurrentFilter(''), false, 'an empty name is not saved');
const t0 = new Date('2026-11-10T10:00:00.000Z');
eq(saveCurrentFilter('  My view ', 'tasks', undefined, t0), true, 'a name is saved');
let all = getSavedFilters();
eq(all.length, 1, 'one preset');
eq([all[0].id, all[0].name, all[0].surface, all[0].createdAt], ['flt_' + t0.getTime(), 'My view', 'tasks', t0.toISOString()], 'id, trimmed name, surface, timestamp');
eq(all[0].config, emptyFilterConfig(), 'like the old code, the config is empty (its state keys never existed)');
eq(emptyFilterConfig(), { taskStatus: '', taskAssignee: '', taskCompany: '', matrixFilters: null, contactFilter: null }, 'the empty config shape');
saveCurrentFilter('Second', 'contacts', { contactFilter: { priority: 'A' } }, new Date(t0.getTime() + 5));
eq(getSavedFilters().map((f) => f.name), ['My view', 'Second'], 'presets append');
// apply: the handlers the old code found on window
const calls = [];
const h = { mxSet: (k, v) => calls.push(['mx', k, v]), setTDF: (k, v) => calls.push(['tdf', k, v]), applyF: (v) => calls.push(['applyF', v]) };
applySavedFilter(all[0].id, h);
eq(calls, [], 'applying an (empty) preset does nothing, as before');
mem.set(SAVED_FILTERS_KEY, JSON.stringify([{ id: 'x', name: 'full', config: { taskStatus: 'Pending', taskCompany: 'Acme', matrixFilters: { s: 'a', o: 'b' }, contactFilter: { priority: 'A' } } }]));
applySavedFilter('x', h);
eq(calls, [['mx', 's', 'a'], ['mx', 'o', 'b'], ['tdf', 'status', 'Pending'], ['tdf', 'company', 'Acme'], ['applyF', { priority: 'A' }]], 'a full preset is applied in the old order');
calls.length = 0;
applySavedFilter('nope', h);
applySavedFilter('x', {});
eq(calls, [], 'an unknown id, or missing handlers, is quietly ignored');
deleteSavedFilter('x');
eq(getSavedFilters(), [], 'delete removes the preset');
mem.set(SAVED_FILTERS_KEY, '{not json');
eq(getSavedFilters(), [], 'corrupt storage reads as no presets');

// ── Smart Search ──────────────────────────────────────────────────────────────
const data = {
  tasks: [{ id: 't1', task: 'Draft term sheet', company: 'Acme', assignedTo: 'Ann', func: 'Legal' }, { id: 't2', task: 'Other', company: 'Beta', assignedTo: '', func: '' }],
  contacts: [{ id: 1, name: 'Acme Anna', org: '', email: '' }, { id: 2, name: 'Bo', org: 'Acme Corp', email: '' }, { id: 3, name: 'Cy', org: '', email: 'cy@acme.test' }, { id: 4, name: 'Di', org: 'Zed', email: '' }],
  leads: [{ name: 'Acme round', targetOrg: '' }, { name: '', targetOrg: 'acme' }, { name: 'None', targetOrg: 'x' }],
};
const r = globalSmartSearch('ACME', data);
eq(r.tasks.map((t) => t.id), ['t1'], 'tasks match company (case-insensitive)');
eq(r.contacts.map((c) => c.id), [1, 2, 3], 'contacts match name, org or email');
eq(r.leads.length, 2, 'leads match name or target org (computed, though the old dialog never listed them)');
eq(globalSmartSearch('a', data), { tasks: [], contacts: [], leads: [] }, 'one character searches nothing');
eq(globalSmartSearch('  ', data), { tasks: [], contacts: [], leads: [] }, 'blank searches nothing');
eq(globalSmartSearch(null, data).tasks, [], 'no query searches nothing');
eq(globalSmartSearch('x', {}).tasks, [], 'no data is fine');
const big = { contacts: Array.from({ length: 25 }, (_, i) => ({ id: i, name: 'Same ' + i })) };
eq(globalSmartSearch('same', big).contacts.length, 10, 'at most ten per kind');
eq(globalSmartSearch('t1 ', { tasks: [{ task: 't1' }] }).tasks.length, 1, 'the query is trimmed');

// ── the workbook ──────────────────────────────────────────────────────────────
eq(SHEETJS_URL, 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.mini.min.js', 'the same CDN build the old index.html used');
eq(exportFileName(new Date('2026-11-10T23:59:00Z')), 'BASE_Export_2026-11-10.xlsx', 'file name carries the UTC date');
let sheets = buildExportSheets({});
eq(sheets.map((s) => s.name), ['Contacts', 'Tasks'], 'Contacts and Tasks are always there');
sheets = buildExportSheets({ leads: [{ id: 1 }], events: [{ id: 5, title: 'Gala' }], guests: [{ id: 9, eventId: 5, name: 'G' }, { id: 10, eventId: 77, name: 'H' }] });
eq(sheets.map((s) => s.name), ['Contacts', 'Tasks', 'Leads', 'Events', 'Event Guests'], 'Leads, Events and Event Guests appear only when they have rows, in this order');
eq(sheets[4].rows.map((row) => row[2]), ['Gala', ''], 'a guest row carries its event title, blank when the event is unknown');
sheets = buildExportSheets({ contacts: [{ id: 3, name: 'Dee', priority: 'A', birthday: '15/03/1990' }], tasks: [{ id: 'u', task: 'T', contactId: null }], leads: [{ id: 1, amount: 0, priority: '' }] });
const [cs, ts, ls] = sheets;
eq([cs.headers.length, cs.rows[0].length], [34, 34], 'contact columns line up with their headers');
eq([ts.headers.length, ts.rows[0].length], [19, 19], 'task columns line up');
eq([ls.headers.length, ls.rows[0].length], [21, 21], 'lead columns line up');
eq([cs.rows[0][0], cs.rows[0][1], cs.rows[0][5], cs.rows[0][28]], [3, 'Dee', 'A', '15/03/1990'], 'contact cells: id, name, ABC, birthday');
eq([ts.rows[0][9], ls.rows[0][7]], ['', 0], 'a missing task contact id is blank; a zero lead amount is kept');
eq(cs.headers.slice(0, 3), ['ID', 'Name', 'Organisation'], 'headers');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
