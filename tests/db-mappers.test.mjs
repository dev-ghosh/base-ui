// Verifies rowToEntity maps BOTH filter levels. This is the check that was
// missing: every earlier test injected state.tasks directly and so never
// exercised the mapper at all.
import { rowToEntity, rowToContact, entityToRow, personName, personCode } from '../src/lib/mappers.js';
import { store } from '../src/store/store.js';

// The owner vocabulary is data: seed what the data loader would have put in the store.
store.setState({
  people: [
    { code: 'VRISHABH', display_name: 'Vrishabh', is_internal: true },
    { code: 'NEWBIE',   display_name: 'New Colleague', is_internal: true },
  ],
  coOwners: new Map([[7, ['NEWBIE']]]),
});

const row = {
  id: 42, tier: 'task', title: 'T', status: 'pending', extra: {},
  company: 'Intertech', func: 'Sales', func_review: true,
  func_review_note: 'thin evidence', lead_id: null,
};
const t = rowToEntity(row);
let bad = 0;
const check = (c, m) => { console.log((c ? '  ok  ' : '  FAIL') + '  ' + m); if (!c) bad++; };

check(t.company === 'Intertech',              'rowToEntity maps company');
check(t.func === 'Sales',                     'rowToEntity maps func');
check(t.funcReview === true,                  'rowToEntity maps funcReview');
check(t.funcReviewNote === 'thin evidence',   'rowToEntity maps funcReviewNote');

const empty = rowToEntity({ id: 1, tier: 'task', title: 'x', status: 'pending', extra: {} });
check(empty.company === '' && empty.func === '', 'missing columns map to empty string, not undefined');

const c = rowToContact({ id: 1, n: 'A' });
check(!('company' in c) && !('func' in c),     'rowToContact is not polluted with task-only fields');

// Owners resolve through the store people, never through a constant.
const owned = rowToEntity({ id: 7, tier: 'task', title: 'o', status: 'pending', extra: {}, owner_code: 'VRISHABH' });
check(owned.ownerCode === 'VRISHABH',                       'rowToEntity keeps ownerCode');
check(owned.assignedTo === 'Vrishabh, New Colleague',       'assignedTo = owner name + co-owner names from the store');
check(owned.coOwnerCodes.length === 1 && owned.coOwnerCodes[0] === 'NEWBIE', 'coOwnerCodes read from store coOwners');
const unknown = rowToEntity({ id: 8, tier: 'task', title: 'u', status: 'pending', extra: {}, owner_code: 'SOMEONE' });
check(unknown.assignedTo === 'SOMEONE',                     'an owner code missing from people shows the code, not blank');
const legacy = rowToEntity({ id: 9, tier: 'task', title: 'l', status: 'pending', extra: { legacy_assigned_to: 'Manushree' } });
check(legacy.assignedTo === 'Manushree' && legacy.ownerCode === '', 'legacy free-text owner still surfaces when there is no code');

// The write side: a person code, not a name lookup that silently returns null.
const w1 = entityToRow({ task: 't', ownerCode: 'NEWBIE', assignedTo: 'New Colleague' }, true);
check(w1.owner_code === 'NEWBIE',                           'entityToRow writes the chosen person code');
const w2 = entityToRow({ task: 't', assignedTo: 'New Colleague, Vrishabh' }, true);
check(w2.owner_code === 'NEWBIE',                           'a multi-name assignedTo resolves its FIRST name (was NULL before)');
check(personName('NEWBIE') === 'New Colleague' && personCode('vrishabh') === 'VRISHABH', 'personName/personCode round-trip');

console.log(bad ? `\n${bad} FAILED\n` : '\nmapper ok\n');
process.exit(bad ? 1 : 0);
