// Old URLs keep working (spec C8, docs/route-inventory.md section 2 + ruling 12.4).
//   ?tab=<old>  ->  the new route;  unknown ?tab=  ->  /today;  #mx?<qs>  ->  /work/matrix?<qs>
let bad = 0;
const check = (c, m) => { console.log((c ? '  ok  ' : '  FAIL') + '  ' + m); if (!c) bad++; };
const { resolveLegacyUrl } = await import('../src/lib/legacy-urls.js');

// [search, hash, expected]
const table = [
  // every ?tab= value in the inventory
  ['?tab=home', '', '/today'],
  ['?tab=today', '', '/today'],
  ['?tab=tasks', '', '/work/matrix'],
  ['?tab=work', '', '/work/matrix'],
  ['?tab=initiatives', '', '/work/initiatives'],
  ['?tab=decide', '', '/work/decide'],
  ['?tab=leads', '', '/pipeline'],
  ['?tab=pipeline', '', '/pipeline'],
  ['?tab=contacts', '', '/contacts'],
  ['?tab=events', '', '/events'],
  ['?tab=analytics', '', '/analytics/overview'],   // ruling 12.4
  ['?tab=escalations', '', '/escalations'],
  ['?tab=profile', '', '/profile'],
  ['?tab=help', '', '/help'],
  ['?tab=expenses', '', '/expenses'],
  ['?tab=team', '', '/team'],
  ['?tab=hr-automation', '', '/hr-automation'],    // ruling 12.4
  // unknown values never 404
  ['?tab=bogus', '', '/today'],
  ['?tab=HOME', '', '/today'],
  ['?tab=constructor', '', '/today'],              // Object.prototype keys are not tabs
  ['?tab=__proto__', '', '/today'],
  ['?tab=%2Fadmin', '', '/today'],
  // the matrix hash
  ['', '#mx?s=pending&o=ABC', '/work/matrix?s=pending&o=ABC'],
  ['', '#mx?s=pending|in_progress&q=a%20b&od=1', '/work/matrix?s=pending|in_progress&q=a%20b&od=1'],
  ['', '#mx', '/work/matrix'],
  ['', '#mx?', '/work/matrix'],
  ['?tab=work', '#mx?s=pending&o=ABC', '/work/matrix?s=pending&o=ABC'],
  ['?tab=tasks', '#mx?c=A&f=B&k=cell&t=pivot&pv=priority', '/work/matrix?c=A&f=B&k=cell&t=pivot&pv=priority'],
  // nothing to convert
  ['', '', null],
  ['?', '', null],
  ['?tab=', '', null],
  ['?other=1', '', null],
  ['?scope=mine', '', null],
  ['', '#access_token=abc', null],
  ['', '#pair=ABCDEFGHJKMN', null],
  ['', '#mxfoo', null],
  ['', '#other?s=1', null],
  // the query string without the leading ?
  ['tab=help', '', '/help'],
  // no arguments at all
  [undefined, undefined, null],
];

for (const [search, hash, want] of table) {
  const got = resolveLegacyUrl(search, hash);
  check(got === want, `resolveLegacyUrl(${JSON.stringify(search)}, ${JSON.stringify(hash)}) -> ${JSON.stringify(want)}${got === want ? '' : '  (got ' + JSON.stringify(got) + ')'}`);
}

process.exit(bad ? 1 : 0);
