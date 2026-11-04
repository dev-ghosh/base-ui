// The root page must not turn arbitrary hash junk into a stored session.
let bad = 0;
const check = (c, m) => { console.log((c ? '  ok  ' : '  FAIL') + '  ' + m); if (!c) bad++; };
const { looksLikeAccessToken } = await import('../src/lib/signin-callback.js');
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = (payload) => `${b64({ alg: 'HS256' })}.${b64(payload)}.sig`;

check(looksLikeAccessToken(jwt({ sub: 'u1', email: 'a@example.com' })) === true, 'a three-part token with a JSON payload is accepted');
check(looksLikeAccessToken(jwt({ sub: 'u1' })) === true, 'payload without an email is accepted');
check(looksLikeAccessToken('garbage') === false, '"garbage" is rejected');
check(looksLikeAccessToken('') === false && looksLikeAccessToken(null) === false && looksLikeAccessToken(undefined) === false, 'empty/null is rejected');
check(looksLikeAccessToken('a.b.c') === false, 'three dotted words that are not JSON are rejected');
check(looksLikeAccessToken(`${b64({ alg: 'x' })}.${Buffer.from('"str"').toString('base64url')}.sig`) === false, 'a payload that is not an object is rejected');
check(looksLikeAccessToken(`${b64({ alg: 'x' })}.${b64({ sub: 'u' })}.`) === false, 'a missing signature segment is rejected');
check(looksLikeAccessToken('dev_mock_token') === false, 'dev/mock tokens are not accepted from a URL');

process.exit(bad ? 1 : 0);
