import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { createStore, store, createInitialState } from '@/store/store.js';
import { useStore } from '@/store/useStore.js';

afterEach(() => {
  cleanup();
});

describe('createStore', () => {
  it('setState merges a patch and notifies subscribers once', () => {
    const s = createStore({ a: 1, b: 2 });
    const fn = vi.fn();
    s.subscribe(fn);
    s.setState({ a: 5 });
    expect(s.getState()).toEqual({ a: 5, b: 2 });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('setState accepts an updater function', () => {
    const s = createStore({ n: 1 });
    s.setState((st) => ({ n: st.n + 1 }));
    expect(s.getState().n).toBe(2);
  });

  it('getState returns a stable reference until state changes', () => {
    const s = createStore({ a: 1 });
    const before = s.getState();
    expect(s.getState()).toBe(before);
    s.setState({ a: 2 });
    expect(s.getState()).not.toBe(before);
  });

  it('unsubscribe stops notifications', () => {
    const s = createStore({ a: 1 });
    const fn = vi.fn();
    const off = s.subscribe(fn);
    s.setState({ a: 2 });
    off();
    s.setState({ a: 3 });
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe('store singleton', () => {
  it('has the required initial shape', () => {
    const s = createInitialState();
    expect(s.people).toEqual([]);
    expect(s.coOwners).toBeInstanceOf(Map);
    expect(s.coOwners.size).toBe(0);
    expect(s.access).toBeNull();
    expect(s.currentUser).toBeNull();
    expect(s.session).toBeNull();
    for (const k of ['contacts', 'events', 'guests', 'tasks', 'workstreams', 'actions',
      'entityLinks', 'entities', 'fronts', 'initiatives', 'candidates', 'decisions',
      'cleanups', 'leads']) {
      expect(s[k]).toEqual([]);
    }
  });

  it('omits UI-only keys', () => {
    const s = store.getState();
    for (const k of ['taskView', 'contactView', 'leadView', 'sortCol', 'contactPage', 'bulkSelected', 'editTaskId']) {
      expect(k in s).toBe(false);
    }
  });

  it('is importable without DOM globals', () => {
    expect(createInitialState().coOwners).toBeInstanceOf(Map);
  });
});

describe('useStore', () => {
  beforeEach(() => {
    act(() => store.setState(createInitialState()));
  });

  function Probe({ onRender }) {
    const n = useStore((s) => s.tasks.length);
    onRender();
    return <div data-testid="n">{n}</div>;
  }

  it('rerenders when the selected value changes', () => {
    const onRender = vi.fn();
    render(<Probe onRender={onRender} />);
    expect(screen.getByTestId('n').textContent).toBe('0');
    act(() => store.setState({ tasks: [{ id: 1 }, { id: 2 }] }));
    expect(screen.getByTestId('n').textContent).toBe('2');
  });

  it('does not rerender when an unrelated key changes', () => {
    const onRender = vi.fn();
    render(<Probe onRender={onRender} />);
    const count = onRender.mock.calls.length;
    act(() => store.setState({ people: [{ code: 'x' }] }));
    expect(onRender).toHaveBeenCalledTimes(count);
  });
});
