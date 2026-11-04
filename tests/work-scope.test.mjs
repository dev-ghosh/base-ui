/**
 * Work scope: Mine / Team / Everyone, the predicate every Work surface uses.
 *
 * Run with: node tests/work-scope.test.mjs   (no network, no keys)
 *
 * The failure this exists to catch: a surface that decides "mine" on its own
 * terms (a name string, a legacy assignee, the wrong shape of row) and shows a
 * person somebody else's work labelled as theirs, or hides their own.
 */
import { isMine, inScope, resolveScope, scopeCounts, ancestorsOf, mineSet } from '../src/lib/scope.js';

let passed = 0, failed = 0;
const assert = (c, m) => c
  ? (console.log(`  ✓ ${m}`), passed++)
  : (console.error(`  ✗ ${m}`), failed++);

const ME = 'P1CODE';
const OTHER = 'P2CODE';

console.log('\nisMine / inScope\n');

const owned    = { id: 1, ownerCode: ME, coOwnerCodes: [] };
const coOwned  = { id: 2, ownerCode: OTHER, coOwnerCodes: [ME] };
const theirs   = { id: 3, ownerCode: OTHER, coOwnerCodes: [] };
const unowned  = { id: 4, ownerCode: '', assignedTo: '', coOwnerCodes: [] };
const legacy   = { id: 5, ownerCode: '', assignedTo: 'Some Name', coOwnerCodes: [] };
const queueRow = { id: 6, owner: ME, co_owners: [] };
const queueCo  = { id: 7, owner: OTHER, co_owners: [ME] };
const queueLeg = { id: 8, owner: 'Some Name', co_owners: [], owner_is_legacy: true };

assert(isMine(owned, ME),            'owner is mine');
assert(isMine(coOwned, ME),          'co-owner is mine');
assert(!isMine(theirs, ME),          'someone else\'s is not mine');
assert(!isMine(unowned, ME),         'unowned is not mine');
assert(!isMine(legacy, ME),          'legacy free-text assignee is not mine (F2)');
assert(!isMine(owned, null),         'null me owns nothing (F1)');
assert(isMine(queueRow, ME),         'buildQueue row shape: owner');
assert(isMine(queueCo, ME),          'buildQueue row shape: co-owner');
assert(!isMine(queueLeg, ME),        'buildQueue row shape: legacy string is not a code');

assert(inScope(owned, 'mine', ME),      'mine: my task in');
assert(!inScope(theirs, 'mine', ME),    'mine: their task out');
assert(!inScope(unowned, 'mine', ME),   'mine: unowned out');
assert(inScope(theirs, 'team', ME),     'team: their task in');
assert(inScope(unowned, 'team', ME),    'team: unowned in (a team fact)');
assert(!inScope(owned, 'team', ME),     'team: my task out');
assert(inScope(owned, 'everyone', ME),  'everyone: mine in');
assert(inScope(unowned, 'everyone', ME),'everyone: unowned in');
assert(inScope(owned, 'everyone', null),'everyone with null me: everything in');

console.log('\nresolveScope\n');
assert(resolveScope(null, ME) === 'mine',         'no stored choice, bound person → mine');
assert(resolveScope(null, null) === 'everyone',   'no stored choice, unbound → everyone (F1)');
assert(resolveScope('team', ME) === 'team',       'stored choice wins');
assert(resolveScope('mine', null) === 'everyone', 'stored mine for an unbound sign-in falls back (F8)');
assert(resolveScope('bogus', ME) === 'mine',      'unknown stored value ignored');

console.log('\nscopeCounts\n');
const counts = scopeCounts([queueRow, queueCo, { id: 9, owner: OTHER, co_owners: [] }, { id: 10, owner: null, co_owners: [] }], ME);
assert(counts.mine === 2 && counts.team === 2 && counts.everyone === 4, 'mine + team = everyone');

console.log('\nancestorsOf / mineSet\n');
// initiative 100 contains workstream 10 contains task 1 (mine) ; task 3 (theirs) sits under 20 under 200
const links = [
  { parentId: 10, childId: 1 }, { parentId: 100, childId: 10 },
  { parentId: 20, childId: 3 }, { parentId: 200, childId: 20 },
  { parentId: 1000, childId: 100 },   // third hop: reached (action→task→workstream→initiative is the SQL's depth)
  { parentId: 10000, childId: 1000 }, // fourth hop: must NOT be reached
];
const anc = ancestorsOf([1], links);
assert(anc.has('10') && anc.has('100'),  'walks task → workstream → initiative');
assert(anc.has('1000') && !anc.has('10000'), 'stops at three levels');
assert(!anc.has('20') && !anc.has('200'),'does not cross into another branch');

const cyc = ancestorsOf([1], [{ parentId: 2, childId: 1 }, { parentId: 1, childId: 2 }]);
assert(cyc.has('2') && cyc.size === 2,   'a cycle terminates (F6)');

const set = mineSet([owned, theirs], links, ME);
assert(set.has('1') && set.has('10') && set.has('100'), 'mineSet holds my task and its parents');
assert(!set.has('3') && !set.has('200'),               'mineSet excludes their branch');
assert(mineSet([owned], links, null).size === 0,       'mineSet is empty for an unbound sign-in');

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
