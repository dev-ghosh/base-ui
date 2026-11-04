// Warmth: label thresholds, and the score (pure given contact, now, tasks).
import { warmthLabel, computeWarmth } from '../src/lib/warmth.js';
import { store } from '../src/store/store.js';

let bad = 0;
const check = (c, m) => { console.log((c ? '  ok  ' : '  FAIL') + '  ' + m); if (!c) bad++; };

check(warmthLabel(70) === 'Hot',  'warmthLabel(70) is Hot');
check(warmthLabel(45) === 'Warm', 'warmthLabel(45) is Warm');
check(warmthLabel(20) === 'Cool', 'warmthLabel(20) is Cool');
check(warmthLabel(19) === 'Cold', 'warmthLabel(19) is Cold');

const now = new Date(2026, 10, 4, 15, 30); // 4 Nov 2026, local
store.setState({ tasks: [] });
check(computeWarmth(null, now) === 0, 'no contact scores 0');
check(computeWarmth({ id: 1, priority: 'A' }, now) === 40, 'priority A is 40');
check(computeWarmth({ id: 1, category: 'Investors' }, now) === 30, 'investor category is 30 without a priority');
check(computeWarmth({ id: 1, priority: 'B', lastMtg: '2026-10-20', nextStep: ' x ', keyInputs: 'y' }, now) === 25 + 30 + 15 + 10,
  'recent meeting (<=30d from now) + next step + key inputs add up');
check(computeWarmth({ id: 1, lastMtg: '2026-06-01' }, now) === 10, 'meeting 156d before now (91-365d) scores 10');

// Task bonus comes from the store's tasks unless passed in.
const c = { id: 5 };
store.setState({ tasks: [{ contactId: 5, status: 'Pending', priority: 'P1', nextFollowUp: '2026-12-01' }] });
check(computeWarmth(c, now) === 25, 'open P1 task for the contact adds 25 (tasks read from the store)');
store.setState({ tasks: [{ contactId: 5, status: 'Pending', priority: 'P3', nextFollowUp: '2026-11-01' }] });
check(computeWarmth(c, now) === 20, 'overdue (relative to now) open task adds 20');
store.setState({ tasks: [{ contactId: 5, status: 'Completed', priority: 'P1', nextFollowUp: '2026-11-01' }] });
check(computeWarmth(c, now) === 0, 'completed tasks add nothing');
check(computeWarmth(c, now, [{ contactId: 5, status: 'Pending', priority: 'P2', nextFollowUp: '2026-11-01' }]) === 22,
  'explicit tasks argument overrides the store (P2 overdue = 22)');

console.log(bad ? `\n${bad} FAILED\n` : '\nwarmth ok\n');
process.exit(bad ? 1 : 0);
