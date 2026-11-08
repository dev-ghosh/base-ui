// The alerts the signed-in person has, who has read which, the panel's open state, and the announcer that
// toasts new ones. Port of the stateful part of rie-dashboard2/js/notifications.js.
//
// Alerts are derived (model.js computeAlerts); the only things kept are the per-person read list and
// seen-tasks list in localStorage (`rie_alerts_read:<code>`, `rie_alerts_seen_tasks:<code>`: keyed to the
// person, so another person on the same device never sees or changes them) and, in memory, which alerts
// were already announced this session. Plain JS with relative imports: importable in Node.
import { store, createStore } from '../../store/store.js';
import { getStorage } from '../../lib/config.js';
import { isMine } from '../../lib/scope.js';
import {
  READ_KEY, SEEN_KEY, computeAlerts, hasStored, readSet, toastsFor, todayIST, writeSet,
} from './model.js';
import { showToast } from './toasts.js';

/**
 * The panel: { open, filter: 'all' | 'unread' }. `version` is bumped whenever the read list or the
 * seen-tasks list is written, so the hooks that derive from them draw again.
 */
export const alertsUi = createStore({ open: false, filter: 'all', version: 0 });
const bump = () => alertsUi.setState((s) => ({ version: s.version + 1 }));

export const openAlertsPanel = () => alertsUi.setState({ open: true });
export const closeAlertsPanel = () => alertsUi.setState({ open: false });
export const setAlertFilter = (filter) => alertsUi.setState({ filter });

/** The signed-in person's code (rie_my_access().person_code), or null when the sign-in is not linked. */
export const myCode = (state = store.getState()) => state.access?.person_code || null;

/** The "seen tasks" list for this person, and whether it has never been written (first run on this device). */
export function seenFor(me, storage = getStorage()) {
  return { seen: readSet(storage, SEEN_KEY(me)), firstRun: !hasStored(storage, SEEN_KEY(me)) };
}
export const readFor = (me, storage = getStorage()) => readSet(storage, READ_KEY(me));

/** All of my alerts right now (not stored: derived from the store on every call). */
export function currentAlerts(state = store.getState(), storage = getStorage(), now = new Date()) {
  const me = myCode(state);
  if (!me) return [];
  return computeAlerts({
    me, tasks: state.tasks, escalations: state.escalations, people: state.people, today: todayIST(now), ...seenFor(me, storage),
  });
}

export function unreadAlerts(state = store.getState(), storage = getStorage(), now = new Date()) {
  const me = myCode(state);
  if (!me) return [];
  const read = readFor(me, storage);
  return currentAlerts(state, storage, now).filter((a) => !read.has(a.key));
}

/**
 * Record the tasks currently on my plate as seen, so only later arrivals count as new. Called after each
 * full load. Only the very first run on a device writes the list (silently baselining what I already own);
 * later arrivals stay "new" until the panel is opened and marked read.
 */
export function syncSeenTasks(state = store.getState(), storage = getStorage()) {
  const me = myCode(state);
  if (!me) return;
  const { seen, firstRun } = seenFor(me, storage);
  if (!firstRun) return;
  for (const t of state.tasks || []) if (isMine(t, me)) seen.add(String(t.id));
  writeSet(storage, SEEN_KEY(me), seen);
  bump();
}

/** "Mark all read": every alert shown is read, and every task of mine is now seen. */
export function markAllNotificationsRead(state = store.getState(), storage = getStorage()) {
  const me = myCode(state);
  if (!me) return;
  const read = readFor(me, storage);
  currentAlerts(state, storage).forEach((a) => read.add(a.key));
  writeSet(storage, READ_KEY(me), read);
  // Anything shown as "new" has now been seen.
  const seen = readSet(storage, SEEN_KEY(me));
  (state.tasks || []).forEach((t) => { if (isMine(t, me)) seen.add(String(t.id)); });
  writeSet(storage, SEEN_KEY(me), seen);
  bump();
}

/**
 * Mark one alert read (opening it). A "new task" alert also marks that task seen.
 * @returns the alert, or null when it is no longer there
 */
export function markAlertRead(key, state = store.getState(), storage = getStorage()) {
  const me = myCode(state);
  const alert = currentAlerts(state, storage).find((x) => x.key === key);
  if (!me || !alert) return null;
  const read = readFor(me, storage);
  read.add(key);
  writeSet(storage, READ_KEY(me), read);
  if (alert.kind === 'assigned') {
    const seen = readSet(storage, SEEN_KEY(me));
    seen.add(key.split(':')[1]);
    writeSet(storage, SEEN_KEY(me), seen);
  }
  bump();
  return alert;
}

/* ── announcing ────────────────────────────────────────────────────────────── */

const announced = new Set();
let announcedOnce = false;

/**
 * Toast once per alert per session, only for work that is yours. The first call of a session gives one
 * summary instead of one toast per alert. Clicking a toast opens the panel.
 */
export function announceNewAlerts(summarise = false, state = store.getState(), storage = getStorage()) {
  const fresh = unreadAlerts(state, storage).filter((a) => !announced.has(a.key));
  fresh.forEach((a) => announced.add(a.key));
  for (const t of toastsFor(fresh, summarise)) showToast({ ...t, onClick: openAlertsPanel });
}

/** After a load: the first one of the session is a summary, later ones (reconnects) announce what is new. */
export function announceAfterLoad() {
  announceNewAlerts(!announcedOnce);
  announcedOnce = true;
}

/** Sign-out: nothing announced, nothing open, nothing remembered in memory for the next person. */
export function resetAlertsSession() {
  announced.clear();
  announcedOnce = false;
  alertsUi.setState({ open: false, filter: 'all' });
}
