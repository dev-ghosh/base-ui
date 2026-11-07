// A tiny stand-in for next/navigation that actually behaves like a URL: push / replace change
// the pathname and search, and usePathname / useSearchParams re-render their readers. Tests use
// it through   vi.mock('next/navigation', async () => (await import('./helpers/fake-router.js')).navigationMock)
import { createElement, useSyncExternalStore } from 'react';

const listeners = new Set();
const state = { pathname: '/work/matrix', search: '' };
export const history = [];          // { kind: 'push' | 'replace', href }
export const redirects = [];        // targets given to redirect()

const emit = () => { for (const l of [...listeners]) l(); };
const subscribe = (fn) => { listeners.add(fn); return () => { listeners.delete(fn); }; };

/** Set the URL (e.g. '/work/matrix?scope=team') without recording it as a navigation. */
export function setUrl(href) {
  const [pathname, search = ''] = href.split('?');
  state.pathname = pathname;
  state.search = search;
  emit();
}
export const currentUrl = () => state.pathname + (state.search ? '?' + state.search : '');
export const currentParams = () => new URLSearchParams(state.search);
export function resetNav(href = '/work/matrix') {
  history.length = 0;
  redirects.length = 0;
  setUrl(href);
}

const go = (kind) => (href) => {
  history.push({ kind, href });
  setUrl(href);
};
const router = { push: go('push'), replace: go('replace'), back: () => {}, forward: () => {}, refresh: () => {}, prefetch: () => {} };

let cachedSearch = null;
let cachedParams = new URLSearchParams('');
const searchSnapshot = () => {
  if (cachedSearch !== state.search) { cachedSearch = state.search; cachedParams = new URLSearchParams(state.search); }
  return cachedParams;
};

export const navigationMock = {
  useRouter: () => router,
  usePathname: () => useSyncExternalStore(subscribe, () => state.pathname, () => state.pathname),
  useSearchParams: () => useSyncExternalStore(subscribe, searchSnapshot, searchSnapshot),
  useParams: () => ({}),
  redirect: (to) => { redirects.push(to); },
  notFound: () => {},
};

/** next/link as a plain anchor whose click goes through the fake router (modifier clicks are left alone). */
export const linkMock = {
  default: function Link({ href, children, onClick, prefetch: _prefetch, replace: doReplace, ...rest }) {
    return createElement('a', {
      href,
      ...rest,
      onClick: (e) => {
        onClick?.(e);
        if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.button > 0) return;
        e.preventDefault();
        (doReplace ? router.replace : router.push)(String(href));
      },
    }, children);
  },
};
