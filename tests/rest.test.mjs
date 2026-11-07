// REST client: write guard, error handling, URL/verb shapes, missing-env error,
// edge-function caller, and a light realtime test with a fake WebSocket.
process.env.NEXT_PUBLIC_SB_URL = 'https://example.supabase.co';
process.env.NEXT_PUBLIC_SB_KEY = 'anon-key-123';

let bad = 0;
const check = (c, m) => { console.log((c ? '  ok  ' : '  FAIL') + '  ' + m); if (!c) bad++; };

const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => { mem.set(k, String(v)); },
  removeItem: (k) => { mem.delete(k); },
};

const calls = [];
let responders = [];
const res = (status, body, textOverride) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
  text: async () => (textOverride !== undefined ? textOverride : JSON.stringify(body)),
});
globalThis.fetch = async (url, init) => {
  calls.push({ url: String(url), init });
  const r = responders.shift();
  if (!r) throw new Error('unexpected fetch ' + url);
  return r;
};
const reset = () => { calls.length = 0; responders = []; mem.clear(); };
const rejects = async (p) => { try { await p; return null; } catch (e) { return e; } };

const { store } = await import('../src/store/store.js');
const rest = await import('../src/lib/rest.js');
const config = await import('../src/lib/config.js');
const edge = await import('../src/lib/edge.js');
const VIEWER_MSG = 'You have view-only access to BASE, so this change was not saved.';

// ---- write guard ----------------------------------------------------------
store.setState({ access: { can_write: false, role: 'viewer' } });
reset();
let e = await rejects(rest.sbInsert('tasks', {}));
check(e && e.message === VIEWER_MSG, 'viewer: sbInsert rejects with the viewer sentence');
check(calls.length === 0, 'viewer: sbInsert never calls fetch');
for (const [name, fn] of [
  ['sbUpdate', () => rest.sbUpdate('tasks', 1, {})],
  ['sbDelete', () => rest.sbDelete('tasks', 1)],
  ['sbPatchWhere', () => rest.sbPatchWhere('entity_owners', 'a=eq.1', {})],
]) {
  e = await rejects(fn());
  check(e && e.message === VIEWER_MSG && calls.length === 0, `viewer: ${name} blocked before any request`);
}
check((await rejects(Promise.resolve().then(() => rest.assertCanWrite()))).message === VIEWER_MSG, 'assertCanWrite() is exported and throws the viewer sentence');

store.setState({ access: null });
responders = [res(200, [{ id: 1 }])];
await rest.sbInsert('tasks', { a: 1 });
check(calls.length === 1, 'access still null (unknown): write is allowed, RLS decides');

store.setState({ access: { can_write: true, role: 'member' } });

// ---- request shapes -------------------------------------------------------
reset();
responders = [res(200, [{ id: 7 }])];
let out = await rest.sbInsert('tasks', { title: 'x' });
check(calls[0].url === 'https://example.supabase.co/rest/v1/tasks' && calls[0].init.method === 'POST', 'sbInsert POSTs /rest/v1/<table>');
check(calls[0].init.body === '{"title":"x"}' && out[0].id === 7, 'sbInsert sends JSON and returns the representation');
check(calls[0].init.headers.Prefer === 'return=representation' && calls[0].init.headers.apikey === 'anon-key-123', 'sbInsert sends Prefer and apikey headers');

responders = [res(200, [{ id: 7 }])];
await rest.sbUpdate('tasks', 'abc', { s: 1 });
check(calls[1].url === 'https://example.supabase.co/rest/v1/tasks?id=eq.abc' && calls[1].init.method === 'PATCH', 'sbUpdate PATCHes ?id=eq.<id>');

responders = [res(200, [{ id: 7 }])];
await rest.sbPatchWhere('entity_owners', 'entity_id=eq.1&person_code=eq.X', { removed_at: 'now' });
check(calls[2].url.endsWith('/rest/v1/entity_owners?entity_id=eq.1&person_code=eq.X') && calls[2].init.method === 'PATCH', 'sbPatchWhere PATCHes the raw filter');

responders = [res(200, [{ id: 1 }])];
out = await rest.sbGet('tasks', 'select=*&limit=1');
check(calls[3].url === 'https://example.supabase.co/rest/v1/tasks?select=*&limit=1' && out[0].id === 1, 'sbGet GETs table?params');

responders = [res(200, { ok: true })];
out = await rest.sbRpc('rie_my_access', { a: 1 });
check(calls[4].url === 'https://example.supabase.co/rest/v1/rpc/rie_my_access' && calls[4].init.method === 'POST' && calls[4].init.body === '{"a":1}' && out.ok === true, 'sbRpc POSTs /rpc/<fn> with the body');

// ---- delete ---------------------------------------------------------------
reset();
responders = [res(200, [{ id: 1 }])];
await rest.sbDelete('tasks', 1);
check(calls[0].init.method === 'DELETE' && calls[0].init.headers.Prefer === 'return=representation', 'sbDelete DELETEs with Prefer: return=representation');
responders = [res(200, [])];
e = await rejects(rest.sbDelete('tasks', 1));
check(e && /Row not deleted/.test(e.message) && /RLS/.test(e.message), 'sbDelete: empty representation means RLS refused it, so it throws');
responders = [res(204, null, '')];
check((await rejects(rest.sbDelete('tasks', 1))) === null, 'sbDelete: empty body is not an error');

// ---- errors ---------------------------------------------------------------
reset();
responders = [res(500, {}, 'boom')];
e = await rejects(rest.sbInsert('tasks', {}));
check(e && e.message === 'INSERT tasks failed: boom', 'sbInsert error message names verb, table and body');
responders = [res(500, {}, 'boom')];
e = await rejects(rest.sbUpdate('tasks', 1, {}));
check(e && e.message === 'UPDATE tasks failed: boom', 'sbUpdate error message');
responders = [res(500, {}, 'boom')];
e = await rejects(rest.sbRpc('f'));
check(e && e.message === 'RPC f failed: boom', 'sbRpc error message');
responders = [res(404, {})];
e = await rejects(rest.sbGet('tasks'));
check(e && e.message === 'GET tasks failed: 404', 'sbGet error message');

reset();
responders = [res(401, {})];
e = await rejects(rest.sbGet('tasks'));
check(e && e.message === 'Your session has expired — please sign in again.', 'sbGet 401 gives the session-expired sentence');
responders = [res(403, {}, '{"code":"42501","message":"new row violates row-level security"}')];
e = await rejects(rest.sbInsert('tasks', {}));
check(e && e.message === 'Your session has expired — please sign in again.', 'RLS/42501 body on a write is treated as an expired session');
await new Promise((r) => setTimeout(r, 20)); // let the unawaited handleAuthExpired settle

reset();
responders = [res(404, {})];
check(JSON.stringify(await rest.safeGet('nope', '')) === '[]', 'safeGet returns [] for a missing table (404)');
responders = [res(500, {})];
e = await rejects(rest.safeGet('t', ''));
check(e && /500/.test(e.message), 'safeGet rethrows other errors');

reset();
responders = [res(200, [])];
await rest.getContactHistory(5);
check(calls[0].url.endsWith('/rest/v1/contact_history?contact_id=eq.5&order=created_at.desc&limit=20'), 'getContactHistory query');
responders = [res(200, [])];
await rest.getLeadHistory(6);
check(calls[1].url.endsWith('/rest/v1/lead_history?lead_id=eq.6&order=created_at.desc&limit=100'), 'getLeadHistory query');

// ---- edge function --------------------------------------------------------
reset();
responders = [res(200, { ids: [1] })];
out = await edge.callEdgeFunction('nl-search', { q: 'x' });
check(calls[0].url === 'https://example.supabase.co/functions/v1/nl-search' && calls[0].init.method === 'POST', 'callEdgeFunction POSTs /functions/v1/<fn>');
check(calls[0].init.headers.Authorization === 'Bearer anon-key-123' && calls[0].init.body === '{"q":"x"}' && out.ids[0] === 1, '... with the anon key as bearer (as old) and JSON body');
responders = [res(500, {}, 'bad')];
e = await rejects(edge.callEdgeFunction('nl-search', {}));
check(e && e.message === 'nl-search failed: bad', 'callEdgeFunction error message');

// ---- missing env ----------------------------------------------------------
const savedUrl = process.env.NEXT_PUBLIC_SB_URL;
const savedKey = process.env.NEXT_PUBLIC_SB_KEY;
reset();
delete process.env.NEXT_PUBLIC_SB_URL;
e = await rejects(rest.sbGet('tasks'));
check(e && /NEXT_PUBLIC_SB_URL/.test(e.message) && calls.length === 0, 'sbGet without NEXT_PUBLIC_SB_URL throws an Error naming it, no request');
process.env.NEXT_PUBLIC_SB_URL = savedUrl;
delete process.env.NEXT_PUBLIC_SB_KEY;
e = await rejects(config.getHeaders());
check(e && /NEXT_PUBLIC_SB_KEY/.test(e.message), 'getHeaders without NEXT_PUBLIC_SB_KEY throws an Error naming it');
e = await rejects(edge.callEdgeFunction('x', {}));
check(e && /NEXT_PUBLIC_SB_KEY/.test(e.message), 'callEdgeFunction without NEXT_PUBLIC_SB_KEY throws an Error naming it');
process.env.NEXT_PUBLIC_SB_KEY = savedKey;

// ---- realtime (fake WebSocket) -------------------------------------------
const sockets = [];
class FakeWS {
  static CONNECTING = 0; static OPEN = 1; static CLOSING = 2; static CLOSED = 3;
  constructor(url) { this.url = url; this.readyState = 0; this.sent = []; sockets.push(this); }
  send(d) { this.sent.push(JSON.parse(d)); }
  close() { this.readyState = 3; }
}
globalThis.WebSocket = FakeWS;
const rt = await import('../src/lib/realtime.js');
const events = [];
mem.set('rie_session', JSON.stringify({ accessToken: 'USER-JWT' }));
rt.initRealtime((ev) => events.push(ev));
const ws = sockets[0];
check(ws.url === 'wss://example.supabase.co/realtime/v1/websocket?apikey=anon-key-123&vsn=1.0.0', 'realtime connects to wss://<host>/realtime/v1/websocket with the anon apikey');
ws.readyState = 1; ws.onopen();
const joins = ws.sent.filter((m) => m.event === 'phx_join');
check(joins.length === 10 && joins.some((m) => m.topic === 'realtime:public:tasks'), 'one phx_join per table (10)');
check(joins.every((m) => m.payload.access_token === 'USER-JWT'), 'join payload carries the user access_token');
check(joins.every((m) => m.payload.config.postgres_changes[0].event === '*' && m.payload.config.postgres_changes[0].table === m.topic.split(':').pop()), 'join payload carries a postgres_changes binding for its table');
check(events.length === 0, 'first connect does not emit a resync');
ws.onmessage({ data: JSON.stringify({ event: 'postgres_changes', topic: 'realtime:public:tasks', payload: { data: { table: 'tasks', eventType: 'update', record: { id: 1 }, old_record: { id: 1 } } } }) });
check(events[0] && events[0].table === 'tasks' && events[0].eventType === 'UPDATE' && events[0].new.id === 1, 'a postgres_changes frame is delivered as {table, eventType, new, old}');
ws.onmessage({ data: JSON.stringify({ event: 'system', topic: 'realtime:public:tasks', payload: { status: 'error', message: 'nope' } }) });
check(events[1] && events[1].type === 'error', 'a refused subscription is surfaced as {type:"error"}');
ws.onopen(); // second open on the same wrapper = reconnect
check(events[2] && events[2].type === 'resync', 'reconnect calls onChange({type:"resync"})');
rt.destroyRealtime();
check(ws.readyState === 3, 'destroyRealtime closes the socket');
let lateThrew = false;
try { ws.onerror?.(); ws.onclose?.(); } catch { lateThrew = true; }
check(!lateThrew, 'a socket error arriving after destroyRealtime is ignored, not a crash');

if (bad) { console.error(`${bad} check(s) failed`); process.exit(1); }
process.exit(0);
