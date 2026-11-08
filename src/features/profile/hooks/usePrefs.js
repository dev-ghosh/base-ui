'use client';

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { useStore } from '../../../store/useStore.js';
import { avatarColourOf, prefsFlagStore, prefsOf } from '../../../lib/prefs.js';

/** { prefs (defaults filled in), loaded, remote } for the signed-in person's preferences. */
export function usePrefs() {
  const stored = useStore((s) => s.prefs);
  const remote = useStore((s) => s.prefsRemote);
  return useMemo(() => ({ prefs: prefsOf({ prefs: stored }), loaded: stored !== null, remote }), [stored, remote]);
}

/** The avatar colour for the `.user-av` circles (sidebar, top bar, Profile). Clay until a choice is known. */
export function useAvatarColour() {
  const stored = useStore((s) => s.prefs);
  return avatarColourOf(stored);
}

/** The "Saved" flag beside the Profile title: its text and whether it is showing (1.8 s after each save). */
export function useSavedFlag() {
  const flag = useSyncExternalStore(prefsFlagStore.subscribe, prefsFlagStore.getState, prefsFlagStore.getState);
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!flag.n) return undefined;
    setShow(true);
    const t = setTimeout(() => setShow(false), 1800);
    return () => clearTimeout(t);
  }, [flag.n]);
  return { msg: flag.msg, show };
}
