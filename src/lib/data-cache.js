// The offline cache of the loaded lists. Port of saveToCache()/loadFromCache() in
// rie-dashboard2/js/app.js. Plain JS with relative imports so plain Node can run it.
import { getStorage, SESSION_KEY } from './config.js';
import { store } from '../store/store.js';

export const CACHE_KEY = 'rie_data_cache';

// Bump whenever the SHAPE of a cached record changes. A cache written by an
// older build is discarded rather than restored: v2 added company/func to
// tasks, and replaying a v1 cache made every task look untagged, which renders
// the Company x Function matrix as an empty grid of dashes with no explanation.
//
// v3 (R25): the entry also carries the id of the person it was written for, and is
// only ever served to that person.
export const CACHE_SCHEMA = 3;

// The lists that are cached (people and coOwners are not: they are reloaded first).
export const CACHED_LISTS = [
  'contacts', 'tasks', 'events', 'guests', 'leads', 'initiatives', 'candidates',
  'decisions', 'cleanups', 'workstreams', 'actions', 'entityLinks',
];

/** The signed-in user's id from the stored session, or null. (Read straight from
 *  storage so this module does not import auth.js, which imports it.) */
export function currentUserId() {
  try {
    const raw = getStorage()?.getItem(SESSION_KEY);
    const s = raw && JSON.parse(raw);
    return (s && s.accessToken && s.userId) || null;
  } catch { return null; }
}

/** Remove the cached snapshot. Never throws. */
export function clearCache() {
  try { getStorage()?.removeItem(CACHE_KEY); } catch { /* storage unavailable */ }
}

/**
 * Persist the current lists, stamped with the signed-in user's id. Never throws: a full or unavailable localStorage
 * (quota, private mode, SSR) just means there is no offline copy.
 * @param {object} [state] defaults to the store's current state
 */
export function writeCache(state = store.getState()) {
  try {
    const userId = currentUserId();
    if (!userId) return;   // nobody to attribute it to: better no offline copy than a shared one
    const snapshot = { schema: CACHE_SCHEMA, userId, ts: Date.now() };
    for (const k of CACHED_LISTS) snapshot[k] = state[k];
    getStorage()?.setItem(CACHE_KEY, JSON.stringify(snapshot));
  } catch { /* storage quota, ignore */ }
}

/**
 * The cached snapshot, or null when there is none, it is unreadable, or it was
 * written by a build with a different record shape, or for a different person
 * (either one is deleted).
 */
export function readCache() {
  try {
    const storage = getStorage();
    const raw = storage?.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.schema !== CACHE_SCHEMA) {
      // Stale shape. Drop it: showing structurally wrong data is worse than
      // showing none, because the user cannot tell the difference.
      storage.removeItem(CACHE_KEY);
      return null;
    }
    if (!parsed.userId || parsed.userId !== currentUserId()) {
      // Written for someone else (or for no one): never show one person's data to another.
      storage.removeItem(CACHE_KEY);
      return null;
    }
    return parsed;
  } catch { return null; }
}

/** Whole minutes since the snapshot was written (the "(5m ago)" in the status bar). */
export function cacheAgeMinutes(cache, now = Date.now()) {
  return Math.round((now - cache.ts) / 60000);
}
