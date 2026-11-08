// Toasts: the transient notices in the top-right corner. Port of showToast() / pushNotification() in
// rie-dashboard2/js/notifications.js. The old code appended DOM nodes to #rie-toast-container; here the
// list lives in a small store and <ToastHost> (mounted once in the (app) layout) draws it, so any module
// (task actions, the alert announcer, the Sync button) can raise one without a component.
//
// A toast is not an alert: it is not stored and not counted. Plain JS, no DOM: importable in Node.
import { createStore } from '../../store/store.js';

/** How long a toast stays, and how long the fade-out takes (the old setTimeout values). */
export const TOAST_MS = 5000;
export const TOAST_FADE_MS = 300;

/** { toasts: [{ id, title, message, type, onClick, leaving }] } oldest first. */
export const toastStore = createStore({ toasts: [] });

let seq = 0;

/**
 * Show a toast. `type` is the colour class ('info' default, 'alert' warm). With `onClick` the whole toast
 * is clickable (it runs the handler and goes); the little ✕ only dismisses.
 * @returns {number} the toast id
 */
export function showToast({ title, message, type = 'info', onClick } = {}) {
  const id = ++seq;
  toastStore.setState((s) => ({
    toasts: [...s.toasts, { id, title: title || '', message: message || '', type, onClick: onClick || null, leaving: false }],
  }));
  return id;
}

/** Take a toast off the screen at once. */
export function removeToast(id) {
  toastStore.setState((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
}

/** Fade a toast out, then remove it (the old `dismiss`). Dismissing twice is harmless. */
export function dismissToast(id) {
  const t = toastStore.getState().toasts.find((x) => x.id === id);
  if (!t || t.leaving) return;
  toastStore.setState((s) => ({ toasts: s.toasts.map((x) => (x.id === id ? { ...x, leaving: true } : x)) }));
  setTimeout(() => removeToast(id), TOAST_FADE_MS);
}

/** Transient feedback ("Task updated"). Not an alert: not stored, not counted. */
export function pushNotification(title, message, type = 'info') {
  showToast({ title, message, type });
}

/** Drop every toast (sign-out: they can name tasks and people). */
export function clearToasts() {
  toastStore.setState({ toasts: [] });
}
