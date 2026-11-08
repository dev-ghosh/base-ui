// The top-bar Sync button. Port of syncNow() in rie-dashboard2/js/app.js: everything a browser reload
// would refresh, without the reload. syncData() alone re-fetches rows but not access, so a role, company
// or scope change still needed a reload to show up.
//   1. access (rie_my_access): role, companies, admin, person binding
//   2. data (loadData): tasks, co-owners, people, registry, escalations, prefs
//   3. the page on screen: Team and Expenses cache their own tables, so those are re-fetched; every other
//      screen draws from the store, which step 2 has replaced (the old switchTab(active) re-render)
//   4. a check for a newer app version: if there is one the service worker installs it and the page
//      reloads once (the platform layer; a no-op where no service worker is registered)
//
// Plain JS with relative imports so plain Node can import it.
import { createStore } from '../store/store.js';
import { refreshMyAccess } from './access.js';
import { loadExpenses } from './expense-actions.js';
import { syncData } from './load-data.js';
import { setStatus } from './status.js';
import { loadTeam } from './team-actions.js';
import { pushNotification } from '../features/notifications/toasts.js';

/** { busy }: the Sync button spins (and is aria-busy) while a sync runs. */
export const syncStore = createStore({ busy: false });

/** The first path segment ('/team/cards' -> 'team'), the screen on show. */
const screenOf = (pathname) => String(pathname || '').split('/').filter(Boolean)[0] || '';

let syncing = false;

/**
 * @param {string} [pathname] the page on screen (usePathname), to refresh the tables it caches itself
 * @returns {Promise<boolean|undefined>} true when the server answered, false when what is shown is cached;
 *   undefined when a sync was already running or it threw
 */
export async function syncNow(pathname = '') {
  if (syncing) return undefined;
  syncing = true;
  syncStore.setState({ busy: true });
  try {
    await refreshMyAccess();
    const fresh = await syncData();
    const active = screenOf(pathname);
    // Pages that cache their own tables: drop the cache so the redraw re-fetches.
    if (active === 'team') await loadTeam(true);
    if (active === 'expenses') await loadExpenses(true);
    try {
      globalThis.navigator?.serviceWorker?.getRegistration?.().then((r) => r?.update()).catch(() => {});
    } catch { /* no service worker here */ }
    // Only claim success when the server answered; loadData already put the reason in the status bar otherwise.
    if (fresh) pushNotification('Synced', 'You are looking at the latest.', 'info');
    else pushNotification('Could not sync', 'Check your connection. Showing what was last loaded.', 'alert');
    return fresh;
  } catch (e) {
    setStatus('error', 'Sync failed: ' + (e.message || e));
    return undefined;
  } finally {
    syncing = false;
    syncStore.setState({ busy: false });
  }
}
