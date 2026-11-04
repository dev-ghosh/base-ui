import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';

process.env.NEXT_PUBLIC_SB_URL = 'https://example.supabase.co';
process.env.NEXT_PUBLIC_SB_KEY = 'anon-key-123';

vi.mock('@/lib/devicepair.js', async (importOriginal) => {
  const real = await importOriginal();
  return {
    ...real,
    startPairing: vi.fn(),
    pairingStatus: vi.fn(),
    cancelPairing: vi.fn(() => Promise.resolve()),
    buildQr: vi.fn(async () => ({ size: 33, d: 'M4 4h1v1h-1z' })),
  };
});

import PairShow from '@/features/auth/PairShow.jsx';
import * as dp from '@/lib/devicepair.js';

const flush = () => act(async () => { await vi.advanceTimersByTimeAsync(0); });
const advance = (ms) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
const pairing = (over = {}) => ({
  pairingId: 'p1', code: 'ABCDEFGHJKLM', expiresAt: new Date(Date.now() + 180000).toISOString(), ttlSeconds: 180, ...over,
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(dp.startPairing).mockReset().mockResolvedValue(pairing());
  vi.mocked(dp.pairingStatus).mockReset().mockResolvedValue({ found: true, claimed: false, expired: false });
  vi.mocked(dp.cancelPairing).mockClear();
  vi.mocked(dp.buildQr).mockClear();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('PairShow (device that is already signed in)', () => {
  it('shows "Creating a code…", then the QR, the grouped code and a countdown', async () => {
    render(<PairShow onClose={() => {}} />);
    expect(screen.getByText('Creating a code…')).toBeTruthy();
    await flush();
    expect(screen.queryByText('Creating a code…')).toBeNull();
    expect(document.querySelector('#mo-pair.mo.open .mb')).toBeTruthy();
    expect(screen.getByText('Sign in another device').className).toBe('mti');
    expect(document.getElementById('pair-code-text').textContent).toBe('ABCDE-FGHJKLM');
    expect(document.getElementById('pair-code-text').className).toBe('pair-code');
    expect(document.getElementById('pair-expiry').textContent).toBe('Expires in 3:00');
    const svg = document.querySelector('#pair-qr.qr-box svg');
    expect(svg.getAttribute('viewBox')).toBe('0 0 33 33');
    expect(svg.querySelector('path').getAttribute('d')).toBe('M4 4h1v1h-1z');
    // the QR encodes the site root with the code in the fragment (spec C13)
    expect(dp.buildQr).toHaveBeenCalledWith(`${window.location.origin}/#pair=ABCDEFGHJKLM`);
    await advance(1000);
    expect(document.getElementById('pair-expiry').textContent).toBe('Expires in 2:59');
  });

  it('polls status and switches to the confirmation when the other device claims', async () => {
    render(<PairShow onClose={() => {}} />);
    await flush();
    await advance(2000);
    expect(dp.pairingStatus).toHaveBeenCalledWith('p1');
    expect(screen.queryByText('Signed in on the other device')).toBeNull();
    vi.mocked(dp.pairingStatus).mockResolvedValue({ found: true, claimed: true, claimedUa: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)' });
    await advance(2000);
    expect(screen.getByText('Signed in on the other device')).toBeTruthy();
    expect(document.getElementById('pair-done-ua').textContent).toBe('on an iPhone');
    const calls = vi.mocked(dp.pairingStatus).mock.calls.length;
    await advance(6000);
    expect(dp.pairingStatus).toHaveBeenCalledTimes(calls);   // polling stopped
  });

  it('says "Expired — tap New code" when the time runs out, and stops polling', async () => {
    vi.mocked(dp.startPairing).mockResolvedValue(pairing({ expiresAt: new Date(Date.now() + 3000).toISOString() }));
    render(<PairShow onClose={() => {}} />);
    await flush();
    await advance(4000);
    expect(document.getElementById('pair-expiry').textContent).toBe('Expired — tap New code');
    const calls = vi.mocked(dp.pairingStatus).mock.calls.length;
    await advance(6000);
    expect(dp.pairingStatus).toHaveBeenCalledTimes(calls);
  });

  it('"New code" mints another pairing', async () => {
    vi.mocked(dp.startPairing)
      .mockResolvedValueOnce(pairing())
      .mockResolvedValueOnce(pairing({ pairingId: 'p2', code: 'ZZZZZYYYYYXX' }));
    render(<PairShow onClose={() => {}} />);
    await flush();
    fireEvent.click(screen.getByRole('button', { name: 'New code' }));
    await flush();
    expect(dp.startPairing).toHaveBeenCalledTimes(2);
    expect(document.getElementById('pair-code-text').textContent).toBe('ZZZZZ-YYYYYXX');
  });

  it('shows a failure to mint in the error line', async () => {
    vi.mocked(dp.startPairing).mockRejectedValue(new Error('Sign in on this device first.'));
    render(<PairShow onClose={() => {}} />);
    await flush();
    expect(document.getElementById('pair-share-err').textContent).toBe('Sign in on this device first.');
    expect(screen.queryByText('Creating a code…')).toBeNull();
  });

  it('closing burns the code on the way out (✕, Done and a backdrop tap)', async () => {
    const onClose = vi.fn();
    const { unmount } = render(<PairShow onClose={onClose} />);
    await flush();
    fireEvent.click(screen.getByText('✕'));
    expect(dp.cancelPairing).toHaveBeenCalledWith('p1');
    expect(onClose).toHaveBeenCalledTimes(1);
    unmount();

    vi.mocked(dp.cancelPairing).mockClear();
    onClose.mockClear();
    render(<PairShow onClose={onClose} />);
    await flush();
    fireEvent.click(document.getElementById('mo-pair'));        // the backdrop itself
    expect(dp.cancelPairing).toHaveBeenCalledWith('p1');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('a click inside the box does not close it', async () => {
    const onClose = vi.fn();
    render(<PairShow onClose={onClose} />);
    await flush();
    fireEvent.click(document.querySelector('#mo-pair .mb'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('cancels a live pairing if it is unmounted without being closed', async () => {
    const { unmount } = render(<PairShow onClose={() => {}} />);
    await flush();
    unmount();
    expect(dp.cancelPairing).toHaveBeenCalledWith('p1');
  });
});
