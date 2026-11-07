// Triage: keys D 1 2 3 X S U -> outcomes (js/triage.js), the queue is a snapshot that never
// re-sorts, undo lasts ten seconds, failures put the card back, and the direct-visit cases.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup, fireEvent, act } from '@testing-library/react';

process.env.NEXT_PUBLIC_SB_URL = 'https://example.supabase.co';
process.env.NEXT_PUBLIC_SB_KEY = 'anon-key-123';

const nav = vi.hoisted(() => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => nav,
  usePathname: () => '/today/triage',
  useParams: () => ({}),
  useSearchParams: () => new URLSearchParams(''),
}));

import TriageOverlay from '@/features/triage/TriageOverlay.jsx';
import { store } from '@/store/store.js';
import { getStatus } from '@/lib/status.js';
import { addDaysISO, nextMondayISO } from '@/lib/today.js';
import { seed, makeTask, stubFetch, failResponse, todayISO, ME } from './helpers/fixtures.js';

const READ_ONLY = 'You have view-only access to BASE, so this change was not saved.';

/** Three overdue tasks of mine in a known order (A most urgent), one not overdue, one of someone else's. */
function seedQueue(extra = {}) {
  seed({
    tasks: [
      makeTask({ id: 'A', task: 'Alpha', priority: 'P1', nextFollowUp: todayISO(-30), company: 'Acme', func: 'Ops', actionItem: 'Do the thing' }),
      makeTask({ id: 'B', task: 'Bravo', priority: 'P2', nextFollowUp: todayISO(-20) }),
      makeTask({ id: 'C', task: 'Charlie', priority: 'P2', nextFollowUp: todayISO(-10) }),
      makeTask({ id: 'F', task: 'Future', nextFollowUp: todayISO(5) }),
      makeTask({ id: 'O', task: 'Others', ownerCode: 'OT1', assignedTo: 'Olive Other', priority: 'P1', nextFollowUp: todayISO(-40) }),
    ],
    ...extra,
  });
}

const key = (k, init = {}) => fireEvent.keyDown(document, { key: k, ...init });
const card = () => document.querySelector('.tg-title')?.textContent;
const count = () => document.querySelector('.tg-count')?.textContent;
const task = (id) => store.getState().tasks.find((t) => t.id === id);

beforeEach(() => { vi.clearAllMocks(); });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('Triage card', () => {
  it('shows my overdue tasks, most urgent first, with the old copy', () => {
    seedQueue();
    stubFetch();
    render(<TriageOverlay scope="mine" onClose={vi.fn()} />);

    expect(count()).toBe('1 of 3');
    expect(card()).toBe('Alpha');
    expect(document.querySelector('.tg-late').textContent).toBe('30d late · P1');
    expect(document.querySelector('.tg-meta').textContent).toBe('Acme · Ops');
    expect(document.querySelector('.tg-action').textContent).toBe('Do the thing');
    expect(document.querySelector('.tg-was').textContent).toMatch(/^Was due /);
    expect(document.querySelector('.tg-prog-fill').style.width).toBe('0%');
    expect(document.querySelector('.tg-hint').textContent).toBe('D done · 1/2/3 push · X drop · S skip · U undo · Esc close');
    expect(document.querySelector('.tg-undo')).toBeNull();
    expect(screen.getByRole('button', { name: /Done$/ })).toBeTruthy();
  });

  it('scope=all includes everyone\'s overdue work', () => {
    seedQueue();
    stubFetch();
    render(<TriageOverlay scope="all" onClose={vi.fn()} />);
    expect(count()).toBe('1 of 4');
    expect(card()).toBe('Others');                     // P1 and the oldest
  });
});

describe('Triage keys -> outcomes', () => {
  const cases = [
    ['d', { status: 'completed' }],
    ['D', { status: 'completed' }],
    ['1', () => ({ next_follow_up: addDaysISO(1) })],
    ['2', () => ({ next_follow_up: nextMondayISO() })],
    ['3', () => ({ next_follow_up: addDaysISO(30) })],
    ['x', { status: 'dropped' }],
  ];
  it.each(cases)('%s writes the right PATCH once and advances to the next card', async (k, expected) => {
    seedQueue();
    const f = stubFetch();
    render(<TriageOverlay scope="mine" onClose={vi.fn()} />);

    key(k);

    expect(count()).toBe('2 of 3');                    // the card moved before the request resolved
    expect(card()).toBe('Bravo');
    await waitFor(() => expect(f.writes()).toHaveLength(1));
    const want = typeof expected === 'function' ? expected() : expected;
    expect(f.writes()[0]).toMatchObject({ method: 'PATCH', body: want });
    expect(f.writes()[0].url).toContain('/entities?id=eq.A');
  });

  it('the store follows the write (display status, ISO date)', async () => {
    seedQueue();
    stubFetch();
    render(<TriageOverlay scope="mine" onClose={vi.fn()} />);
    key('x');
    await waitFor(() => expect(task('A').status).toBe('Dropped'));
    key('3');
    await waitFor(() => expect(task('B').nextFollowUp).toBe(addDaysISO(30)));
  });

  it('S and ArrowRight skip without writing', () => {
    seedQueue();
    const f = stubFetch();
    render(<TriageOverlay scope="mine" onClose={vi.fn()} />);
    key('s');
    expect(card()).toBe('Bravo');
    key('ArrowRight');
    expect(card()).toBe('Charlie');
    expect(count()).toBe('3 of 3');
    expect(f.fn).not.toHaveBeenCalled();
  });

  it('Escape closes; modifier chords do nothing', () => {
    seedQueue();
    const f = stubFetch();
    const onClose = vi.fn();
    render(<TriageOverlay scope="mine" onClose={onClose} />);
    key('d', { ctrlKey: true });
    key('x', { metaKey: true });
    key('1', { altKey: true });
    expect(f.fn).not.toHaveBeenCalled();
    expect(count()).toBe('1 of 3');
    key('Escape');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('the buttons do the same as the keys', async () => {
    seedQueue();
    const f = stubFetch();
    render(<TriageOverlay scope="mine" onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Tomorrow/ }));
    await waitFor(() => expect(f.writes()).toHaveLength(1));
    expect(f.writes()[0].body).toEqual({ next_follow_up: addDaysISO(1) });
    fireEvent.click(screen.getByRole('button', { name: /Skip/ }));
    expect(card()).toBe('Charlie');
  });
});

describe('Triage snapshot', () => {
  it('never re-sorts under the hands: later edits to the store do not move cards', async () => {
    seedQueue();
    stubFetch();
    render(<TriageOverlay scope="mine" onClose={vi.fn()} />);

    key('d');
    await waitFor(() => expect(task('A').status).toBe('Completed'));
    // something else makes Charlie the most urgent overdue task in the store
    act(() => {
      store.setState((s) => ({ tasks: s.tasks.map((t) => (t.id === 'C' ? { ...t, priority: 'P1', nextFollowUp: todayISO(-99) } : t)) }));
    });
    expect(card()).toBe('Bravo');                      // still the second card
    key('s');
    expect(card()).toBe('Charlie');
    expect(count()).toBe('3 of 3');
  });

  it('a failed write puts the card back where it was and says which task', async () => {
    seedQueue();
    stubFetch(async () => failResponse('server said no'));
    render(<TriageOverlay scope="mine" onClose={vi.fn()} />);

    key('d');
    expect(card()).toBe('Bravo');
    await waitFor(() => expect(getStatus().kind).toBe('error'));
    expect(getStatus().msg).toMatch(/^Could not update "Alpha": /);
    await waitFor(() => expect(card()).toBe('Alpha'));
    // Ported as the old code behaves: it splices the card back in at the ADVANCED index, so the card
    // shows again but the counter reads one higher (2 of 4). Listed as an old-code defect in the report.
    expect(count()).toBe('2 of 4');
    expect(task('A').status).toBe('Pending');
    expect(document.querySelector('.tg-undo')).toBeNull();     // no undo for a write that never happened
  });

  it('a view-only user: the guard sentence, no fetch, the card is put back', async () => {
    seedQueue({ access: { person_code: ME, can_write: false } });
    const f = stubFetch();
    render(<TriageOverlay scope="mine" onClose={vi.fn()} />);
    key('d');
    await waitFor(() => expect(getStatus().kind).toBe('error'));
    expect(getStatus().msg).toContain(READ_ONLY);
    expect(f.fn).not.toHaveBeenCalled();
    await waitFor(() => expect(card()).toBe('Alpha'));
  });
});

describe('Triage undo (ten seconds)', () => {
  it('U restores the previous card and the previous values', async () => {
    seedQueue();
    const f = stubFetch();
    render(<TriageOverlay scope="mine" onClose={vi.fn()} />);

    key('2');
    await waitFor(() => expect(task('A').nextFollowUp).toBe(nextMondayISO()));
    expect(screen.getByRole('button', { name: /Undo/ })).toBeTruthy();

    key('u');
    expect(count()).toBe('1 of 3');
    expect(card()).toBe('Alpha');
    await waitFor(() => expect(f.writes()).toHaveLength(2));
    expect(f.writes()[1].body).toEqual({ status: 'pending', next_follow_up: todayISO(-30) });
    await waitFor(() => expect(task('A').nextFollowUp).toBe(todayISO(-30)));
    expect(document.querySelector('.tg-undo')).toBeNull();      // nothing left to undo
  });

  it('the Undo button works too', async () => {
    seedQueue();
    const f = stubFetch();
    render(<TriageOverlay scope="mine" onClose={vi.fn()} />);
    key('x');
    await waitFor(() => expect(f.writes()).toHaveLength(1));
    fireEvent.click(await screen.findByRole('button', { name: /Undo/ }));
    expect(card()).toBe('Alpha');
    await waitFor(() => expect(f.writes()).toHaveLength(2));
    expect(f.writes()[1].body.status).toBe('pending');
  });

  it('undo stops being offered ten seconds after the last action', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    seedQueue();
    const f = stubFetch();
    render(<TriageOverlay scope="mine" onClose={vi.fn()} />);

    key('d');
    await waitFor(() => expect(f.writes()).toHaveLength(1));
    expect(screen.getByRole('button', { name: /Undo/ })).toBeTruthy();

    act(() => { vi.advanceTimersByTime(9000); });
    expect(screen.queryByRole('button', { name: /Undo/ })).toBeTruthy();   // still within ten seconds

    act(() => { vi.advanceTimersByTime(1500); });
    expect(screen.queryByRole('button', { name: /Undo/ })).toBeNull();
    key('u');                                           // too late: nothing happens
    expect(count()).toBe('2 of 3');
    expect(f.writes()).toHaveLength(1);
  });

  it('each action restarts the ten seconds', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    seedQueue();
    const f = stubFetch();
    render(<TriageOverlay scope="mine" onClose={vi.fn()} />);
    key('d');
    await waitFor(() => expect(f.writes()).toHaveLength(1));
    act(() => { vi.advanceTimersByTime(8000); });
    key('d');
    await waitFor(() => expect(f.writes()).toHaveLength(2));
    act(() => { vi.advanceTimersByTime(8000); });         // 16s after the first, 8s after the second
    expect(screen.queryByRole('button', { name: /Undo/ })).toBeTruthy();
    key('u');
    expect(count()).toBe('2 of 3');                       // the second action was undone
  });
});

describe('Triage end states', () => {
  it('shows "N cleared" after the last card and Done closes', async () => {
    seedQueue();
    stubFetch();
    const onClose = vi.fn();
    render(<TriageOverlay scope="mine" onClose={onClose} />);
    key('s'); key('s'); key('s');
    expect(document.querySelector('.tg-done h2').textContent).toBe('3 cleared');
    expect(document.querySelector('.tg-done p').textContent).toBe('That backlog is now decided, not just visible.');
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('a direct visit with an empty queue shows the empty state', () => {
    seed({ tasks: [makeTask({ nextFollowUp: todayISO(4) })] });
    stubFetch();
    render(<TriageOverlay scope="mine" onClose={vi.fn()} />);
    expect(document.querySelector('.tg-done h2').textContent).toBe('Nothing overdue');
    expect(document.querySelector('.tg-done p').textContent).toBe('Nothing to triage right now.');
  });

  it('an empty queue is re-taken when the data arrives (a direct visit opens before the load ends)', () => {
    seed({ tasks: [], dataLoaded: false });
    stubFetch();
    render(<TriageOverlay scope="mine" onClose={vi.fn()} />);
    expect(document.querySelector('.tg-done h2').textContent).toBe('Nothing overdue');
    act(() => {
      store.setState({ tasks: [makeTask({ id: 'L', task: 'Late arrival', nextFollowUp: todayISO(-3) })], dataLoaded: true });
    });
    expect(card()).toBe('Late arrival');
  });

  it('the backdrop does not close it (a stray click would drop you out of a 90-item run)', () => {
    seedQueue();
    stubFetch();
    const onClose = vi.fn();
    const { container } = render(<TriageOverlay scope="mine" onClose={onClose} />);
    fireEvent.click(container.querySelector('.mo'));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
