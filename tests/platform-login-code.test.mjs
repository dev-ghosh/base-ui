// Installed-app session handoff codes (port of exportLoginCode / importLoginCode).
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
const jwt = (payload) => {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64');
  return `${b64({ alg: 'HS256' })}.${b64(payload)}.sig`;
};
const { exportLoginCode, importLoginCode } = await import('../src/lib/platform.js');
const throwsMsg = (fn) => { try { fn(); return ''; } catch (e) { return e.message; } };

check(exportLoginCode() === null, 'export with no session is null');

const at = jwt({ sub: 'u1', email: 'a@example.com' });
mem.set('rie_session', JSON.stringify({ accessToken: at, refreshToken: 'rt', expiresAt: Date.now() + 9e9 }));
const code = exportLoginCode();
check(typeof code === 'string' && /^[A-Za-z0-9_-]+$/.test(code), 'export gives a base64url string');

mem.clear();
const s = importLoginCode(`  ${code.slice(0, 10)}\n${code.slice(10)} `);
check(s.accessToken === at && s.refreshToken === 'rt', 'import round-trips (whitespace tolerated)');
check(JSON.parse(mem.get('rie_session')).accessToken === at, 'import stores rie_session');

check(throwsMsg(() => importLoginCode('')) === 'Paste the login code first.', 'empty input sentence');
check(throwsMsg(() => importLoginCode('!!!not-a-code')) === 'That does not look like a login code.', 'garbage sentence');
const b64u = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
check(throwsMsg(() => importLoginCode(b64u({ v: 2, a: 'x', t: Date.now() }))) === 'Unrecognised login code.', 'wrong version sentence');
check(throwsMsg(() => importLoginCode(b64u({ v: 1, a: at, r: '', t: Date.now() - 11 * 60 * 1000 }))) === 'That login code has expired — send a new magic link.', 'older than 10 minutes is refused');

process.exit(bad ? 1 : 0);
