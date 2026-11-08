// Alerts: derived from the store and ASSIGNED TO ME ONLY (by person code, via isMine; never team-wide, never by
// name). Expected values are worked out by hand from rie-dashboard2/js/notifications.js computeAlerts() and the
// announce / mark-read functions around it.
import {
  computeAlerts, toastsFor, todayIST, badgeText, GROUPS, READ_KEY, SEEN_KEY,
} from '../src/features/notifications/model.js';
import {
  currentAlerts, unreadAlerts, syncSeenTasks, markAllNotificationsRead, markAlertRead, announceNewAlerts,
  announceAfterLoad, resetAlertsSession, alertsUi, openAlertsPanel, closeAlertsPanel, setAlertFilter, myCode,
} from '../src/features/notifications/alerts.js';
import {
  toastStore, showToast, dismissToast, removeToast, pushNotification, clearToasts, TOAST_FADE_MS,
} from '../src/features/notifications/toasts.js';
import { pushNotification as seamPush, openAlertsPanel as seamOpen } from '../src/lib/seams.js';

let bad = 0;
const check = (c, m) => { console.log((c ? '  ok  ' : '  FAIL') + '  ' + m); if (!c) bad++; };
const keys = (a) => a.map((x) => x.key);

const ME = 'ME1';
const TODAY = '2026-11-10';
const mem = () => { const m = {}; return { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: (k) => { delete m[k]; }, _m: m }; };
let n = 0;
const task = (o = {}) => ({ id: 't' + ++n, task: 'Task ' + n, status: 'Pending', priority: 'P2', ownerCode: ME, coOwnerCodes: [], assignedTo: 'Me Myself', nextFollowUp: '', createdAt: '', ...o });
const esc = (o = {}) => ({ id: 1, status: 'open', level: 1, assigned_to: ME, raised_by: 'OT1', task_title: 'Stuck thing', reason: 'Deadline at risk', created_at: '2026-11-09T10:00:00Z', ...o });
const people = [{ code: ME, display_name: 'Me Myself' }, { code: 'OT1', display_name: 'Olive Other' }];
const base = { me: ME, people, today: TODAY, seen: new Set(), firstRun: true };

// ── whose alerts ────────────────────────────────────────────────────────────
{
  const mine = task({ nextFollowUp: '2026-11-01' });
  const theirs = task({ ownerCode: 'OT1', assignedTo: 'Olive Other', nextFollowUp: '2026-11-01' });
  check(keys(computeAlerts({ ...base, tasks: [mine, theirs] })).join() === `overdue:${mine.id}:2026-11-01`, 'an overdue task owned by someone else yields no alert');

  const lookalike = task({ ownerCode: 'XX9', assignedTo: 'Me Myself', nextFollowUp: '2026-11-01' });
  check(computeAlerts({ ...base, tasks: [lookalike] }).length === 0, 'a task whose owner NAME equals mine but whose CODE differs yields no alert');
  check(computeAlerts({ ...base, tasks: [task({ ownerCode: '', assignedTo: 'Me Myself', nextFollowUp: '2026-11-01' })] }).length === 0, 'a legacy free-text owner (no code) is nobody\'s: no alert');

  const co = task({ ownerCode: 'OT1', coOwnerCodes: [ME], nextFollowUp: '2026-11-01' });
  check(computeAlerts({ ...base, tasks: [co] }).length === 1, 'a co-owner (by code) gets the alert');
  check(computeAlerts({ ...base, me: null, tasks: [mine], escalations: [esc()] }).length === 0, 'a sign-in with no person code has no alerts at all');
  check(computeAlerts({ ...base, me: 'ME', tasks: [mine] }).length === 0, 'matching is exact on the code (ME is not ME1)');
}

// ── overdue / soon ──────────────────────────────────────────────────────────
{
  const od = task({ nextFollowUp: '2026-11-09' });
  const od1 = task({ nextFollowUp: '2026-11-09', priority: 'P1' });
  const odA = task({ nextFollowUp: '2026-11-09', priority: 'A' });
  const t0 = task({ nextFollowUp: '2026-11-10' });
  const t2 = task({ nextFollowUp: '2026-11-12' });
  const t3 = task({ nextFollowUp: '2026-11-13' });
  const a = computeAlerts({ ...base, tasks: [od, od1, odA, t0, t2, t3] });
  const kind = (t) => a.find((x) => x.go.id === t.id)?.kind;
  check(kind(od) === 'overdue' && kind(od1) === 'overdue', 'yesterday is overdue');
  check(kind(t0) === 'soon' && kind(t2) === 'soon', 'today and two days away are "soon"');
  check(kind(t3) === undefined, 'three days away is not an alert');
  check(a.find((x) => x.go.id === od1.id).urgent === true && a.find((x) => x.go.id === odA.id).urgent === true, 'P1 (and A) overdue is urgent');
  check(a.find((x) => x.go.id === od.id).urgent === false, 'a P2 overdue is not urgent');
  check(a.find((x) => x.go.id === od1.id).sub.endsWith(' · P1') && !a.find((x) => x.go.id === od.id).sub.includes('P1'), 'urgent overdue is labelled P1');
  check(a.find((x) => x.go.id === t0.id).urgent === false, '"soon" is never urgent');
  check(computeAlerts({ ...base, tasks: [task({ status: 'Completed', nextFollowUp: '2026-11-01' }), task({ status: 'Dropped', nextFollowUp: '2026-11-01' })] }).length === 0, 'completed and dropped tasks give no alert');
  check(a.map((x) => x.kind).join() === 'overdue,overdue,overdue,soon,soon', 'overdue before soon');
  check(a[0].urgent && a[1].urgent && !a[2].urgent, 'urgent overdue tasks lead the list');
  check(a[3].rank === 0 && a[4].rank === 2, 'within a kind the nearest date comes first');
}

// ── escalations ─────────────────────────────────────────────────────────────
{
  const e1 = esc({ id: 7, level: 2 });
  const a = computeAlerts({ ...base, escalations: [e1, esc({ id: 8, assigned_to: 'OT1' }), esc({ id: 9, status: 'resolved' }), esc({ id: 10, status: 'withdrawn' })] });
  check(a.length === 1 && a[0].key === 'esc:7:2', 'only OPEN escalations assigned to me; the level is in the key');
  check(a[0].kind === 'escalation' && a[0].urgent === true && a[0].go.type === 'esc', 'an escalation alert is urgent and goes to the Escalations page');
  check(a[0].sub === 'Escalated to you by Olive Other · Deadline at risk' && a[0].title === 'Stuck thing', 'the line names who raised it (from the people list) and why');
  check(computeAlerts({ ...base, people: [], escalations: [esc()] })[0].sub.startsWith('Escalated to you by OT1'), 'an unknown raiser falls back to the code');
  check(computeAlerts({ ...base, escalations: [esc({ raised_by: ME, assigned_to: 'OT1' })] }).length === 0, 'an escalation I raised is not an alert for me');
  const mixed = computeAlerts({ ...base, tasks: [task({ nextFollowUp: '2026-11-01', priority: 'P1' })], escalations: [e1] });
  check(mixed[0].kind === 'escalation', 'an escalation sorts before an urgent overdue task');
}

// ── newly assigned ──────────────────────────────────────────────────────────
{
  const seenT = task(); const newT = task({ createdAt: '2026-11-09T08:00:00Z' }); const newDated = task({ nextFollowUp: '2026-12-25' });
  const first = computeAlerts({ ...base, tasks: [seenT, newT], firstRun: true });
  check(first.length === 0, 'first run on a device: nothing is "new" (no fifty alerts for months-old work)');
  const later = computeAlerts({ ...base, tasks: [seenT, newT, newDated], seen: new Set([String(seenT.id)]), firstRun: false });
  check(later.length === 2 && later.every((x) => x.kind === 'assigned'), 'later: tasks not yet seen are "assigned" alerts');
  check(later[0].sub === 'Assigned to you' && later[1].sub.startsWith('Assigned to you · '), '... with the due date when there is one');
  check(later[0].key === `assigned:${newT.id}`, 'the key is assigned:<id>');
  check(computeAlerts({ ...base, tasks: [task({ ownerCode: 'OT1' })], seen: new Set(), firstRun: false }).length === 0, 'a task assigned to someone else is never "new for you"');
}

// ── helpers ─────────────────────────────────────────────────────────────────
check(todayIST(new Date('2026-11-10T20:00:00Z')) === '2026-11-11', 'todayIST is the India date (20:00 UTC is already tomorrow)');
check(todayIST(new Date('2026-11-10T10:00:00Z')) === '2026-11-10', 'todayIST: 10:00 UTC is the same day');
check(badgeText(0) === '0' && badgeText(9) === '9' && badgeText(10) === '9+', 'the badge reads 9+ above nine');
check(GROUPS.map((g) => g[1]).join() === 'Waiting on you,Overdue,Coming up,New for you', 'panel groups and headings');
check(READ_KEY('A') === 'rie_alerts_read:A' && SEEN_KEY('A') === 'rie_alerts_seen_tasks:A', 'the localStorage keys are the old ones, per person');

// ── toasts for a batch ──────────────────────────────────────────────────────
{
  const mk = (kind, urgent, title) => ({ kind, urgent, title });
  check(toastsFor([]).length === 0, 'no fresh alerts: no toast');
  const one = toastsFor([mk('overdue', true, 'A'), mk('soon', false, 'B')]);
  check(one.length === 2 && one[0].title === 'Overdue' && one[0].type === 'alert' && one[1].title === 'Due soon' && one[1].type === 'info' && one[1].message === 'B', 'up to three: one toast each, titled by kind, urgent ones warm');
  check(toastsFor([mk('escalation', true, 'x')])[0].title === 'Escalated to you' && toastsFor([mk('assigned', false, 'x')])[0].title === 'New task for you', 'titles for escalation and assigned');
  const four = toastsFor([1, 2, 3, 4].map((i) => mk('soon', i === 1, 'x' + i)));
  check(four.length === 1 && four[0].title === '4 alerts for you' && four[0].message === '1 needs attention first.' && four[0].type === 'alert', 'more than three: one summary, with the urgent count');
  const sum = toastsFor([mk('soon', false, 'x')], true);
  check(sum.length === 1 && sum[0].title === '1 alert for you' && sum[0].message === 'Open the bell to see them.' && sum[0].type === 'info', 'summarise: singular, no urgent -> "Open the bell"');
  check(toastsFor([mk('overdue', true, 'a'), mk('overdue', true, 'b')], true)[0].message === '2 need attention first.', 'two urgent: "2 need attention first."');
}

// ── the stateful part: read lists, announcing ──────────────────────────────
const { store, createInitialState } = await import('../src/store/store.js');
function seed(over = {}) {
  store.setState({ ...createInitialState(), people, access: { person_code: ME }, ...over });
  clearToasts(); resetAlertsSession();
}
{
  const st = mem();
  const a = task({ nextFollowUp: '2026-01-01' }); const b = task({ ownerCode: 'OT1' });
  seed({ tasks: [a, b], escalations: [esc({ id: 5 })] });
  check(myCode() === ME, 'myCode reads access.person_code');
  const now = new Date('2026-11-10T06:00:00Z');
  check(keys(currentAlerts(store.getState(), st, now)).join() === `esc:5:1,overdue:${a.id}:2026-01-01`, 'currentAlerts: derived from the store (escalation, then overdue), not the team\'s task');

  syncSeenTasks(store.getState(), st);
  check(JSON.parse(st._m[SEEN_KEY(ME)]).join() === String(a.id), 'first run: my tasks (not other people\'s) are baselined as seen');
  const c = task({ createdAt: '2026-11-10T00:00:00Z' });
  store.setState({ tasks: [a, b, c] });
  syncSeenTasks(store.getState(), st);
  check(JSON.parse(st._m[SEEN_KEY(ME)]).join() === String(a.id), 'later loads do not baseline: a new task stays new');
  check(currentAlerts(store.getState(), st, now).some((x) => x.key === `assigned:${c.id}`), '... and shows as an "assigned" alert');

  const key = `assigned:${c.id}`;
  const got = markAlertRead(key, store.getState(), st);
  check(got?.kind === 'assigned' && JSON.parse(st._m[READ_KEY(ME)]).includes(key) && JSON.parse(st._m[SEEN_KEY(ME)]).includes(String(c.id)), 'opening an alert marks it read, and a new task seen');
  check(markAlertRead('nope:1', store.getState(), st) === null, 'an alert that is gone marks nothing');
  check(!unreadAlerts(store.getState(), st, now).some((x) => x.key === key), 'a read alert is no longer unread');
  const before = unreadAlerts(store.getState(), st, now).length;
  markAllNotificationsRead(store.getState(), st);
  check(before > 0 && unreadAlerts(store.getState(), st, now).length === 0, 'mark all read leaves nothing unread');

  // another person on the same device has their own lists
  store.setState({ access: { person_code: 'OT1' } });
  check(st.getItem(READ_KEY('OT1')) === null, 'the other person\'s lists are separate keys, untouched');
  check(currentAlerts(store.getState(), st, now).every((x) => x.go.id !== a.id), 'and they see none of my alerts');
  store.setState({ access: { person_code: null } });
  check(currentAlerts(store.getState(), st, now).length === 0 && unreadAlerts(store.getState(), st, now).length === 0, 'unlinked sign-in: no alerts, none unread');
  syncSeenTasks(store.getState(), st); markAllNotificationsRead(store.getState(), st);
  check(Object.keys(st._m).every((k) => k.endsWith(':' + ME)), 'unlinked sign-in writes nothing');
}
{
  // blocked storage must not throw
  const blocked = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  seed({ tasks: [task({ nextFollowUp: '2026-01-01' })] });
  let ok = true;
  try { currentAlerts(store.getState(), blocked); syncSeenTasks(store.getState(), blocked); markAllNotificationsRead(store.getState(), blocked); announceNewAlerts(false, store.getState(), blocked); } catch { ok = false; }
  check(ok, 'a blocked localStorage does not throw anywhere');
}
{
  const st = mem();
  const t = [1, 2, 3, 4, 5].map((i) => task({ nextFollowUp: '2026-01-0' + i, priority: i < 3 ? 'P1' : 'P2' }));
  seed({ tasks: t.slice(0, 2) });
  announceNewAlerts(false, store.getState(), st);
  let ts = toastStore.getState().toasts;
  check(ts.length === 2 && ts.every((x) => x.type === 'alert' && x.title === 'Overdue' && typeof x.onClick === 'function'), 'two new alerts: one toast each, clickable');
  announceNewAlerts(false, store.getState(), st);
  check(toastStore.getState().toasts.length === 2, 'the same alerts are not announced twice in a session');
  store.setState({ tasks: t });
  announceNewAlerts(false, store.getState(), st);
  ts = toastStore.getState().toasts;
  check(ts.length === 5 && ts.slice(2).every((x) => x.title === 'Overdue'), 'three new at once are toasted individually (only more than three summarise)');
}
{
  const st = mem();
  const t = [1, 2, 3, 4, 5].map((i) => task({ nextFollowUp: '2026-01-0' + i }));
  seed({ tasks: t });
  announceNewAlerts(false, store.getState(), st);
  const ts = toastStore.getState().toasts;
  check(ts.length === 1 && ts[0].title === '5 alerts for you' && ts[0].message === 'Open the bell to see them.', 'more than three fresh alerts: one summary toast');
  ts[0].onClick();
  check(alertsUi.getState().open === true, 'the summary toast opens the alerts panel');
  closeAlertsPanel();

  // the first load of a session summarises even one alert; later loads announce individually
  seed({ tasks: [task({ nextFollowUp: '2026-01-01' })] });
  announceAfterLoad();
  check(toastStore.getState().toasts.length === 1 && toastStore.getState().toasts[0].title === '1 alert for you', 'first load of a session: a summary');
  clearToasts();
  store.setState({ tasks: [...store.getState().tasks, task({ nextFollowUp: '2026-01-02' })] });
  announceAfterLoad();
  check(toastStore.getState().toasts.length === 1 && toastStore.getState().toasts[0].title === 'Overdue', 'a later load toasts only the new alert, individually');

  resetAlertsSession();
  clearToasts();
  announceAfterLoad();
  check(toastStore.getState().toasts[0]?.title === '2 alerts for you', 'after sign-out the announcements start over (summary again)');
}

// ── the panel's state ───────────────────────────────────────────────────────
{
  resetAlertsSession();
  check(alertsUi.getState().open === false && alertsUi.getState().filter === 'all', 'the panel starts closed on All');
  seamOpen();
  check(alertsUi.getState().open === true, 'the seam openAlertsPanel() (bell, Help) opens it');
  setAlertFilter('unread');
  check(alertsUi.getState().filter === 'unread', 'filter -> unread');
  closeAlertsPanel(); openAlertsPanel();
  resetAlertsSession();
  check(alertsUi.getState().open === false && alertsUi.getState().filter === 'all', 'sign-out closes it and resets the filter');
}

// ── toasts ──────────────────────────────────────────────────────────────────
{
  clearToasts();
  pushNotification('Task updated', '"X" saved', 'info');
  let t = toastStore.getState().toasts;
  check(t.length === 1 && t[0].title === 'Task updated' && t[0].message === '"X" saved' && t[0].type === 'info' && t[0].onClick === null, 'pushNotification adds an info toast');
  seamPush('Task not deleted', 'why', 'alert');
  t = toastStore.getState().toasts;
  check(t.length === 2 && t[1].type === 'alert', 'the seam pushNotification(title, message, type) is the same function');
  pushNotification('T');
  check(toastStore.getState().toasts[2].type === 'info' && toastStore.getState().toasts[2].message === '', 'type defaults to info, message to empty');
  const id = showToast({ title: 'Q', message: 'm' });
  dismissToast(id);
  check(toastStore.getState().toasts.find((x) => x.id === id).leaving === true, 'dismiss fades the toast out first');
  dismissToast(id);
  await new Promise((r) => setTimeout(r, TOAST_FADE_MS + 60));
  check(!toastStore.getState().toasts.some((x) => x.id === id), '... then removes it');
  const id2 = showToast({ title: 'R' });
  removeToast(id2);
  check(!toastStore.getState().toasts.some((x) => x.id === id2), 'removeToast takes it off at once');
  clearToasts();
  check(toastStore.getState().toasts.length === 0, 'clearToasts empties the corner');
}

process.exit(bad ? 1 : 0);
