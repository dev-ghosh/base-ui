'use client';

import { useEffect, useRef } from 'react';
import { useStore } from '../store/useStore.js';
import { loadData } from '../lib/load-data.js';

/**
 * Load every list once per sign-in, as soon as the user is signed in AND the
 * access answer is in (the old boot ran loadMyAccess() then loadData()).
 *
 * `signedIn` comes from the shell's session. Sign-out resets access (resetAccess),
 * so the next sign-in goes false -> true again and loads again. A ref (kept by
 * React across StrictMode's simulated remount) stops the dev double-effect from
 * loading twice.
 */
export function useDataLoader(signedIn) {
  const accessLoaded = useStore((s) => s.accessLoaded);
  const ready = !!signedIn && accessLoaded;
  const started = useRef(false);

  useEffect(() => {
    if (!ready) { started.current = false; return; }
    if (started.current) return;
    started.current = true;
    loadData().catch((e) => console.warn('loadData failed:', e));
  }, [ready]);
}
