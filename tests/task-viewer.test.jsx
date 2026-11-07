// The task viewer (js/taskview.js): the route renders a known task, an unknown id shows a
// not-found message inside the page frame (never a crash), the buttons follow the role.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup, fireEvent, within } from '@testing-library/react';

process.env.NEXT_PUBLIC_SB_URL = 'https://example.supabase.co';
process.env.NEXT_PUBLIC_SB_KEY = 'anon-key-123';

const nav = vi.hoisted(() => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn(), params: { id: 't1' } }));
vi.mock('next/navigation', () => ({
  useRouter: () => nav,
  usePathname: () => `/work/tasks/${nav.params.id}`,
  useParams: () => nav.params,
  useSearchParams: () => new URLSearchParams(''),
}));

import TaskViewPage, { TaskViewModal } from '@/features/tasks/TaskViewRoute.jsx';
import { TaskFormProvider } from '@/features/tasks/TaskFormProvider.jsx';
import { store } from '@/store/store.js';
import { getStatus } from '@/lib/status.js';
import { seed, makeTask, stubFetch, okResponse, todayISO } from './helpers/fixtures.js';

const html = document.documentElement;
const asViewer = () => { html.classList.add('ro'); };

function seedTask(extra = {}, taskOver = {}) {
  seed({
    tasks: [makeTask({
      id: 't1', task: 'Write the report', legacyTaskId: 77, company: 'Acme', func: 'Ops', priority: 'P1', status: 'In Progress',
      nextFollowUp: todayISO(-3), startDate: '2026-01-05', ownerCode: 'ME1', coOwnerCodes: ['OT1'], assignedTo: 'Me Myself, Olive Other',
      actionItem: 'Draft it\nthen review', keyInputs: 'Some notes', tags: ['q4'], contactName: 'Cy Contact', contactOrg: 'Cy Org',
      createdBy: 'Ann', createdAt: '2026-01-02T00:00:00Z', updatedAt: '2026-02-03T00:00:00Z', updatedBy: 'Bob', leadId: 9, funcReview: true, funcReviewNote: 'guessed',
      ...taskOver,
    })],
    workstreams: [{ id: 'ws1', task: 'Parent stream' }],
    entityLinks: [{ parentId: 'ws1', childId: 't1' }],
    leads: [{ id: 9, title: 'Big lead' }],
    ...extra,
  });
}

const renderModal = (props = {}) => render(<TaskFormProvider><TaskViewModal {...props} /></TaskFormProvider>);
const renderPage = () => render(<TaskFormProvider><TaskViewPage /></TaskFormProvider>);

beforeEach(() => { vi.clearAllMocks(); nav.params = { id: 't1' }; html.classList.remove('ro', 'is-admin'); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); html.classList.remove('ro', 'is-admin'); });

describe('task viewer content', () => {
  it('renders a known task in the modal: kicker, title, chips, details, sections, footer', async () => {
    seedTask();
    stubFetch();
    const { container } = renderModal();

    expect(container.querySelector('.mo.open')).toBeTruthy();
    expect(container.querySelector('.tv-kicker').textContent).toBe('Task #77 · Acme · Ops');
    expect(screen.getByRole('heading', { name: 'Write the report' })).toBeTruthy();
    const chips = [...container.querySelectorAll('.tv-chip')].map((c) => [c.textContent, c.className]);
    expect(chips[0]).toEqual(['In Progress', 'tv-chip st-progress']);
    expect(chips[1]).toEqual(['P1', 'tv-chip pr-p1']);
    expect(chips[2][1]).toBe('tv-chip due-ov');                       // overdue chip, red class from dueCls
    expect(chips.map((c) => c[0])).toContain('Needs review');
    expect(chips.map((c) => c[0])).toContain('#q4');

    const rows = Object.fromEntries([...container.querySelectorAll('.tv-row')].map((r) => [r.querySelector('dt').textContent, r.querySelector('dd').textContent]));
    expect(rows.Owner).toBe('Me Myself');
    expect(rows['Also on it']).toBe('Olive Other');
    expect(rows.Due).toMatch(/\(Was due /);
    expect(rows.Contact).toBe('Cy Contact · Cy Org');
    expect(rows.Lead).toBe('Big lead');
    expect(rows['Part of']).toBe('Parent stream');
    expect(rows.Start).toBeTruthy();
    expect(container.querySelectorAll('.tv-sec h3')[0].textContent).toBe('Action item');
    expect(container.querySelector('.tv-text').textContent).toBe('Draft it\nthen review');
    expect(screen.getByText('Why it needs review')).toBeTruthy();
    expect(container.querySelector('.tv-meta').textContent).toMatch(/Created by Ann on .*Updated by Bob on /s);
    await waitFor(() => expect(container.querySelector('#tv-history').textContent).toBe('No changes recorded yet.'));
  });

  it('shows the history from entity_events', async () => {
    seedTask();
    stubFetch(async (url) => {
      if (url.includes('/entity_events')) {
        return okResponse([
          { id: 1, entity_id: 't1', event_type: 'status_changed', field_name: 'status', old_value: 'Pending', new_value: 'Completed', actor: 'Bob', created_at: '2026-02-03T00:00:00Z', notes: 'Hierarchy' },
          { id: 2, entity_id: 't1', event_type: 'created', actor: 'Ann', created_at: '2026-01-02T00:00:00Z', notes: '' },
        ]);
      }
    });
    const { container } = renderModal();
    await waitFor(() => expect(container.querySelectorAll('.tv-ev')).toHaveLength(2));
    const [first, second] = container.querySelectorAll('.tv-ev');
    expect(first.querySelector('.tv-ev-what').textContent).toBe('status: Pending → Completed · Hierarchy');
    expect(first.querySelector('s').textContent).toBe('Pending');
    expect(first.querySelector('.tv-ev-who').textContent).toBe('Bob');
    expect(second.querySelector('.tv-ev-what').textContent).toBe('created');
  });

  it('says so when the history cannot be loaded', async () => {
    seedTask();
    stubFetch(async (url) => (url.includes('/entity_events') ? { ok: false, status: 500, text: async () => 'x', json: async () => ({}) } : undefined));
    const { container } = renderModal();
    await waitFor(() => expect(container.querySelector('#tv-history').textContent).toBe('History could not be loaded.'));
  });

  it('an unassigned undated task reads "Unassigned" / "No date"; a legacy free-text assignee shows when there is no owner', () => {
    seedTask({}, { ownerCode: '', coOwnerCodes: [], assignedTo: 'Old Name', nextFollowUp: '' });
    stubFetch();
    const { container } = renderModal();
    const dd = (label) => [...container.querySelectorAll('.tv-row')].find((r) => r.querySelector('dt').textContent === label)?.querySelector('dd').textContent;
    expect(dd('Owner')).toBe('Old Name');
    expect(dd('Due')).toBe('No date');
    expect(dd('Also on it')).toBeUndefined();
  });
});

describe('task viewer buttons', () => {
  it('an editor sees Edit, Mark done, Escalate… and Close; no Delete unless admin', () => {
    seedTask();
    stubFetch();
    renderModal();
    const names = within(document.querySelector('.tv-foot')).getAllByRole('button').map((b) => b.textContent);
    expect(names).toEqual(['Edit', 'Mark done', 'Escalate…', 'Close']);
  });

  it('an admin also sees Delete', () => {
    seedTask();
    stubFetch();
    html.classList.add('is-admin');
    store.setState({ access: { person_code: 'ME1', can_write: true, is_admin: true } });
    renderModal();
    expect(within(document.querySelector('.tv-foot')).getByRole('button', { name: 'Delete' })).toBeTruthy();
  });

  it('a view-only user sees only Close, and no "Use Edit" hint', () => {
    seedTask({ access: { person_code: 'ME1', can_write: false } }, { actionItem: '', keyInputs: '' });
    stubFetch();
    renderModal();
    expect(within(document.querySelector('.tv-foot')).getAllByRole('button').map((b) => b.textContent)).toEqual(['Close']);
    expect(document.querySelector('.tv-empty').textContent).toBe('No details written yet.');
  });

  it('a closed task offers Reopen instead of Mark done and Escalate', () => {
    seedTask({}, { status: 'Completed' });
    stubFetch();
    renderModal();
    expect(within(document.querySelector('.tv-foot')).getAllByRole('button').map((b) => b.textContent)).toEqual(['Edit', 'Reopen', 'Close']);
  });

  it('Mark done moves the task (PATCH status completed) and the viewer follows', async () => {
    seedTask();
    const f = stubFetch();
    const { container } = renderModal();
    fireEvent.click(screen.getByRole('button', { name: 'Mark done' }));
    await waitFor(() => expect(container.querySelector('.tv-chip').textContent).toBe('Completed'));
    const patch = f.writes().find((w) => w.url.includes('/entities?id=eq.t1'));
    expect(patch.body).toMatchObject({ status: 'completed' });
    expect(getStatus().msg).toBe('Moved to Completed');
    expect(screen.getByRole('button', { name: 'Reopen' })).toBeTruthy();
  });

  it('Close goes back (the modal route)', () => {
    seedTask();
    stubFetch();
    renderModal();
    fireEvent.click(within(document.querySelector('.tv-foot')).getByRole('button', { name: 'Close' }));
    expect(nav.back).toHaveBeenCalledTimes(1);
    fireEvent.click(document.querySelector('.tv-head .mx'));
    expect(nav.back).toHaveBeenCalledTimes(2);
  });

  it('the backdrop closes it, as the old document click handler did', () => {
    seedTask();
    stubFetch();
    const { container } = renderModal();
    fireEvent.click(container.querySelector('.mo'));
    expect(nav.back).toHaveBeenCalledTimes(1);
  });

  it('Edit opens the task form and leaves the viewer (it comes back after a save)', () => {
    seedTask();
    stubFetch();
    renderModal();
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(nav.back).toHaveBeenCalledTimes(1);
    expect(document.querySelector('#mo-tf.open')).toBeTruthy();
    expect(document.querySelector('#mo-tf .mti').textContent).toBe('Edit Task #77');
  });
});

describe('the viewer as a page (direct visit)', () => {
  it('renders the same viewer inside the page frame', () => {
    seedTask();
    stubFetch();
    const { container } = renderPage();
    expect(container.querySelector('.tp.active')).toBeTruthy();
    expect(container.querySelector('#mo-tv')).toBeNull();                    // not a modal overlay
    expect(screen.getByRole('heading', { name: 'Write the report' })).toBeTruthy();
    expect(container.querySelector('.tv-foot')).toBeTruthy();
  });

  it('an unknown id shows a not-found message inside the frame, not a crash', () => {
    seedTask();
    stubFetch();
    nav.params = { id: 'does-not-exist' };
    const { container } = renderPage();
    expect(container.querySelector('.tp.active')).toBeTruthy();
    expect(container.textContent).toMatch(/Task not found/);
    expect(container.textContent).toContain('does-not-exist');
  });

  it('an unknown id in the modal route shows the message with a Close button', () => {
    seedTask();
    stubFetch();
    nav.params = { id: 'nope' };
    const { container } = renderModal();
    expect(container.textContent).toMatch(/Task not found/);
    fireEvent.click(within(container.querySelector('#mo-tv')).getByRole('button', { name: 'Close' }));
    expect(nav.back).toHaveBeenCalled();
  });

  it('while the lists are still arriving it says Loading, not not-found', () => {
    seedTask({ dataLoaded: false, tasks: [] });
    stubFetch();
    const { container } = renderPage();
    expect(container.textContent).toMatch(/Loading/);
    expect(container.textContent).not.toMatch(/not found/i);
  });

  it('ids are compared as strings (a numeric route param finds a string id)', () => {
    seedTask({ tasks: [makeTask({ id: '123', task: 'Numeric id' })] });
    stubFetch();
    nav.params = { id: 123 };
    renderPage();
    expect(screen.getByRole('heading', { name: 'Numeric id' })).toBeTruthy();
  });

  it('Close on a direct visit leaves for Work', () => {
    seedTask();
    stubFetch();
    renderPage();
    fireEvent.click(within(document.querySelector('.tv-foot')).getByRole('button', { name: 'Close' }));
    expect(nav.push).toHaveBeenCalledWith('/work');
  });
});
