// computeAnalytics and the drill dialog against the OLD functions' output. tests/fixtures/analytics.expected.json
// was produced once by running rie-dashboard2/js/analytics.js (computeAnalytics + analyticsDrill) on
// tests/fixtures/analytics.state.json with the clock fixed at the fixture's `now`; nothing here regenerates it.
import { readFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';

const read = (n) => JSON.parse(readFileSync(new URL('./fixtures/' + n, import.meta.url), 'utf8'));
const input = read('analytics.state.json');
const expected = read('analytics.expected.json');

// fixed clock, as when the expectation was generated (the weekly labels depend on the current year)
const FIXED = Date.parse(input.now);
const RealDate = Date;
globalThis.Date = class extends RealDate {
  constructor(...a) { if (a.length === 0) super(FIXED); else super(...a); }
  static now() { return FIXED; }
};

const { computeAnalytics, drillView, drillLists, TABS, RANGES, DEFAULT_FILTERS } = await import('../src/lib/analytics.js');

let bad = 0;
const check = (c, m) => { console.log((c ? '  ok  ' : '  FAIL') + '  ' + m); if (!c) bad++; };

// the result is JSON-compared: the old result went through JSON.stringify too (Maps are already arrays)
const roundTrip = (x) => JSON.parse(JSON.stringify(x));
const state = { tasks: input.tasks, leads: input.leads, escalations: input.escalations };

for (const c of expected.cases) {
  const got = computeAnalytics(state, { ...DEFAULT_FILTERS, ...c.filters });
  check(isDeepStrictEqual(roundTrip(got), c.result), `computeAnalytics equals the old output: ${c.name}`);
  const keys = Object.keys(c.drills);
  const bodies = keys.map((k) => {
    const v = drillView(got, k);
    return [k, { title: v.title, ids: v.rows.map((t) => String(t.id)), empty: v.rows.length === 0 }];
  });
  check(isDeepStrictEqual(Object.fromEntries(bodies), c.drills), `drill dialogs equal the old ones (${keys.length} keys): ${c.name}`);
}

// the explicit `now` and the defaults
check(isDeepStrictEqual(roundTrip(computeAnalytics(state)), expected.cases[0].result), 'no filters = the defaults (30 days, all companies, everyone)');
const d2 = computeAnalytics(state, { range: '7' }, new RealDate('2026-11-17T12:00:00Z'));
check(d2.today === '2026-11-17' && d2.since === '2026-11-10', 'a given `now` moves today and the window');
check(isDeepStrictEqual(Object.keys(computeAnalytics({}, undefined)).sort(), Object.keys(expected.cases[0].result).sort()), 'an empty state gives the same shape');

// the drill: the 300 cap and the key parsing (a name may contain a colon)
const many = Array.from({ length: 305 }, (_, i) => ({ id: 'x' + i, task: 'T' + i, status: 'Pending', priority: 'P2', company: 'Co: A', func: 'F', assignedTo: 'P: Q', nextFollowUp: '2026-12-01', createdAt: '2026-11-01T12:00:00Z', updatedAt: '2026-11-09T12:00:00Z' }));
const big = computeAnalytics({ tasks: many });
const v = drillView(big, 'open');
check(v.rows.length === 300 && v.total === 305 && v.truncated && v.title === 'Open tasks · 305', 'the drill lists the first 300 of 305 and says so');
check(drillView(big, 'company:Co: A').title === 'Co: A: open tasks · 305', 'a colon inside a name stays in the name');
check(drillView(big, 'person:P: Q').total === 305, 'a person with a colon opens their list');
check(drillView(big, 'nope').title === 'Tasks · 0', 'an unknown key is an empty "Tasks"');
check(Object.keys(drillLists(big)).length === 8 + 3, 'drillLists: 8 counters + one list per person, company and function');

// tabs and ranges
check(isDeepStrictEqual(TABS.map(([, l]) => l), ['Overview', 'People', 'Companies & functions', 'Pipeline']), 'the four tab names');
check(isDeepStrictEqual(TABS.map(([k]) => k), ['overview', 'people', 'areas', 'pipeline']), 'the four tab segments');
check(isDeepStrictEqual(RANGES.map(([k]) => k), ['7', '30', '90', 'ALL']), 'the four ranges');

process.exit(bad ? 1 : 0);
