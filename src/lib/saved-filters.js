/* saved-filters.js — Smart Search and saved filter presets. Port of rie-dashboard2/js/saved-filters.js.
 * Presets live in localStorage (`rie_saved_filters`), as before.
 *
 * The old module read the live filter state off `state.taskFilter`, `state.mxFilter` and `state.filter`
 * (none of which exist), so every preset it ever saved had an empty config, and applying one did
 * nothing. That is ported as it was: saveCurrentFilter() takes an optional `config`, and without one
 * stores the same empty config. applySavedFilter() takes the handlers the old code looked up on
 * `window` (mxSet, setTDF, applyF); none are wired yet, so applying is a no-op, as before.
 *
 * The Ctrl+K listener and the dialog are in features/search/SmartSearch.jsx.
 * Pure apart from localStorage (every access is guarded). Plain Node can import it.
 */
export const SAVED_FILTERS_KEY = 'rie_saved_filters';

const storage = () => {
  try { return globalThis.localStorage || null; } catch { return null; }
};

export function getSavedFilters() {
  try {
    const raw = storage()?.getItem(SAVED_FILTERS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/** What the old code stored for the current view: its three state keys never existed, so all empty. */
export const emptyFilterConfig = () => ({
  taskStatus: '', taskAssignee: '', taskCompany: '', matrixFilters: null, contactFilter: null,
});

/** @returns {boolean} true when saved */
export function saveCurrentFilter(name, surface = 'tasks', config = emptyFilterConfig(), now = new Date()) {
  if (!name || !name.trim()) return false;
  const filters = getSavedFilters();
  filters.push({
    id: 'flt_' + now.getTime(),
    name: name.trim(),
    surface,
    createdAt: now.toISOString(),
    config,
  });
  try {
    storage().setItem(SAVED_FILTERS_KEY, JSON.stringify(filters));
    return true;
  } catch (err) {
    console.error('Failed to save filter preset', err);
    return false;
  }
}

/** Apply a preset through the given handlers (each optional, as the old `window.x &&` checks were). */
export function applySavedFilter(filterId, { mxSet, setTDF, applyF } = {}) {
  const match = getSavedFilters().find((f) => f.id === filterId);
  if (!match) return;
  const c = match.config || {};
  if (c.matrixFilters && mxSet) {
    for (const [k, v] of Object.entries(c.matrixFilters)) mxSet(k, v);
  }
  if (c.taskStatus && setTDF) setTDF('status', c.taskStatus);
  if (c.taskCompany && setTDF) setTDF('company', c.taskCompany);
  if (c.contactFilter && applyF) applyF(c.contactFilter);
}

export function deleteSavedFilter(filterId) {
  const filters = getSavedFilters().filter((f) => f.id !== filterId);
  storage()?.setItem(SAVED_FILTERS_KEY, JSON.stringify(filters));
}

/**
 * Global Smart Search across tasks, contacts and leads: two characters or more, case-insensitive
 * substring, at most ten of each. `data` is { tasks, contacts, leads } (the old state).
 */
export function globalSmartSearch(query, { tasks = [], contacts = [], leads = [] } = {}) {
  if (!query || query.trim().length < 2) return { tasks: [], contacts: [], leads: [] };
  const q = query.trim().toLowerCase();
  const has = (v) => Boolean(v) && v.toLowerCase().includes(q);
  return {
    tasks: tasks.filter((t) => has(t.task) || has(t.company) || has(t.assignedTo) || has(t.func)).slice(0, 10),
    contacts: contacts.filter((c) => has(c.name) || has(c.org) || has(c.email)).slice(0, 10),
    leads: leads.filter((l) => has(l.name) || has(l.targetOrg)).slice(0, 10),
  };
}
