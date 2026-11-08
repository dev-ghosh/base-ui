// The person's own preferences: job title, phone, avatar colour, e-mail alert choices.
// Port of the load / save / avatar part of rie-dashboard2/js/profile.js.
//
// Preferences live in public.user_prefs (own row only, by RLS). If that table is not there yet they
// are kept on this device (`rie_prefs:<email>`, keyed to the person, never shared between people),
// and the page says so. Plain JS with relative imports so plain Node can run it.
import { store, createStore } from '../store/store.js';
import { sbUrl, getHeaders, getStorage } from './config.js';
import { getSession } from './auth.js';
import { setStatus } from './status.js';
import { beginLoad, isCurrentLoad } from './user-data.js';

export const DEFAULTS = {
  job_title: '', phone: '', avatar_tone: 'clay',
  email_enabled: true, email_overdue: true, email_due_soon: true,
  email_assigned: true, email_escalations: true,
  digest_hour: 8, digest_frequency: 'daily',
};

export const TONES = {
  clay: '#D97757', sage: '#6FA287', sky: '#5B93D3', plum: '#9B72B8',
  gold: '#C99A3B', rose: '#C96F8A', slate: '#6B7A90', teal: '#3E9EA3',
};

/** [pref key, label, hint] of the four e-mail alert kinds. */
export const KINDS = [
  ['email_escalations', 'Escalations', 'When a task is escalated to you.'],
  ['email_overdue', 'Overdue tasks', 'Tasks assigned to you that have passed their date.'],
  ['email_due_soon', 'Due soon', 'Tasks assigned to you that are due today or in the next two days.'],
  ['email_assigned', 'New assignments', 'Tasks newly given to you since the last e-mail.'],
];

export const DIGEST_FREQUENCIES = [
  ['daily', 'Every day'],
  ['weekdays', 'Weekdays only'],
  ['off', 'Never (only instant e-mails)'],
];

/** "8:00 am" ... "11:00 pm" for hour 0..23, as the old digest-hour options. */
export const hourLabel = (h) => `${((h + 11) % 12) + 1}:00 ${h < 12 ? 'am' : 'pm'}`;

/** The effective preferences: the defaults, then whatever is stored. */
export const prefsOf = (state = store.getState()) => ({ ...DEFAULTS, ...(state.prefs || {}) });

/** The colour of the avatar for a prefs object. */
export const avatarColourOf = (prefs) => TONES[prefs?.avatar_tone] || TONES.clay;

/** The signed-in person's e-mail, lower-cased (the access row first, as the old email()). */
export const prefsEmail = () => (store.getState().access?.email || getSession()?.email || '').toLowerCase();
const localKey = () => `rie_prefs:${prefsEmail()}`;

/** The "Saved" flag beside the page title: a message and a counter so the same message re-shows. */
export const prefsFlagStore = createStore({ msg: '', n: 0 });
const flag = (msg) => prefsFlagStore.setState((s) => ({ msg, n: s.n + 1 }));

/**
 * Read this device's copy, then the database row (own row only). Never throws. A failed read
 * (table not applied yet, or offline) means "device only", which the Notifications section says.
 * @param {object} [token] the load this belongs to (beginLoad()); its result is dropped when the session has ended
 */
export async function loadPrefs(token = beginLoad()) {
  if (!isCurrentLoad(token)) return store.getState().prefs;
  let local = {};
  try { local = JSON.parse(getStorage()?.getItem(localKey()) || '{}') || {}; } catch { /* fresh */ }
  store.setState({ prefs: { ...local } });
  let prefs = { ...local };
  let remote;
  try {
    const res = await fetch(`${sbUrl()}/rest/v1/user_prefs?email=eq.${encodeURIComponent(prefsEmail())}&limit=1`,
      { headers: await getHeaders() });
    if (!res.ok) throw new Error(String(res.status));
    const [row] = await res.json();
    if (row) prefs = { ...local, ...row };
    remote = true;
  } catch {
    remote = false;          // table not applied yet, or offline: device only
  }
  if (!isCurrentLoad(token)) return null;
  store.setState({ prefs, prefsRemote: remote });
  return prefs;
}

/**
 * Merge a change into the preferences, keep this device's copy, and send the whole row to the
 * database (upsert on email). Never throws; the outcome is the flag message.
 */
export async function persistPrefs(patch) {
  const token = beginLoad();
  store.setState((s) => ({ prefs: { ...(s.prefs || {}), ...patch } }));
  try { getStorage()?.setItem(localKey(), JSON.stringify(store.getState().prefs)); } catch { /* private mode */ }
  if (store.getState().prefsRemote === false) { flag('Saved on this device'); return 'Saved on this device'; }
  let msg;
  try {
    const body = { email: prefsEmail(), ...prefsOf(), updated_at: new Date().toISOString() };
    delete body.last_digest_at;   // owned by the e-mail job, never by the client
    const res = await fetch(`${sbUrl()}/rest/v1/user_prefs?on_conflict=email`, {
      method: 'POST',
      headers: { ...(await getHeaders()), Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(await res.text());
    if (isCurrentLoad(token)) store.setState({ prefsRemote: true });
    msg = 'Saved';
  } catch (e) {
    if (isCurrentLoad(token)) store.setState({ prefsRemote: false });
    msg = 'Saved on this device only';
    console.warn('user_prefs not saved to the database:', e.message);
  }
  flag(msg);
  return msg;
}

/** Set one preference now (digest_hour is a number). */
export function setPref(key, value) {
  if (key === 'digest_hour') value = Number(value);
  return persistPrefs({ [key]: value });
}

// One timer for both text fields, as the old saveTimer: typing in the second field within 450 ms of
// the first drops the first (an old defect, ported as it was).
let saveTimer = null;
/** Set a text preference after the typing stops (450 ms). */
export function setPrefText(key, value) {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { persistPrefs({ [key]: value.trim() }); }, 450);
}

/**
 * "Send me a test e-mail" (edge function send-alerts, mode test).
 * @returns {Promise<{ok: boolean, message: string}>}
 */
export async function sendTestEmail() {
  try {
    const res = await fetch(`${sbUrl()}/functions/v1/send-alerts`, {
      method: 'POST',
      headers: { ...(await getHeaders()), 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'test' }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(j.error || `Server said ${res.status}`);
    return { ok: true, message: `Sent to ${prefsEmail()}. Check your inbox (and spam).` };
  } catch (e) {
    setStatus('error', 'Test e-mail failed: ' + e.message);
    return { ok: false, message: `Could not send: ${e.message}` };
  }
}
