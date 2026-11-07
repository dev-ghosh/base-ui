import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StrictMode } from 'react';
import { render, cleanup, act } from '@testing-library/react';

process.env.NEXT_PUBLIC_SB_URL = 'https://example.supabase.co';
process.env.NEXT_PUBLIC_SB_KEY = 'anon-key-123';

// Only the outside world is replaced: the network loaders and the websocket. The
// store, the apply rules and the hooks are the real ones.
const loader = vi.hoisted(() => ({ loadData: vi.fn(async () => true), syncData: vi.fn(async () => true) }));
vi.mock('@/lib/load-data.js', () => loader);
const rt = vi.hoisted(() => ({ onChange: null, active: 0, init: vi.fn(), destroy: vi.fn() }));
vi.mock('@/lib/realtime.js', () => ({
  initRealtime: (fn) => { rt.init(); rt.onChange = fn; rt.active += 1; },
  destroyRealtime: () => { rt.destroy(); rt.onChange = null; rt.active -= 1; },
}));

import { useDataLoader } from '@/hooks/useDataLoader.js';
import { useRealtime } from '@/hooks/useRealtime.js';
import { REALTIME_BATCH_MS } from '@/lib/apply-realtime.js';
import { store, createInitialState } from '@/store/store.js';

function Loader({ signedIn }) { useDataLoader(signedIn); return null; }
function Live({ signedIn }) { useRealtime(signedIn); return null; }

beforeEach(() => {
  vi.clearAllMocks();
  rt.onChange = null; rt.active = 0;
  act(() => store.setState(createInitialState()));
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('useDataLoader', () => {
  it('waits for sign-in AND access, then loads exactly once (also under StrictMode)', () => {
    const { rerender } = render(<StrictMode><Loader signedIn={false} /></StrictMode>);
    expect(loader.loadData).not.toHaveBeenCalled();

    rerender(<StrictMode><Loader signedIn /></StrictMode>);          // signed in, access still unknown
    expect(loader.loadData).not.toHaveBeenCalled();

    act(() => store.setState({ accessLoaded: true }));               // access answered
    expect(loader.loadData).toHaveBeenCalledTimes(1);

    rerender(<StrictMode><Loader signedIn /></StrictMode>);          // nothing new: no second load
    act(() => store.setState({ tasks: [] }));
    expect(loader.loadData).toHaveBeenCalledTimes(1);
  });

  it('loads again after sign-out and a new sign-in', () => {
    act(() => store.setState({ accessLoaded: true }));
    const { rerender } = render(<Loader signedIn />);
    expect(loader.loadData).toHaveBeenCalledTimes(1);

    rerender(<Loader signedIn={false} />);                           // signed out
    act(() => store.setState({ accessLoaded: false }));              // resetAccess()
    expect(loader.loadData).toHaveBeenCalledTimes(1);

    rerender(<Loader signedIn />);                                   // someone signs in again
    act(() => store.setState({ accessLoaded: true }));
    expect(loader.loadData).toHaveBeenCalledTimes(2);
  });

  it('does not load for a signed-out visitor even if access is marked loaded', () => {
    act(() => store.setState({ accessLoaded: true }));
    render(<Loader signedIn={false} />);
    expect(loader.loadData).not.toHaveBeenCalled();
  });
});

describe('useRealtime', () => {
  const task = (id, title) => ({ id, tier: 'task', title, status: 'pending' });
  const change = (row) => ({ table: 'entities', eventType: 'UPDATE', new: row, old: null });

  beforeEach(() => {
    vi.useFakeTimers();
    act(() => store.setState({ accessLoaded: true }));
  });

  it('subscribes once while signed in and unsubscribes on unmount', () => {
    const { unmount } = render(<Live signedIn />);
    expect(rt.init).toHaveBeenCalledTimes(1);
    expect(rt.active).toBe(1);
    unmount();
    expect(rt.destroy).toHaveBeenCalledTimes(1);
    expect(rt.active).toBe(0);
  });

  it('under StrictMode ends with exactly one live subscription', () => {
    const { unmount } = render(<StrictMode><Live signedIn /></StrictMode>);
    expect(rt.active).toBe(1);
    unmount();
    expect(rt.active).toBe(0);
  });

  it('does not subscribe when signed out, and unsubscribes on sign-out', () => {
    const { rerender } = render(<Live signedIn={false} />);
    expect(rt.init).not.toHaveBeenCalled();
    rerender(<Live signedIn />);
    expect(rt.active).toBe(1);
    rerender(<Live signedIn={false} />);
    expect(rt.active).toBe(0);
  });

  it('does not subscribe before access is known', () => {
    act(() => store.setState({ accessLoaded: false }));
    render(<Live signedIn />);
    expect(rt.init).not.toHaveBeenCalled();
    act(() => store.setState({ accessLoaded: true }));
    expect(rt.active).toBe(1);
  });

  it('applies a row change to the store after the debounce, with no resync', () => {
    render(<Live signedIn />);
    act(() => { rt.onChange(change(task('a', 'First'))); });
    expect(store.getState().tasks).toHaveLength(0);                  // still inside the window
    act(() => { vi.advanceTimersByTime(REALTIME_BATCH_MS - 1); });
    expect(store.getState().tasks).toHaveLength(0);
    act(() => { vi.advanceTimersByTime(1); });
    expect(store.getState().tasks.map((t) => t.task)).toEqual(['First']);
    expect(loader.syncData).not.toHaveBeenCalled();
  });

  it('coalesces a burst into one batch (trailing debounce)', () => {
    render(<Live signedIn />);
    act(() => { rt.onChange(change(task('a', 'A'))); });
    act(() => { vi.advanceTimersByTime(1000); });
    act(() => { rt.onChange(change(task('b', 'B'))); });             // restarts the window
    act(() => { vi.advanceTimersByTime(1000); });
    expect(store.getState().tasks).toHaveLength(0);
    act(() => { vi.advanceTimersByTime(500); });
    expect(store.getState().tasks.map((t) => t.task)).toEqual(['A', 'B']);
  });

  it('{type:"resync"} triggers exactly one syncData', () => {
    render(<Live signedIn />);
    act(() => { rt.onChange({ type: 'resync', reason: 'reconnect' }); });
    expect(loader.syncData).not.toHaveBeenCalled();                  // debounced, not immediate
    act(() => { vi.advanceTimersByTime(REALTIME_BATCH_MS); });
    expect(loader.syncData).toHaveBeenCalledTimes(1);
    act(() => { vi.advanceTimersByTime(10 * REALTIME_BATCH_MS); });
    expect(loader.syncData).toHaveBeenCalledTimes(1);
  });

  it('several resync-worthy frames in one window still cost one syncData', () => {
    render(<Live signedIn />);
    act(() => {
      rt.onChange({ type: 'resync' });
      rt.onChange({ table: 'decision_queue', eventType: 'INSERT', new: { id: 1 }, old: null });
      rt.onChange({ table: 'entities', eventType: 'UPDATE', new: null, old: null });
    });
    act(() => { vi.advanceTimersByTime(REALTIME_BATCH_MS); });
    expect(loader.syncData).toHaveBeenCalledTimes(1);
  });

  it('a refused-subscription frame ({type:"error"}) does not resync', () => {
    render(<Live signedIn />);
    act(() => { rt.onChange({ type: 'error', topic: 't', message: 'm' }); });
    act(() => { vi.advanceTimersByTime(REALTIME_BATCH_MS); });
    expect(loader.syncData).not.toHaveBeenCalled();
  });

  it('writes the offline cache after a batch that changed the store, not after echoes', () => {
    const mem = new Map([['rie_session', JSON.stringify({ accessToken: 't', userId: 'u1' })]]);
    vi.stubGlobal('localStorage', {
      getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k),
    });
    render(<Live signedIn />);
    act(() => { rt.onChange({ table: 'lead_history', eventType: 'INSERT', new: { id: 1 }, old: null }); });
    act(() => { vi.advanceTimersByTime(REALTIME_BATCH_MS); });
    expect(mem.has('rie_data_cache')).toBe(false);
    act(() => { rt.onChange(change(task('a', 'Cached'))); });
    act(() => { vi.advanceTimersByTime(REALTIME_BATCH_MS); });
    expect(JSON.parse(mem.get('rie_data_cache')).tasks).toHaveLength(1);
    vi.unstubAllGlobals();
  });

  it('drops a pending batch on unmount (no apply, no sync after unsubscribing)', () => {
    const { unmount } = render(<Live signedIn />);
    act(() => { rt.onChange({ type: 'resync' }); });
    unmount();
    act(() => { vi.advanceTimersByTime(5 * REALTIME_BATCH_MS); });
    expect(loader.syncData).not.toHaveBeenCalled();
  });
});
