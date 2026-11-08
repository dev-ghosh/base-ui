// Alerts: what is derived, and what the panel shows. Port of computeAlerts() and the panel text in
// rie-dashboard2/js/notifications.js.
//
// An alert exists for you when something is ASSIGNED TO YOU:
//   - an escalation is waiting on you,
//   - one of your tasks is overdue,
//   - one of your tasks is due in the next two days,
//   - a task was newly given to you.
// Nothing about the rest of the team ever appears. Identity is the signed-in person's CODE
// (rie_my_access().person_code) and the same isMine() predicate Today and Work use, so the bell can never
// disagree with them: a task whose owner NAME equals mine but whose code differs yields no alert, and a
// person with no code gets none at all.
//
// Alerts are DERIVED from the lists on every call. There is no stored alert list to go stale. The only thing
// stored is which alerts the person has read, per person, in localStorage.
//
// Pure and Node-importable (no DOM, no React).
import { dueLabel } from '../../lib/format.js';
import { isMine } from '../../lib/scope.js';

/** localStorage keys, one pair per person code (the old keys, unchanged). */
export const READ_KEY = (me) => `rie_alerts_read:${me}`;
export const SEEN_KEY = (me) => `rie_alerts_seen_tasks:${me}`;

export const DUE_SOON_DAYS = 2;
const CLOSED = new Set(['Completed', 'Dropped']);
const ORDER = { escalation: 0, overdue: 1, soon: 2, assigned: 3 };

/** Panel groups: [alert kind, heading]. */
export const GROUPS = [
  ['escalation', 'Waiting on you'],
  ['overdue', 'Overdue'],
  ['soon', 'Coming up'],
  ['assigned', 'New for you'],
];

/** The toast title for one alert kind. */
export const TOAST_TITLE = {
  escalation: 'Escalated to you', overdue: 'Overdue', soon: 'Due soon', assigned: 'New task for you',
};

/** India date, matching rie_today() on the server, so "overdue" here and in the e-mail digest flip at the same moment. */
export function todayIST(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(now);
}
const dayNum = (iso) => Math.floor(Date.UTC(...iso.split('-').map((n, i) => (i === 1 ? n - 1 : +n))) / 86400000);

/* ── storage (per person, tolerant of a blocked localStorage) ──────────────── */

export function readSet(storage, key) {
  try { return new Set(JSON.parse(storage?.getItem(key) || '[]')); } catch { return new Set(); }
}
export function writeSet(storage, key, set) {
  try { storage?.setItem(key, JSON.stringify([...set].slice(-500))); } catch { /* private mode */ }
}
/** Has the "seen tasks" list ever been written for this person on this device? */
export function hasStored(storage, key) {
  try { return storage?.getItem(key) != null && storage.getItem(key) !== ''; } catch { return false; }
}

/* ── the derivation ────────────────────────────────────────────────────────── */

const nameOf = (people, code) => (people || []).find((p) => p.code === code)?.display_name || code;

/**
 * @param {object} src
 * @param {string|null} src.me          the signed-in person's code (null = not linked: no alerts)
 * @param {object[]} src.tasks          store tasks
 * @param {object[]} src.escalations    raw escalations rows
 * @param {object[]} src.people         public.people rows (for the name in "Escalated to you by …")
 * @param {string}   [src.today]        ISO date in India (todayIST())
 * @param {Set<string>} [src.seen]      task ids already seen on this device
 * @param {boolean}  [src.firstRun]     no "seen" list yet: nothing is "new", or the first bell would show
 *                                      fifty "new" alerts for work owned for months
 * @returns {object[]} alerts, most urgent first: { key, kind, urgent, title, sub, ts, rank?, go }
 */
export function computeAlerts({ me, tasks = [], escalations = [], people = [], today = todayIST(), seen = new Set(), firstRun = true }) {
  if (!me) return [];
  const t0 = dayNum(today);
  const out = [];

  for (const e of escalations || []) {
    if (e.status !== 'open' || e.assigned_to !== me) continue;
    out.push({
      key: `esc:${e.id}:${e.level}`, kind: 'escalation', urgent: true,
      title: e.task_title,
      sub: `Escalated to you by ${nameOf(people, e.raised_by)} · ${e.reason}`,
      ts: e.updated_at || e.created_at,
      go: { type: 'esc' },
    });
  }

  const mine = (tasks || []).filter((t) => !CLOSED.has(t.status) && isMine({ ownerCode: t.ownerCode, coOwnerCodes: t.coOwnerCodes }, me));

  for (const t of mine) {
    const p1 = t.priority === 'P1' || t.priority === 'A';
    const due = t.nextFollowUp;
    if (due) {
      const d = dayNum(due) - t0;
      if (d < 0) {
        out.push({
          key: `overdue:${t.id}:${due}`, kind: 'overdue', urgent: p1,
          title: t.task || 'Untitled task', sub: `${dueLabel(due)}${p1 ? ' · P1' : ''}`,
          ts: due, rank: d, go: { type: 'task', id: t.id },
        });
        continue;
      }
      if (d <= DUE_SOON_DAYS) {
        out.push({
          key: `soon:${t.id}:${due}`, kind: 'soon', urgent: false,
          title: t.task || 'Untitled task', sub: dueLabel(due),
          ts: due, rank: d, go: { type: 'task', id: t.id },
        });
        continue;
      }
    }
    // Newly assigned: not yet seen on this device.
    if (!firstRun && !seen.has(String(t.id))) {
      out.push({
        key: `assigned:${t.id}`, kind: 'assigned', urgent: false,
        title: t.task || 'Untitled task', sub: 'Assigned to you' + (due ? ` · ${dueLabel(due)}` : ''),
        ts: t.createdAt || '', go: { type: 'task', id: t.id },
      });
    }
  }
  return out.sort((a, b) =>
    (b.urgent - a.urgent) || ORDER[a.kind] - ORDER[b.kind] || (a.rank ?? 0) - (b.rank ?? 0));
}

/** The bell's number: "9+" above nine. */
export const badgeText = (n) => (n > 9 ? '9+' : String(n));

/** The toast(s) for a batch of fresh alerts: one summary when asked or when there are more than three. */
export function toastsFor(fresh, summarise = false) {
  if (!fresh.length) return [];
  if (summarise || fresh.length > 3) {
    const urgent = fresh.filter((a) => a.urgent).length;
    return [{
      title: `${fresh.length} alert${fresh.length === 1 ? '' : 's'} for you`,
      message: urgent ? `${urgent} need${urgent === 1 ? 's' : ''} attention first.` : 'Open the bell to see them.',
      type: urgent ? 'alert' : 'info',
    }];
  }
  return fresh.map((a) => ({ title: TOAST_TITLE[a.kind], message: a.title, type: a.urgent ? 'alert' : 'info' }));
}
