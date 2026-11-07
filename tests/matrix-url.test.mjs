/**
 * Matrix URL contract: the old `#mx?` hash as search params (spec 7.13).
 * Run with: node tests/matrix-url.test.mjs   (no network, no keys)
 */
import { parseMatrixParams, serializeMatrixParams, mergeMatrixParams, defaultFilters } from '../src/features/work/matrix/params.js';

let passed = 0, failed = 0;
const assert = (c, m) => c ? (console.log(`  ✓ ${m}`), passed++) : (console.error(`  ✗ ${m}`), failed++);
const eq = (a, b, m) => {
  const ok = JSON.stringify(a) === JSON.stringify(b);
  assert(ok, `${m}${ok ? '' : `\n      got      ${JSON.stringify(a)}\n      expected ${JSON.stringify(b)}`}`);
};

console.log('\ndefaults\n');
eq(parseMatrixParams(''), defaultFilters(), 'nothing in the URL = the defaults');
eq(defaultFilters().statuses, ['Pending', 'In Progress', 'On Hold'], 'default statuses are the Live preset');
eq(serializeMatrixParams(defaultFilters()), '', 'defaults serialise to nothing');

console.log('\nround trip\n');
const withBasics = {
  ...defaultFilters(),
  statuses: ['Completed', 'Dropped', 'Pending'],
  owner: 'Olive Other', priority: 'P1', q: 'launch & go',
  overdueOnly: true, reviewOnly: true,
};
eq(parseMatrixParams(serializeMatrixParams(withBasics)), withBasics, 'status, owner, priority, search and both toggles survive');
const withCompany = { ...defaultFilters(), drill: { company: 'Acme Co', func: 'Ops', kind: 'cell' }, tab: 'list' };
eq(parseMatrixParams(serializeMatrixParams(withCompany)), withCompany, 'company, function and tab survive');
const pivot = { ...defaultFilters(), drill: { company: 'Acme Co', func: '', kind: 'cell' }, tab: 'pivot', pivot: 'dueBucket' };
eq(parseMatrixParams(serializeMatrixParams(pivot)), pivot, 'pivot axis survives');
const kpi = { ...defaultFilters(), drill: { company: '', func: '', kind: 'untagged' }, tab: 'board' };
eq(parseMatrixParams(serializeMatrixParams(kpi)), kpi, 'an untagged KPI drill survives');
const review = { ...defaultFilters(), statuses: ['Pending'], drill: { company: '', func: '', kind: 'review' } };
eq(parseMatrixParams(serializeMatrixParams(review)), review, 'a review KPI drill survives');
assert(serializeMatrixParams(withCompany) === 'c=Acme+Co&f=Ops&t=list', 'old key names and order: c, f, (k only when not cell), t');
assert(serializeMatrixParams(pivot).endsWith('t=pivot&pv=dueBucket'), 'pv is written only with the pivot tab');
assert(!serializeMatrixParams({ ...pivot, tab: 'list' }).includes('pv='), 'and not with the other tabs');
assert(serializeMatrixParams({ ...defaultFilters(), statuses: ['On Hold', 'Pending', 'In Progress'] }) === '', 'the Live preset in another order is still the default');

console.log('\nstale and unknown values are ignored, never an error\n');
eq(parseMatrixParams('?s=Bogus|Nonsense').statuses, ['Pending', 'In Progress', 'On Hold'], 'a status list of only unknown names keeps the default');
eq(parseMatrixParams('?s=Bogus|Completed').statuses, ['Completed'], 'unknown names are dropped from a mixed list');
eq(parseMatrixParams('?od=yes&rv=0').overdueOnly, false, 'od is only on for 1');
eq(parseMatrixParams('?t=kanban&pv=nope&c=Acme').drill, { company: 'Acme', func: '', kind: 'cell' }, 'unknown tab / axis do not break the drill');
eq(parseMatrixParams('?t=kanban&pv=nope&c=Acme').tab, 'board', 'unknown tab = board');
eq(parseMatrixParams('?t=list&pv=priority').drill, null, 't and pv alone do not open a drill');
eq(parseMatrixParams('?k=bogus').drill, null, 'an unknown kind alone does not open a drill');
eq(parseMatrixParams('?c=Acme&k=bogus').drill.kind, 'cell', 'an unknown kind beside a company reads as cell');
eq(parseMatrixParams('?zzz=1&scope=team'), defaultFilters(), 'keys that are not the Matrix keys are ignored');
eq(parseMatrixParams(new URLSearchParams('o=Olive&p=P2')).owner, 'Olive', 'a URLSearchParams is accepted');

console.log('\nlegacy hash payload (what legacy-urls hands over)\n');
const legacy = parseMatrixParams('s=Pending|Completed&o=Olive%20Other&p=P1&q=x&od=1&rv=1&c=Acme&f=Ops&k=review&t=pivot&pv=func');
eq(legacy, { statuses: ['Pending', 'Completed'], owner: 'Olive Other', priority: 'P1', q: 'x', overdueOnly: true, reviewOnly: true, drill: { company: 'Acme', func: 'Ops', kind: 'review' }, tab: 'pivot', pivot: 'func' }, 'every old key reads');

console.log('\nmerging into the page URL keeps the Work scope\n');
assert(mergeMatrixParams('scope=team&o=Old&c=Acme', { ...defaultFilters(), priority: 'P2' }) === 'scope=team&p=P2', 'the Matrix keys are replaced, scope stays');
assert(mergeMatrixParams('?scope=mine', defaultFilters()) === 'scope=mine', 'defaults add nothing');
assert(mergeMatrixParams('', defaultFilters()) === '', 'an empty URL stays empty');

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
