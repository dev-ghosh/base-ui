'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { TOAST_MS, dismissToast, removeToast, toastStore } from './toasts.js';

/** One toast: fades in on the next frame, dismisses itself after 5 s, the ✕ only dismisses. */
function Toast({ toast }) {
  const { id, title, message, type, onClick, leaving } = toast;
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setShown(true));
    const timer = setTimeout(() => dismissToast(id), TOAST_MS);
    return () => { cancelAnimationFrame(raf); clearTimeout(timer); };
  }, [id]);

  const cls = ['toast', type, onClick ? 'click' : '', shown && !leaving ? 'in' : ''].filter(Boolean).join(' ');
  return (
    <div
      className={cls}
      onClick={onClick ? () => { onClick(); removeToast(id); } : undefined}
    >
      {/* The ✕ only dismisses; it must not also run the toast's own click. */}
      <button type="button" className="toast-x" aria-label="Dismiss" onClick={(e) => { e.stopPropagation(); dismissToast(id); }}>✕</button>
      <div className="toast-t">{title}</div>
      <div className="toast-m">{message}</div>
    </div>
  );
}

/**
 * The toast corner (`#rie-toast-container`, the old lazily created box). Mounted once in the (app) layout.
 */
export default function ToastHost() {
  const toasts = useSyncExternalStore(toastStore.subscribe, () => toastStore.getState().toasts, () => toastStore.getState().toasts);
  return (
    <div id="rie-toast-container" role="status" aria-live="polite">
      {toasts.map((t) => <Toast key={t.id} toast={t} />)}
    </div>
  );
}
