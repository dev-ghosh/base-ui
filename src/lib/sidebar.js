// The side menu's open/closed behaviour. Port of rie-dashboard2/js/shell.js.
//
// One sidebar, two behaviours. On a wide screen (>= 1024px) it is part of the layout
// and the menu button folds it to an icon rail and back (the choice is remembered in
// localStorage 'rie_side_collapsed'). Below that it is a drawer over the page with a
// scrim. Both are driven by classes on <html>, so the CSS owns every pixel of the
// animation and this module owns only the state:
//
//   html.side-collapsed   wide screens: icon rail instead of the full menu
//   html.side-open        narrow screens: the drawer is showing
import { createStore } from '../store/store.js';

export const SIDE_KEY = 'rie_side_collapsed';
const WIDE_QUERY = '(min-width: 1024px)';
const OPENING_MS = 900;

/**
 * What the menu button and #side render from.
 *   open     the menu is showing (wide: not collapsed; narrow: drawer open)
 *   wide     the viewport is at least 1024px
 *   opening  the entrance animation is replaying
 */
export const sidebarStore = createStore({ open: true, wide: true, opening: false });

const root = () => document.documentElement;

export function isWide() {
  if (typeof window === 'undefined') return true;
  if (typeof window.matchMedia === 'function') return window.matchMedia(WIDE_QUERY).matches;
  return window.innerWidth >= 1024;
}

function computeOpen() {
  return isWide() ? !root().classList.contains('side-collapsed') : root().classList.contains('side-open');
}

/** Recompute the rendered state from the classes on <html>. */
export function syncSidebar() {
  const open = computeOpen();
  const wide = isWide();
  const cur = sidebarStore.getState();
  if (cur.open !== open || cur.wide !== wide) sidebarStore.setState({ open, wide });
}

let openTimer = null;

/** Replay the staggered entrance of the items. */
function animateIn() {
  clearTimeout(openTimer);
  sidebarStore.setState({ opening: true });
  openTimer = setTimeout(() => sidebarStore.setState({ opening: false }), OPENING_MS);
}

export function openSidebar() {
  if (isWide()) root().classList.remove('side-collapsed');
  else root().classList.add('side-open');
  animateIn();
  syncSidebar();
}

export function closeSidebar() {
  if (isWide()) root().classList.add('side-collapsed');
  else root().classList.remove('side-open');
  syncSidebar();
}

export function closeSidebarIfMobile() {
  if (!isWide()) { root().classList.remove('side-open'); syncSidebar(); }
}

export function toggleMenu() {
  if (computeOpen()) closeSidebar(); else openSidebar();
  if (isWide()) {
    try { localStorage.setItem(SIDE_KEY, root().classList.contains('side-collapsed') ? '1' : '0'); } catch { /* ignore */ }
  }
}

/**
 * Run once when the shell mounts: restore the remembered collapse (the early script
 * does this before first paint on a full load; this covers everything else), follow
 * the breakpoint, and own the keyboard. Returns the cleanup.
 */
export function initSidebar() {
  let collapsed = false;
  try { collapsed = localStorage.getItem(SIDE_KEY) === '1'; } catch { /* ignore */ }
  if (isWide() && collapsed) root().classList.add('side-collapsed');
  syncSidebar();

  const mq = typeof window.matchMedia === 'function' ? window.matchMedia(WIDE_QUERY) : null;
  const onBreakpoint = () => {
    root().classList.remove('side-open');     // never carry a drawer across the breakpoint
    syncSidebar();
  };
  mq?.addEventListener?.('change', onBreakpoint);

  const onKey = (e) => {
    const t = e.target;
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(t?.tagName) || t?.isContentEditable;
    if (e.key === 'Escape') {
      if (!isWide()) closeSidebarIfMobile();
    } else if (e.key === '[' && !typing && !e.metaKey && !e.ctrlKey && !document.getElementById('tour-root')) {
      toggleMenu();
    }
  };
  document.addEventListener('keydown', onKey);

  return () => {
    mq?.removeEventListener?.('change', onBreakpoint);
    document.removeEventListener('keydown', onKey);
    clearTimeout(openTimer);
  };
}
