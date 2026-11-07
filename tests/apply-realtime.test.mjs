// applyRealtimeChange: row-level apply vs full resync (old CLAUDE.md "Realtime" rules).
process.env.NEXT_PUBLIC_SB_URL = 'https://example.supabase.co';
process.env.NEXT_PUBLIC_SB_KEY = 'anon-key-123';

let bad = 0;
const check = (c, m) => { console.log((c ? '  ok  ' : '  FAIL') + '  ' + m); if (!c) bad++; };

console.warn = () => {};   // apply logs a warning before it asks for a resync

const { store, createInitialState } = await import('../src/store/store.js');
const { applyRealtimeChange, applyRealtimeBatch } = await import('../src/lib/apply-realtime.js');
const { rowToEntity, rowToContact } = await import('../src/lib/mappers.js');

const reset = () => store.setState(createInitialState());
const ent = (id, tier, extra = {}) => ({ id, tier, title: 'T ' + id, status: 'pending', ...extra });
const ch = (table, eventType, row, old = null) => ({
  table, eventType, new: eventType === 'DELETE' ? null : row, old: eventType === 'DELETE' ? (old || row) : old,
});

// ---- the headline case: an entities UPDATE of a task upserts that one task ----
reset();
store.setState({ people: [{ code: 'pat', display_name: 'Pat Example' }] });
store.setState({ tasks: [rowToEntity(ent('a', 'task')), rowToEntity(ent('b', 'task'))] });
const beforeTasks = store.getState().tasks;
let r = applyRealtimeChange(ch('entities', 'UPDATE', ent('b', 'task', { title: 'Renamed', owner_code: 'pat' })));
check(r === 'applied', 'entities UPDATE tier=task returns applied');
let tasks = store.getState().tasks;
check(tasks.length === 2, 'update replaces in place (still 2 tasks)');
check(tasks[1].task === 'Renamed' && tasks[1].assignedTo === 'Pat Example', 'updated task is mapped by rowToEntity (title, owner name from people)');
check(tasks[0] === beforeTasks[0], 'the other task is untouched');
check(tasks !== beforeTasks, 'a new array is stored (immutable update)');

// insert appends
r = applyRealtimeChange(ch('entities', 'INSERT', ent('c', 'task')));
check(r === 'applied' && store.getState().tasks.length === 3 && store.getState().tasks[2].id === 'c', 'entities INSERT appends the task');

// ids compare as strings (uuid vs numeric id)
reset();
store.setState({ contacts: [rowToContact({ id: 5, n: 'Sam' })] });
r = applyRealtimeChange(ch('contacts', 'UPDATE', { id: '5', n: 'Samuel' }));
check(r === 'applied' && store.getState().contacts.length === 1 && store.getState().contacts[0].name === 'Samuel', 'ids are compared as strings (5 vs "5")');

// ---- tiers route to their own list; a tier change moves the row ----
reset();
r = applyRealtimeChange(ch('entities', 'INSERT', ent('w1', 'workstream')));
check(r === 'applied' && store.getState().workstreams.length === 1 && store.getState().tasks.length === 0, 'workstream tier goes to workstreams only');
r = applyRealtimeChange(ch('entities', 'INSERT', ent('x1', 'action')));
check(r === 'applied' && store.getState().actions.length === 1, 'action tier goes to actions');
r = applyRealtimeChange(ch('entities', 'UPDATE', ent('w1', 'task')));
check(store.getState().workstreams.length === 0 && store.getState().tasks.length === 1, 'tier workstream->task: leaves workstreams, joins tasks');

// ---- DELETE removes the row from every entity list ----
r = applyRealtimeChange(ch('entities', 'DELETE', null, { id: 'x1' }));
check(r === 'applied' && store.getState().actions.length === 0, 'entities DELETE removes the action');
r = applyRealtimeChange(ch('entities', 'DELETE', null, { id: 'w1' }));
check(r === 'applied' && store.getState().tasks.length === 0, 'entities DELETE removes the task');
r = applyRealtimeChange(ch('entities', 'DELETE', null, { id: 'nope' }));
check(r === 'applied', 'DELETE of an unknown id is applied (nothing to do)');

reset();
store.setState({ contacts: [rowToContact({ id: 1, n: 'A' }), rowToContact({ id: 2, n: 'B' })] });
r = applyRealtimeChange(ch('contacts', 'DELETE', null, { id: 1 }));
check(r === 'applied' && store.getState().contacts.map((c) => c.id).join() === '2', 'contacts DELETE removes just that contact');

// ---- other lists ----
reset();
r = applyRealtimeChange(ch('events', 'INSERT', { id: 1, title: 'Gala' }));
check(r === 'applied' && store.getState().events[0].title === 'Gala', 'events INSERT');
r = applyRealtimeChange(ch('event_guests', 'INSERT', { id: 9, event_id: 1, name: 'G' }));
check(r === 'applied' && store.getState().guests[0].eventId === 1, 'event_guests INSERT goes to guests');
r = applyRealtimeChange(ch('leads', 'INSERT', { id: 3, title: 'Grant' }));
check(r === 'applied' && store.getState().leads[0].title === 'Grant', 'leads INSERT');

// ---- rows that do not match their list's filter are ignored ----
reset();
r = applyRealtimeChange(ch('cleanup_queue', 'INSERT', { id: 1, status: 'resolved' }));
check(r === 'applied', 'non-matching cleanup (status resolved) returns applied');
check(store.getState().cleanups.length === 0, 'non-matching cleanup is NOT added');
r = applyRealtimeChange(ch('cleanup_queue', 'INSERT', { id: 2, status: 'pending' }));
check(r === 'applied' && store.getState().cleanups.length === 1, 'pending cleanup is added');
const stateBefore = store.getState();
r = applyRealtimeChange(ch('entities', 'INSERT', ent('i9', 'frobnicate')));
check(r === 'applied' && store.getState() === stateBefore, 'entity of a tier no list holds: applied, store untouched');
r = applyRealtimeChange(ch('cleanup_queue', 'UPDATE', { id: 2, status: 'resolved' }));
check(r === 'applied' && store.getState().cleanups.length === 0, 'a pending cleanup that stops matching is dropped (old behaviour)');

// ---- escalations are folded into store.escalations ----
reset();
r = applyRealtimeChange(ch('escalations', 'INSERT', { id: 1, status: 'open', assigned_to: 'pat' }));
check(r === 'applied' && store.getState().escalations.length === 1, 'escalation INSERT is folded in');
r = applyRealtimeChange(ch('escalations', 'UPDATE', { id: 1, status: 'closed' }));
check(store.getState().escalations[0].status === 'closed' && store.getState().escalations[0].assigned_to === 'pat', 'escalation UPDATE merges over the old row');
r = applyRealtimeChange(ch('escalations', 'DELETE', null, { id: 1 }));
check(r === 'applied' && store.getState().escalations.length === 0, 'escalation DELETE removes');

// ---- echoes that back no list, and refused subscriptions: applied, no resync ----
for (const t of ['tasks', 'lead_history']) {
  check(applyRealtimeChange(ch(t, 'UPDATE', { id: 1 })) === 'applied', `${t} echo is applied (no list behind it)`);
}
check(applyRealtimeChange({ type: 'error', topic: 'realtime:public:x', message: 'no' }) === 'applied',
  '{type:"error"} does not trigger a resync');

// ---- everything that must fall back to a full resync ----
check(applyRealtimeChange({ type: 'resync', reason: 'reconnect' }) === 'resync', '{type:"resync"} -> resync');
for (const t of ['v_initiative_heartbeat', 'v_opening_move_candidates', 'decision_queue']) {
  check(applyRealtimeChange(ch(t, 'UPDATE', { id: 1 })) === 'resync', `derived table ${t} -> resync`);
}
check(applyRealtimeChange(ch('entities', 'INSERT', ent('i1', 'initiative'))) === 'resync', 'initiative-tier entity INSERT -> resync');
check(applyRealtimeChange(ch('entities', 'UPDATE', ent('i1', 'initiative'))) === 'resync', 'initiative-tier entity UPDATE -> resync');
check(applyRealtimeChange({ table: 'entities', eventType: 'UPDATE', new: null, old: null }) === 'resync', 'UPDATE with new:null -> resync');
check(applyRealtimeChange({ table: 'contacts', eventType: 'INSERT', new: null, old: null }) === 'resync', 'INSERT with new:null -> resync');
check(applyRealtimeChange({ table: 'contacts', eventType: 'DELETE', new: null, old: null }) === 'resync', 'DELETE with old:null -> resync');
check(applyRealtimeChange({ table: 'contacts', eventType: 'UPDATE', new: { n: 'no id' }, old: null }) === 'resync', 'row without an id -> resync');
check(applyRealtimeChange({ table: 'contacts', eventType: 'TRUNCATE', new: { id: 1 }, old: null }) === 'resync', 'unknown eventType -> resync');
check(applyRealtimeChange(ch('some_new_table', 'INSERT', { id: 1 })) === 'resync', 'unknown table -> resync');
check(applyRealtimeChange(null) === 'resync' && applyRealtimeChange(undefined) === 'resync', 'null/undefined payload -> resync');

// an exception during apply -> resync, and the store is not left half-written
reset();
store.setState({ tasks: [rowToEntity(ent('a', 'task'))] });
const snap = store.getState();
const boom = { id: 'a', tier: 'task', get title() { throw new Error('boom'); } };
check(applyRealtimeChange({ table: 'entities', eventType: 'UPDATE', new: boom, old: null }) === 'resync', 'a mapper that throws -> resync (no exception escapes)');
check(store.getState() === snap, 'nothing was written when the apply threw');

// ---- batches: stop at the first resync, report whether the store changed ----
reset();
let out = applyRealtimeBatch([ch('events', 'INSERT', { id: 1 }), ch('events', 'INSERT', { id: 2 })]);
check(out.result === 'applied' && out.changed && store.getState().events.length === 2, 'batch of applicable rows: applied + changed');
out = applyRealtimeBatch([ch('tasks', 'UPDATE', { id: 1 })]);
check(out.result === 'applied' && out.changed === false, 'batch of echoes: applied, not changed (no cache rewrite needed)');
out = applyRealtimeBatch([ch('events', 'INSERT', { id: 3 }), { type: 'resync' }, ch('events', 'INSERT', { id: 4 })]);
check(out.result === 'resync' && store.getState().events.length === 3, 'batch with a resync: resync, rows before it applied, rows after it skipped');

if (bad) { console.error(`\n${bad} check(s) failed`); process.exit(1); }
console.log('\nall apply-realtime checks passed');
