// Profile: sections <-> route segments, the remembered section, the access summary, the prefs rules.
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

const m = await import('../src/features/profile/model.js');
const prefsLib = await import('../src/lib/prefs.js');
const { store, createInitialState } = await import('../src/store/store.js');

// ---- sections and segments ----
check(m.SECTIONS.map((s) => s.label).join() === 'Profile,Notifications,Appearance,Security', 'four sections, first one still labelled "Profile"');
check(m.SECTIONS.map((s) => s.segment).join() === 'general,notifications,appearance,security', 'segments: general, notifications, appearance, security');
check(m.segmentOfStored('profile') === 'general', 'the old stored value "profile" is the general segment');
check(m.segmentOfStored('security') === 'security' && m.segmentOfStored('general') === 'general', 'other stored values map to themselves');
check(m.segmentOfStored(null) === 'general' && m.segmentOfStored('nope') === 'general', 'nothing or junk stored -> general');
check(m.storedOfSegment('general') === 'profile' && m.storedOfSegment('appearance') === 'appearance', 'the old app reads back what we write');
check(m.readStoredSegment() === 'general', 'nothing stored: general');
m.rememberSegment('notifications');
check(mem.get('rie_profile_tab') === 'notifications' && m.readStoredSegment() === 'notifications', 'rie_profile_tab is kept in sync');
m.rememberSegment('general');
check(mem.get('rie_profile_tab') === 'profile', 'general is stored as the old id "profile"');
check(m.isProfileSegment('security') && !m.isProfileSegment('profile'), 'isProfileSegment');

// ---- access summary ----
const a = m.accessSummary({ role: 'member', task_scope: 'assigned', extra_access: ['leads', 'zzz'], companies: ['Acme'] });
check(a.role.label === 'Editor' && a.scope.label === 'Assigned only', 'role and scope words');
check(a.extras.join() === 'Leads,zzz' && a.companies.join() === 'Acme', 'extras (unknown kept) and companies');
check(m.accessSummary({ companies: [] }).companies === null && m.accessSummary(null).role === null, 'empty companies = all; no access row = nothing');
check(m.formatExpiry(null) === '—' && /Nov/.test(m.formatExpiry('2026-11-05T10:00:00Z')), 'formatExpiry');

// ---- prefs rules ----
check(prefsLib.hourLabel(0) === '12:00 am' && prefsLib.hourLabel(8) === '8:00 am' && prefsLib.hourLabel(12) === '12:00 pm' && prefsLib.hourLabel(23) === '11:00 pm', 'digest hour labels');
check(prefsLib.prefsOf({ prefs: null }).digest_hour === 8 && prefsLib.prefsOf({ prefs: { phone: '1' } }).phone === '1', 'prefsOf = defaults + stored');
check(prefsLib.avatarColourOf({ avatar_tone: 'sky' }) === '#5B93D3' && prefsLib.avatarColourOf({ avatar_tone: 'x' }) === '#D97757' && prefsLib.avatarColourOf(null) === '#D97757', 'avatar colour, clay by default');

// fetch stub
const calls = [];
let mode = 'ok';
globalThis.fetch = async (url, init = {}) => {
  calls.push({ url: String(url), method: init.method || 'GET', body: init.body ? JSON.parse(init.body) : undefined, headers: init.headers });
  if (mode === 'down') throw new TypeError('Failed to fetch');
  if (mode === 'missing') return { ok: false, status: 404, json: async () => ({}), text: async () => 'no table' };
  if ((init.method || 'GET') === 'GET') return { ok: true, status: 200, json: async () => [{ email: 'me@x.test', job_title: 'Head', phone: '99' }], text: async () => '' };
  return { ok: true, status: 201, json: async () => ({}), text: async () => '' };
};
const signIn = (id) => mem.set('rie_session', JSON.stringify({ accessToken: 't', userId: id, email: 'me@x.test' }));
const reset = () => { store.setState({ ...createInitialState(), access: { email: 'Me@X.test', can_write: true } }); calls.length = 0; mode = 'ok'; signIn('u1'); };

// ---- load: the row wins over this device's copy ----
reset();
mem.set('rie_prefs:me@x.test', JSON.stringify({ job_title: 'old', avatar_tone: 'sage' }));
await prefsLib.loadPrefs();
check(calls.length === 1 && calls[0].url === 'https://example.supabase.co/rest/v1/user_prefs?email=eq.me%40x.test&limit=1', 'loadPrefs reads own row by e-mail');
check(store.getState().prefs.job_title === 'Head' && store.getState().prefs.avatar_tone === 'sage' && store.getState().prefsRemote === true, 'row over local, local fills the gaps, remote = true');

// ---- load fails: device only ----
reset(); mode = 'missing';
mem.set('rie_prefs:me@x.test', JSON.stringify({ phone: '5' }));
await prefsLib.loadPrefs();
check(store.getState().prefs.phone === '5' && store.getState().prefsRemote === false, 'no table: this device copy, remote = false');

// ---- save: whole row, upsert on email, no last_digest_at ----
reset();
await prefsLib.loadPrefs(); calls.length = 0;
store.setState({ prefs: { ...store.getState().prefs, last_digest_at: 'x' } });
const msg = await prefsLib.setPref('digest_hour', '9');
const post = calls.find((c) => c.method === 'POST');
check(msg === 'Saved' && post.url.endsWith('/rest/v1/user_prefs?on_conflict=email'), 'save is a POST upsert on email');
check(post.headers.Prefer === 'resolution=merge-duplicates,return=minimal', 'Prefer: merge-duplicates');
check(post.body.email === 'me@x.test' && post.body.digest_hour === 9 && post.body.email_enabled === true && !('last_digest_at' in post.body) && typeof post.body.updated_at === 'string', 'body: email, number hour, every pref, no last_digest_at, updated_at');
check(JSON.parse(mem.get('rie_prefs:me@x.test')).digest_hour === 9, 'this device keeps a copy');
check(prefsLib.prefsFlagStore.getState().msg === 'Saved', 'the flag says Saved');

// ---- save when the table is not there: device only, and no more requests ----
reset(); mode = 'missing';
await prefsLib.loadPrefs(); calls.length = 0;
check(await prefsLib.setPref('phone', '1') === 'Saved on this device' && calls.length === 0, 'device-only mode sends nothing');
reset(); await prefsLib.loadPrefs(); mode = 'down'; calls.length = 0;
check(await prefsLib.setPref('phone', '1') === 'Saved on this device only' && store.getState().prefsRemote === false, 'a failed save falls back to device only');

// ---- text prefs are debounced and trimmed ----
reset(); await prefsLib.loadPrefs(); calls.length = 0;
prefsLib.setPrefText('job_title', ' Chief ');
check(calls.length === 0, 'text is not sent while typing');
await new Promise((r) => setTimeout(r, 520));
check(calls.find((c) => c.method === 'POST')?.body.job_title === 'Chief', 'sent once after 450 ms, trimmed');

// ---- R25: a sign-out drops prefs; a late answer for the old person lands nowhere ----
reset();
const slow = prefsLib.loadPrefs();
const { onSessionEnded } = await import('../src/lib/user-data.js');
mem.delete('rie_session'); onSessionEnded();
await slow;
check(store.getState().prefs === null && store.getState().prefsRemote === null, 'sign-out clears prefs; the stale load writes nothing');

// ---- test e-mail ----
reset();
const ok = await prefsLib.sendTestEmail();
const t = calls.find((c) => c.url.endsWith('/functions/v1/send-alerts'));
check(ok.ok && t.body.mode === 'test' && /Sent to me@x.test/.test(ok.message), 'test e-mail: POST send-alerts {mode: test}');

if (bad) { console.error(`${bad} check(s) failed`); process.exit(1); }
console.log('all profile checks passed');
