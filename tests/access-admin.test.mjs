// Access admin: the pure rules (person codes, validation, extras, companies) and the REST layer
// (reads, the admin-only write guard, error words, the payload paths), against the old js/access.js.
process.env.NEXT_PUBLIC_SB_URL = 'https://example.supabase.co';
process.env.NEXT_PUBLIC_SB_KEY = 'anon-key-123';
let bad = 0;
const check = (c, m) => { console.log((c ? '  ok  ' : '  FAIL') + '  ' + m); if (!c) bad++; };
console.warn = () => {};

const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => { mem.set(k, String(v)); },
  removeItem: (k) => { mem.delete(k); },
};
mem.set('rie_session', JSON.stringify({ accessToken: 'jwt-1', userId: 'u1', email: 'a@x.test' }));

const calls = [];
let respond = () => ({ ok: true, status: 200, body: [] });
globalThis.fetch = async (url, init = {}) => {
  calls.push({ url: String(url), method: init.method || 'GET', headers: init.headers, body: init.body ? JSON.parse(init.body) : undefined });
  const r = respond(String(url), init);
  return { ok: r.ok, status: r.status, json: async () => r.body, text: async () => (typeof r.body === 'string' ? r.body : JSON.stringify(r.body)) };
};

const aa = await import('../src/lib/access-admin.js');
const { store, createInitialState } = await import('../src/store/store.js');
const { isMoOpen, closeAllMo } = await import('../src/lib/modals.js');

const asAdmin = (admin = true) => { store.setState({ ...createInitialState(), access: { email: 'a@x.test', role: admin ? 'admin' : 'member', is_admin: admin, can_write: true }, accessLoaded: true }); calls.length = 0; closeAllMo(); };

// ---- person codes ----
check(aa.proposePersonCode('Anil Kumar', 'a@x.test') === 'ANIL', 'code = first name, letters only, upper-case');
check(aa.proposePersonCode('Anil', 'a@x.test', [{ code: 'ANIL' }]) === 'ANIL2', 'taken -> ANIL2');
check(aa.proposePersonCode('Anil', 'a@x.test', [{ code: 'ANIL' }, { code: 'ANIL2' }]) === 'ANIL3', '... ANIL3');
check(aa.proposePersonCode('J. R.', 'a@x.test') === 'J', 'punctuation is dropped');
check(aa.proposePersonCode('', 'sam.lee@x.test') === 'SAMLEE', 'no name: the e-mail local part');
check(aa.proposePersonCode('1234', '1234@x.test') === 'PERSON', 'nothing left: PERSON');
check(aa.proposePersonCode('Abcdefghijklmnopqrstuvwxyzabc', 'a@x.test').length === 24, 'capped at 24 letters');
check(aa.proposePersonCode('Zed', 'a@x.test', null) === 'ZED', 'no people list is fine');

// ---- validation, in the old order ----
const rows = [{ email: 'Taken@X.test' }];
check(aa.validateNewPerson({ email: 'nope', name: 'N', scope: 'assigned' }, rows) === 'That does not look like an email address.', 'bad address');
check(aa.validateNewPerson({ email: 'a b@x.co', name: 'N', scope: 'all' }, rows) === 'That does not look like an email address.', 'space in address');
check(aa.validateNewPerson({ email: 'taken@x.test', name: 'N', scope: 'all' }, rows) === 'That address already has access. Change their role below instead.', 'already has access (case-insensitive)');
check(aa.validateNewPerson({ email: 'n@x.test', name: '', scope: 'assigned' }, rows) === 'A name is needed so tasks can be assigned to them.', 'assigned scope needs a name');
check(aa.validateNewPerson({ email: 'n@x.test', name: '', scope: 'all' }, rows) === '', 'all scope needs no name');
check(aa.validateNewPerson({ email: 'n@x.test', name: 'N', scope: 'assigned' }, rows) === '', 'valid');

// ---- extras and companies ----
check(aa.nextExtras(['leads'], 'leads').length === 0 && aa.nextExtras(null, 'events').join() === 'events' && aa.nextExtras(['leads'], 'events').join() === 'leads,events', 'toggle an extra');
const all = ['A', 'B', 'C'];
check(aa.nextCompanies(null, all, 'B').value.join() === 'A,C', 'from "all", switching one off keeps the others');
check(aa.nextCompanies(['A', 'C'], all, 'B').value === null, 'switching the last one back on returns to null (= all)');
check(aa.nextCompanies(['A'], all, 'C').value.join() === 'A,C', 'adds one');
check(aa.nextCompanies(['A'], all, 'A').error === 'Someone must be able to see at least one company.', 'cannot hide the last company');
check(aa.nextCompanies(null, ['A'], 'A').error != null, 'one company in the world: cannot hide it either');

// ---- counts and "seen" ----
const tasks = [
  { status: 'Pending', ownerCode: 'P1' }, { status: 'In Progress', ownerCode: 'X', coOwnerCodes: ['P1'] },
  { status: 'On Hold', ownerCode: 'P1', archivedAt: '2026-01-01' }, { status: 'Completed', ownerCode: 'P1' }, { status: 'Pending', ownerCode: 'P2' },
];
check(aa.openCount(tasks, 'P1') === 2, 'open count: owned or co-owned, open statuses, not archived');
const now = Date.parse('2026-11-10T12:00:00Z');
check(aa.lastSeen({}, now) === 'Never signed in', 'never signed in');
check(aa.lastSeen({ last_sign_in_at: '2026-11-10T01:00:00Z' }, now) === 'Seen today', 'today');
check(aa.lastSeen({ last_sign_in_at: '2026-11-09T01:00:00Z' }, now) === 'Seen yesterday', 'yesterday');
check(aa.lastSeen({ last_sign_in_at: '2026-11-05T12:00:00Z' }, now) === 'Seen 5 days ago', 'days ago');
check(/^Seen /.test(aa.lastSeen({ last_sign_in_at: '2026-08-05T12:00:00Z' }, now)) && !/ago/.test(aa.lastSeen({ last_sign_in_at: '2026-08-05T12:00:00Z' }, now)), 'a date after 30 days');
check(aa.allowedUserPath('a+b@x.test') === 'rie_allowed_users?email=eq.a%2Bb%40x.test', 'the PATCH path encodes the e-mail');

// ---- openAccess: admins only ----
asAdmin(false);
check(aa.openAccess() === false && !isMoOpen('mo-access'), 'a non-admin cannot open it');
store.setState({ access: null });
check(aa.openAccess() === false, 'nor can someone whose access is unknown');
asAdmin(true);
check(aa.openAccess() === true && isMoOpen('mo-access'), 'an admin can');
aa.closeAccess();
check(!isMoOpen('mo-access'), 'closeAccess');

// ---- writes: guard, headers, error words ----
asAdmin(false);
let threw = '';
try { await aa.writeAccess('PATCH', 'rie_allowed_users?email=eq.x', { role: 'admin' }); } catch (e) { threw = e.message; }
check(threw === 'Only an admin can change who has access.' && calls.length === 0, 'a non-admin write is refused before any request');

asAdmin(true);
respond = () => ({ ok: true, status: 200, body: [{ ok: 1 }] });
const out = await aa.writeAccess('PATCH', 'rie_allowed_users?email=eq.x', { role: 'viewer' });
check(calls[0].method === 'PATCH' && calls[0].url === 'https://example.supabase.co/rest/v1/rie_allowed_users?email=eq.x', 'PATCH to the path');
check(calls[0].headers.Authorization === 'Bearer jwt-1' && calls[0].headers.Prefer === 'return=representation', 'under the caller JWT, return=representation');
check(JSON.stringify(calls[0].body) === '{"role":"viewer"}' && out[0].ok === 1, 'body and result');
await aa.writeAccess('PATCH', 'rie_allowed_users?email=eq.x');
check(calls[1].body === undefined, 'no body when none is given');

respond = () => ({ ok: false, status: 400, body: { message: 'Cannot demote the last admin', hint: 'h' } });
threw = ''; try { await aa.writeAccess('PATCH', 'p', {}); } catch (e) { threw = e.message; }
check(threw === 'Cannot demote the last admin', 'the database message is shown verbatim');
respond = () => ({ ok: false, status: 400, body: { hint: 'try this' } });
threw = ''; try { await aa.writeAccess('PATCH', 'p', {}); } catch (e) { threw = e.message; }
check(threw === 'try this', 'the hint when there is no message');
respond = () => ({ ok: false, status: 500, body: 'plain text failure' });
threw = ''; try { await aa.writeAccess('PATCH', 'p', {}); } catch (e) { threw = e.message; }
check(threw === 'plain text failure', 'raw text when it is not JSON');

// ---- reads ----
asAdmin(true);
respond = (url) => {
  if (url.includes('/rpc/rie_companies')) return { ok: true, status: 200, body: [{ company: 'Acme' }, 'Beta'] };
  if (url.includes('v_rie_access')) return { ok: true, status: 200, body: [{ email: 'a@x.test' }] };
  if (url.includes('/people')) return { ok: true, status: 200, body: [{ code: 'P1' }] };
  return { ok: true, status: 200, body: [] };
};
const data = await aa.fetchAccessData();
const urls = calls.map((c) => c.url.replace('https://example.supabase.co/rest/v1/', ''));
check(urls.includes('v_rie_access?order=active.desc,role.asc,display_name.asc'), 'reads v_rie_access in the old order');
check(urls.includes('rpc/rie_companies') && urls.includes('people?archived_at=is.null&order=code.asc'), 'reads rie_companies and people');
check(data.companies.join() === 'Acme,Beta' && data.rows.length === 1 && data.people[0].code === 'P1', 'companies from the data, rows, people');
respond = (url) => (url.includes('/rpc/rie_companies') ? { ok: false, status: 500, body: 'x' } : url.includes('/people') ? { ok: false, status: 500, body: 'x' } : { ok: true, status: 200, body: [] });
const data2 = await aa.fetchAccessData();
check(data2.companies.length === 0 && data2.people === null, 'a failing company or people read is not fatal');

check(aa.accessMessages.added('e', 'assigned', 'N') === 'e can sign in and will see tasks assigned to N' && aa.accessMessages.added('e', 'all', '') === 'e can now sign in', 'status words: add');
check(aa.accessMessages.scope('e', 'all') === 'e now sees all tasks' && aa.accessMessages.role('e', 'member') === 'e is now Editor', 'status words: scope, role');
check(aa.accessMessages.extras('e', []) === 'e sees only their tasks' && aa.accessMessages.extras('e', ['a', 'b']) === 'e can also see a, b', 'status words: extras');
check(aa.accessMessages.companies('e', null) === 'e can see all companies' && aa.accessMessages.companies('e', ['A']) === 'e can see A', 'status words: companies');
check(aa.accessMessages.active('e', true) === 'e restored' && aa.accessMessages.active('e', false) === 'e can no longer sign in', 'status words: revoke, restore');
check(aa.accessMessages.person('e', 'P') === 'e is P' && aa.accessMessages.person('e', '') === 'e is not linked to a person', 'status words: person');

if (bad) { console.error(`${bad} check(s) failed`); process.exit(1); }
console.log('all access-admin checks passed');
