// The status bar's state. Port of setStatus() in rie-dashboard2/js/utils.js.
//
// A module-level store rather than component state because setStatus is called
// from places that are not components (data loading, realtime, auth expiry).
// Components read it through useStatus().
import { createStore } from '../store/store.js';

const INITIAL = { kind: '', msg: 'Loading…', meta: '' };

export const statusStore = createStore(INITIAL);

/**
 * @param {string} kind  '' | 'online' | 'syncing' | 'error' ... becomes the dot's modifier class
 * @param {string} msg   the text
 * @param {string} [meta] right-hand note; like the old code it is only replaced when a
 *                        new one is given, so "cached 5m ago" survives a later message
 */
export function setStatus(kind, msg, meta) {
  statusStore.setState((s) => ({ kind: kind || '', msg, meta: meta ? meta : s.meta }));
}

export const getStatus = () => statusStore.getState();

export function resetStatus() {
  statusStore.setState(INITIAL);
}
