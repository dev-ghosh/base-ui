// Bulk mode on the Board and Hierarchy (port of js/bulk-ops.js): toggle, select / select all / clear,
// batch status and batch reassign as one PATCH per task, the prompts as modal dialogs with the old words,
// and a view-only user. The real task-actions / rest.js run; only fetch is stubbed.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent, waitFor, within } from '@testing-library/react';

process.env.NEXT_PUBLIC_SB_URL = 'https://example.supabase.co';
process.env.NEXT_PUBLIC_SB_KEY = 'anon-key-123';

vi.mock('next/navigation', async () => (await import('./helpers/fake-router.js')).navigationMock);
vi.mock('next/link', async () => (await import('./helpers/fake-router.js')).linkMock);

import BoardRoute from '@/app/(app)/work/board/page.jsx';
import HierarchyRoute from '@/app/(app)/work/hierarchy/page.jsx';
import WorkLayout from '@/app/(app)/work/layout.jsx';
import { store } from '@/store/store.js';
import { getStatus } from '@/lib/status.js';
import { seed, stubFetch, failResponse } from './helpers/fixtures.js';
import { NOW, OT, ME, T } from './helpers/board-fixture.js';
import { history, resetNav } from './helpers/fake-router.js';

const READ_ONLY = 'You have view-only access to BASE, so this change was not saved.';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const card = (title) => $$('.kb-card').find((c) => $('.kb-task', c).textContent === title);
const tick = (title) => fireEvent.click(within(card(title)).getByRole('checkbox'));
const bar = () => document.getElementById('task-bulk-bar');
const btn = (name) => within(bar()).getByRole('button', { name });
const task = (id) => store.getState().tasks.find((t) => t.id === id);
const patches = (f) => f.writes().filter((w) => w.method === 'PATCH');
const idOf = (w) => w.url.split('?id=eq.')[1];

const FIX = () => [
  T({ id: 'b1', task: 'One', priority: 'P2' }),
  T({ id: 'b2', task: 'Two', priority: 'P2' }),
  T({ id: 'b3', task: 'Three', priority: 'P2', status: 'In Progress' }),
  T({ id: 'b4', task: 'Theirs', priority: 'P2', owner: OT }),
  T({ id: 'b5', task: 'Done already', status: 'Completed', priority: '' }),
];

function setup({ url = '/work/board', tasks = FIX(), seedExtra = {}, scope = 'everyone', handler } = {}) {
  seed({ tasks, ...seedExtra });
  resetNav(url);
  localStorage.setItem('rie_work_scope', scope);
  return stubFetch(handler);
}
const mount = (Route = BoardRoute) => render(<WorkLayout><Route /></WorkLayout>);
const bulkOn = () => fireEvent.click(document.getElementById('tf-bulk'));
const answer = (id, text) => {
  const dlg = document.getElementById(id);
  fireEvent.change($('input', dlg), { target: { value: text } });
  fireEvent.click(within(dlg).getByRole('button', { name: 'OK' }));
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  localStorage.clear();
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); localStorage.clear(); });

describe('bulk mode: toggle, select, select all, clear', () => {
  it('?bulk=1 (the Help card "Open Bulk edit") starts with bulk mode on', () => {
    setup({ url: '/work/board?bulk=1' });
    mount();
    expect(document.getElementById('tf-bulk').getAttribute('aria-pressed')).toBe('true');
    expect(bar()).not.toBeNull();
    expect($$('.kb-card input[type="checkbox"]').length).toBeGreaterThan(0);
  });

  it('is off to begin with; the toggle shows the bar and a tick box on every card, exit hides them and drops the selection', () => {
    setup();
    mount();
    expect(bar()).toBeNull();
    expect($$('.kb-card input[type="checkbox"]')).toHaveLength(0);
    bulkOn();
    expect(document.getElementById('tf-bulk').getAttribute('aria-pressed')).toBe('true');
    expect(bar().textContent).toContain('0 tasks selected');
    expect($$('.kb-card input[type="checkbox"]')).toHaveLength(4);   // the live columns: One, Two, Three, Theirs
    tick('One');
    expect(bar().textContent).toContain('1 task selected');
    fireEvent.click(btn('Exit Bulk Mode'));
    expect(bar()).toBeNull();
    expect($$('.kb-card input[type="checkbox"]')).toHaveLength(0);
    bulkOn();                                                        // coming back starts from nothing
    expect(bar().textContent).toContain('0 tasks selected');
  });

  it('the buttons are the old ones, in order; Change Status and Reassign wait for a selection', () => {
    setup();
    mount();
    bulkOn();
    expect($$('button', bar()).map((b) => b.textContent)).toEqual(['Select all', 'Change Status', 'Reassign', 'Clear', 'Exit Bulk Mode']);
    expect(btn('Change Status').disabled).toBe(true);
    expect(btn('Reassign').disabled).toBe(true);
    tick('One');
    expect(btn('Change Status').disabled).toBe(false);
    expect(btn('Reassign').disabled).toBe(false);
  });

  it('ticking a card does not open the viewer; ticking again unselects', () => {
    setup();
    mount();
    bulkOn();
    tick('One');
    tick('Two');
    expect(bar().textContent).toContain('2 tasks selected');
    expect(history.filter((h) => h.href.startsWith('/work/tasks'))).toEqual([]);
    tick('One');
    expect(bar().textContent).toContain('1 task selected');
  });

  it('Select all takes what the list shows (scope and filters applied), Clear empties it', () => {
    setup({ scope: 'mine' });
    mount();
    bulkOn();
    fireEvent.click(btn('Select all'));
    // mine: One, Two, Three, Done already (closed work is in the list too, behind the rail)
    expect(bar().textContent).toContain('4 tasks selected');
    fireEvent.click(btn('Clear'));
    expect(bar().textContent).toContain('0 tasks selected');
    cleanup();
    setup({ scope: 'everyone', url: '/work/board?pr=P2' });
    mount();
    bulkOn();
    fireEvent.click(btn('Select all'));
    expect(bar().textContent).toContain('4 tasks selected');         // the priority filter excludes the Completed one (no priority)
  });
});

describe('batch status', () => {
  it('asks in the old words, then PATCHes each selected task once, in order, and reports', async () => {
    const f = setup();
    mount();
    bulkOn();
    tick('One'); tick('Two'); tick('Three');
    fireEvent.click(btn('Change Status'));
    const dlg = document.getElementById('mo-bulk-status');
    expect(dlg.classList.contains('open')).toBe(true);
    expect(dlg.textContent).toContain('Enter new status:');
    expect(dlg.textContent).toContain('Pending / In Progress / On Hold / Completed / Dropped');
    answer('mo-bulk-status', ' Completed ');
    await waitFor(() => expect(getStatus()).toMatchObject({ kind: 'online', msg: 'Updated 3 tasks' }));
    expect(patches(f).map((w) => [idOf(w), w.body.status])).toEqual([['b1', 'completed'], ['b2', 'completed'], ['b3', 'completed']]);
    expect(['b1', 'b2', 'b3'].map((id) => task(id).status)).toEqual(['Completed', 'Completed', 'Completed']);
    expect(task('b4').status).toBe('Pending');                       // not selected, not touched
    expect(bar().textContent).toContain('0 tasks selected');         // selection cleared, mode stays on
    expect(document.getElementById('mo-bulk-status')).toBeNull();
  });

  it('the cards move at once (optimistic), before the requests resolve', async () => {
    let release;
    const hold = new Promise((r) => { release = r; });
    const f = setup({ handler: async (url, init) => { if (init.method === 'PATCH') await hold; } });
    mount();
    bulkOn();
    tick('One');
    fireEvent.click(btn('Change Status'));
    answer('mo-bulk-status', 'On Hold');
    await waitFor(() => expect(task('b1').status).toBe('On Hold'));
    expect(getStatus().kind).toBe('syncing');
    release();
    await waitFor(() => expect(getStatus().msg).toBe('Updated 1 tasks'));
    expect(patches(f)).toHaveLength(1);
  });

  it('a task that fails is rolled back and counted: "Updated 1 tasks (1 failed)"', async () => {
    const f = setup({ handler: async (url, init) => (init.method === 'PATCH' && url.includes('id=eq.b2') ? failResponse('denied') : undefined) });
    mount();
    bulkOn();
    tick('One'); tick('Two');
    fireEvent.click(btn('Change Status'));
    answer('mo-bulk-status', 'Dropped');
    await waitFor(() => expect(getStatus().msg).toBe('Updated 1 tasks (1 failed)'));
    expect(getStatus().kind).toBe('error');
    expect(task('b1').status).toBe('Dropped');
    expect(task('b2').status).toBe('Pending');
    expect(patches(f)).toHaveLength(2);                              // it went on to the next task after the failure
  });

  it('an answer that is not a status does nothing, like the old prompt; so does Cancel', () => {
    const f = setup();
    mount();
    bulkOn();
    tick('One');
    fireEvent.click(btn('Change Status'));
    answer('mo-bulk-status', 'Finished');
    expect(f.fn).not.toHaveBeenCalled();
    expect(document.getElementById('mo-bulk-status')).toBeNull();     // closed, as a prompt closes
    expect(bar().textContent).toContain('1 task selected');          // the selection is still there
    fireEvent.click(btn('Change Status'));
    fireEvent.click(within(document.getElementById('mo-bulk-status')).getByRole('button', { name: 'Cancel' }));
    expect(document.getElementById('mo-bulk-status')).toBeNull();
    expect(f.fn).not.toHaveBeenCalled();
  });

  it('a task already at that status is not written again and is not a failure', async () => {
    const f = setup();
    mount();
    bulkOn();
    tick('One'); tick('Three');
    fireEvent.click(btn('Change Status'));
    answer('mo-bulk-status', 'In Progress');
    await waitFor(() => expect(getStatus().msg).toBe('Updated 2 tasks'));
    expect(patches(f).map(idOf)).toEqual(['b1']);                    // Three was already In Progress
  });
});

describe('batch reassign', () => {
  it('asks for a person code, upper-cases it, PATCHes owner_code once per task, and the cards follow', async () => {
    const f = setup();
    mount();
    bulkOn();
    tick('One'); tick('Two');
    fireEvent.click(btn('Reassign'));
    const dlg = document.getElementById('mo-bulk-reassign');
    expect(dlg.textContent).toContain('Enter Person Code to reassign to (e.g. CODE):');
    answer('mo-bulk-reassign', ' ot1 ');
    await waitFor(() => expect(getStatus()).toMatchObject({ kind: 'online', msg: 'Reassigned 2 tasks' }));
    expect(patches(f).map((w) => [idOf(w), w.body])).toEqual([['b1', { owner_code: 'OT1' }], ['b2', { owner_code: 'OT1' }]]);
    expect(task('b1')).toMatchObject({ ownerCode: 'OT1', assignedTo: 'Olive Other' });
    expect(card('One').textContent).toContain('Olive Other');
    expect(bar().textContent).toContain('0 tasks selected');
  });

  it('a rejected reassign is rolled back and counted', async () => {
    setup({ handler: async (url, init) => (init.method === 'PATCH' ? failResponse('fk violation') : undefined) });
    mount();
    bulkOn();
    tick('One');
    fireEvent.click(btn('Reassign'));
    answer('mo-bulk-reassign', 'zzz');
    await waitFor(() => expect(getStatus().msg).toBe('Reassigned 0 tasks (1 failed)'));
    expect(task('b1')).toMatchObject({ ownerCode: ME, assignedTo: 'Me Myself' });
  });

  it('a blank answer does nothing', () => {
    const f = setup();
    mount();
    bulkOn();
    tick('One');
    fireEvent.click(btn('Reassign'));
    answer('mo-bulk-reassign', '   ');
    expect(f.fn).not.toHaveBeenCalled();
  });

  it('keeps co-owners in the display name', async () => {
    setup({ tasks: [T({ id: 'c1', task: 'Shared', coOwnerCodes: [ME], ownerCode: OT, assignedTo: 'Olive Other, Me Myself' })] });
    mount();
    bulkOn();
    tick('Shared');
    fireEvent.click(btn('Reassign'));
    answer('mo-bulk-reassign', 'OT1');
    await waitFor(() => expect(getStatus().msg).toBe('Reassigned 1 tasks'));
    expect(task('c1').assignedTo).toBe('Olive Other, Me Myself');
  });
});

describe('a view-only user', () => {
  it('gets the view-only sentence from a batch and no request is made', async () => {
    const f = setup({ seedExtra: { access: { person_code: ME, can_write: false, role: 'viewer' } } });
    mount();
    bulkOn();                                                        // html.ro hides the button in the real page; in jsdom there is no CSS
    tick('One');
    fireEvent.click(btn('Change Status'));
    answer('mo-bulk-status', 'Completed');
    await waitFor(() => expect(getStatus().kind).toBe('error'));
    expect(getStatus().msg).toBe(READ_ONLY);
    fireEvent.click(btn('Reassign'));
    answer('mo-bulk-reassign', 'OT1');
    await waitFor(() => expect(getStatus().msg).toBe(READ_ONLY));
    expect(f.fn).not.toHaveBeenCalled();
    expect(task('b1')).toMatchObject({ status: 'Pending', ownerCode: ME });
  });
});

describe('Hierarchy has bulk mode too', () => {
  it('rows get tick boxes, Select all takes the list, a batch writes through the same path', async () => {
    const f = setup({ url: '/work/hierarchy', tasks: [T({ id: 'r1', task: 'Row one', priority: 'P2' }), T({ id: 'r2', task: 'Row two', priority: 'P2', owner: OT })] });
    mount(HierarchyRoute);
    fireEvent.click($('.hg-h'));                                    // Unfiled starts folded
    bulkOn();
    expect($$('.ht-r input[type="checkbox"]')).toHaveLength(2);
    fireEvent.click(btn('Select all'));
    expect(bar().textContent).toContain('2 tasks selected');
    fireEvent.click(btn('Change Status'));
    answer('mo-bulk-status', 'Dropped');
    await waitFor(() => expect(getStatus().msg).toBe('Updated 2 tasks'));
    expect(patches(f).map((w) => [idOf(w), w.body.status])).toEqual([['r1', 'dropped'], ['r2', 'dropped']]);
  });
});
