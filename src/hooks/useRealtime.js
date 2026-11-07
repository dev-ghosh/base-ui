'use client';

import { useEffect } from 'react';
import { useStore } from '../store/useStore.js';
import { initRealtime, destroyRealtime } from '../lib/realtime.js';
import { applyRealtimeBatch, REALTIME_BATCH_MS } from '../lib/apply-realtime.js';
import { syncData } from '../lib/load-data.js';
import { writeCache } from '../lib/data-cache.js';

/**
 * Live updates while signed in (and the access answer is in, like the data
 * loader). Port of startRealtime() in rie-dashboard2/js/app.js.
 *
 * Frames are collected and applied together once the stream has been quiet for
 * REALTIME_BATCH_MS (a trailing debounce, as before). The batch is applied row by
 * row; if any frame needs a full resync (reconnect, unusable payload, derived
 * table, initiative, exception) the whole batch costs one syncData(). Unmount or
 * sign-out closes the socket and drops anything still pending.
 */
export function useRealtime(signedIn) {
  const accessLoaded = useStore((s) => s.accessLoaded);
  const active = !!signedIn && accessLoaded;

  useEffect(() => {
    if (!active) return undefined;
    let timer = null;
    const pending = [];

    const flush = () => {
      const batch = pending.splice(0);
      const { result, changed } = applyRealtimeBatch(batch);
      if (result === 'resync') {
        syncData().catch((e) => console.warn('syncData failed:', e));
      } else if (changed) {
        writeCache();
      }
    };

    initRealtime((change) => {
      pending.push(change);
      clearTimeout(timer);
      timer = setTimeout(flush, REALTIME_BATCH_MS);
    });

    return () => {
      clearTimeout(timer);
      pending.length = 0;
      destroyRealtime();
    };
  }, [active]);
}
