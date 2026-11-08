/* activity.js — Real-time Activity Timeline Feed & Audit Stream. Port of rie-dashboard2/js/activity.js.
 *
 * The feed is three sources merged: events this browser recorded when a task was changed
 * (localStorage `rie_activity_stream`, newest first, at most 100), every task in the store as
 * "<person> <status phrase> <task>", and contact history (state.history). Newest 60 are shown.
 *
 * recordActivity() is what task-actions.js calls (through seams.js) where the old tasks.js did.
 * R25: the stream holds task titles and people, so it is dropped when the session ends
 * (user-data.js calls clearActivity()); the old app never cleared it.
 *
 * Plain JS with relative imports so plain Node can run it.
 */
import { store, createStore } from '../store/store.js';
import { getStorage } from './config.js';

export const ACTIVITY_STORAGE_KEY = 'rie_activity_stream';
const KEEP = 100;
const SHOW = 60;

/** Bumped by every recordActivity() so an open Activity panel redraws (the old code re-rendered it by hand). */
export const activityStore = createStore({ version: 0 });

export function getStoredActivities(storage = getStorage()) {
  try {
    const raw = storage?.getItem(ACTIVITY_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/** Forget the recorded events (sign-out). Never throws. */
export function clearActivity(storage = getStorage()) {
  try { storage?.removeItem(ACTIVITY_STORAGE_KEY); } catch { /* storage unavailable */ }
  activityStore.setState((s) => ({ version: s.version + 1 }));
}

/**
 * Record that someone did something to a task. `person` falls back to the signed-in user, then to
 * 'Team Member'; `target` to 'Untitled Deliverable'. A full or unavailable localStorage loses the
 * entry instead of failing the write that called this (the old call threw into the task write).
 */
export function recordActivity(action, target, person, type = 'task', now = new Date()) {
  const current = getStoredActivities();
  const entry = {
    id: 'act_' + now.getTime() + '_' + Math.random().toString(36).substr(2, 4),
    person: (person || store.getState().currentUser || 'Team Member').trim(),
    action: action.trim(),
    target: (target || 'Untitled Deliverable').trim(),
    time: now.toISOString(),
    type,
  };
  current.unshift(entry);
  try { getStorage()?.setItem(ACTIVITY_STORAGE_KEY, JSON.stringify(current.slice(0, KEEP))); } catch { /* storage unavailable */ }
  activityStore.setState((s) => ({ version: s.version + 1 }));
}

/**
 * The merged feed, newest first, at most 60.
 * @param {{stored?: object[], tasks?: object[], history?: object[], now?: Date}} src
 */
export function buildActivityFeed({ stored = [], tasks = [], history = [], now = new Date() } = {}) {
  const feed = [];
  const seenKeys = new Set();

  // 1. Locally recorded real-time events
  stored.forEach((s) => {
    const key = `${s.person}_${s.action}_${s.target}_${s.time?.slice(0, 16)}`;
    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      feed.push({ ...s, time: new Date(s.time) });
    }
  });

  // 2. All Completed & In-Progress tasks from state.tasks (full dataset)
  if (Array.isArray(tasks)) {
    tasks.forEach((t) => {
      const taskTime = new Date(t.updatedAt || t.createdAt || now);
      const person = t.assignedTo || t.owner_code || 'Team Member';
      const action = t.status === 'Completed' ? 'marked completed' : (t.status === 'In Progress' ? 'actively working on' : `set to ${String(t.status ?? '').toLowerCase()}`);
      const key = `${person}_${action}_${t.task}_${taskTime.toISOString().slice(0, 13)}`;

      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        feed.push({ id: 'act_task_' + t.id, person, action, target: t.task || 'Untitled Task', time: taskTime, type: 'task', status: t.status });
      }
    });
  }

  // 3. Contact history (the old state never had a `history` list, so this adds nothing there either)
  if (Array.isArray(history)) {
    history.forEach((h) => {
      feed.push({
        id: 'act_h_' + (h.id || Math.random()),
        person: h.author || 'Team Member',
        action: h.type || 'updated contact',
        target: h.contactName || h.notes || 'Contact Record',
        time: new Date(h.timestamp || now),
        type: 'contact',
      });
    });
  }

  feed.sort((a, b) => b.time - a.time);
  return feed.slice(0, SHOW);
}

/** The feed from what is stored and loaded right now. */
export function getActivityFeed(now = new Date()) {
  const s = store.getState();
  return buildActivityFeed({ stored: getStoredActivities(), tasks: s.tasks, history: s.history, now });
}

/** "just now", "5m ago", "3h ago", "2d ago", else the local date. */
export function timeAgo(date, now = new Date()) {
  const seconds = Math.floor((now - date) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return date.toLocaleDateString();
}

/** How a row is drawn: a "Done" chip for completions, a blue dot for work in progress, grey otherwise. */
export function activityKind(a) {
  const isCompleted = a.action.includes('complete') || a.status === 'Completed';
  const isProgress = a.action.includes('working') || a.action.includes('Progress');
  const dotColor = isCompleted ? 'var(--ac,#D97757)' : (isProgress ? 'var(--cold,#74ABE2)' : 'var(--sf4,#71717a)');
  return { isCompleted, isProgress, dotColor };
}
