// Loading every list from the backend into the store. Port of loadData() and
// syncData() in rie-dashboard2/js/app.js. Plain JS with relative imports so plain
// Node can run it.
//
// Left to the screens that own them (they were part of the old loadData but belong
// to later tasks): the task_functions registry (matrix), escalations and profile
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

/**
 * Fetch everything and replace the store's lists.
 * @returns {Promise<boolean>} true when the lists are fresh from the server; false
 *   when the cache (or nothing) is what is on screen. (The old function returned the
 *   same, for the Sync button's "Synced" / "Could not sync" notification.)
 */
export async function loadData() {
  setStatus('syncing', 'Syncing database…');
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
    });
    writeCache();
    // The status bar says only what a status bar is for: is this connected, and
    // how old is what I am looking at. Counts belong on the surface that uses them.
    setStatus(
      'online',
      'Connected',
      'Synced ' + new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
    );
    return true;
  } catch (e) {
    const cache = readCache();
    if (cache) {
      const restored = {};
      for (const k of CACHED_LISTS) restored[k] = cache[k] || [];
      restored.people = cache.people || store.getState().people || [];
      store.setState(restored);
      setStatus('online', `Showing cached data (${cacheAgeMinutes(cache)}m ago)`);
    } else {
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
