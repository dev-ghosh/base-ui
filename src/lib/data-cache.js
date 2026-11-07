// The offline cache of the loaded lists. Port of saveToCache()/loadFromCache() in
// rie-dashboard2/js/app.js. Plain JS with relative imports so plain Node can run it.
import { getStorage } from './config.js';
import { store } from '../store/store.js';

export const CACHE_KEY = 'rie_data_cache';

// Bump whenever the SHAPE of a cached record changes. A cache written by an
// older build is discarded rather than restored: v2 added company/func to
// tasks, and replaying a v1 cache made every task look untagged, which renders
// the Company x Function matrix as an empty grid of dashes with no explanation.
export const CACHE_SCHEMA = 2;

// The lists that are cached (people and coOwners are not: they are reloaded first).
export const CACHED_LISTS = [
  'contacts', 'tasks', 'events', 'guests', 'leads', 'initiatives', 'candidates',
  'decisions', 'cleanups', 'workstreams', 'actions', 'entityLinks',
];

/**
 * Persist the current lists. Never throws: a full or unavailable localStorage
 * (quota, private mode, SSR) just means there is no offline copy.
 * @param {object} [state] defaults to the store's current state
 */
export function writeCache(state = store.getState()) {
  try {
    const snapshot = { schema: CACHE_SCHEMA, ts: Date.now() };
    for (const k of CACHED_LISTS) snapshot[k] = state[k];
    getStorage()?.setItem(CACHE_KEY, JSON.stringify(snapshot));
  } catch { /* storage quota, ignore */ }
}

/**
 * The cached snapshot, or null when there is none, it is unreadable, or it was
 * written by a build with a different record shape (that one is deleted).
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
    return parsed;
  } catch { return null; }
}

/** Whole minutes since the snapshot was written (the "(5m ago)" in the status bar). */
export function cacheAgeMinutes(cache, now = Date.now()) {
  return Math.round((now - cache.ts) / 60000);
}
