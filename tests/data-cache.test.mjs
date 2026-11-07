// rie_data_cache: round trip, schema discard, age, and writeCache never throws.
process.env.NEXT_PUBLIC_SB_URL = 'https://example.supabase.co';
process.env.NEXT_PUBLIC_SB_KEY = 'anon-key-123';

let bad = 0;
const check = (c, m) => { console.log((c ? '  ok  ' : '  FAIL') + '  ' + m); if (!c) bad++; };

const mem = new Map();
let quotaFull = false;
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => { if (quotaFull) throw new Error('QuotaExceededError'); mem.set(k, String(v)); },
  removeItem: (k) => { mem.delete(k); },
};

const asUser = (id) => (id ? mem.set('rie_session', JSON.stringify({ accessToken: 't', userId: id })) : mem.delete('rie_session'));
asUser('user-a');

const { store } = await import('../src/store/store.js');
const cache = await import('../src/lib/data-cache.js');

check(cache.CACHE_KEY === 'rie_data_cache', 'cache key is the old one (rie_data_cache)');
check(cache.CACHE_SCHEMA === 3, 'schema version is 3 (2 + the owner id; older caches are discarded)');

// empty -> null
check(cache.readCache() === null, 'no entry: readCache() is null');

// round trip of the store's lists
store.setState({
  tasks: [{ id: '1', task: 'Call Pat' }],
  contacts: [{ id: 7, name: 'Sam' }],
  entityLinks: [{ parentId: 'a', childId: 'b' }],
  people: [{ code: 'zz' }],
});
cache.writeCache();
const back = cache.readCache();
check(back && back.schema === 3 && typeof back.ts === 'number', 'writeCache stores schema and timestamp');
check(back.tasks.length === 1 && back.tasks[0].task === 'Call Pat', 'tasks round trip');
check(back.contacts[0].name === 'Sam' && back.entityLinks[0].childId === 'b', 'contacts and entityLinks round trip');
check(!('people' in back) && !('coOwners' in back), 'people/coOwners are not cached (old behaviour)');
for (const k of ['events', 'guests', 'leads', 'initiatives', 'candidates', 'decisions', 'cleanups', 'workstreams', 'actions']) {
  if (!Array.isArray(back[k])) check(false, `list ${k} is cached as an array`);
}
check(true, 'all twelve lists are cached');

// explicit state argument
cache.writeCache({ ...store.getState(), tasks: [] });
check(cache.readCache().tasks.length === 0, 'writeCache(state) caches the given state');

// per-user: the cache is only served to the person who wrote it (R25)
cache.writeCache();
check(JSON.parse(mem.get('rie_data_cache')).userId === 'user-a', 'writeCache stores the signed-in user id');
asUser('user-b');
check(cache.readCache() === null, 'cache written by user A is not served to user B');
check(!mem.has('rie_data_cache'), '... and is removed');
asUser('user-a');
cache.writeCache();
asUser(null);
check(cache.readCache() === null && !mem.has('rie_data_cache'), 'no session: cache is not served and is removed');
cache.writeCache();
check(!mem.has('rie_data_cache'), 'no session: writeCache writes nothing (cannot attribute it)');
asUser('user-a');
mem.set('rie_data_cache', JSON.stringify({ schema: 3, ts: Date.now(), tasks: [{ id: 'x' }] }));
check(cache.readCache() === null && !mem.has('rie_data_cache'), 'entry without a user id is discarded');
cache.writeCache();
cache.clearCache();
check(!mem.has('rie_data_cache'), 'clearCache removes the entry');

// stale schema is discarded and deleted
mem.set('rie_data_cache', JSON.stringify({ schema: 2, userId: 'user-a', ts: Date.now(), tasks: [{ id: 'x' }] }));
check(cache.readCache() === null, 'older schema: readCache() is null');
check(!mem.has('rie_data_cache'), 'older schema: entry is removed');

// corrupt JSON
mem.set('rie_data_cache', '{not json');
check(cache.readCache() === null, 'corrupt JSON: readCache() is null, no throw');

// age
const now = 10 * 60000;
check(cache.cacheAgeMinutes({ ts: 0 }, now) === 10, 'age: 10 minutes');
check(cache.cacheAgeMinutes({ ts: now - 29000 }, now) === 0, 'age: under 30s rounds to 0');
check(cache.cacheAgeMinutes({ ts: now - 31000 }, now) === 1, 'age: over 30s rounds up to 1');

// full / unavailable storage never throws
mem.clear();
asUser('user-a');
quotaFull = true;
let threw = false;
try { cache.writeCache(); } catch { threw = true; }
check(!threw, 'writeCache does not throw when localStorage is full');
quotaFull = false;

delete globalThis.localStorage;
threw = false;
try { cache.writeCache(); cache.readCache(); } catch { threw = true; }
check(!threw, 'writeCache/readCache do not throw when localStorage is unavailable');
check(cache.readCache() === null, 'no storage: readCache() is null');

if (bad) { console.error(`\n${bad} check(s) failed`); process.exit(1); }
console.log('\nall data-cache checks passed');
