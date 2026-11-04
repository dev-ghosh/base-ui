// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { createStore, createInitialState, store } from '@/store/store.js';

describe('store in a plain Node environment', () => {
  it('runs without DOM globals', () => {
    // Guards against a wrongly configured environment making this test vacuous.
    expect(typeof window).toBe('undefined');
    expect(typeof document).toBe('undefined');

    const initial = createInitialState();
    expect(initial.coOwners).toBeInstanceOf(Map);

    const s = createStore(initial);
    const fn = vi.fn();
    s.subscribe(fn);
    s.setState({ tasks: [{ id: 1 }] });
    expect(s.getState().tasks).toHaveLength(1);
    expect(fn).toHaveBeenCalledTimes(1);

    store.setState({ people: [{ code: 'x' }] });
    expect(store.getState().people).toHaveLength(1);
  });
});
