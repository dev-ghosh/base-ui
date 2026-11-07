'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { splashStore } from '../lib/splash.js';

const FADE_MS = 450;   // hideSplash() in the old utils.js: .hide fades, then display:none

/** The boot splash (#splash). Shown until the shell is ready, then fades out. */
export default function Splash() {
  const { msg, hidden } = useSyncExternalStore(splashStore.subscribe, splashStore.getState, splashStore.getState);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    if (!hidden) { setGone(false); return undefined; }
    const t = setTimeout(() => setGone(true), FADE_MS);
    return () => clearTimeout(t);
  }, [hidden]);

  return (
    <div id="splash" className={hidden ? 'hide' : undefined} style={gone ? { display: 'none' } : undefined}>
      <div className="sp-mark">B</div>
      <div className="sp-title">BASE</div>
      <div className="sp-sub">Connecting to database…</div>
      <div className="sp-spin"></div>
      <div className="sp-msg" id="sp-msg">{msg}</div>
    </div>
  );
}
