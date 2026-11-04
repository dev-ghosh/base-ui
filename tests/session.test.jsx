import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act, cleanup } from '@testing-library/react';

process.env.NEXT_PUBLIC_SB_URL = 'https://example.supabase.co';
process.env.NEXT_PUBLIC_SB_KEY = 'anon-key-123';

// Keep every real auth function (R14: getSession / refreshSession keep the old
// auto-extend behaviour) except the timer, which the tests only observe.
vi.mock('@/lib/auth.js', async (importOriginal) => {
  const real = await importOriginal();
  return { ...real, scheduleAutoRefresh: vi.fn() };
});

import { useSession } from '@/hooks/useSession.js';
import * as auth from '@/lib/auth.js';

const DAY = 24 * 60 * 60 * 1000;
const store = (over = {}) =>
  localStorage.setItem('rie_session', JSON.stringify({
    accessToken: 'tok', refreshToken: 'ref', userId: 'u1', email: 'a@example.com',
    displayName: 'A', expiresAt: Date.now() + 30 * DAY, ...over,
  }));

beforeEach(() => {
  localStorage.clear();
  vi.mocked(auth.scheduleAutoRefresh).mockClear();
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) })));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('useSession', () => {
  it('is "loading" on the first render, before storage has been read', () => {
    store();
    const seen = [];
    renderHook(() => { const s = useSession(); seen.push(s.status); return s; });
    expect(seen[0]).toBe('loading');
  });

  it('reports signedOut when there is no stored session, and does not arm the refresh timer', async () => {
    const { result } = renderHook(() => useSession());
    await waitFor(() => expect(result.current.status).toBe('signedOut'));
    expect(result.current.session).toBeNull();
    expect(auth.scheduleAutoRefresh).not.toHaveBeenCalled();
  });

  it('reports signedIn with the session, and calls scheduleAutoRefresh', async () => {
    store();
    const { result } = renderHook(() => useSession());
    await waitFor(() => expect(result.current.status).toBe('signedIn'));
    expect(result.current.session.email).toBe('a@example.com');
    expect(auth.scheduleAutoRefresh).toHaveBeenCalledTimes(1);
  });

  it('treats a stored session as signedIn even when expiresAt has passed (old auto-extend, R14)', async () => {
    store({ expiresAt: Date.now() - DAY });
    const { result } = renderHook(() => useSession());
    await waitFor(() => expect(result.current.status).toBe('signedIn'));
    expect(JSON.parse(localStorage.getItem('rie_session')).expiresAt).toBeGreaterThan(Date.now());
  });

  it('stays signedIn after a REFUSED refresh: a rejected refresh keeps the session (R14)', async () => {
    store();
    globalThis.fetch.mockResolvedValueOnce({ ok: false, status: 400, json: async () => ({ error: 'invalid_grant' }) });
    const kept = await auth.refreshSession();
    expect(kept.accessToken).toBe('tok');
    expect(localStorage.getItem('rie_session')).not.toBeNull();

    const { result } = renderHook(() => useSession());
    await waitFor(() => expect(result.current.status).toBe('signedIn'));
  });

  it('signOut() clears the stored session and flips to signedOut', async () => {
    store();
    const { result } = renderHook(() => useSession());
    await waitFor(() => expect(result.current.status).toBe('signedIn'));
    await act(async () => { await result.current.signOut(); });
    expect(localStorage.getItem('rie_session')).toBeNull();
    expect(result.current.status).toBe('signedOut');
    expect(result.current.session).toBeNull();
    // the server-side logout was requested with the user's token
    const logout = globalThis.fetch.mock.calls.find(([u]) => String(u).endsWith('/auth/v1/logout'));
    expect(logout[1].headers.Authorization).toBe('Bearer tok');
  });
});
