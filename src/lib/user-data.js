// What belongs to the signed-in person (R25): the offline cache and the loaded lists
// must never outlive their owner, and a load that was started for one person must
// never land for another. One helper, called from the single place sessions end
// (auth.clearSession) and when a different person's session replaces another's
// (auth.decodeSession). Plain JS, relative imports, importable in Node.
import { store, createInitialState } from '../store/store.js';
import { clearCache, currentUserId } from './data-cache.js';

// Bumped every time a session ends. A load remembers the value it started under.
let generation = 0;

// The store keys that hold the signed-in person's data (not access, session or the scope choice).
const DATA_KEYS = [
  'contacts', 'events', 'guests', 'tasks', 'workstreams', 'actions', 'entityLinks',
  'entities', 'fronts', 'people', 'coOwners', 'initiatives', 'candidates', 'decisions',
  'cleanups', 'decideRows', 'decideLoaded', 'decideSweep', 'leads', 'entityEvents', 'escalations', 'dataLoaded',
];

/** Identify the load that is starting now: this sign-in, this person. */
export function beginLoad() {
  return { generation, userId: currentUserId() };
}

/** False once the session it started under has ended or been replaced by another person's. */
export function isCurrentLoad(token) {
  return token.generation === generation && token.userId === currentUserId();
}

/** The session ended: drop the offline cache and empty the lists, and orphan any load in flight. */
export function onSessionEnded() {
  generation += 1;
  clearCache();
  const initial = createInitialState();
  const patch = {};
  for (const k of DATA_KEYS) patch[k] = initial[k];
  store.setState(patch);
}
