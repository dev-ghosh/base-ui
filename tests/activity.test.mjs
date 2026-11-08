// Activity feed: buildActivityFeed against the OLD getActivityFeed output (tests/fixtures/activity.expected.json,
// produced once by running rie-dashboard2/js/activity.js, recordActivity included, with the clock fixed), and
// recordActivity's writes against what the old one stored. timeAgo and the row styling are worked out by hand.
import { readFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';

const read = (n) => JSON.parse(readFileSync(new URL('./fixtures/' + n, import.meta.url), 'utf8'));
const input = read('activity.state.json');
const expected = read('activity.expected.json');

let fixed = Date.parse(input.now);
const RealDate = Date;
globalThis.Date = class extends RealDate {
  constructor(...a) { if (a.length === 0) super(fixed); else super(...a); }
  static now() { return fixed; }
};
const mem = {};
globalThis.localStorage = { getItem: (k) => mem[k] ?? null, setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; } };

const A = await import('../src/lib/activity.js');
const { store } = await import('../src/store/store.js');

let bad = 0;
const check = (c, m) => { console.log((c ? '  ok  ' : '  FAIL') + '  ' + m); if (!c) bad++; };

// ---- the merged feed ----
const now = new RealDate(input.now);
const feed = A.buildActivityFeed({ stored: input.stored, tasks: input.tasks, history: input.history, now })
  .map((a) => ({ ...a, time: a.time.toISOString() }));
check(feed.length === 60 && expected.feed.length === 60, 'the feed is capped at 60');
check(isDeepStrictEqual(feed, expected.feed), 'buildActivityFeed equals the old getActivityFeed (stored + tasks + history, dedupe, sort)');
const names = (f) => f.map((a) => a.id);
check(!names(feed).includes('act_task_t7'), 'two tasks with the same person, action, target and hour appear once');
check(names(feed).includes('act_task_t8'), '... and again in the next hour');
check(feed.filter((a) => a.target === 'Budget plan').length === 1, 'recorded events in the same minute appear once');

// ---- recording ----
store.setState({ currentUser: input.currentUser });
const rec = (iso, ...args) => { fixed = Date.parse(iso); A.recordActivity(...args); };
const v0 = A.activityStore.getState().version;
rec('2026-11-10T11:58:00Z', 'marked completed', 'Ship the report', 'Asha Rao', 'task');
rec('2026-11-10T11:30:10Z', 'moved to In Progress', 'Review contract', undefined, 'task');
rec('2026-11-10T09:00:00Z', 'created new deliverable', '  Budget plan ', ' Ben Cole ', 'task');
rec('2026-11-10T09:00:30Z', 'created new deliverable', 'Budget plan', 'Ben Cole', 'task');
rec('2026-11-08T12:00:00Z', 'updated deliverable', '', 'Cy Dunn', 'task');
rec('2026-09-01T12:00:00Z', 'moved to On Hold', 'Old thing', 'Dee Eve', 'task');
const stored = A.getStoredActivities();
const noId = (l) => l.map(({ id, ...r }) => r);
check(isDeepStrictEqual(noId(stored), noId(expected.stored)), 'recordActivity stores what the old one stored (newest first, trimmed, defaults)');
check(stored.every((s) => /^act_\d+_[a-z0-9]{1,4}$/.test(s.id)), 'entry ids look like act_<ms>_<4 chars>');
check(A.activityStore.getState().version === v0 + 6, 'every record bumps the store version (an open panel redraws)');
for (let i = 0; i < 110; i++) A.recordActivity('x', 't' + i, 'p');
check(A.getStoredActivities().length === 100, 'only the newest 100 are kept');
check(A.getStoredActivities()[0].target === 't109', '... newest first');

// ---- getActivityFeed reads the store and storage ----
store.setState({ tasks: [{ id: 'z', task: 'Zed', status: 'Completed', assignedTo: 'Zoe', updatedAt: '2026-11-10T11:59:00Z' }], history: undefined });
fixed = Date.parse(input.now);
const live = A.getActivityFeed(new RealDate(input.now));
check(live.length === 60, 'getActivityFeed merges storage and the store (capped at 60)');
check(live.some((a) => a.id === 'act_task_z' && a.person === 'Zoe'), '... including the store tasks');

// ---- sign-out forgets it (R25) ----
A.clearActivity();
check(A.getStoredActivities().length === 0 && !('rie_activity_stream' in mem), 'clearActivity removes the stream');
mem.rie_activity_stream = '{not json';
check(isDeepStrictEqual(A.getStoredActivities(), []), 'an unreadable stream is an empty one');
const failing = { getItem: () => { throw new Error('no'); }, setItem: () => { throw new Error('full'); }, removeItem: () => { throw new Error('no'); } };
globalThis.localStorage = failing;
let threw = false;
try { A.recordActivity('a', 'b', 'c'); A.clearActivity(); } catch { threw = true; }
check(!threw, 'unavailable storage never fails the write that called recordActivity');

// ---- timeAgo ----
const at = (s) => new RealDate(Date.parse(input.now) - s * 1000);
check(A.timeAgo(at(0), now) === 'just now' && A.timeAgo(at(59), now) === 'just now', 'under a minute is "just now"');
check(A.timeAgo(at(60), now) === '1m ago' && A.timeAgo(at(3599), now) === '59m ago', 'minutes');
check(A.timeAgo(at(3600), now) === '1h ago' && A.timeAgo(at(86399), now) === '23h ago', 'hours');
check(A.timeAgo(at(86400), now) === '1d ago' && A.timeAgo(at(29 * 86400 + 3600), now) === '29d ago', 'days');
check(A.timeAgo(at(30 * 86400), now) === at(30 * 86400).toLocaleDateString(), 'thirty days or more is the local date');
check(A.timeAgo(at(-120), now) === 'just now', 'a time in the future is "just now"');

// ---- row styling ----
const k = (action, status) => A.activityKind({ action, status });
check(k('marked completed').isCompleted && k('x', 'Completed').isCompleted && !k('moved to Completed').isCompleted, 'completed: action contains "complete" (lower case: "moved to Completed" is not), or status Completed');
check(k('actively working on').isProgress && k('moved to In Progress').isProgress && !k('set to pending').isProgress, 'progress: "working" or "Progress"');
check(k('marked completed').dotColor === 'var(--ac,#D97757)' && k('actively working on').dotColor === 'var(--cold,#74ABE2)' && k('set to pending').dotColor === 'var(--sf4,#71717a)', 'dot colours');
check(k('moved to In Progress', 'Completed').dotColor === 'var(--ac,#D97757)', 'completed wins over progress');

process.exit(bad ? 1 : 0);
