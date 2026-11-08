// "Sign in another device" (mo-pair) as an overlay of the signed-in shell: mounted only while open, so a
// closed overlay holds no live code; opening it mints one, closing (or leaving the shell) burns it.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent, act } from '@testing-library/react';

process.env.NEXT_PUBLIC_SB_URL = 'https://example.supabase.co';
process.env.NEXT_PUBLIC_SB_KEY = 'anon-key-123';

vi.mock('next/navigation', async () => (await import('./helpers/fake-router.js')).navigationMock);
vi.mock('next/link', async () => (await import('./helpers/fake-router.js')).linkMock);
vi.mock('@/lib/devicepair.js', async (importOriginal) => ({
  ...(await importOriginal()),
  startPairing: vi.fn(),
  pairingStatus: vi.fn(),
  cancelPairing: vi.fn(() => Promise.resolve()),
  buildQr: vi.fn(async () => ({ size: 33, d: 'M4 4h1v1h-1z' })),
}));

import PairOverlay from '@/features/auth/PairOverlay.jsx';
import { openMo, closeMo, isMoOpen } from '@/lib/modals.js';
import * as dp from '@/lib/devicepair.js';
import { seed } from './helpers/fixtures.js';

const flush = () => act(async () => { await vi.advanceTimersByTimeAsync(0); });
const pairing = (id, code) => ({ pairingId: id, code, expiresAt: new Date(Date.now() + 180000).toISOString() });

beforeEach(() => {
  vi.useFakeTimers();
  seed({});
  vi.mocked(dp.startPairing).mockReset().mockResolvedValue(pairing('p1', 'ABCDEFGHJKLM'));
  vi.mocked(dp.pairingStatus).mockReset().mockResolvedValue({ found: true, claimed: false, expired: false });
  vi.mocked(dp.cancelPairing).mockClear();
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('PairOverlay', () => {
  it('renders nothing and mints nothing while closed', async () => {
    render(<PairOverlay />);
    await flush();
    expect(document.getElementById('mo-pair')).toBeNull();
    expect(dp.startPairing).not.toHaveBeenCalled();
  });

  it('openMo(mo-pair) shows the QR with a freshly minted code; closing burns it and hides the overlay', async () => {
    render(<PairOverlay />);
    act(() => openMo('mo-pair'));
    await flush();
    expect(document.querySelector('#mo-pair.mo.open')).toBeTruthy();
    expect(dp.startPairing).toHaveBeenCalledTimes(1);
    expect(document.getElementById('pair-code-text').textContent).toBe('ABCDE-FGHJKLM');
    fireEvent.click(document.querySelector('#mo-pair .mx'));
    expect(dp.cancelPairing).toHaveBeenCalledWith('p1');
    expect(document.getElementById('mo-pair')).toBeNull();
    expect(isMoOpen('mo-pair')).toBe(false);
  });

  it('the backdrop closes it too, and reopening mints a different code', async () => {
    render(<PairOverlay />);
    act(() => openMo('mo-pair'));
    await flush();
    fireEvent.click(document.getElementById('mo-pair'));
    expect(dp.cancelPairing).toHaveBeenCalledWith('p1');
    vi.mocked(dp.startPairing).mockResolvedValue(pairing('p2', 'ZZZZZYYYYYXX'));
    act(() => openMo('mo-pair'));
    await flush();
    expect(dp.startPairing).toHaveBeenCalledTimes(2);
    expect(document.getElementById('pair-code-text').textContent).toBe('ZZZZZ-YYYYYXX');
  });

  it('leaving the shell (sign-out unmounts it) burns the live code', async () => {
    const { unmount } = render(<PairOverlay />);
    act(() => openMo('mo-pair'));
    await flush();
    unmount();
    expect(dp.cancelPairing).toHaveBeenCalledWith('p1');
    act(() => closeMo('mo-pair'));
  });

  it('a code that never arrived leaves nothing to burn', async () => {
    vi.mocked(dp.startPairing).mockRejectedValue(new Error('No connection. Check the network and try again.'));
    render(<PairOverlay />);
    act(() => openMo('mo-pair'));
    await flush();
    expect(document.getElementById('pair-share-err').textContent).toBe('No connection. Check the network and try again.');
    fireEvent.click(document.querySelector('#mo-pair .mx'));
    expect(dp.cancelPairing).not.toHaveBeenCalled();
  });
});
