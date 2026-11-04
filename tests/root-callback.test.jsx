import { StrictMode } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';

process.env.NEXT_PUBLIC_SB_URL = 'https://example.supabase.co';
process.env.NEXT_PUBLIC_SB_KEY = 'anon-key-123';

const nav = vi.hoisted(() => ({ router: { replace: null, push: null }, search: '' }));
vi.mock('next/navigation', () => ({
  useRouter: () => nav.router,
  useSearchParams: () => new URLSearchParams(nav.search),
}));

import RootPage from '@/app/page.jsx';
import LoginPage from '@/app/login/page.jsx';

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = (payload) => `${b64({ alg: 'HS256' })}.${b64(payload)}.sig`;
const setUrl = (path) => window.history.replaceState(null, '', path);
const stored = () => JSON.parse(localStorage.getItem('rie_session') || 'null');

beforeEach(() => {
  nav.router.replace = vi.fn();
  nav.router.push = vi.fn();
  nav.search = '';
  localStorage.clear();
  setUrl('/');
  vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('unexpected network call'); }));
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const lastReplace = () => nav.router.replace.mock.calls.at(-1)?.[0];

describe('root page: magic-link return (#access_token)', () => {
  it('stores rie_session, clears the hash and replaces to /today', async () => {
    const at = jwt({ sub: 'u1', email: 'a.b@example.com' });
    setUrl(`/#access_token=${at}&refresh_token=rt-1&type=magiclink`);
    render(<RootPage />);
    await waitFor(() => expect(nav.router.replace).toHaveBeenCalledWith('/today'));
    expect(stored().accessToken).toBe(at);
    expect(stored().refreshToken).toBe('rt-1');
    expect(stored().email).toBe('a.b@example.com');
    expect(window.location.hash).toBe('');
    expect(nav.router.replace).toHaveBeenCalledTimes(1);
  });

  it('accepts a link that carries no refresh_token', async () => {
    const at = jwt({ sub: 'u1' });
    setUrl(`/#access_token=${at}`);
    render(<RootPage />);
    await waitFor(() => expect(lastReplace()).toBe('/today'));
    expect(stored().accessToken).toBe(at);
  });

  it('a garbage token goes to /login?error=link, stores no session, and still clears the hash', async () => {
    setUrl('/#access_token=garbage&refresh_token=x');
    render(<RootPage />);
    await waitFor(() => expect(lastReplace()).toBe('/login?error=link'));
    expect(localStorage.getItem('rie_session')).toBeNull();
    expect(window.location.hash).toBe('');
  });

  it('the login form then shows a sentence for error=link, never a blank page', async () => {
    setUrl('/#access_token=garbage');
    render(<RootPage />);
    await waitFor(() => expect(lastReplace()).toBe('/login?error=link'));
    cleanup();

    nav.search = lastReplace().split('?')[1];
    render(<LoginPage />);
    const msg = await screen.findByRole('alert');
    expect(msg.textContent).toMatch(/sign-in link/i);
    expect(msg.textContent.length).toBeGreaterThan(20);
    expect(screen.getByText('Sign in to BASE')).toBeTruthy();
  });
});

describe('root page: QR pairing (#pair)', () => {
  it('reads the code, clears the hash first, claims it, stores the session and replaces to /today', async () => {
    const at = jwt({ sub: 'u2', email: 'p@example.com' });
    let hashWhenClaimed = null;
    globalThis.fetch = vi.fn(async (url, init) => {
      hashWhenClaimed = window.location.hash;
      expect(String(url)).toBe('https://example.supabase.co/functions/v1/device-pair');
      expect(JSON.parse(init.body)).toEqual({ action: 'claim', code: 'ABCDEFGHJKLM' });
      expect(init.headers.Authorization).toBeUndefined();
      return { ok: true, status: 200, json: async () => ({ access_token: at, refresh_token: 'rt-2', expires_in: 3600 }) };
    });
    setUrl('/#pair=abcde-fghjklm');
    render(<RootPage />);
    await waitFor(() => expect(lastReplace()).toBe('/today'));
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(hashWhenClaimed).toBe('');        // consumed before the network call
    expect(window.location.hash).toBe('');
    expect(stored().accessToken).toBe(at);
  });

  it('a refused code goes to /login?error=pair and stores nothing', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: false, status: 400,
      json: async () => ({ error: 'That pairing code is wrong, used, or expired. Show a new QR code.' }),
    }));
    setUrl('/#pair=ABCDEFGHJKLM');
    render(<RootPage />);
    await waitFor(() => expect(lastReplace()).toBe('/login?error=pair'));
    expect(localStorage.getItem('rie_session')).toBeNull();
    expect(window.location.hash).toBe('');
  });

  it('a hash that only looks like a pairing code (wrong length) is ignored like any unknown hash', async () => {
    setUrl('/#pair=SHORT');
    render(<RootPage />);
    await waitFor(() => expect(lastReplace()).toBe('/login'));
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});

describe('root page: failed magic-link return (#error=...)', () => {
  const EXPIRED = '/#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired';

  it('signed out: clears the hash and goes to /login?error=link', async () => {
    setUrl(EXPIRED);
    render(<RootPage />);
    await waitFor(() => expect(lastReplace()).toBe('/login?error=link'));
    expect(window.location.hash).toBe('');
    expect(localStorage.getItem('rie_session')).toBeNull();
  });

  it('a bare #error_code= is treated the same', async () => {
    setUrl('/#error_code=otp_expired');
    render(<RootPage />);
    await waitFor(() => expect(lastReplace()).toBe('/login?error=link'));
  });

  it('with an existing session: clears the hash and carries on to /today', async () => {
    localStorage.setItem('rie_session', JSON.stringify({ accessToken: 't', refreshToken: '', expiresAt: Date.now() + 9e9 }));
    setUrl(EXPIRED);
    render(<RootPage />);
    await waitFor(() => expect(lastReplace()).toBe('/today'));
    expect(window.location.hash).toBe('');
  });
});

describe('root page: unexpected failure', () => {
  it('an unexpected throw still ends on /login, never a blank page', async () => {
    setUrl('/#access_token=garbage');
    vi.spyOn(window.history, 'replaceState').mockImplementation(() => { throw new Error('boom'); });
    render(<RootPage />);
    await waitFor(() => expect(lastReplace()).toBe('/login'));
  });
});

describe('root page: no sign-in hash', () => {
  it('no hash and no session -> /login', async () => {
    render(<RootPage />);
    await waitFor(() => expect(lastReplace()).toBe('/login'));
  });

  it('no hash with a session -> /today', async () => {
    localStorage.setItem('rie_session', JSON.stringify({ accessToken: 't', refreshToken: '', expiresAt: Date.now() + 9e9 }));
    render(<RootPage />);
    await waitFor(() => expect(lastReplace()).toBe('/today'));
  });

  it('forwards a legacy ?tab= query to /today so the shell can resolve it', async () => {
    localStorage.setItem('rie_session', JSON.stringify({ accessToken: 't', refreshToken: '', expiresAt: Date.now() + 9e9 }));
    setUrl('/?tab=work');
    render(<RootPage />);
    await waitFor(() => expect(lastReplace()).toBe('/today?tab=work'));
  });

  it('an unknown hash is ignored: signed out -> /login, signed in -> /today', async () => {
    setUrl('/#something-else');
    render(<RootPage />);
    await waitFor(() => expect(lastReplace()).toBe('/login'));
    cleanup();
    nav.router.replace = vi.fn();
    localStorage.setItem('rie_session', JSON.stringify({ accessToken: 't', refreshToken: '', expiresAt: Date.now() + 9e9 }));
    setUrl('/#something-else');
    render(<RootPage />);
    await waitFor(() => expect(lastReplace()).toBe('/today'));
  });

  it('under React StrictMode (effects run twice in dev) the single-use code is claimed once', async () => {
    const at = jwt({ sub: 'u3' });
    globalThis.fetch = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ access_token: at, refresh_token: 'r' }) }));
    setUrl('/#pair=ABCDEFGHJKLM');
    render(<StrictMode><RootPage /></StrictMode>);
    await waitFor(() => expect(lastReplace()).toBe('/today'));
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(nav.router.replace).toHaveBeenCalledTimes(1);
  });
});
