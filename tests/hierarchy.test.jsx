// Work > Hierarchy: groups by workstream / first tag / Unfiled, folded unless my work in them is due
// soon, remembered per group, eight tasks per group before the fold, closed tasks behind "+ N done",
// the status selects (task and workstream) through the shared write path, the colour rule, empty
// states, and the Board <-> Hierarchy links that keep the query string.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent, waitFor, within } from '@testing-library/react';

process.env.NEXT_PUBLIC_SB_URL = 'https://example.supabase.co';
process.env.NEXT_PUBLIC_SB_KEY = 'anon-key-123';

vi.mock('next/navigation', async () => (await import('./helpers/fake-router.js')).navigationMock);
vi.mock('next/link', async () => (await import('./helpers/fake-router.js')).linkMock);

import HierarchyRoute from '@/app/(app)/work/hierarchy/page.jsx';
import BoardRoute from '@/app/(app)/work/board/page.jsx';
import WorkLayout from '@/app/(app)/work/layout.jsx';
import { store } from '@/store/store.js';
import { getStatus } from '@/lib/status.js';
import { seed, stubFetch, failResponse } from './helpers/fixtures.js';
import { NOW, OT, ME, T } from './helpers/board-fixture.js';
import { history, resetNav, currentParams, currentUrl } from './helpers/fake-router.js';

const READ_ONLY = 'You have view-only access to BASE, so this change was not saved.';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const group = (title) => $$('details.hg').find((d) => $('.hg-t', d)?.textContent === title);
const titlesIn = (g) => $$('.ht-t', g).map((e) => e.textContent);
const row = (title) => $$('.ht').find((r) => $('.ht-t', r).textContent === title);
const task = (id) => store.getState().tasks.find((t) => t.id === id);

// w1 "WS One": h1 (mine, P1, late), h2 (Olive's, P2, due 20 Nov), h3 (done).  Tag "Alpha tag": h4.  Unfiled: h5.
// Tag "Done tag": h6, completed only -> the "nothing open" fold.
const WS = [{ id: 'w1', task: 'WS One', status: 'In Progress', v3Status: 'in_progress' }];
const LINKS = [{ parentId: 'w1', childId: 'h1' }, { parentId: 'w1', childId: 'h2' }, { parentId: 'w1', childId: 'h3' }];
const FIX = () => [
  T({ id: 'h1', task: 'Mine late', priority: 'P1', nextFollowUp: '2026-11-01' }),
  T({ id: 'h2', task: 'Olive later', priority: 'P2', nextFollowUp: '2026-11-20', owner: OT }),
  T({ id: 'h3', task: 'Finished one', status: 'Completed' }),
  T({ id: 'h4', task: 'Tagged one', priority: 'P2', nextFollowUp: '2026-11-30', tags: ['Alpha tag'] }),
  T({ id: 'h5', task: 'Loose one', priority: 'P2' }),
  T({ id: 'h6', task: 'Old tagged', status: 'Completed', tags: ['Done tag'] }),
];

function setup({ url = '/work/hierarchy', tasks = FIX(), seedExtra = {}, scope = 'everyone', handler } = {}) {
  seed({ tasks, workstreams: WS, entityLinks: LINKS, ...seedExtra });
  resetNav(url);
  localStorage.setItem('rie_work_scope', scope);
  return stubFetch(handler);
}
const mount = () => render(<WorkLayout><HierarchyRoute /></WorkLayout>);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  localStorage.clear();
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); localStorage.clear(); });

describe('/work/hierarchy renders', () => {
  it('groups with open work first, soonest due first; Unfiled last; the finished one in a fold', () => {
    setup();
    mount();
    const top = $$('.hier > details.hg').map((d) => $('.hg-t', d).textContent);
    expect(top).toEqual(['WS One', 'Alpha tag', 'Unfiled', '1 group with nothing open']);
    expect($('.hier > details.hg-alldone')).not.toBeNull();
    // the nothing-open group sits inside that fold
    expect($$('.hg-alldone details.hg .hg-t').map((e) => e.textContent)).toEqual(['Done tag']);
  });

  it('a group header says what a folded group needs: open count, next due date, progress, P1 overdue', () => {
    setup();
    mount();
    const h = $('.hg-h', group('WS One'));
    expect($('.hg-m', h).textContent).toBe('2 open · next 1 Nov');       // a date, not "9d late"
    expect($('.hg-fire', h).textContent).toBe('P1 overdue');
    expect($('.hg-bar', h).getAttribute('title')).toBe('33% done');
    expect($('.hg-bar i', h).style.width).toBe('33%');
    expect($('.hg-m', $('.hg-h', group('Unfiled'))).textContent).toBe('1 open');          // no date, no "next"
    expect($('.hg-fire', $('.hg-h', group('Alpha tag')))).toBeNull();
  });

  it('"P1 overdue" is only for the person whose P1 it is', () => {
    setup({ seedExtra: { access: { person_code: OT, can_write: true } } });
    mount();
    expect($('.hg-fire', group('WS One'))).toBeNull();
  });

  it('the workstream header carries its own status select and a link to the initiative; Unfiled links to Classify', () => {
    setup();
    mount();
    const sel = $('.hg-x select.ch-status', group('WS One'));
    expect(sel.value).toBe('In Progress');
    expect([...sel.options].map((o) => o.value)).toEqual(['Pending', 'In Progress', 'On Hold', 'Completed', 'Dropped']);
    expect($('.hg-x a', group('WS One')).getAttribute('href')).toBe('/work/initiatives/w1');
    expect($('.hg-x a', group('Unfiled')).getAttribute('href')).toBe('/today/classify');
    expect($('.hg-x a', group('Unfiled')).textContent).toBe('Classify');
    expect($('.hg-x', group('Alpha tag'))).toBeNull();
  });

  it('open tasks are ranked, closed ones wait behind "+ N done"', () => {
    setup();
    mount();
    expect(titlesIn(group('WS One')).slice(0, 2)).toEqual(['Mine late', 'Olive later']);
    const done = $('details.hg-done', group('WS One'));
    expect($('summary', done).textContent).toBe('+ 1 done');
    expect($$('.ht-t', done).map((e) => e.textContent)).toEqual(['Finished one']);
    expect(done.open).toBe(false);
  });

  it('a task row: status select, due label, priority, first assignee, edit', () => {
    setup();
    mount();
    const r = row('Mine late');
    expect($('select.ch-status', r).value).toBe('Pending');
    expect($('.ht-d', r).textContent).toBe('Was due 1 Nov');
    expect($('.ht-p', r).textContent).toBe('P1');
    expect($('.ht-o', r).textContent).toBe('Me Myself');
    expect($('button[aria-label="Edit"]', r)).not.toBeNull();
    expect($('.ht-p', row('Loose one')).textContent).toBe('P2');
  });

  it('the first assignee only, when a task is shared', () => {
    setup({ tasks: [T({ id: 'h1', task: 'Shared', assignedTo: 'Olive Other, Me Myself', ownerCode: OT, coOwnerCodes: [ME] })] });
    mount();
    expect($('.ht-o', row('Shared')).textContent).toBe('Olive Other');
  });

  it('actions under a task are listed with their status', () => {
    setup({
      seedExtra: { actions: [{ id: 'ac1', task: 'Call them', status: 'On Hold' }], entityLinks: [...LINKS, { parentId: 'h1', childId: 'ac1' }] },
    });
    mount();
    const a = $('.ht-a .ht-ar', row('Mine late'));
    expect(a.textContent).toContain('Call them');
    expect(a.textContent).toContain('On Hold');
  });

  it('a task title opens the viewer with router.push(/work/tasks/[id])', () => {
    setup({ url: '/work/hierarchy?scope=everyone' });
    mount();
    fireEvent.click($('.ht-t', row('Mine late')));
    expect(history.at(-1)).toEqual({ kind: 'push', href: '/work/tasks/h1' });
  });
});

describe('colour rule', () => {
  const colors = (title) => ({ due: $('.ht-d', row(title)).style.color, pr: $('.ht-p', row(title))?.style.color });
  it('red only where P1, overdue and mine; overdue alone amber; due today amber; the rest muted ink', () => {
    setup({
      tasks: [
        T({ id: 'a', task: 'Fire', priority: 'P1', nextFollowUp: '2026-11-01' }),
        T({ id: 'b', task: 'Theirs', priority: 'P1', nextFollowUp: '2026-11-01', owner: OT }),
        T({ id: 'c', task: 'Late P2', priority: 'P2', nextFollowUp: '2026-11-01' }),
        T({ id: 'd', task: 'Today', priority: 'P2', nextFollowUp: '2026-11-10' }),
        T({ id: 'e', task: 'Later', priority: 'P3', nextFollowUp: '2026-11-25' }),
        T({ id: 'f', task: 'Held', priority: 'P1', nextFollowUp: '2026-11-01', status: 'On Hold' }),
      ],
      seedExtra: { workstreams: [], entityLinks: [] },
    });
    mount();
    fireEvent.click($('.hg-h', group('Unfiled')));
    expect(colors('Fire')).toEqual({ due: 'var(--hot)', pr: 'var(--hot)' });
    expect(colors('Theirs')).toEqual({ due: 'var(--warm)', pr: 'var(--warm)' });     // P1 alone is amber, overdue alone is amber
    expect(colors('Late P2')).toEqual({ due: 'var(--warm)', pr: 'var(--txd)' });
    expect(colors('Today')).toEqual({ due: 'var(--warm)', pr: 'var(--txd)' });
    expect(colors('Later')).toEqual({ due: 'var(--txm)', pr: 'var(--txd)' });
    expect(colors('Held')).toEqual({ due: 'var(--txd)', pr: 'var(--warm)' });        // paused: never late
  });
});

describe('groups fold', () => {
  it('start open only where my open work is due within a week or late; tag groups and Unfiled start closed', () => {
    setup();
    mount();
    expect(group('WS One').open).toBe(true);                // h1 is mine, due 1 Nov
    expect(group('Alpha tag').open).toBe(false);
    expect(group('Unfiled').open).toBe(false);
  });

  it('a workstream with nothing of mine due soon starts closed', () => {
    setup({ seedExtra: { access: { person_code: 'OT1', can_write: true } }, tasks: [
      T({ id: 'h1', task: 'Mine late', priority: 'P1', nextFollowUp: '2026-11-01' }),
      T({ id: 'h2', task: 'Olive later', priority: 'P2', nextFollowUp: '2026-11-20', owner: OT }),
    ] });
    mount();
    expect(group('WS One').open).toBe(false);               // OT1's task is due 20 Nov, not within 7 days; h1 is not theirs
  });

  it('clicking the header opens and closes the group, and remembers it per group in rie_hier_open', () => {
    setup();
    const { unmount } = mount();
    fireEvent.click($('.hg-h', group('Unfiled')));
    expect(group('Unfiled').open).toBe(true);
    expect(JSON.parse(localStorage.getItem('rie_hier_open'))).toEqual({ unfiled: true });
    fireEvent.click($('.hg-h', group('WS One')));
    expect(group('WS One').open).toBe(false);
    expect(JSON.parse(localStorage.getItem('rie_hier_open'))).toEqual({ unfiled: true, 'ws:w1': false });
    unmount();                                              // a new visit: the choice stands, over the default
    mount();
    expect(group('Unfiled').open).toBe(true);
    expect(group('WS One').open).toBe(false);
    expect(group('Alpha tag').open).toBe(false);
  });

  it('the default is not written to storage by merely looking (only a click persists)', () => {
    setup();
    mount();
    expect(localStorage.getItem('rie_hier_open')).toBeNull();
  });

  it('eight open tasks per group before a "N more"; it reveals the rest', () => {
    const many = Array.from({ length: 11 }, (_, i) => T({ id: 'm' + i, task: 'Item ' + String(i).padStart(2, '0'), priority: 'P2', nextFollowUp: `2026-12-${String(i + 1).padStart(2, '0')}` }));
    setup({ tasks: many, seedExtra: { workstreams: [], entityLinks: [] } });
    mount();
    fireEvent.click($('.hg-h', group('Unfiled')));
    expect(titlesIn(group('Unfiled'))).toHaveLength(8);
    expect($('.kb-more', group('Unfiled')).textContent).toBe('3 more');
    fireEvent.click($('.kb-more', group('Unfiled')));
    expect(titlesIn(group('Unfiled'))).toHaveLength(11);
    expect($('.kb-more', group('Unfiled'))).toBeNull();
    expect($('.hg-m', $('.hg-h', group('Unfiled'))).textContent).toBe('11 open · next 1 Dec');
  });

  it('a group that holds only closed tasks says "Nothing open" inside its fold', () => {
    setup();
    mount();
    fireEvent.click($('.hg-alldone > .hg-h'));              // native <details>: the user opens it
    expect($('.kb-empty', group('Done tag')).textContent).toBe('Nothing open');
    expect($('summary', $('details.hg-done', group('Done tag'))).textContent).toBe('+ 1 done');
  });

  it('"2 groups with nothing open" is plural', () => {
    setup({ tasks: [...FIX(), T({ id: 'h7', task: 'Another', status: 'Dropped', tags: ['Third tag'] })] });
    mount();
    expect($('.hg-alldone > .hg-h .hg-t').textContent).toBe('2 groups with nothing open');
  });
});

describe('status writes from the rows go through the shared path', () => {
  const patches = (f) => f.writes().filter((w) => w.method === 'PATCH');
  const gate = () => { let release; const p = new Promise((r) => { release = r; }); return { p, release }; };

  it('a task\'s select is optimistic and PATCHes entities once', async () => {
    const g = gate();
    const f = setup({ handler: async (url, init) => { if (init.method === 'PATCH') await g.p; } });
    mount();
    fireEvent.change($('select.ch-status', row('Mine late')), { target: { value: 'Completed' } });
    expect(task('h1').status).toBe('Completed');                          // before the request resolved
    expect($('select.ch-status', row('Mine late')).value).toBe('Completed');
    g.release();
    await waitFor(() => expect(getStatus()).toMatchObject({ kind: 'online', msg: 'Moved to Completed' }));
    expect(patches(f)).toHaveLength(1);
    expect(patches(f)[0].url).toContain('/rest/v1/entities?id=eq.h1');
    expect(patches(f)[0].body).toMatchObject({ status: 'completed' });
    await waitFor(() => expect(f.writes().some((w) => w.url.includes('entity_events') && w.body?.notes === 'Hierarchy')).toBe(true));
  });

  it('rolls back and says so when rejected', async () => {
    setup({ handler: async (url, init) => (init.method === 'PATCH' ? failResponse('denied') : undefined) });
    mount();
    fireEvent.change($('select.ch-status', row('Mine late')), { target: { value: 'Dropped' } });
    await waitFor(() => expect(getStatus().kind).toBe('error'));
    expect(getStatus().msg).toMatch(/^Update failed: .*denied/);
    expect(task('h1').status).toBe('Pending');
    expect($('select.ch-status', row('Mine late')).value).toBe('Pending');
  });

  it('a workstream\'s select writes the workstream; On Hold cascades to unfinished children, not finished ones', async () => {
    const f = setup();
    mount();
    fireEvent.change($('.hg-x select', group('WS One')), { target: { value: 'On Hold' } });
    await waitFor(() => expect(getStatus()).toMatchObject({ kind: 'online', msg: 'Workstream set to On Hold' }));
    expect(patches(f).map((p) => [p.url.split('?id=eq.')[1], p.body.status])).toEqual([['w1', 'on_hold'], ['h1', 'on_hold'], ['h2', 'on_hold']]);
    expect(store.getState().workstreams[0].status).toBe('On Hold');
    expect(task('h1').status).toBe('On Hold');
    expect(task('h3').status).toBe('Completed');                          // done work is left alone
  });

  it('a workstream write that fails says so and changes nothing', async () => {
    setup({ handler: async (url, init) => (init.method === 'PATCH' ? failResponse('nope') : undefined) });
    mount();
    fireEvent.change($('.hg-x select', group('WS One')), { target: { value: 'Dropped' } });
    await waitFor(() => expect(getStatus().kind).toBe('error'));
    expect(getStatus().msg).toMatch(/^Status update failed: /);
    expect(store.getState().workstreams[0].status).toBe('In Progress');
    expect(task('h1').status).toBe('Pending');
  });

  it('a view-only user: the sentence, and no request at all', async () => {
    const f = setup({ seedExtra: { access: { person_code: ME, can_write: false, role: 'viewer' } } });
    mount();
    fireEvent.change($('select.ch-status', row('Mine late')), { target: { value: 'Completed' } });
    await waitFor(() => expect(getStatus().kind).toBe('error'));
    expect(getStatus().msg).toContain(READ_ONLY);
    fireEvent.change($('.hg-x select', group('WS One')), { target: { value: 'Dropped' } });
    await waitFor(() => expect(getStatus().msg).toContain(READ_ONLY));
    expect(f.fn).not.toHaveBeenCalled();
    expect(task('h1').status).toBe('Pending');
    expect(store.getState().workstreams[0].status).toBe('In Progress');
  });
});

describe('filters and scope apply here exactly as on the Board', () => {
  it('the same filter row narrows the groups', () => {
    setup({ url: '/work/hierarchy?pr=P1' });
    mount();
    expect($$('.ht-t').map((e) => e.textContent)).toEqual(['Mine late']);
    expect($('#tf-toggle').textContent).toBe('Filters · 1');
  });

  it('scope Team drops my tasks', () => {
    setup({ url: '/work/hierarchy?scope=team' });
    mount();
    expect(group('WS One')).not.toBeUndefined();
    expect($$('.ht-t').map((e) => e.textContent)).toEqual(['Olive later']);
  });

  it('scope Mine with nothing of mine says so, and points at Team', () => {
    setup({ url: '/work/hierarchy?scope=mine', tasks: [T({ id: 'x', task: 'Theirs', owner: OT })] });
    mount();
    expect($('.hier .kb-empty').textContent).toBe('Nothing of yours here. The team’s work is under Team.');
  });

  it('a filter that matches nothing offers to clear the filters, and does', () => {
    setup({ url: '/work/hierarchy?scope=everyone&pj=Gone&q=zzz' });
    mount();
    expect($('.hier .kb-empty').textContent).toBe('Nothing matches. Clear the filters to see everything.');
    fireEvent.click(within($('.hier .kb-empty')).getByText('Clear the filters'));
    expect(currentParams().get('q')).toBeNull();
    expect(currentParams().get('scope')).toBe('everyone');             // the scope stays
    expect($$('.ht-t').length).toBeGreaterThan(0);
  });
});

describe('Board <-> Hierarchy keep the query string', () => {
  it('the link on Hierarchy goes to the Board (labelled Kanban) with scope and filters intact', () => {
    setup({ url: '/work/hierarchy?scope=team&pr=P2&q=olive' });
    mount();
    const link = $('#task-view-toggle');
    expect(link.textContent).toBe('Kanban');
    expect(link.getAttribute('href')).toBe('/work/board?scope=team&pr=P2&q=olive');
    fireEvent.click(link);
    expect(history.at(-1)).toEqual({ kind: 'push', href: '/work/board?scope=team&pr=P2&q=olive' });
    expect(currentUrl()).toBe('/work/board?scope=team&pr=P2&q=olive');
  });

  it('and the Board links to Hierarchy the same way', () => {
    seed({ tasks: FIX(), workstreams: WS, entityLinks: LINKS });
    resetNav('/work/board?scope=everyone&at=Olive+Other&due=overdue');
    localStorage.setItem('rie_work_scope', 'everyone');
    stubFetch();
    render(<WorkLayout><BoardRoute /></WorkLayout>);
    const link = $('#task-view-toggle');
    expect(link.textContent).toBe('Hierarchy');
    expect(link.getAttribute('href')).toBe('/work/hierarchy?scope=everyone&at=Olive+Other&due=overdue');
  });

  it('with nothing in the URL the links are bare routes', () => {
    setup();
    mount();
    expect($('#task-view-toggle').getAttribute('href')).toBe('/work/board');
  });
});
