// Auth client: magic link, email code, session storage, refresh. fetch and
// localStorage are stubbed; nothing touches the network.
process.env.NEXT_PUBLIC_SB_URL = 'https://example.supabase.co';
process.env.NEXT_PUBLIC_SB_KEY = 'anon-key-123';

let bad = 0;
const check = (c, m) => { console.log((c ? '  ok  ' : '  FAIL') + '  ' + m); if (!c) bad++; };

// In-memory localStorage on globalThis.
const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => { mem.set(k, String(v)); },
  removeItem: (k) => { mem.delete(k); },
};

// fetch mock: queue of responders; every call is recorded.
const calls = [];
let responders = [];
const res = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
  text: async () => JSON.stringify(body),
});
globalThis.fetch = async (url, init) => {
  calls.push({ url: String(url), init });
  const r = responders.shift();
  if (!r) throw new Error('unexpected fetch ' + url);
  return typeof r === 'function' ? r(url, init) : r;
};
const reset = () => { calls.length = 0; responders = []; mem.clear(); };

const jwt = (payload) => {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64');
  return `${b64({ alg: 'HS256' })}.${b64(payload)}.sig`;
};

const auth = await import('../src/lib/auth.js');
const { getHeaders } = await import('../src/lib/config.js');
const SESSION_KEY = 'rie_session';
const DAY = 24 * 60 * 60 * 1000;

// ---- constants ------------------------------------------------------------
check(auth.OTP_LENGTH === 8, 'OTP_LENGTH is 8 (measured, not the documented 6)');

// ---- sendMagicLink --------------------------------------------------------
reset();
responders = [res(200, true), res(200, {})];
const loc = { origin: 'http://localhost:8080', pathname: '/login' };
await auth.sendMagicLink('a@b.co', loc);
check(calls.length === 2, 'sendMagicLink makes the allowlist preflight and the otp request');
check(calls[0].url === 'https://example.supabase.co/rest/v1/rpc/rie_email_allowed', 'preflight hits rpc/rie_email_allowed');
check(calls[1].url === 'https://example.supabase.co/auth/v1/otp?redirect_to=' + encodeURIComponent('http://localhost:8080/'),
  'otp request carries redirect_to = origin + "/" as a QUERY parameter (not pathname)');
const otpInit = calls[1].init;
const otpBody = JSON.parse(otpInit.body);
check(otpInit.method === 'POST' && otpBody.email === 'a@b.co' && otpBody.create_user === true, 'otp body is {email, create_user:true}');
check(otpInit.headers.apikey === 'anon-key-123', 'otp request sends the anon apikey');

reset();
responders = [res(200, false)];
let err = null;
try { await auth.sendMagicLink('x@y.co', loc); } catch (e) { err = e; }
check(err && /not authorised for BASE/.test(err.message) && calls.length === 1, 'allowlist says no: throws and never requests an otp');

reset();
responders = [res(500, {}), res(200, {})];
await auth.sendMagicLink('a@b.co', loc);
check(calls.length === 2, 'preflight failure (non-ok) falls through to the otp request');

reset();
responders = [res(200, true), res(429, { message: 'rate limited' })];
err = null;
try { await auth.sendMagicLink('a@b.co', loc); } catch (e) { err = e; }
check(err && err.message === 'rate limited', 'otp error surfaces the server message');

// ---- decodeSession / getSession ------------------------------------------
reset();
const token = jwt({ sub: 'u-1', email: 'jane.doe@example.com', user_metadata: { display_name: 'Jane D' } });
const s = auth.decodeSession(token, 'refresh-1');
check(s.userId === 'u-1' && s.email === 'jane.doe@example.com' && s.displayName === 'Jane D', 'decodeSession round-trips sub, email, display_name from the JWT');
check(s.accessToken === token && s.refreshToken === 'refresh-1', 'decodeSession keeps both tokens');
check(Math.abs(s.expiresAt - (Date.now() + 30 * DAY)) < 5000, 'decodeSession stamps a 30-day expiry');
check(JSON.parse(mem.get(SESSION_KEY)).userId === 'u-1', 'decodeSession persists under rie_session');

const noName = auth.decodeSession(jwt({ sub: 'u-2', email: 'sam@x.co' }), '');
check(noName.displayName === 'sam' && noName.refreshToken === '', 'displayName falls back to the email local part');

check(auth.getSession().userId === 'u-2', 'getSession returns the stored session');

// getSession: the old code NEVER returns null for a near-expiry session. It
// auto-extends anything expiring within 24 h back to 30 days (dev/offline
// resilience). The "expiresAt - 60s" in the old CLAUDE.md is stale documentation.
for (const secs of [59, 61]) {
  mem.set(SESSION_KEY, JSON.stringify({ accessToken: token, refreshToken: 'r', expiresAt: Date.now() + secs * 1000 }));
  const got = auth.getSession();
  check(got && got.accessToken === token, `getSession with expiresAt ${secs}s away returns the session (old behaviour: never null)`);
  check(Math.abs(got.expiresAt - (Date.now() + 30 * DAY)) < 5000, `  ... and extends expiry to ~30 days (${secs}s case)`);
  check(Math.abs(JSON.parse(mem.get(SESSION_KEY)).expiresAt - (Date.now() + 30 * DAY)) < 5000, `  ... and persists the extension (${secs}s case)`);
}
mem.set(SESSION_KEY, JSON.stringify({ accessToken: token, expiresAt: Date.now() + 10 * DAY }));
check(auth.getSession().expiresAt - Date.now() < 11 * DAY, 'expiry more than 24 h away is left alone');
mem.set(SESSION_KEY, JSON.stringify({ refreshToken: 'x' }));
check(auth.getSession() === null, 'getSession is null without an accessToken');
mem.set(SESSION_KEY, '{not json');
check(auth.getSession() === null, 'getSession is null on corrupt storage');
mem.clear();
check(auth.getSession() === null, 'getSession is null with no session');

auth.decodeSession(token, 'r');
auth.clearSession();
check(!mem.has(SESSION_KEY), 'clearSession removes rie_session');

// ---- parseAuthCallback ----------------------------------------------------
check(auth.parseAuthCallback({ hash: '#access_token=AT&refresh_token=RT&type=magiclink' }).accessToken === 'AT', 'parseAuthCallback reads access_token from the hash');
check(auth.parseAuthCallback({ hash: '#access_token=AT&refresh_token=RT' }).refreshToken === 'RT', '... and refresh_token');
check(auth.parseAuthCallback({ hash: '' }) === null, 'parseAuthCallback is null with no token');

// ---- verifyEmailCode ------------------------------------------------------
reset();
responders = [res(200, { access_token: token, refresh_token: 'RT' })];
const vs = await auth.verifyEmailCode('a@b.co', '1234 5678');
check(calls[0].url === 'https://example.supabase.co/auth/v1/verify', 'verifyEmailCode posts to /auth/v1/verify');
check(JSON.stringify(JSON.parse(calls[0].init.body)) === JSON.stringify({ type: 'email', email: 'a@b.co', token: '12345678' }),
  'verifyEmailCode body is {type:"email", email, token} with non-digits stripped');
check(vs.accessToken === token && vs.refreshToken === 'RT', 'verifyEmailCode returns and stores the session');
check(mem.has(SESSION_KEY), 'verifyEmailCode persisted the session');
auth.cancelAutoRefresh();

reset();
err = null;
try { await auth.verifyEmailCode('a@b.co', '123'); } catch (e) { err = e; }
check(err && err.message === 'Enter the 8-digit code from the email.' && calls.length === 0, 'too-short code is rejected locally, no request');
err = null;
try { await auth.verifyEmailCode('', '12345678'); } catch (e) { err = e; }
check(err && err.message === 'Enter your email address first.', 'missing email is rejected locally');
responders = [res(403, { error_code: 'otp_expired' })];
err = null;
try { await auth.verifyEmailCode('a@b.co', '12345678'); } catch (e) { err = e; }
check(err && /wrong or has expired/.test(err.message), 'otp_expired / 403 gives the wrong-or-expired sentence');

// ---- verifySignInLink / parseSignInLink ----------------------------------
check(auth.parseSignInLink('https://x.supabase.co/auth/v1/verify?token=TKN&type=magiclink&redirect_to=y').tokenHash === 'TKN', 'parseSignInLink extracts token from a pasted verify link');
check(auth.parseSignInLink('abcdefghijklmnopqrstuvwxyz').tokenHash === 'abcdefghijklmnopqrstuvwxyz', 'parseSignInLink accepts a bare token that looks like one');
check(auth.parseSignInLink('hello') === null, 'parseSignInLink rejects a stray word');
reset();
responders = [res(200, { access_token: token, refresh_token: 'RT' })];
await auth.verifySignInLink('https://x.supabase.co/auth/v1/verify?token=TKN&type=magiclink');
check(JSON.parse(calls[0].init.body).token_hash === 'TKN' && JSON.parse(calls[0].init.body).type === 'magiclink', 'verifySignInLink posts {type, token_hash}');
auth.cancelAutoRefresh();

// ---- refreshSession -------------------------------------------------------
// Refused refresh: the old code does NOT clear the session; it extends expiry
// and returns the stored session ("do not aggressively wipe").
reset();
mem.set(SESSION_KEY, JSON.stringify({ accessToken: token, refreshToken: 'RT', expiresAt: Date.now() + 1000 }));
responders = [res(400, { error: 'invalid_grant' })];
const kept = await auth.refreshSession();
check(calls[0].url === 'https://example.supabase.co/auth/v1/token?grant_type=refresh_token', 'refreshSession posts to /token?grant_type=refresh_token');
check(JSON.parse(calls[0].init.body).refresh_token === 'RT', '... with the stored refresh token');
check(kept && kept.accessToken === token && mem.has(SESSION_KEY), 'refused refresh keeps the session (old behaviour: no wipe)');
check(Math.abs(JSON.parse(mem.get(SESSION_KEY)).expiresAt - (Date.now() + 30 * DAY)) < 5000, 'refused refresh extends expiry to 30 days');

reset();
mem.set(SESSION_KEY, JSON.stringify({ accessToken: token, refreshToken: 'RT', expiresAt: Date.now() + 1000 }));
responders = [() => { throw new Error('offline'); }];
const offline = await auth.refreshSession();
check(offline && offline.accessToken === token, 'network error preserves and returns the stored session');

reset();
check((await auth.refreshSession()) === null && calls.length === 0, 'refreshSession with no session returns null without a request');

reset();
mem.set(SESSION_KEY, JSON.stringify({ accessToken: 'dev_abc', refreshToken: 'dev_r', expiresAt: 1 }));
const dev = await auth.refreshSession();
check(dev.expiresAt > Date.now() && calls.length === 0, 'dev_ tokens are kept alive locally, no request');

reset();
const newTok = jwt({ sub: 'u-9', email: 'new@x.co' });
mem.set(SESSION_KEY, JSON.stringify({ accessToken: token, refreshToken: 'RT', expiresAt: Date.now() + 1000 }));
responders = [res(200, { access_token: newTok, refresh_token: 'RT2' })];
const fresh = await auth.refreshSession();
check(fresh.accessToken === newTok && fresh.refreshToken === 'RT2' && JSON.parse(mem.get(SESSION_KEY)).accessToken === newTok, 'successful refresh stores the new tokens');
auth.cancelAutoRefresh();

reset();
mem.set(SESSION_KEY, JSON.stringify({ accessToken: token, refreshToken: 'RT', expiresAt: Date.now() + 1000 }));
responders = [async () => { await new Promise((r) => setTimeout(r, 20)); return res(400, {}); }];
await Promise.all([auth.refreshSession(), auth.refreshSession()]);
check(calls.length === 1, 'concurrent refreshSession calls share one in-flight request');

// ---- getHeaders (config.js) ----------------------------------------------
reset();
let h = await getHeaders();
check(h.Authorization === 'Bearer anon-key-123' && h.apikey === 'anon-key-123', 'getHeaders falls back to the anon key with no session');
check(h['Content-Type'] === 'application/json' && h.Prefer === 'return=representation', 'getHeaders carries Content-Type and Prefer');
mem.set(SESSION_KEY, JSON.stringify({ accessToken: 'USER-JWT', refreshToken: 'r', expiresAt: Date.now() + DAY }));
h = await getHeaders();
check(h.Authorization === 'Bearer USER-JWT' && h.apikey === 'anon-key-123', 'getHeaders uses the session JWT, apikey stays the anon key');
// Expiring within 5 min: silent refresh first.
reset();
mem.set(SESSION_KEY, JSON.stringify({ accessToken: token, refreshToken: 'RT', expiresAt: Date.now() + 60 * 1000 }));
responders = [res(200, { access_token: newTok, refresh_token: 'RT3' })];
h = await getHeaders();
check(h.Authorization === 'Bearer ' + newTok && calls.length === 1, 'getHeaders refreshes a token inside the 5-minute window and uses the new one');
auth.cancelAutoRefresh();

// ---- signOut --------------------------------------------------------------
reset();
auth.decodeSession(token, 'r');
responders = [res(204, {})];
await auth.signOut();
check(!mem.has(SESSION_KEY), 'signOut clears the session');
check(calls[0].url === 'https://example.supabase.co/auth/v1/logout' && calls[0].init.headers.Authorization === 'Bearer ' + token, 'signOut posts /logout with the session JWT');

reset();
auth.decodeSession('dev_x', 'r');
await auth.signOut();
check(calls.length === 0 && !mem.has(SESSION_KEY), 'signOut with a dev_ token clears locally and makes no request');

// ---- scheduleAutoRefresh: delay must fit setTimeout's 32-bit limit ---------
// The old code passed ~30 days (2.59e9 ms) which overflows, fires after ~1 ms and
// re-arms itself against /auth/v1/token. Deliberate deviation: clamp.
{
  reset();
  const warnings = [];
  const onWarn = (w) => warnings.push(w.name);
  process.on('warning', onWarn);
  const realSetTimeout = globalThis.setTimeout;
  const delays = [];
  globalThis.setTimeout = (fn, ms) => { delays.push(ms); return 0; };
  mem.set(SESSION_KEY, JSON.stringify({ accessToken: token, refreshToken: 'RT', expiresAt: Date.now() + 30 * DAY }));
  auth.scheduleAutoRefresh();
  globalThis.setTimeout = realSetTimeout;
  check(delays.length === 1 && delays[0] > 0 && delays[0] <= 2 ** 31 - 1, `30-day session: setTimeout delay (${delays[0]}) is > 0 and <= 2**31-1`);
  // And a real (unstubbed) timer with that session must not warn.
  auth.scheduleAutoRefresh();
  await new Promise((r) => realSetTimeout(r, 50));
  check(!warnings.includes('TimeoutOverflowWarning'), 'no TimeoutOverflowWarning emitted');
  process.off('warning', onWarn);
}

auth.cancelAutoRefresh();
if (bad) { console.error(`${bad} check(s) failed`); process.exit(1); }
process.exit(0);
