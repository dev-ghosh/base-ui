// loadData/syncData: the endpoints, mapping order, store writes, status copy, cache fallback.
process.env.NEXT_PUBLIC_SB_URL = 'https://example.supabase.co';
process.env.NEXT_PUBLIC_SB_KEY = 'anon-key-123';

let bad = 0;
const check = (c, m) => { console.log((c ? '  ok  ' : '  FAIL') + '  ' + m); if (!c) bad++; };
console.warn = () => {};

const mem = new Map();
let quotaFull = false;
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => { if (quotaFull) throw new Error('QuotaExceededError'); mem.set(k, String(v)); },
  removeItem: (k) => { mem.delete(k); },
};

// fetch stub: a table -> rows map keyed by "table?query" prefix; `fail` maps to a status.
const calls = [];
let rows = {};
let failing = {};
const jsonRes = (status, body) => ({
  ok: status >= 200 && status < 300, status,
  json: async () => body, text: async () => JSON.stringify(body),
});
globalThis.fetch = async (url) => {
  const u = String(url);
  calls.push(u);
  if (failing.all) throw new TypeError('Failed to fetch');
  const path = u.replace('https://example.supabase.co/rest/v1/', '');
  for (const [key, status] of Object.entries(failing)) {
    if (path.startsWith(key)) return jsonRes(status, {});
  }
  for (const [key, body] of Object.entries(rows)) {
    if (path.startsWith(key)) return jsonRes(200, body);
  }
  return jsonRes(200, []);
};

const { store, createInitialState } = await import('../src/store/store.js');
const { statusStore, resetStatus } = await import('../src/lib/status.js');
const { loadData, syncData } = await import('../src/lib/load-data.js');
const { writeCache, readCache } = await import('../src/lib/data-cache.js');

const asUser = (id) => mem.set('rie_session', JSON.stringify({ accessToken: 't', userId: id }));
const reset = () => {
  store.setState(createInitialState());
  resetStatus(); calls.length = 0; rows = {}; failing = {}; mem.clear(); quotaFull = false;
  asUser('user-a');
};
const ENTITY = (id, tier, extra = {}) => ({ id, tier, title: 'T-' + id, status: 'pending', ...extra });

// ---- the endpoint list: same tables, queries and order as the old loadData ----
reset();
await loadData();
const paths = calls.map((c) => c.replace('https://example.supabase.co/rest/v1/', ''));
const expected = [
  'contacts?order=id.asc',
  'entities?tier=eq.task&order=id.asc',
  'events?order=date.asc',
  'event_guests?order=name.asc',
  'leads?order=updated_at.desc',
  'v_initiative_heartbeat?',
  'v_opening_move_candidates?order=score.desc&limit=10',
  'decision_queue?status=eq.pending&order=raised_at.asc',
  'cleanup_queue?status=eq.pending&order=similarity_score.desc',
  'fronts?archived_at=is.null&order=code.asc',
  'people?archived_at=is.null&order=code.asc',
  'entities?tier=eq.workstream&order=id.asc',
  'entities?tier=eq.action&order=id.asc',
  'entity_links?link_type=eq.contains&select=parent_id,child_id',
  'entity_owners?removed_at=is.null&select=entity_id,person_code',
  'entity_events?order=created_at.desc&limit=60',
  'escalations?order=created_at.desc&limit=500',   // after the lists, as the old loadData awaited loadEscalations()
];
check(paths.length === expected.length, `${expected.length} requests are made (got ${paths.length})`);
check(expected.every((p, i) => paths[i] === p), 'tables, queries and order match the old loadData');

// ---- empty arrays: empty lists, no throw, status online ----
const s0 = store.getState();
check(['contacts', 'tasks', 'events', 'guests', 'leads', 'initiatives', 'candidates', 'decisions', 'cleanups',
  'workstreams', 'actions', 'entityLinks', 'entityEvents', 'fronts', 'people'].every((k) => Array.isArray(s0[k]) && s0[k].length === 0),
  'empty responses leave every list empty');
check(s0.coOwners instanceof Map && s0.coOwners.size === 0, 'empty responses leave coOwners an empty Map');
check(statusStore.getState().kind === 'online' && statusStore.getState().msg === 'Connected', 'status after a good load: online / Connected');
check(/^Synced \d/.test(statusStore.getState().meta), 'status meta says "Synced <time>"');
check(readCache() && readCache().tasks.length === 0, 'a good load writes the cache');

// ---- a full load: mapped rows, people and co-owners resolved BEFORE tasks ----
reset();
rows = {
  'contacts?order=id.asc': [{ id: 1, n: 'Sam' }],
  'entities?tier=eq.task': [
    ENTITY('t1', 'task', { owner_code: 'pat' }),
    ENTITY('t2', 'task', { owner_code: 'lee' }),
  ],
  'entities?tier=eq.workstream': [ENTITY('w1', 'workstream')],
  'entities?tier=eq.action': [ENTITY('a1', 'action')],
  'events?': [{ id: 4, title: 'Gala' }],
  'event_guests?': [{ id: 5, event_id: 4, name: 'G' }],
  'leads?': [{ id: 6, title: 'Grant' }],
  'v_initiative_heartbeat?': [{ id: 'i1', title: 'Init' }],
  'v_opening_move_candidates?': [{ id: 'c1', title: 'Move' }],
  'decision_queue?': [{ id: 'd1', question: 'Q?' }],
  'cleanup_queue?': [{ id: 'k1', entity_a_id: 'x', entity_b_id: 'y' }],
  'fronts?': [{ code: 'F1' }],
  'people?': [{ code: 'pat', display_name: 'Pat Example' }, { code: 'lee', display_name: 'Lee Example' }],
  'entity_links?': [{ parent_id: 'w1', child_id: 't1' }],
  'entity_owners?': [
    { entity_id: 't1', person_code: 'pat' },    // mirror of the primary owner: dropped
    { entity_id: 't1', person_code: 'lee' },
    { entity_id: 't1', person_code: 'lee' },    // duplicate: kept once
    { entity_id: 't2', person_code: 'lee' },    // mirror of t2's primary owner: dropped
    { entity_id: null, person_code: 'pat' },    // unusable: skipped
  ],
  'entity_events?': [{ id: 'e1', entity_id: 't1', event_type: 'status' }],
};
await loadData();
const s = store.getState();
check(s.people.length === 2 && s.fronts[0].code === 'F1', 'people and fronts are stored as returned');
check(s.contacts[0].name === 'Sam' && s.events[0].title === 'Gala' && s.guests[0].eventId === 4 && s.leads[0].title === 'Grant', 'contacts/events/guests/leads are mapped');
check(s.tasks.length === 2 && s.workstreams.length === 1 && s.actions.length === 1, 'tasks/workstreams/actions come from the three entities queries');
check(s.tasks[0].assignedTo === 'Pat Example, Lee Example', 'owner names resolve through people and co-owners (people loaded first)');
check(s.tasks[0].coOwnerCodes.join() === 'lee', 'co-owners: primary owner mirror dropped, duplicate collapsed');
check(s.tasks[1].assignedTo === 'Lee Example' && s.tasks[1].coOwnerCodes.length === 0, 'a task whose only co-owner row mirrors its owner has no co-owners');
check(s.coOwners.get('t1').join() === 'lee' && !s.coOwners.has('t2'), 'coOwners Map: t1 -> [lee], t2 absent');
check(s.initiatives[0].id === 'i1' && s.candidates[0].id === 'c1' && s.decisions[0].question === 'Q?' && s.cleanups[0].entityAId === 'x', 'derived/queue lists are mapped');
check(s.entityLinks[0].parentId === 'w1' && s.entityLinks[0].childId === 't1', 'entityLinks mapped to {parentId, childId}');
check(s.entityEvents[0].eventType === 'status', 'entityEvents are mapped');
const cached = readCache();
check(cached && cached.tasks.length === 2 && cached.contacts.length === 1, 'the cache holds the loaded lists');

// ---- an endpoint that is missing (safeGet fallback) still fills the others ----
reset();
rows = { 'contacts?order=id.asc': [{ id: 1, n: 'Sam' }], 'entities?tier=eq.task': [ENTITY('t1', 'task')] };
failing = { 'leads?': 404, 'decision_queue?': 404 };
await loadData();
check(store.getState().leads.length === 0 && store.getState().decisions.length === 0, 'missing tables give empty lists');
check(store.getState().contacts.length === 1 && store.getState().tasks.length === 1, 'the other tables are still filled');
check(statusStore.getState().msg === 'Connected', 'a missing table is not an error: status is Connected');

// ---- a hard failure with a cache present: fall back to the cache, say how old it is ----
reset();
store.setState({ tasks: [{ id: 'cached-1', task: 'From cache' }], contacts: [{ id: 3, name: 'Cached' }] });
writeCache();
const stored = JSON.parse(mem.get('rie_data_cache'));
stored.ts = Date.now() - 7 * 60000;
mem.set('rie_data_cache', JSON.stringify(stored));
store.setState(createInitialState());
store.setState({ people: [{ code: 'keep' }] });
failing = { 'contacts?': 500 };   // contacts uses sbGet, not safeGet: a 500 is fatal
const res = await loadData();
check(res === false, 'a failed load reports false (not fresh)');
check(store.getState().tasks[0].task === 'From cache' && store.getState().contacts[0].name === 'Cached', 'lists are restored from the cache');
check(store.getState().people[0].code === 'keep', 'people already in the store survive the fallback');
check(statusStore.getState().kind === 'online', 'cache fallback status kind is online');
check(statusStore.getState().msg === 'Showing cached data (7m ago)', `status carries the cache age: "${statusStore.getState().msg}"`);

// cache present but a fetch rejects outright (offline)
failing = { all: true };
store.setState(createInitialState());
await loadData();
check(/Showing cached data \(\d+m ago\)/.test(statusStore.getState().msg) && store.getState().tasks.length === 1, 'offline (fetch rejects): cache fallback too');

// ---- a hard failure with no cache: error status, store left alone, no throw ----
reset();
failing = { 'contacts?': 500 };
store.setState({ tasks: [{ id: 'keep' }] });
const res2 = await loadData();
check(res2 === false, 'failed load with no cache reports false');
check(statusStore.getState().kind === 'error' && statusStore.getState().msg.startsWith('Could not load data: '), `error status: "${statusStore.getState().msg}"`);
check(store.getState().tasks.length === 1, 'the store keeps what it had');

// ---- a stale-schema cache is not used ----
reset();
mem.set('rie_data_cache', JSON.stringify({ schema: 2, userId: 'user-a', ts: Date.now(), tasks: [{ id: 'old' }] }));
failing = { 'contacts?': 500 };
await loadData();
check(statusStore.getState().kind === 'error' && store.getState().tasks.length === 0, 'old-schema cache is ignored: error status, nothing restored');

// ---- writeCache failing (quota) does not fail the load ----
reset();
quotaFull = true;
rows = { 'contacts?order=id.asc': [{ id: 1, n: 'Sam' }] };
const res3 = await loadData();
check(res3 === true && store.getState().contacts.length === 1 && statusStore.getState().msg === 'Connected', 'a full localStorage does not break a good load');

// ---- status while loading ----
reset();
const p = loadData();
check(statusStore.getState().kind === 'syncing' && statusStore.getState().msg === 'Syncing database…', 'status is "Syncing database…" while loading');
await p;

// ---- syncData drops the legacy cache key and reloads ----
reset();
mem.set('rie_cache_v3', 'old');
calls.length = 0;
await syncData();
check(!mem.has('rie_cache_v3'), 'syncData removes rie_cache_v3');
check(calls.length === 17, 'syncData reloads all endpoints');

// ---- escalations: raw rows into store.escalations (Analytics counts the open ones) ----
reset();
rows = { escalations: [{ id: 1, status: 'open' }, { id: 2, status: 'closed' }] };
await loadData();
check(store.getState().escalations.length === 2 && store.getState().escalations[0].status === 'open', 'escalations rows are in the store');
check(store.getState().escalationsError === null, 'no escalations error');
reset();
failing = { escalations: 404 };
check(await loadData() === true, 'a missing escalations table does not fail the load');
check(store.getState().escalationsError === 'missing' && store.getState().dataLoaded, 'a missing escalations table is reported as "missing"');
reset();
failing = { escalations: 500 };
await loadData();
check(/500/.test(store.getState().escalationsError || ''), 'another escalations failure keeps its message');
check(store.getState().tasks !== undefined && store.getState().dataLoaded, 'the other lists are unaffected');

// ---- R25: the cache never leaks between people ----
reset();
store.setState({ tasks: [{ id: 'a-1', task: "A's task" }] });
writeCache();                                   // written while user A is signed in
store.setState(createInitialState());
asUser('user-b');                               // B signs in on the same browser
failing = { 'contacts?': 500 };
await loadData();
check(statusStore.getState().kind === 'error' && statusStore.getState().msg.startsWith('Could not load data: '),
  "user B's failed load shows the error status, not A's cache");
check(store.getState().tasks.length === 0, "user A's tasks are not shown to user B");
check(!mem.has('rie_data_cache'), "user A's cache entry is gone");

reset();                                        // same user: offline fallback still works
store.setState({ tasks: [{ id: 'a-1', task: 'Mine' }] });
writeCache();
store.setState(createInitialState());
failing = { all: true };
await loadData();
check(/^Showing cached data \(\d+m ago\)$/.test(statusStore.getState().msg) && store.getState().tasks[0].task === 'Mine',
  'same user, offline: the cache is still served');

// sign-out clears the cache key and the lists
const { onSessionEnded } = await import('../src/lib/user-data.js');
reset();
rows = { 'contacts?order=id.asc': [{ id: 1, n: 'Sam' }], 'people?': [{ code: 'pat' }] };
await loadData();
check(mem.has('rie_data_cache') && store.getState().contacts.length === 1, 'precondition: loaded and cached');
onSessionEnded();
check(!mem.has('rie_data_cache'), 'sign-out clears rie_data_cache');
check(store.getState().contacts.length === 0 && store.getState().people.length === 0 && store.getState().coOwners.size === 0,
  'sign-out empties the lists, people and co-owners');

// the real sign-out path (auth.clearSession) does it
const auth = await import('../src/lib/auth.js');
reset();
await loadData();
auth.clearSession();
check(!mem.has('rie_data_cache') && !mem.has('rie_session'), 'clearSession() ends the session and clears the cache');

// a different person signing in over the top (decodeSession) ends the previous user's data
reset();
rows = { 'contacts?order=id.asc': [{ id: 1, n: 'Sam' }] };
await loadData();
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64');
auth.decodeSession(`${b64({ alg: 'x' })}.${b64({ sub: 'user-b', email: 'b@x.co' })}.sig`, 'r');
check(!mem.has('rie_data_cache') && store.getState().contacts.length === 0, "a new person signing in clears the previous one's cache and lists");

// an in-flight load that resolves after sign-out writes nothing
reset();
let release;
const gate = new Promise((r) => { release = r; });
const realFetch = globalThis.fetch;
globalThis.fetch = async (url) => { await gate; return realFetch(url); };
rows = { 'contacts?order=id.asc': [{ id: 1, n: 'Sam' }], 'people?': [{ code: 'pat' }], 'entities?tier=eq.task': [ENTITY('t1', 'task')] };
const inflight = loadData();
auth.clearSession();                            // user signs out while the request is out
statusStore.setState({ kind: '', msg: 'Signed out' });
release();
const fresh = await inflight;
check(fresh === false, 'a stale load reports false');
check(store.getState().contacts.length === 0 && store.getState().tasks.length === 0 && store.getState().people.length === 0,
  'in-flight load resolving after sign-out leaves the store empty');
check(!mem.has('rie_data_cache'), '... and writes no cache');
check(statusStore.getState().msg === 'Signed out', '... and does not touch the status bar');

// ... also when the user changed (B signed in while A's load was out)
reset();
const gate2 = new Promise((r) => { release = r; });
globalThis.fetch = async (url) => { await gate2; return realFetch(url); };
rows = { 'contacts?order=id.asc': [{ id: 1, n: 'A-contact' }] };
const inflight2 = loadData();
asUser('user-b');
release();
await inflight2;
check(store.getState().contacts.length === 0 && !mem.has('rie_data_cache'), "A's in-flight load is dropped when B is now signed in");

// a stale FAILING load does not restore a cache or set an error either
reset();
const gate3 = new Promise((r) => { release = r; });
globalThis.fetch = async () => { await gate3; throw new TypeError('Failed to fetch'); };
const inflight3 = loadData();
auth.clearSession();
statusStore.setState({ kind: '', msg: 'Signed out' });
release();
await inflight3;
check(statusStore.getState().msg === 'Signed out' && store.getState().tasks.length === 0, 'a stale failing load changes nothing');
globalThis.fetch = realFetch;

if (bad) { console.error(`\n${bad} check(s) failed`); process.exit(1); }
console.log('\nall load-data checks passed');
