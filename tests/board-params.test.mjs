/**
 * Board / Hierarchy URL contract: the legacy filter row (tf-proj, tf-task, tf-cat, assigned-to, priority,
 * created, due, tags) as search params on /work/board and /work/hierarchy.
 * Run with: node tests/board-params.test.mjs   (no network, no keys)
 */
import {
  parseBoardParams, serializeBoardParams, mergeBoardParams, defaultBoardFilters, BOARD_KEYS, UNASSIGNED,
} from '../src/features/work/board/params.js';

let passed = 0, failed = 0;
const assert = (c, m) => c ? (console.log(`  ✓ ${m}`), passed++) : (console.error(`  ✗ ${m}`), failed++);
const eq = (a, b, m) => {
  const ok = JSON.stringify(a) === JSON.stringify(b);
  assert(ok, `${m}${ok ? '' : `\n      got      ${JSON.stringify(a)}\n      expected ${JSON.stringify(b)}`}`);
};

console.log('\ndefaults\n');
eq(parseBoardParams(''), defaultBoardFilters(), 'nothing in the URL = the defaults');
eq(defaultBoardFilters(), {
  project: '', q: '', category: '', assignees: [], priorities: [], due: 'all',
  created: 'all', createdFrom: '', createdTo: '', tags: [],
}, 'the default filters are the old empty state (taskDateFilter all, taskCreatedFilter all, empty sets)');
eq(serializeBoardParams(defaultBoardFilters()), '', 'defaults serialise to nothing');
eq(parseBoardParams(undefined), defaultBoardFilters(), 'undefined is the defaults');
eq(parseBoardParams('?q=x').q, 'x', 'a leading ? is accepted');
eq(parseBoardParams(new URLSearchParams('q=x')).q, 'x', 'a URLSearchParams is accepted');

console.log('\nround trip\n');
const rich = {
  ...defaultBoardFilters(),
  project: 'Alpha & Co', q: 'launch #2', category: 'Ops',
  assignees: ['Olive Other', UNASSIGNED, 'Me, Myself'], priorities: ['P1', ''], due: '3days',
  created: 'week', tags: ['Overdue', "it's | odd"],
};
eq(parseBoardParams(serializeBoardParams(rich)), rich, 'every field survives, including awkward characters and the empty priority');
const custom = { ...defaultBoardFilters(), created: 'custom', createdFrom: '2026-10-01', createdTo: '2026-10-31' };
eq(parseBoardParams(serializeBoardParams(custom)), custom, 'a custom created range survives');
eq(serializeBoardParams(custom), 'cr=custom&crf=2026-10-01&crt=2026-10-31', 'and is written as cr=custom&crf=..&crt=..');
const openEnded = { ...defaultBoardFilters(), created: 'custom', createdFrom: '2026-10-01' };
eq(parseBoardParams(serializeBoardParams(openEnded)), openEnded, 'a custom range with only a start survives');
const bareCustom = { ...defaultBoardFilters(), created: 'custom' };
eq(parseBoardParams(serializeBoardParams(bareCustom)), bareCustom, 'custom chosen but not applied yet survives (old state: custom with no bounds)');
for (const created of ['today', 'week', 'month', 'quarter']) {
  const f = { ...defaultBoardFilters(), created };
  eq(parseBoardParams(serializeBoardParams(f)), f, `created=${created} survives`);
}
for (const due of ['overdue', 'today', '3days']) {
  const f = { ...defaultBoardFilters(), due };
  eq(parseBoardParams(serializeBoardParams(f)), f, `due=${due} survives`);
}

console.log('\nwhat is written\n');
eq(serializeBoardParams({ ...defaultBoardFilters(), project: 'P', category: 'C' }), 'pj=P&cat=C', 'project is pj, category is cat');
eq(serializeBoardParams({ ...defaultBoardFilters(), q: 'abc' }), 'q=abc', 'search text is q');
eq(serializeBoardParams({ ...defaultBoardFilters(), assignees: ['A', 'B'] }), 'at=A&at=B', 'assignees repeat at');
eq(serializeBoardParams({ ...defaultBoardFilters(), priorities: ['P2', ''] }), 'pr=P2&pr=none', 'priorities repeat pr; "no priority" is none');
eq(serializeBoardParams({ ...defaultBoardFilters(), due: 'overdue' }), 'due=overdue', 'due is written when not all');
eq(serializeBoardParams({ ...defaultBoardFilters(), tags: ['x', 'y'] }), 'tg=x&tg=y', 'tags repeat tg');
assert(!serializeBoardParams({ ...defaultBoardFilters(), created: 'week', createdFrom: '2026-10-01', createdTo: '2026-10-02' }).includes('crf'),
  'a custom range is dropped when the preset is not custom');

console.log('\nunknown and stale values are ignored, never an error\n');
eq(parseBoardParams('due=nextweek').due, 'all', 'unknown due -> all');
eq(parseBoardParams('due=all').due, 'all', 'due=all is the default');
eq(parseBoardParams('cr=fortnight').created, 'all', 'unknown created -> all');
eq(parseBoardParams('cr=week&crf=2026-10-01').createdFrom, '', 'a range given without cr=custom is ignored');
eq(parseBoardParams('cr=custom&crf=yesterday&crt=2026-13-99x').createdFrom, '', 'a malformed from date is ignored');
eq(parseBoardParams('cr=custom&crf=yesterday&crt=2026-13-99x').createdTo, '', 'a malformed to date is ignored');
eq(parseBoardParams('pr=P9&pr=P1&pr=P1').priorities, ['P1'], 'unknown priorities are dropped and duplicates collapse');
eq(parseBoardParams('at=&at=A&at=A').assignees, ['A'], 'empty and repeated assignees are dropped');
eq(parseBoardParams('tg=&tg=T&tg=T').tags, ['T'], 'empty and repeated tags are dropped');
eq(parseBoardParams('zzz=1&scope=mine&utm=2'), defaultBoardFilters(), 'unknown keys do nothing');
eq(parseBoardParams('%E0%A4%A'), defaultBoardFilters(), 'a malformed escape is not an error');

console.log('\nmerging keeps the keys it does not own\n');
eq(mergeBoardParams('scope=team&q=old&pj=Old', { ...defaultBoardFilters(), q: 'new' }), 'scope=team&q=new', 'scope survives, board keys are replaced wholesale');
eq(mergeBoardParams('scope=team&q=old', defaultBoardFilters()), 'scope=team', 'clearing the filters leaves only scope');
eq(mergeBoardParams('', defaultBoardFilters()), '', 'nothing to say = empty');
assert(BOARD_KEYS.includes('pj') && !BOARD_KEYS.includes('scope'), 'scope is not a board key');

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed) process.exit(1);
