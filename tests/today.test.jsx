// Today: the groups in the order of the old today.js, the row actions (✓ → and the focused-row
// keys), optimistic behaviour, the viewer-role guard, and where each row leads.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup, fireEvent, within, act } from '@testing-library/react';

process.env.NEXT_PUBLIC_SB_URL = 'https://example.supabase.co';
process.env.NEXT_PUBLIC_SB_KEY = 'anon-key-123';

const nav = vi.hoisted(() => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => nav,
  usePathname: () => '/today',
  useParams: () => ({}),
  useSearchParams: () => new URLSearchParams(''),
}));

import TodayPage from '@/features/today/TodayPage.jsx';
import { store } from '@/store/store.js';
import { getStatus } from '@/lib/status.js';
import { nextMondayISO } from '@/lib/today.js';
import { seed, makeTask, stubFetch, failResponse, todayISO, ME } from './helpers/fixtures.js';

const READ_ONLY = 'You have view-only access to BASE, so this change was not saved.';
const OVERDUE = todayISO(-10);
const SOON = todayISO(3);

/** A Today with one of everything, in a known order. */
function seedEverything(extra = {}) {
  seed({
    tasks: [
      makeTask({ id: 'p1a', task: 'P1 late', priority: 'P1', nextFollowUp: OVERDUE }),
      makeTask({ id: 'p2a', task: 'P2 late', priority: 'P2', nextFollowUp: todayISO(-5) }),
      makeTask({ id: 'soon', task: 'Soon one', priority: 'P2', nextFollowUp: SOON }),
      makeTask({ id: 'bare', task: 'Needs classifying', func: '', nextFollowUp: SOON }),
      makeTask({ id: 'oth', task: 'Theirs', ownerCode: 'OT1', assignedTo: 'Olive Other', nextFollowUp: OVERDUE }),
      makeTask({ id: 'nob', task: 'Nobody\'s', ownerCode: '', assignedTo: '', nextFollowUp: OVERDUE }),
    ],
    decisions: [
      { id: 1, entityId: null, question: 'Older decision about nothing.', raisedAt: '2026-01-01T00:00:00Z', signalCode: '' },
      { id: 2, entityId: null, question: 'Newer decision about nothing.', raisedAt: '2026-06-01T00:00:00Z', signalCode: '' },
    ],
    ...extra,
  });
}

beforeEach(() => { vi.clearAllMocks(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Today layout', () => {
  it('renders the groups in the order of the old today.js: Decide, Do now, Also overdue, Due next, Classify, Team', () => {
    seedEverything();
    stubFetch();
    const { container } = render(<TodayPage />);

    expect([...container.querySelectorAll('.td-sec h2')].map((h) => h.textContent))
      .toEqual(['Decide', 'Do now', 'Also overdue', 'Due next', 'Classify']);
    const order = [...container.querySelectorAll('.td-wrap > *')].map((el) => el.className.split(' ')[0] || el.tagName);
    expect(order[0]).toBe('td-head');
    expect(order.slice(-1)[0]).toBe('td-team');
  });

  it('shows counts, the shape line, and the Decide rows newest first', () => {
    seedEverything();
    stubFetch();
    const { container } = render(<TodayPage />);

    const decide = container.querySelectorAll('.td-sec')[0];
    expect(within(decide).getByText('2', { selector: '.td-count' })).toBeTruthy();
    const titles = [...decide.querySelectorAll('.td-decide .td-title')].map((e) => e.textContent);
    expect(titles).toEqual(['Newer decision about nothing.', 'Older decision about nothing.']);
    expect(container.querySelector('.td-shape').textContent).toMatch(/4 open · 2 due this week/);
    expect(screen.getByRole('heading', { name: 'Today' })).toBeTruthy();
  });

  it('caps each group at five rows and says how many there really are', () => {
    const many = Array.from({ length: 8 }, (_, i) => makeTask({ id: 'm' + i, task: 'Late ' + i, nextFollowUp: todayISO(-3 - i) }));
    seed({ tasks: many });
    stubFetch();
    const { container } = render(<TodayPage />);
    const sec = container.querySelector('.td-sec');
    expect(sec.querySelector('h2').textContent).toBe('Also overdue');
    expect(sec.querySelector('.td-count').textContent).toBe('8');
    expect(sec.querySelectorAll('.td-row')).toHaveLength(5);
    expect(screen.getByRole('button', { name: 'Triage 8' })).toBeTruthy();
  });

  it('red only where P1 + overdue; other late rows are amber (soft)', () => {
    seedEverything();
    stubFetch();
    const { container } = render(<TodayPage />);
    const p1 = container.querySelector('[data-id="p1a"] .td-late');
    const p2 = container.querySelector('[data-id="p2a"] .td-late');
    expect(p1.className).toBe('td-late');
    expect(p2.className).toBe('td-late soft');
    expect(container.querySelector('[data-id="soon"] .td-due')).toBeTruthy();
    expect(container.querySelector('[data-id="p1a"] .td-p1').textContent).toBe('P1');
  });

  it('says why it is empty: no person code / nothing assigned / all clear', () => {
    seed({ tasks: [], access: { can_write: true } });
    stubFetch();
    const a = render(<TodayPage />);
    expect(a.container.querySelector('.td-clear').textContent).toMatch(/not linked to a person yet/);
    a.unmount();

    seed({ tasks: [makeTask({ ownerCode: 'OT1', assignedTo: 'Olive Other', nextFollowUp: SOON })] });
    const b = render(<TodayPage />);
    expect(b.container.querySelector('.td-clear').textContent).toMatch(/Nothing is assigned to you yet/);
    b.unmount();

    seed({ tasks: [makeTask({ nextFollowUp: '' })] });
    const c = render(<TodayPage />);
    expect(c.container.querySelector('.td-clear').textContent).toBe('Nothing due and nothing overdue. 1 of your tasks have no date.');
  });

  it('the Team section lists other owners and "Nobody", and is collapsed while something of mine is overdue', () => {
    seedEverything();
    stubFetch();
    const { container } = render(<TodayPage />);
    const team = container.querySelector('details.td-team');
    expect(team.open).toBe(false);
    expect(team.querySelector('summary').textContent).toBe('Team · 1 unowned');
    expect(within(team).getByText('Olive Other')).toBeTruthy();
    expect(within(team).getByText('Nobody')).toBeTruthy();
  });
});

describe('Today navigation (todayGoto -> router)', () => {
  it('Review all and decision rows go to Initiatives', () => {
    seedEverything();
    stubFetch();
    const { container } = render(<TodayPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Review all' }));
    expect(nav.push).toHaveBeenLastCalledWith('/work/initiatives');
    fireEvent.click(container.querySelector('.td-decide'));
    expect(nav.push).toHaveBeenLastCalledWith('/work/initiatives');
  });

  it('a team row goes to the Matrix, scope everyone, owner = display name; Nobody to scope team', () => {
    seedEverything();
    stubFetch();
    render(<TodayPage />);
    fireEvent.click(screen.getByText('Olive Other').closest('button'));
    expect(nav.push).toHaveBeenLastCalledWith('/work/matrix?scope=everyone&o=Olive%20Other');
    fireEvent.click(screen.getByText('Nobody').closest('button'));
    expect(nav.push).toHaveBeenLastCalledWith('/work/matrix?scope=team');
  });

  it('Triage N and Classify N open the overlay routes', () => {
    seedEverything();
    stubFetch();
    render(<TodayPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Triage 2' }));
    expect(nav.push).toHaveBeenLastCalledWith('/today/triage');
    fireEvent.click(screen.getByRole('button', { name: 'Classify 1' }));
    expect(nav.push).toHaveBeenLastCalledWith('/today/classify');
  });

  it('clicking a row opens the task viewer route', () => {
    seedEverything();
    stubFetch();
    const { container } = render(<TodayPage />);
    fireEvent.click(container.querySelector('[data-id="soon"]'));
    expect(nav.push).toHaveBeenLastCalledWith('/work/tasks/soon');
  });
});

describe('Today row actions', () => {
  it('✓ calls the REST update once and the row disappears at once (optimistic)', async () => {
    seedEverything();
    let release;
    const gate = new Promise((r) => { release = r; });
    const f = stubFetch(async () => { await gate; });
    const { container } = render(<TodayPage />);
    expect(container.querySelector('[data-id="p1a"]')).toBeTruthy();

    fireEvent.click(within(container.querySelector('[data-id="p1a"]')).getByTitle('Mark done (D)'));

    await waitFor(() => expect(container.querySelector('[data-id="p1a"]')).toBeNull());   // gone before the request resolved
    expect(f.writes()).toHaveLength(1);
    expect(f.writes()[0]).toMatchObject({ method: 'PATCH', body: { status: 'completed' } });
    expect(f.writes()[0].url).toContain('/entities?id=eq.p1a');
    expect(nav.push).not.toHaveBeenCalled();                                              // the click did not also open the task
    release();
    await waitFor(() => expect(getStatus().msg).toBe('Marked done'));
  });

  it('a rejected update puts the row back and sets an error status', async () => {
    seedEverything();
    stubFetch(async () => failResponse('nope'));
    const { container } = render(<TodayPage />);

    fireEvent.click(within(container.querySelector('[data-id="p1a"]')).getByTitle('Mark done (D)'));

    await waitFor(() => expect(getStatus().kind).toBe('error'));
    expect(getStatus().msg).toMatch(/^Could not update that task: /);
    await waitFor(() => expect(container.querySelector('[data-id="p1a"]')).toBeTruthy());
    expect(store.getState().tasks.find((t) => t.id === 'p1a').status).toBe('Pending');
  });

  it('→ pushes the follow-up to next Monday', async () => {
    seedEverything();
    const f = stubFetch();
    const { container } = render(<TodayPage />);
    fireEvent.click(within(container.querySelector('[data-id="soon"]')).getByTitle('Push a week (2)'));
    await waitFor(() => expect(f.writes()).toHaveLength(1));
    expect(f.writes()[0].body).toEqual({ next_follow_up: nextMondayISO() });
    expect(store.getState().tasks.find((t) => t.id === 'soon').nextFollowUp).toBe(nextMondayISO());
  });

  it('a view-only user: ✓ shows the guard sentence and performs no fetch', async () => {
    seedEverything({ access: { person_code: ME, can_write: false } });
    const f = stubFetch();
    const { container } = render(<TodayPage />);

    fireEvent.click(within(container.querySelector('[data-id="p1a"]')).getByTitle('Mark done (D)'));

    await waitFor(() => expect(getStatus().kind).toBe('error'));
    expect(getStatus().msg).toContain(READ_ONLY);
    expect(f.fn).not.toHaveBeenCalled();
    await waitFor(() => expect(container.querySelector('[data-id="p1a"]')).toBeTruthy());
  });
});

describe('Today focused-row keys (onTodayRowKey)', () => {
  const press = (el, key, init = {}) => fireEvent.keyDown(el, { key, ...init });

  it('Enter and Space open the task', () => {
    seedEverything();
    stubFetch();
    const { container } = render(<TodayPage />);
    const row = container.querySelector('[data-id="p1a"]');
    press(row, 'Enter');
    expect(nav.push).toHaveBeenLastCalledWith('/work/tasks/p1a');
    press(row, ' ');
    expect(nav.push).toHaveBeenCalledTimes(2);
  });

  it('D marks done, 2 pushes a week (both case-insensitive for D)', async () => {
    seedEverything();
    const f = stubFetch();
    const { container } = render(<TodayPage />);
    press(container.querySelector('[data-id="p1a"]'), 'D');
    await waitFor(() => expect(f.writes()).toHaveLength(1));
    expect(f.writes()[0].body).toEqual({ status: 'completed' });

    press(container.querySelector('[data-id="soon"]'), '2');
    await waitFor(() => expect(f.writes()).toHaveLength(2));
    expect(f.writes()[1].body).toEqual({ next_follow_up: nextMondayISO() });
  });

  it('J / ArrowDown focus the next row, K / ArrowUp the previous, across every .td-row in document order', () => {
    seedEverything();
    stubFetch();
    const { container } = render(<TodayPage />);
    const all = [...container.querySelectorAll('.td-row')];          // decision rows, task rows, team rows: as the old querySelectorAll
    const first = container.querySelector('[data-id="p1a"]');
    const i = all.indexOf(first);
    first.focus();
    press(first, 'j');
    expect(document.activeElement).toBe(all[i + 1]);
    press(all[i + 1], 'ArrowDown');
    expect(document.activeElement).toBe(all[i + 2]);
    press(all[i + 2], 'k');
    expect(document.activeElement).toBe(all[i + 1]);
    press(all[i + 1], 'ArrowUp');
    expect(document.activeElement).toBe(first);
    press(first, 'K');                                  // upwards out of the first group onto the Decide rows
    expect(document.activeElement).toBe(all[i - 1]);
  });

  it('modifier chords are left alone', () => {
    seedEverything();
    const f = stubFetch();
    const { container } = render(<TodayPage />);
    const row = container.querySelector('[data-id="p1a"]');
    press(row, 'd', { ctrlKey: true });
    press(row, 'Enter', { metaKey: true });
    press(row, '2', { altKey: true });
    expect(f.fn).not.toHaveBeenCalled();
    expect(nav.push).not.toHaveBeenCalled();
  });
});

describe('Today is derived, not cached', () => {
  it('a write made elsewhere (store.tasks) shows at once: no stale row', async () => {
    seedEverything();
    stubFetch();
    const { container } = render(<TodayPage />);
    expect(container.querySelector('[data-id="soon"]')).toBeTruthy();
    act(() => {
      store.setState((s) => ({ tasks: s.tasks.map((t) => (t.id === 'soon' ? { ...t, nextFollowUp: todayISO(-2) } : t)) }));
    });
    // "Soon one" is now overdue: it moved from Due next to Also overdue
    const sec = [...container.querySelectorAll('.td-sec')].find((s) => s.querySelector('h2').textContent === 'Also overdue');
    expect(sec.querySelector('[data-id="soon"]')).toBeTruthy();
  });
});
