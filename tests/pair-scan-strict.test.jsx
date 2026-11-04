import { StrictMode } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor, cleanup, act } from '@testing-library/react';

process.env.NEXT_PUBLIC_SB_URL = 'https://example.supabase.co';
process.env.NEXT_PUBLIC_SB_KEY = 'anon-key-123';

import { PairScan } from '@/features/auth/PairScan.jsx';

// The REAL startScanner runs here; only the browser camera APIs are faked.
const makeStream = () => ({ tracks: [{ stop: vi.fn() }], getTracks() { return this.tracks; } });
let streams;

beforeEach(() => {
  streams = [];
  vi.stubGlobal('isSecureContext', true);
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: vi.fn(async () => { const s = makeStream(); streams.push(s); return s; }) },
  });
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() => Promise.resolve());
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ({}));
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete navigator.mediaDevices;
});

describe('PairScan under React StrictMode (effects run twice in dev)', () => {
  it('leaves the SECOND scanner\'s stream attached to the shared <video> and stops only the first one\'s tracks', async () => {
    render(
      <StrictMode>
        <PairScan onSignedIn={() => {}} onRefused={() => {}} onCodeEntry={() => {}} onBack={() => {}} />
      </StrictMode>,
    );
    await waitFor(() => expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledTimes(2));
    // let both scanners finish opening and the first (cancelled) one stop itself
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });

    const video = document.getElementById('scan-video');
    expect(streams).toHaveLength(2);
    expect(streams[0].tracks[0].stop).toHaveBeenCalled();      // first run released its camera
    expect(streams[1].tracks[0].stop).not.toHaveBeenCalled();  // second run is live
    expect(video.srcObject).toBe(streams[1]);                  // and still attached

    cleanup();                                                  // leaving the pane releases the live one
    expect(streams[1].tracks[0].stop).toHaveBeenCalled();
  });
});
