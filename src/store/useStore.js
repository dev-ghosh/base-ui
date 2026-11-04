'use client';

import { useSyncExternalStore } from 'react';
import { store } from './store.js';

// Rerenders only when the selected value changes by Object.is.
// The selector must return a stable value for unchanged state (select a field,
// not a freshly built object/array).
export function useStore(selector) {
  const get = () => selector(store.getState());
  return useSyncExternalStore(store.subscribe, get, get);
}
