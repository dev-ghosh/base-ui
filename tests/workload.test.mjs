// Team workload: computeWorkload against the OLD function's output (tests/fixtures/workload.expected.json, produced
// once by running rie-dashboard2/js/workload.js on tests/fixtures/workload.state.json with the clock fixed), plus the
// threshold edges worked out by hand.
import { readFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';

const read = (n) => JSON.parse(readFileSync(new URL('./fixtures/' + n, import.meta.url), 'utf8'));
const input = read('workload.state.json');
const expected = read('workload.expected.json');

const FIXED = Date.parse(input.now);
const RealDate = Date;
globalThis.Date = class extends RealDate {
  constructor(...a) { if (a.length === 0) super(FIXED); else super(...a); }
  static now() { return FIXED; }
};

const { computeWorkload, WORKLOAD_THRESHOLDS } = await import('../src/lib/workload.js');
const { store } = await import('../src/store/store.js');
store.setState({ people: input.people });

let bad = 0;
const check = (c, m) => { console.log((c ? '  ok  ' : '  FAIL') + '  ' + m); if (!c) bad++; };

check(isDeepStrictEqual(WORKLOAD_THRESHOLDS, expected.thresholds), 'the thresholds are the old ones (5, 12, 18, 25)');
const rows = computeWorkload(input.tasks).map(({ tasks, ...r }) => ({ ...r, taskIds: tasks.map((t) => t.id) }));
check(isDeepStrictEqual(rows, expected.rows), `computeWorkload equals the old output (${rows.length} people)`);
check(expected.rows.map((r) => r.status).join() === 'Critical,Heavy,Active,Normal,Normal,Normal,Normal,Normal', 'the fixture covers every status band');

// hand-worked edges
const mk = (n, o = {}) => Array.from({ length: n }, (_, i) => ({ id: `${o.who}${i}`, status: 'Pending', priority: 'P2', nextFollowUp: '', assignedTo: o.who, ...o }));
const band = (n) => computeWorkload(mk(n, { who: 'X' }), { codeOf: () => '' })[0];
check([band(11).status, band(12).status, band(17).status, band(18).status, band(24).status, band(25).status].join() === 'Normal,Active,Active,Heavy,Heavy,Critical', 'bands start at 12, 18 and 25');
check(band(30).score === 100 && band(1).score === 4 && band(13).score === 52, 'score is open/25, capped at 100');
check(band(12).barColor === 'var(--cold, #3b82f6)' && band(1).barColor === 'var(--gr, #22c55e)', 'bar colours');

// overdue / p1 rules
const one = (o) => computeWorkload([{ id: 1, status: 'Pending', priority: 'P2', assignedTo: 'A', nextFollowUp: '', ...o }], { now: new RealDate('2026-11-10T12:00:00'), codeOf: () => 'AA' })[0];
check(one({ nextFollowUp: '2026-11-10' }).overdue === 0 && one({ nextFollowUp: '2026-11-09' }).overdue === 1, 'due today is not overdue; yesterday is');
check(one({ isOverdue: true }).overdue === 1, 'the isOverdue flag counts');
check(one({ priority: 'P1' }).p1 === 1 && one({ priority: 'A' }).p1 === 1 && one({ priority: 'P2' }).p1 === 0, 'P1 and A count as P1');
check(one({}).ownerCode === 'AA', 'the owner code comes from the people list');
check(computeWorkload([{ id: 1, status: 'Completed', assignedTo: 'A' }, { id: 2, status: 'Dropped', assignedTo: 'A' }]).length === 0, 'completed and dropped are not workload');
check(computeWorkload(undefined).length === 0, 'no tasks, no rows');

process.exit(bad ? 1 : 0);
