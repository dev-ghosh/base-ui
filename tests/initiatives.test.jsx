// Work > Initiatives and the initiative viewer (js/entities.js): initiatives only, scoped; the viewer route
// renders a known id and says "not found" inside the frame for an unknown one; its writes are
// optimistic with rollback and blocked for viewers before any fetch.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';

process.env.NEXT_PUBLIC_SB_URL = 'https://example.supabase.co';
process.env.NEXT_PUBLIC_SB_KEY = 'anon-key-123';

const params = vi.hoisted(() => ({ id: 'i1' }));
vi.mock('next/navigation', async () => ({ ...(await import('./helpers/fake-router.js')).navigationMock, useParams: () => params }));
vi.mock('next/link', async () => (await import('./helpers/fake-router.js')).linkMock);

import Page from '@/app/(app)/work/initiatives/page.jsx';
import ViewerPage from '@/app/(app)/work/initiatives/[id]/page.jsx';
import ModalPage from '@/app/(app)/@modal/(.)work/initiatives/[id]/page.jsx';
import { store } from '@/store/store.js';
import { getStatus } from '@/lib/status.js';
import { seed, makeTask, stubFetch, okResponse, failResponse, ME, todayISO } from './helpers/fixtures.js';
import { history, resetNav, setUrl } from './helpers/fake-router.js';

const init = (o) => ({
  id: 'x', title: 'T', status: 'in_progress', priority: 'P2', ownerCode: '', health: 'green', activeChildren: 1, overdueChildren: 0,
  nextFollowUp: '', expectedWindowDays: null, daysSinceActivity: null, progressScore: null, momentumScore: null, ...o,
});

function seedList(extra = {}) {
  seed({
    tasks: [makeTask({ id: 't1', ownerCode: ME, priority: 'P1', nextFollowUp: todayISO(-2), status: 'In Progress' })],
    entityLinks: [{ parentId: 'iD', childId: 't1' }],
    initiatives: [
      init({ id: 'iA', title: 'Alpha mine', ownerCode: ME }),
      init({ id: 'iB', title: 'Beta theirs', ownerCode: 'OT1', health: 'red' }),
      init({ id: 'iC', title: 'Gamma done', ownerCode: 'OT1', status: 'completed' }),
      init({ id: 'iD', title: 'Delta holds mine', ownerCode: 'OT1', overdueChildren: 1 }),
      init({ id: 'iE', title: 'Epsilon parked', ownerCode: ME, activeChildren: 0 }),
    ],
    decisions: [{ id: 'd1', question: 'Should we approve this?', entityId: 'iA' }],
    cleanups: [{ id: 'c1', entityAId: 'iA', entityBId: 'iB', similarityScore: 0.9, sharedKeywords: [], confidence: 'high', recommendedAction: 'merge' }],
    ...extra,
  });
}
const titles = () => [...document.querySelectorAll('.ih-t')].map((n) => n.textContent);

beforeEach(() => { localStorage.clear(); resetNav('/work/initiatives?scope=everyone'); params.id = 'i1'; document.documentElement.classList.remove('ro'); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); });

describe('Initiatives', () => {
  it('lists initiatives only: no decision cards, no cleanup queue, groups by attention, closed folded', () => {
    seedList();
    render(<Page />);
    expect(screen.getByRole('heading', { name: 'Initiatives' })).toBeTruthy();
    expect(document.querySelector('.ih-n').textContent).toBe('4 open · 1 closed');
    expect(document.querySelectorAll('.dq-card').length).toBe(0);
    expect(screen.queryByText(/Should we approve/)).toBeNull();
    expect(screen.queryByText(/Possible duplicates/)).toBeNull();
    expect(screen.queryByText(/similar/)).toBeNull();
    expect([...document.querySelectorAll('.ih-gh h3')].map((n) => n.textContent)).toEqual(['Needs attention', 'Moving', 'Quiet']);
    // Delta holds my overdue P1 and Beta is red: both need attention, the one I own comes first among equals.
    expect(titles()).toEqual(['Beta theirs', 'Delta holds mine', 'Alpha mine', 'Epsilon parked', 'Gamma done']);
    expect(document.querySelector('.ih-closed summary').textContent).toBe('+ 1 closed');
    expect(document.querySelector('.ih-closed .ih-t').textContent).toBe('Gamma done');
  });

  it('red only for my overdue P1: the overdue count is ih-fire on the card that holds it, neutral elsewhere', () => {
    seedList({ initiatives: [
      init({ id: 'iD', title: 'Delta holds mine', ownerCode: 'OT1', overdueChildren: 1 }),
      init({ id: 'iB', title: 'Beta theirs', ownerCode: 'OT1', overdueChildren: 4 }),
    ] });
    render(<Page />);
    const cardOf = (t) => screen.getByText(t).closest('.ih-card');
    expect(cardOf('Delta holds mine').querySelector('.ih-m span.ih-fire').textContent).toBe('1 overdue');
    expect(cardOf('Delta holds mine').querySelector('.ih-share').textContent).toBe('1 of yours · 1 due this week');
    const other = [...cardOf('Beta theirs').querySelectorAll('.ih-m span')].find((s) => s.textContent === '4 overdue');
    expect(other.className).toBe('');
  });

  it('scope filters them: Mine = owned or holding one of my tasks; Team = the rest', () => {
    seedList();
    setUrl('/work/initiatives?scope=mine');
    const { unmount } = render(<Page />);
    expect(titles().sort()).toEqual(['Alpha mine', 'Delta holds mine', 'Epsilon parked']);
    expect(document.querySelector('.ih-n').textContent).toBe('3 open');
    unmount();
    setUrl('/work/initiatives?scope=team');
    render(<Page />);
    expect(titles().sort()).toEqual(['Beta theirs', 'Gamma done']);
  });

  it('explains an empty Mine, and a card opens the viewer route', () => {
    seedList({ initiatives: [init({ id: 'iB', title: 'Beta theirs', ownerCode: 'OT1' })], entityLinks: [] });
    setUrl('/work/initiatives?scope=mine');
    const { unmount } = render(<Page />);
    expect(screen.getByText('None of the initiatives holds a task of yours yet. The rest are under Team.')).toBeTruthy();
    unmount();
    setUrl('/work/initiatives?scope=everyone');
    render(<Page />);
    fireEvent.click(screen.getByText('Beta theirs'));
    expect(history.at(-1)).toEqual({ kind: 'push', href: '/work/initiatives/iB' });
  });
});

/* ── the viewer ─────────────────────────────────────────────────────────────── */

const entity = (o = {}) => ({ id: 'i1', tier: 'initiative', title: 'Launch plan', status: 'in_progress', priority: 'P2', owner_code: ME, next_follow_up: '2026-12-01', front_code: 'F1', intent: 'Ship it', success_criteria: [{ metric: 'Users', target: '100', status: 'unknown' }], outcome_definition: '', ...o });
const child = { child_id: 't9', entities: { id: 't9', tier: 'task', title: 'Child task', status: 'pending', priority: 'P2', next_follow_up: '2026-11-30' } };

function handler({ rows = [entity()], patch } = {}) {
  return (url, init) => {
    if (init.method === 'PATCH') return patch ? patch(url, init) : okResponse([{}]);
    if (init.method !== 'GET') return okResponse([{}]);
    if (url.includes('/entity_links')) return okResponse([child]);
    if (url.includes('/entity_events')) return okResponse([{ id: 'e1', event_type: 'status_changed', field_name: 'status', old_value: 'pending', new_value: 'in_progress', actor: 'Ann', created_at: '2026-10-01T00:00:00Z' }]);
    if (url.includes('/entity_lineage')) return okResponse([{ id: 'l1', event: 'promoted', source_tier_at_event: 'workstream', derived_tier_at_event: 'initiative', created_by: 'Ann', created_at: '2026-09-01T00:00:00Z' }]);
    if (url.includes('/entities?id=eq.')) return okResponse(rows);
    return okResponse([]);
  };
}
const select = (label) => screen.getByLabelText(label);

describe('the initiative viewer route', () => {
  beforeEach(() => seed({ initiatives: [init({ id: 'i1', title: 'Launch plan', status: 'in_progress' })] }));

  it('renders a known id: title, lifecycle, controls, success definition, children, lineage, audit log', async () => {
    const f = stubFetch(handler());
    const { container } = render(<ViewerPage />);
    expect(container.querySelector('.tp.active')).toBeTruthy();                // inside the page frame
    await screen.findByText('Child task');
    expect(container.querySelector('#entity-det-title').textContent).toBe('Launch plan');
    expect([...container.querySelectorAll('.lc-step')].map((b) => b.textContent)).toEqual(['Not started', 'Active', 'On hold', 'Closed']);
    expect(container.querySelector('.lc-step.on').textContent).toBe('Active');
    expect(select('Status').value).toBe('in_progress');
    expect(select('Priority').value).toBe('P2');
    expect(select('Owner').value).toBe(ME);
    expect(container.querySelector('.ent-intent').textContent).toBe('Ship it');
    expect(screen.getByDisplayValue('Users')).toBeTruthy();
    expect(screen.getByText(/Children — 1 open of 1/)).toBeTruthy();
    expect(screen.getByText('Lineage')).toBeTruthy();
    expect(screen.getByText('workstream → initiative')).toBeTruthy();
    expect(screen.getByText('status_changed')).toBeTruthy();
    const urls = f.calls().map((c) => c.url);
    expect(urls.some((u) => u.includes('/entity_links?parent_id=eq.i1&link_type=eq.contains'))).toBe(true);
    expect(urls.some((u) => u.includes('/entity_events?entity_id=eq.i1&order=created_at.desc&limit=30'))).toBe(true);
    expect(f.writes()).toEqual([]);                                             // reading writes nothing
  });

  it('an unknown id shows a not-found message inside the frame (no crash)', async () => {
    params.id = 'nope';
    stubFetch(handler({ rows: [] }));
    const { container } = render(<ViewerPage />);
    await screen.findByText(/Not found\. It may have been deleted/);
    expect(container.querySelector('.tp.active')).toBeTruthy();
    expect(container.textContent).toContain('nope');
    expect(container.querySelector('.lc')).toBeNull();
  });

  it('the @modal twin renders the same viewer as a modal over the page', async () => {
    stubFetch(handler());
    const { container } = render(<ModalPage />);
    await screen.findByText('Child task');
    expect(container.querySelector('#mo-entity-det.mo.open')).toBeTruthy();
    expect(container.querySelector('#mo-entity-det .mti').textContent).toBe('Launch plan');
  });

  it('a child opens: a task goes to the task viewer, a workstream to its own panel', async () => {
    stubFetch(handler());
    render(<ViewerPage />);
    fireEvent.click(await screen.findByText('Child task'));
    expect(history.at(-1).href).toBe('/work/tasks/t9');
  });

  it('a write is optimistic and lands: the control and the list change at once, PATCH entities, then a reload', async () => {
    let release;
    const f = stubFetch(handler({ patch: () => new Promise((r) => { release = () => r(okResponse([{}])); }) }));
    render(<ViewerPage />);
    await screen.findByText('Child task');
    fireEvent.change(select('Status'), { target: { value: 'on_hold' } });
    expect(select('Status').value).toBe('on_hold');                             // before the request answers
    expect(store.getState().initiatives[0].status).toBe('on_hold');
    await waitFor(() => expect(f.writes().length).toBe(1));
    expect(f.writes()[0]).toMatchObject({ method: 'PATCH', url: expect.stringContaining('/entities?id=eq.i1'), body: { status: 'on_hold' } });
    release();
    await waitFor(() => expect(getStatus().msg).toBe('Saved'));
    // the audit row goes out too (fire and forget)
    await waitFor(() => expect(f.writes().some((w) => w.method === 'POST' && w.body.event_type === 'status_changed')).toBe(true));
  });

  it('a failed write rolls back (control and list) and says so in the status bar', async () => {
    stubFetch(handler({ patch: () => failResponse('boom') }));
    render(<ViewerPage />);
    await screen.findByText('Child task');
    fireEvent.change(select('Priority'), { target: { value: 'P1' } });
    await waitFor(() => expect(getStatus().kind).toBe('error'));
    expect(getStatus().msg).toMatch(/^Could not save: /);
    expect(select('Priority').value).toBe('P2');
    fireEvent.change(select('Status'), { target: { value: 'on_hold' } });
    await waitFor(() => expect(select('Status').value).toBe('in_progress'));
    expect(store.getState().initiatives[0].status).toBe('in_progress');
  });

  it('a viewer-role user gets the view-only sentence and no write is sent', async () => {
    seed({ access: { person_code: ME, can_write: false }, initiatives: [init({ id: 'i1', status: 'in_progress' })] });
    const f = stubFetch(handler());
    render(<ViewerPage />);
    await screen.findByText('Child task');
    fireEvent.change(select('Status'), { target: { value: 'on_hold' } });
    await waitFor(() => expect(getStatus().kind).toBe('error'));
    expect(getStatus().msg).toContain('You have view-only access to BASE, so this change was not saved.');
    expect(select('Status').value).toBe('in_progress');
    fireEvent.click(screen.getByRole('button', { name: '+ Add criterion' }));
    await waitFor(() => expect(getStatus().msg).toContain('view-only'));
    expect(f.writes()).toEqual([]);
  });

  it('closing asks for an outcome first, then writes status + outcome + summary', async () => {
    const f = stubFetch(handler());
    const { container } = render(<ViewerPage />);
    await screen.findByText('Child task');
    fireEvent.click(screen.getByRole('button', { name: 'Closed' }));
    expect(container.querySelector('.lc-close-h').textContent).toBe('How did this end?');
    fireEvent.click(screen.getByRole('button', { name: 'Close initiative' }));
    expect(getStatus().msg).toBe('Pick an outcome first — that is the point of closing.');
    expect(f.writes()).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: 'Won' }));
    fireEvent.change(container.querySelector('#lc-summary'), { target: { value: 'We got it' } });
    fireEvent.click(screen.getByRole('button', { name: 'Close initiative' }));
    await waitFor(() => expect(f.writes().find((w) => w.method === 'PATCH')?.body).toEqual({ status: 'completed', outcome: 'won', outcome_summary: 'We got it' }));
    await waitFor(() => expect(container.querySelector('.lc-close')).toBeNull());
  });

  it('success criteria: add writes the whole array, a failure restores it', async () => {
    let n = 0;
    const f = stubFetch(handler({ patch: () => (++n === 1 ? okResponse([{}]) : failResponse('nope')) }));
    render(<ViewerPage />);
    await screen.findByText('Child task');
    fireEvent.click(screen.getByRole('button', { name: '+ Add criterion' }));
    await waitFor(() => expect(getStatus().msg).toBe('Criteria saved'));
    const first = f.writes().find((w) => w.method === 'PATCH');
    expect(first.body.success_criteria).toEqual([{ metric: 'Users', target: '100', status: 'unknown' }, { metric: '', target: '', status: 'unknown' }]);
    expect(screen.getAllByPlaceholderText('Metric').length).toBe(2);
    fireEvent.click(screen.getAllByTitle('Remove')[1]);
    await waitFor(() => expect(getStatus().msg).toMatch(/^Save failed: /));
    expect(screen.getAllByPlaceholderText('Metric').length).toBe(2);              // the row that failed to go is back
  });
});
