// Row-level realtime apply. Port of applyRealtimeRow / applyEntityRealtimeRow /
// applyRealtimeChange in rie-dashboard2/js/app.js (rules: old CLAUDE.md "Realtime").
//
// One change is applied to the store as a single update, or the caller is told to
// do a full resync. A full resync is required for: a reconnect ({type:'resync'}),
// an unusable payload, a derived table, an initiative-tier entity, or any
// exception during apply. Rows that do not match their list's filter are ignored
// rather than guessed at.
//
// Unlike the old code (which mutated state.* arrays in place) every update here
// builds new arrays and writes them with one store.setState, so nothing is written
// if the apply throws half way.
import { store } from '../store/store.js';
import {
  rowToContact, rowToEntity, rowToEvent, rowToGuest, rowToLead, rowToCleanup,
} from './mappers.js';

/** Trailing debounce for realtime frames (useRealtime): events within this window are one batch. */
export const REALTIME_BATCH_MS = 1500;

export const REALTIME_DERIVED_TABLES = new Set([
  'v_initiative_heartbeat',
  'v_opening_move_candidates',
  'decision_queue',
]);

const sameId = (a, b) => a != null && b != null && String(a) === String(b);

/** The list `key` for mutation: a private copy, made once per change. */
function mutable(draft, key) {
  if (!draft[key]) draft[key] = store.getState()[key].slice();
  return draft[key];
}
const current = (draft, key) => draft[key] || store.getState()[key];

/**
 * Upsert/remove one row in list `key`. Returns true when the list changed, false
 * when there was nothing to do, null when the payload is unusable.
 */
function applyRow(draft, key, mapper, change, matches = () => true) {
  const eventType = change.eventType;
  const source = eventType === 'DELETE' ? change.old : change.new;
  if (!source || source.id == null) return null;

  const index = current(draft, key).findIndex((item) => sameId(item.id, source.id));
  if (eventType === 'DELETE') {
    if (index !== -1) mutable(draft, key).splice(index, 1);
    return index !== -1;
  }
  if (eventType !== 'INSERT' && eventType !== 'UPDATE') return null;

  if (!matches(source)) {
    // Not a row this list holds. If it used to be (a status flipped away, a tier
    // changed) it leaves; otherwise it is ignored.
    if (index !== -1) mutable(draft, key).splice(index, 1);
    return index !== -1;
  }

  const mapped = mapper(source);
  const list = mutable(draft, key);
  if (index === -1) list.push(mapped);
  else list[index] = mapped;
  return true;
}

function applyEntityRow(draft, change) {
  const source = change.eventType === 'DELETE' ? change.old : change.new;
  if (!source || source.id == null) return null;

  if (change.eventType === 'DELETE') {
    let changed = false;
    for (const key of ['tasks', 'workstreams', 'actions']) {
      const index = current(draft, key).findIndex((item) => sameId(item.id, source.id));
      if (index !== -1) { mutable(draft, key).splice(index, 1); changed = true; }
    }
    return changed;
  }

  if (source.tier === 'initiative') return null;   // initiatives come from the heartbeat view: resync
  let changed = false;
  for (const [key, tier] of [['tasks', 'task'], ['workstreams', 'workstream'], ['actions', 'action']]) {
    const result = applyRow(draft, key, rowToEntity, change, (row) => row.tier === tier);
    if (result === null) return null;
    changed = result || changed;
  }
  return changed;
}

/** Escalations are kept as the raw rows (the page reads snake_case fields). */
function applyEscalation(draft, change) {
  const row = change.eventType === 'DELETE' ? change.old : change.new;
  if (!row || row.id == null) return false;
  const list = mutable(draft, 'escalations');
  const i = list.findIndex((x) => sameId(x.id, row.id));
  if (change.eventType === 'DELETE') {
    if (i !== -1) list.splice(i, 1);
  } else if (i === -1) list.unshift(row);
  else list[i] = { ...list[i], ...row };
  return true;
}

/** @returns {boolean|null} whether the store changed; null = unusable, resync */
function apply(draft, change) {
  switch (change.table) {
    case 'contacts': return applyRow(draft, 'contacts', rowToContact, change);
    case 'entities': return applyEntityRow(draft, change);
    case 'escalations': return applyEscalation(draft, change);
    case 'events': return applyRow(draft, 'events', rowToEvent, change);
    case 'event_guests': return applyRow(draft, 'guests', rowToGuest, change);
    case 'leads': return applyRow(draft, 'leads', rowToLead, change);
    case 'cleanup_queue': return applyRow(draft, 'cleanups', rowToCleanup, change, (row) => row.status === 'pending');
    // Both are compatibility/audit echoes; neither backs an in-memory list.
    case 'tasks':
    case 'lead_history':
      return false;
    default:
      return null;
  }
}

/**
 * Apply one realtime frame to the store.
 * @param {{table:string,eventType:string,new:object|null,old:object|null}|{type:string}} change
 * @returns {'applied'|'resync'} 'resync' means: refetch everything (syncData)
 */
export function applyRealtimeChange(change) {
  // A refused subscription is already logged by realtime.js and cannot be healed
  // by refetching, so it must not trigger a full sync on every frame.
  if (change?.type === 'error') return 'applied';
  if (!change || change.type === 'resync' || REALTIME_DERIVED_TABLES.has(change.table)) return 'resync';
  const source = change.eventType === 'DELETE' ? change.old : change.new;
  if (!['INSERT', 'UPDATE', 'DELETE'].includes(change.eventType) || !source || source.id == null) return 'resync';

  try {
    const draft = {};
    const changed = apply(draft, change);
    if (changed === null) return 'resync';
    if (Object.keys(draft).length) store.setState(draft);
    return 'applied';
  } catch (e) {
    // A mapper that throws on an unexpected row would otherwise leave the client
    // silently stale. Fall back to the thing that always works.
    console.warn('Realtime apply failed, falling back to a full sync:', e);
    return 'resync';
  }
}

/**
 * Apply a debounced batch in order, stopping at the first change that needs a
 * resync. `changed` says whether the store was written (so the caller can refresh
 * the offline cache only when something actually changed).
 * @returns {{result:'applied'|'resync', changed:boolean}}
 */
export function applyRealtimeBatch(batch) {
  const before = store.getState();
  for (const change of batch) {
    if (applyRealtimeChange(change) === 'resync') {
      return { result: 'resync', changed: store.getState() !== before };
    }
  }
  return { result: 'applied', changed: store.getState() !== before };
}
