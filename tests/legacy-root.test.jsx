// Old bookmarks end to end: the root page lands the app, then the (app) layout converts the
// legacy URL. Unit coverage of the pure resolver is in legacy-urls.test.mjs.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor, cleanup } from '@testing-library/react';

process.env.NEXT_PUBLIC_SB_URL = 'https://example.supabase.co';
process.env.NEXT_PUBLIC_SB_KEY = 'anon-key-123';

// A router whose replace() really moves the (jsdom) address bar, like Next's does, so the
// layout sees the URL the root page sent it to.
const nav = vi.hoisted(() => ({ path: '/', calls: [], router: { replace: null, push: null, back: null } }));
vi.mock('next/navigation', () => ({
  useRouter: () => nav.router,
  usePathname: () => nav.path,
  useParams: () => ({}),
  useSearchParams: () => new URLSearchParams(''),
}));
vi.mock('@/lib/auth.js', async (importOriginal) => {
  const real = await importOriginal();
  return { ...real, scheduleAutoRefresh: vi.fn() };
});

// Not under test here: no network, no websocket.
vi.mock('@/lib/load-data.js', () => ({ loadData: vi.fn(async () => true), syncData: vi.fn(async () => true) }));
vi.mock('@/lib/realtime.js', () => ({ initRealtime: vi.fn(), destroyRealtime: vi.fn() }));

import RootPage from '@/app/page.jsx';
import AppLayout from '@/app/(app)/layout.jsx';
import { resetAccess } from '@/lib/access.js';
import { store } from '@/store/store.js';

const DAY = 24 * 60 * 60 * 1000;
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = (payload) => `${b64({ alg: 'HS256' })}.${b64(payload)}.sig`;
const signIn = () => localStorage.setItem('rie_session', JSON.stringify({
  accessToken: 'tok', refreshToken: 'ref', userId: 'u1', email: 'pat@example.com',
  displayName: 'Pat Example', expiresAt: Date.now() + 30 * DAY,
}));
const setUrl = (u) => window.history.replaceState(null, '', u);

beforeEach(() => {
  localStorage.clear();
  nav.calls = [];
  nav.path = '/';
  nav.router.replace = vi.fn((u) => { nav.calls.push(u); setUrl(u); });
  nav.router.push = vi.fn();
  nav.router.back = vi.fn();
  resetAccess();
  vi.stubGlobal('fetch', vi.fn(async (url) => ({
    ok: true, status: 200, text: async () => '',
    json: async () => (String(url).includes('/rpc/rie_my_access') ? [{ can_write: true }] : {}),
  })));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** Land via the root page, then "navigate" (the mock already moved the URL) into the shell. */
async function landThenShell() {
  const root = render(<RootPage />);
  await waitFor(() => expect(nav.calls.length).toBeGreaterThan(0));
  root.unmount();
  const landed = nav.calls[0];
  nav.calls = [];
  nav.path = landed.split(/[?#]/)[0];
  render(<AppLayout modal={null}><div data-testid="page" /></AppLayout>);
  return landed;
}

describe('legacy bookmarks, root page through the (app) layout', () => {
  it('/#mx?s=pending&o=ABC ends on /work/matrix?s=pending&o=ABC', async () => {
    signIn();
    setUrl('/#mx?s=pending&o=ABC');
    const landed = await landThenShell();
    expect(landed).toBe('/today#mx?s=pending&o=ABC');            // the root keeps the hash
    await waitFor(() => expect(nav.calls).toEqual(['/work/matrix?s=pending&o=ABC']));
    expect(window.location.hash).toBe('');                        // converted once, hash gone
    expect(window.location.pathname + window.location.search).toBe('/work/matrix?s=pending&o=ABC');
  });

  it('/#mx (no filters) ends on /work/matrix', async () => {
    signIn();
    setUrl('/#mx');
    await landThenShell();
    await waitFor(() => expect(nav.calls).toEqual(['/work/matrix']));
  });

  it('/?tab=work ends on /work/matrix', async () => {
    signIn();
    setUrl('/?tab=work');
    expect(await landThenShell()).toBe('/today?tab=work');
    await waitFor(() => expect(nav.calls).toEqual(['/work/matrix']));
  });

  it('/?tab=bogus ends on /today', async () => {
    signIn();
    setUrl('/?tab=bogus');
    await landThenShell();
    await waitFor(() => expect(nav.calls).toEqual(['/today']));
  });

  it('a plain / lands on /today and nothing more happens', async () => {
    signIn();
    setUrl('/');
    expect(await landThenShell()).toBe('/today');
    await waitFor(() => expect(document.getElementById('side')).not.toBeNull());
    expect(nav.calls).toEqual([]);
  });

  it('other hashes are not carried onto the landing route', async () => {
    signIn();
    setUrl('/#mxfoo');
    expect(await landThenShell()).toBe('/today');
  });
});

describe('a new sign-in never reuses the previous answer', () => {
  it('the magic-link return resets access', async () => {
    store.setState({ access: { can_write: true, is_admin: true }, accessLoaded: true });
    setUrl(`/#access_token=${jwt({ sub: 'u2', email: 'b@example.com' })}&refresh_token=r`);
    render(<RootPage />);
    await waitFor(() => expect(nav.calls).toEqual(['/today']));
    expect(store.getState().accessLoaded).toBe(false);
    expect(store.getState().access).toBeNull();
  });
});
