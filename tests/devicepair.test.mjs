// Device pairing client: code parsing and the exact request contract of the
// `device-pair` edge function. fetch and localStorage are stubbed; the real
// backend is never called.
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
const res = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
globalThis.fetch = async (url, init) => {
  calls.push({ url: String(url), init, body: JSON.parse(init.body) });
  const r = responders.shift();
  if (!r) throw new Error('unexpected fetch ' + url);
  if (r instanceof Error) throw r;
  return r;
};
const reset = () => { calls.length = 0; responders = []; mem.clear(); };
const jwt = (payload) => {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64');
  return `${b64({ alg: 'HS256' })}.${b64(payload)}.sig`;
};
const signedIn = () => mem.set('rie_session', JSON.stringify({ accessToken: 'tok-1', refreshToken: 'r', expiresAt: Date.now() + 9e9 }));
const errOf = async (p) => { try { await p; return ''; } catch (e) { return e.message; } };

const dp = await import('../src/lib/devicepair.js');
const FN = 'https://example.supabase.co/functions/v1/device-pair';

console.log('\ncode shape');
check(dp.formatPairCode('abcdefghjklm') === 'ABCDE-FGHJKLM', 'formatPairCode groups 5-7 and upper-cases');
check(dp.formatPairCode('ABC') === 'ABC', 'formatPairCode leaves a partial code alone');
check(dp.formatPairCode(null) === '', 'formatPairCode(null) is empty');
check(dp.cleanPairCode(' abcde-fghjklm\n') === 'ABCDEFGHJKLM', 'cleanPairCode strips separators and upper-cases');
check(dp.parsePairPayload('#pair=ABCDEFGHJKLM') === 'ABCDEFGHJKLM', 'parsePairPayload reads a hash');
check(dp.parsePairPayload('https://x.test/#pair=abcde-fghjklm') === 'ABCDEFGHJKLM', 'parsePairPayload reads a pasted URL with dashes');
check(dp.parsePairPayload('ABCDE-FGHJKLM') === 'ABCDEFGHJKLM', 'parsePairPayload accepts a bare code');
check(dp.parsePairPayload('#pair=SHORT') === null, 'parsePairPayload rejects a wrong length');
check(dp.parsePairPayload('#access_token=abc') === null, 'parsePairPayload ignores other hashes');
check(dp.parsePairPayload('') === null && dp.parsePairPayload(null) === null, 'parsePairPayload(empty) is null');
check(dp.pairUrl('abcde-fghjklm', { origin: 'https://app.test', pathname: '/profile' }) === 'https://app.test/#pair=ABCDEFGHJKLM',
  'pairUrl always targets the site root (spec C13), code in the fragment');

console.log('\ntakePairFromUrl');
{
  const hist = [];
  const loc = { hash: '#pair=ABCDEFGHJKLM', pathname: '/', search: '?tab=work' };
  const history = { replaceState: (...a) => hist.push(a) };
  check(dp.takePairFromUrl(loc, history) === 'ABCDEFGHJKLM', 'returns the code');
  check(hist.length === 1 && hist[0][2] === '/?tab=work', 'clears the hash, keeps path and query');
  const hist2 = [];
  check(dp.takePairFromUrl({ hash: '#foo', pathname: '/', search: '' }, { replaceState: (...a) => hist2.push(a) }) === null
    && hist2.length === 0, 'no pair code: returns null and leaves the URL alone');
}

console.log('\nedge function contract');
{
  reset(); signedIn();
  responders = [res(200, { pairingId: 'p1', code: 'ABCDEFGHJKLM', expiresAt: '2030-01-01T00:00:00Z' })];
  const out = await dp.startPairing();
  const c = calls[0];
  check(out.pairingId === 'p1', 'start returns the pairing');
  check(c.url === FN, 'start posts to /functions/v1/device-pair');
  check(c.init.method === 'POST', 'start is a POST');
  check(JSON.stringify(c.body) === JSON.stringify({ action: 'start' }), 'start body is {action:"start"}');
  check(c.init.headers.Authorization === 'Bearer tok-1' && c.init.headers.apikey === 'anon-key-123', 'start sends the user JWT and the anon apikey');
  check(c.init.headers['Content-Type'] === 'application/json', 'start sends JSON');

  reset(); signedIn();
  responders = [res(200, { found: true, claimed: false })];
  await dp.pairingStatus('p1');
  check(JSON.stringify(calls[0].body) === JSON.stringify({ action: 'status', pairingId: 'p1' }) && calls[0].init.headers.Authorization === 'Bearer tok-1',
    'status sends {action,pairingId} with auth');

  reset(); signedIn();
  responders = [res(200, { ok: true })];
  await dp.cancelPairing('p1');
  check(JSON.stringify(calls[0].body) === JSON.stringify({ action: 'cancel', pairingId: 'p1' }) && calls[0].init.headers.Authorization === 'Bearer tok-1',
    'cancel sends {action,pairingId} with auth');

  reset(); signedIn();
  responders = [res(500, { error: 'x' })];
  let threw = false;
  try { await dp.cancelPairing('p1'); } catch { threw = true; }
  check(!threw, 'cancel never throws (best effort)');

  reset();
  let msg = await errOf(dp.startPairing());
  check(msg === 'Sign in on this device first.' && calls.length === 0, 'start without a session throws and does not call the network');

  reset(); signedIn();
  responders = [res(401, { error: 'Sign in on this device first.' })];
  msg = await errOf(dp.startPairing());
  check(msg === 'Sign in on this device first.', 'a server error message is surfaced');

  reset(); signedIn();
  const bad502 = res(502, null);
  bad502.json = async () => { throw new Error('not json'); };
  responders = [bad502];
  msg = await errOf(dp.startPairing());
  check(msg === 'Pairing failed (502)', 'a non-JSON error falls back to "Pairing failed (status)"');

  reset(); signedIn();
  responders = [new Error('offline')];
  msg = await errOf(dp.startPairing());
  check(msg === 'No connection. Check the network and try again.', 'a network failure gets the offline sentence');
}

console.log('\nclaim');
{
  reset();
  const at = jwt({ sub: 'u1', email: 'a.b@example.com' });
  responders = [res(200, { access_token: at, refresh_token: 'rt-1', expires_in: 3600, email: 'a.b@example.com' })];
  const s = await dp.claimPairing('abcde-fghjklm');
  const c = calls[0];
  check(JSON.stringify(c.body) === JSON.stringify({ action: 'claim', code: 'ABCDEFGHJKLM' }), 'claim sends the cleaned 12-char code');
  check(!('Authorization' in c.init.headers), 'claim is unauthenticated (no Authorization header)');
  check(c.init.headers.apikey === 'anon-key-123', 'claim still sends the anon apikey');
  check(s.email === 'a.b@example.com' && JSON.parse(mem.get('rie_session')).accessToken === at, 'claim stores the session in rie_session');

  reset();
  let msg = await errOf(dp.claimPairing('ABC'));
  check(msg === 'A pairing code is 12 characters.' && calls.length === 0, 'a short code is refused before any request');

  reset();
  responders = [res(400, { error: 'That pairing code is wrong, used, or expired. Show a new QR code.' })];
  msg = await errOf(dp.claimPairing('ABCDEFGHJKLM'));
  check(msg.startsWith('That pairing code is wrong') && !mem.has('rie_session'), 'a refused claim surfaces the server sentence and stores nothing');
}

console.log('\nUA text + QR model');
check(dp.describeUa('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)') === 'on an iPhone', 'describeUa iPhone');
check(dp.describeUa('Mozilla/5.0 (Windows NT 10.0)') === 'on Windows', 'describeUa Windows');
check(dp.describeUa('') === '' && dp.describeUa('curl/8') === '', 'describeUa unknown is empty');
{
  const m = await dp.buildQr('https://base.example.com/#pair=ABCDEFGHJKLM');
  check(m.size > 8 && m.d.startsWith('M') && m.d.includes('h1v1h-1z'), 'buildQr returns a size and one SVG path');
}

process.exit(bad ? 1 : 0);
