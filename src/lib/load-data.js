// Loading every list from the backend into the store. Port of loadData() and
// syncData() in rie-dashboard2/js/app.js. Plain JS with relative imports so plain
// Node can run it.
//
// Left to the screens that own them (they were part of the old loadData but belong
// to later tasks): the task_functions registry (matrix), profile
// preferences, the seen-task/alert bookkeeping, and the one-time tour toast.
import { store } from '../store/store.js';
import { getStorage } from './config.js';
import { sbGet, safeGet } from './rest.js';
import {
  rowToContact, rowToEntity, rowToEvent, rowToGuest, rowToHeartbeat, rowToCandidate,
  rowToDecision, rowToCleanup, rowToLead, rowToEntityEvent,
} from './mappers.js';
import { setStatus } from './status.js';
import { readCache, writeCache, cacheAgeMinutes, CACHED_LISTS } from './data-cache.js';
import { beginLoad, isCurrentLoad } from './user-data.js';

/**
 * The escalations rows (newest 500), kept as raw rows in store.escalations. Port of loadEscalations() in
 * rie-dashboard2/js/escalations.js, which the old loadData() ran after the lists (Analytics counts the
 * open ones; the Escalations screen is a later task). A missing table is reported in
 * store.escalationsError ('missing'), any other failure by its message; neither throws.
 * @param {object} [token] the load this belongs to (beginLoad()); its result is dropped when the session has ended
 */
export async function loadEscalations(token = beginLoad()) {
  try {
    const rows = await sbGet('escalations', 'order=created_at.desc&limit=500');
    if (!isCurrentLoad(token)) return;
    store.setState({ escalations: Array.isArray(rows) ? rows : [], escalationsError: null });
  } catch (e) {
    if (!isCurrentLoad(token)) return;
    const missing = /404|42P01|relation|PGRST205|schema cache/i.test(e?.message || '');
    store.setState({ escalationsError: missing ? 'missing' : (e?.message || String(e)) });
  }
}

/**
 * Fetch everything and replace the store's lists.
 * @returns {Promise<boolean>} true when the lists are fresh from the server; false
 *   when the cache (or nothing) is what is on screen. (The old function returned the
 *   same, for the Sync button's "Synced" / "Could not sync" notification.)
 */
export async function loadData() {
  setStatus('syncing', 'Syncing database…');
  // R25: a load belongs to the person (and sign-in) that started it. If they sign out, or
  // someone else signs in, while it is in flight its result is dropped untouched.
  const token = beginLoad();
  try {
    // v3: tasks are read from entities WHERE tier='task' (trg_tasks_sync_entities keeps them in sync)
    const [cRows, entityTaskRows, eRows, gRows, leadRows, initRows, candidateRows, decisionRows,
      cleanupRows, frontsRows, peopleRows, wsRows, actionRows, linkRows, ownerRows, auditRows] = await Promise.all([
      sbGet('contacts', 'order=id.asc'),
      safeGet('entities', 'tier=eq.task&order=id.asc'),
      safeGet('events', 'order=date.asc'),
      safeGet('event_guests', 'order=name.asc'),
      safeGet('leads', 'order=updated_at.desc'),
      safeGet('v_initiative_heartbeat', ''),
      safeGet('v_opening_move_candidates', 'order=score.desc&limit=10'),
      safeGet('decision_queue', 'status=eq.pending&order=raised_at.asc'),
      safeGet('cleanup_queue', 'status=eq.pending&order=similarity_score.desc'),
      safeGet('fronts', 'archived_at=is.null&order=code.asc'),
      safeGet('people', 'archived_at=is.null&order=code.asc'),
      safeGet('entities', 'tier=eq.workstream&order=id.asc'),
      safeGet('entities', 'tier=eq.action&order=id.asc'),
      safeGet('entity_links', 'link_type=eq.contains&select=parent_id,child_id'),
      // Co-owners. Active rows only; RLS already limits them to visible tasks.
      safeGet('entity_owners', 'removed_at=is.null&select=entity_id,person_code'),
      safeGet('entity_events', 'order=created_at.desc&limit=60'),
    ]);

    if (!isCurrentLoad(token)) return false;

    // People and co-owners FIRST: rowToEntity resolves owner names and
    // coOwnerCodes through them, so mapping tasks earlier would label every
    // owner with a bare code on first paint.
    const coOwners = new Map();
    for (const o of ownerRows || []) {
      if (!o.entity_id || !o.person_code) continue;
      const list = coOwners.get(o.entity_id) || [];
      if (!list.includes(o.person_code)) list.push(o.person_code);
      coOwners.set(o.entity_id, list);
    }
    // The primary owner is not a co-owner of their own task; drop the mirror
    // rows the May migration wrote so names do not appear twice.
    for (const r of entityTaskRows) {
      const list = coOwners.get(r.id);
      if (list && r.owner_code) {
        const rest = list.filter((c) => c !== r.owner_code);
        if (rest.length) coOwners.set(r.id, rest); else coOwners.delete(r.id);
      }
    }
    store.setState({ people: peopleRows, coOwners });

    store.setState({
      contacts: cRows.map(rowToContact),
      // tasks sourced from v3 entities; id field is the entity id for R6 direct writes
      tasks: entityTaskRows.map(rowToEntity),
      events: eRows.map(rowToEvent),
      guests: gRows.map(rowToGuest),
      leads: leadRows.map(rowToLead),
      initiatives: initRows.map(rowToHeartbeat),
      candidates: candidateRows.map(rowToCandidate),
      decisions: decisionRows.map(rowToDecision),
      cleanups: cleanupRows.map(rowToCleanup),
      fronts: frontsRows,
      workstreams: wsRows.map(rowToEntity),
      actions: actionRows.map(rowToEntity),
      entityLinks: linkRows.map((r) => ({ parentId: r.parent_id, childId: r.child_id })),
      entityEvents: (auditRows || []).map(rowToEntityEvent),
      dataLoaded: true,
    });
    writeCache();
    // The status bar says only what a status bar is for: is this connected, and
    // how old is what I am looking at. Counts belong on the surface that uses them.
    setStatus(
      'online',
      'Connected',
      'Synced ' + new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
    );
    // Per-person data, after the lists (the old loadData awaited loadEscalations() here).
    await loadEscalations(token);
    return true;
  } catch (e) {
    if (!isCurrentLoad(token)) return false;
    const cache = readCache();
    if (cache) {
      const restored = {};
      for (const k of CACHED_LISTS) restored[k] = cache[k] || [];
      restored.people = cache.people || store.getState().people || [];
      restored.dataLoaded = true;
      store.setState(restored);
      setStatus('online', `Showing cached data (${cacheAgeMinutes(cache)}m ago)`);
    } else {
      store.setState({ dataLoaded: true });   // nothing arrived and nothing is cached: the lists really are empty
      setStatus('error', 'Could not load data: ' + (e?.message || e));
    }
    return false;   // cache or nothing: not a successful sync
  }
}

/** Reload everything (the legacy cache key is dropped first, as the old code did). */
export async function syncData() {
  try { getStorage()?.removeItem('rie_cache_v3'); } catch { /* storage unavailable */ }
  return loadData();
}
