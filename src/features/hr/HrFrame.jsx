'use client';

import { useCallback, useEffect, useRef } from 'react';
import { EmptyCard } from '../../components/ui.jsx';
import { useTheme } from '../../hooks/useTheme.js';
import { getTheme } from '../../lib/theme.js';

/**
 * The HR automation page (old `#tab-hr-automation`): an iframe of a separate app (spec C14) whose
 * address is NEXT_PUBLIC_HR_AUTOMATION_URL.
 *
 * It is another origin, so it cannot read our theme; it listens for a message instead. This posts
 * `{ type: 'rie-theme', theme }` to the frame's own origin (never "*") when the frame has loaded and
 * again every time the theme changes (old syncEmbeddedTheme(), called from the iframe's onload and
 * from setTheme()). Nothing is posted before the frame has loaded: it would only be dropped.
 */
export default function HrFrame() {
  const src = process.env.NEXT_PUBLIC_HR_AUTOMATION_URL;
  const { theme } = useTheme();
  const frame = useRef(null);
  const loaded = useRef(false);

  const post = useCallback(() => {
    const win = frame.current?.contentWindow;
    if (!win || !src) return;
    try {
      win.postMessage({ type: 'rie-theme', theme: getTheme() }, new URL(src).origin);
    } catch { /* frame not ready, or an address that is not a URL */ }
  }, [src]);

  useEffect(() => {
    if (loaded.current) post();
  }, [theme, post]);

  if (!src) {
    return (
      <div className="tp page active" id="tab-hr-automation">
        <div className="pg-wrap">
          <EmptyCard title="HR automation is not set up" text="Set NEXT_PUBLIC_HR_AUTOMATION_URL to the address of the HR automation app." />
        </div>
      </div>
    );
  }

  return (
    <div className="tp page active" id="tab-hr-automation">
      <iframe
        ref={frame}
        id="hr-automation-frame"
        title="HR automation"
        src={src}
        onLoad={() => { loaded.current = true; post(); }}
        style={{ display: 'block', width: '100%', height: '100%', minHeight: 'calc(100vh - 60px)', border: 0 }}
      />
    </div>
  );
}
