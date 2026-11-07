// Work > Board: live columns and the closed rail, eight cards before the fold, every filter of the
// legacy row as a search param, scope, the colour rule, drag-and-drop status changes (optimistic,
// rolled back on a rejected update), and the view-only user. The real task-actions / rest.js run;
// only fetch is stubbed, so "no fetch" is a real assertion. Expected lists are worked out by hand from
// the fixture comments in tests/helpers/board-fixture.js and from rie-dashboard2/js/tasks.js.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent, waitFor, within } from '@testing-library/react';

process.env.NEXT_PUBLIC_SB_URL = 'https://example.supabase.co';
process.env.NEXT_PUBLIC_SB_KEY = 'anon-key-123';

vi.mock('next/navigation', async () => (await import('./helpers/fake-router.js')).navigationMock);
vi.mock('next/link', async () => (await import('./helpers/fake-router.js')).linkMock);

import BoardRoute from '@/app/(app)/work/board/page.jsx';
import WorkLayout from '@/app/(app)/work/layout.jsx';
import { TaskFormProvider } from '@/features/tasks/TaskFormProvider.jsx';
import { store } from '@/store/store.js';
import { getStatus } from '@/lib/status.js';
import { seed, stubFetch, failResponse } from './helpers/fixtures.js';
import { NOW, OT, ME, T, NAMED } from './helpers/board-fixture.js';
import { TASKS as MATRIX_TASKS } from './helpers/matrix-fixture.js';
import { history, resetNav, currentParams, currentUrl } from './helpers/fake-router.js';

const READ_ONLY = 'You have view-only access to BASE, so this change was not saved.';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const col = (status) => $(`.kb-col[data-status="${status}"]`);
const titlesIn = (root) => $$('.kb-card .kb-task', root).map((e) => e.textContent.replace(/^#\d+/, ''));
const colTitles = (status) => titlesIn(col(status));
const allTitles = () => titlesIn(document).sort();
const card = (title) => $$('.kb-card').find((c) => $('.kb-task', c).textContent.replace(/^#\d+/, '') === title);
const gate = () => { let release; const p = new Promise((r) => { release = r; }); return { p, release }; };
const task = (id) => store.getState().tasks.find((t) => t.id === id);

function setup({ url = '/work/board', tasks = NAMED(), seedExtra = {}, scope = 'everyone', closedOpen = true, handler } = {}) {
  seed({ tasks, ...seedExtra });
  resetNav(url);
  localStorage.setItem('rie_work_scope', scope);        // the default scope; a ?scope= in the URL wins
  if (closedOpen) localStorage.setItem('rie_board_closed', '1');
  return stubFetch(handler);
}
const mount = (opts = {}) => render(
  <WorkLayout>{opts.withForm ? <TaskFormProvider><BoardRoute /></TaskFormProvider> : <BoardRoute />}</WorkLayout>,
);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  localStorage.clear();
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); localStorage.clear(); document.body.className = ''; });

describe('/work/board renders', () => {
  it('shows the three live columns in order and the closed rail, with scope and surface links above', () => {
    setup({ closedOpen: false });
    mount();
    expect($$('.kb-col').map((c) => c.dataset.status)).toEqual(['Pending', 'In Progress', 'On Hold']);
    expect($$('.kb-col').map((c) => c.className.split(' ').slice(1, 2)[0])).toEqual(['kb-wo', 'kb-ip', 'kb-oh']);
    expect($$('.kb-col-hdr').map((h) => h.textContent)).toEqual(['Pending2', 'In Progress1', 'On Hold1']);
    expect($('#kb-board')).not.toBeNull();
    expect($('#tab-tasks .tbar #work-scope')).not.toBeNull();
    // closed work: Delta (Completed, closed this week) and Foxtrot (Dropped)
    expect($('.kb-rail .kb-rail-n').textContent).toBe('✓ 2 closed');
    expect($('.kb-rail .kb-rail-w').textContent).toBe('1 this week');
    expect(col('Completed')).toBeNull();
  });

  it('the Filters control, the Board <-> Hierarchy link and Bulk edit join the same toolbar row', () => {
    setup();
    mount();
    const bar = $('#tab-tasks > .tlay > .tbar');
    expect(bar.contains($('#tf-toggle')) && bar.contains($('#task-view-toggle')) && bar.contains($('#tf-bulk'))).toBe(true);
    expect($('#tf-toggle').textContent).toBe('Filters');
    expect($('#tf-legacy').classList.contains('off')).toBe(true);     // folded behind the button until a filter is active
  });

  it('cards are ranked like Today (P1 first, oldest due first, undated last) and show assignee, due label and P1', () => {
    setup({ tasks: [
      T({ id: 'a', task: 'No date', priority: 'P2' }),
      T({ id: 'b', task: 'P2 late', priority: 'P2', nextFollowUp: '2026-11-01' }),
      T({ id: 'c', task: 'P1 later', priority: 'P1', nextFollowUp: '2026-11-20' }),
      T({ id: 'd', task: 'P1 oldest', priority: 'P1', nextFollowUp: '2026-10-20' }),
    ] });
    mount();
    expect(colTitles('Pending')).toEqual(['P1 oldest', 'P1 later', 'P2 late', 'No date']);
    const c = card('P1 oldest');
    expect(c.textContent).toContain('Me Myself');
    expect(c.textContent).toContain('Was due 20 Oct');
    expect($$('.kb-tag', c).map((e) => e.textContent)).toEqual(['Me Myself', 'Was due 20 Oct', 'P1']);
    expect(card('No date').textContent).toContain('No date');
  });

  it('dates, not day counts: nothing says "127d late"', () => {
    setup({ tasks: [T({ id: 'a', task: 'Ancient', nextFollowUp: '2026-01-05', priority: 'P2' })] });
    mount();
    expect(card('Ancient').textContent).toContain('Was due 5 Jan');
    expect(document.body.textContent).not.toMatch(/\d+d late/);
  });

  it('a task with a legacy number shows it; an unowned task says Unassigned', () => {
    setup();
    mount();
    expect($('.kb-tnum', card('Alpha')).textContent).toBe('#12');
    expect(card('Charlie').textContent).toContain('Unassigned');
  });

  it('opens the task viewer with router.push(/work/tasks/[id]) and keeps nothing else', () => {
    setup({ url: '/work/board?scope=everyone&pj=Proj+A' });
    mount();
    fireEvent.click(card('Alpha'));
    expect(history.at(-1)).toEqual({ kind: 'push', href: '/work/tasks/n1' });
  });

  it('the pencil opens the edit form without opening the viewer; the lead button waits for Pipeline', async () => {
    setup();
    mount({ withForm: true });
    fireEvent.click($('button[aria-label="Edit"]', card('Alpha')));
    expect(history.filter((h) => h.href.startsWith('/work/tasks'))).toEqual([]);
    await waitFor(() => expect(document.getElementById('mo-tf').classList.contains('open')).toBe(true));
    expect($('#mo-tf .mti').textContent).toBe('Edit Task #12');
    fireEvent.click($('button[aria-label="Convert to lead"]', card('Bravo')));
    expect(history.filter((h) => h.href.startsWith('/work/tasks'))).toEqual([]);
  });

  it('an empty column says so', () => {
    setup({ tasks: [T({ id: 'a', task: 'Only one' })] });
    mount();
    expect($('.kb-empty', col('On Hold')).textContent).toBe('Nothing here');
  });
});

describe('eight cards per column, then the fold', () => {
  const eleven = () => Array.from({ length: 11 }, (_, i) => T({ id: 'p' + i, task: 'Card ' + String(i).padStart(2, '0'), priority: 'P2', nextFollowUp: `2026-12-${String(i + 1).padStart(2, '0')}` }));

  it('shows 8 of 11, a "3 more" button, and the header counts all 11', () => {
    setup({ tasks: [...eleven(), T({ id: 'ip', task: 'Moving', status: 'In Progress' })] });
    mount();
    expect(colTitles('Pending')).toHaveLength(8);
    expect(colTitles('Pending')).toEqual(Array.from({ length: 8 }, (_, i) => 'Card ' + String(i).padStart(2, '0')));
    expect($('.kb-cnt', col('Pending')).textContent).toBe('11');
    expect($('.kb-more', col('Pending')).textContent).toBe('3 more');
    expect($('.kb-more', col('In Progress'))).toBeNull();           // one card: no fold
  });

  it('"3 more" reveals exactly the rest of that column and leaves the others alone', () => {
    setup({ tasks: eleven() });
    mount();
    fireEvent.click($('.kb-more', col('Pending')));
    expect(colTitles('Pending')).toHaveLength(11);
    expect(colTitles('Pending').at(-1)).toBe('Card 10');
    expect($('.kb-more', col('Pending'))).toBeNull();
    expect($('.kb-cnt', col('Pending')).textContent).toBe('11');
  });

  it('exactly eight cards has no fold', () => {
    setup({ tasks: eleven().slice(0, 8) });
    mount();
    expect(colTitles('Pending')).toHaveLength(8);
    expect($('.kb-more')).toBeNull();
  });

  it('the fold applies to the closed columns once the rail is open', () => {
    const closed = Array.from({ length: 10 }, (_, i) => T({ id: 'c' + i, task: 'Done ' + i, status: 'Completed' }));
    setup({ tasks: closed, closedOpen: true });
    mount();
    expect(colTitles('Completed')).toHaveLength(8);
    expect($('.kb-more', col('Completed')).textContent).toBe('2 more');
  });
});

describe('the closed rail', () => {
  it('folded by default; clicking it opens Completed and Dropped, remembers it, and the "<" folds it again', () => {
    setup({ closedOpen: false });
    const { unmount } = mount();
    expect(col('Completed')).toBeNull();
    fireEvent.click($('.kb-rail'));
    expect($$('.kb-col').map((c) => c.dataset.status)).toEqual(['Pending', 'In Progress', 'On Hold', 'Completed', 'Dropped']);
    expect(colTitles('Completed')).toEqual(['Delta']);
    expect(colTitles('Dropped')).toEqual(['Foxtrot']);
    expect(localStorage.getItem('rie_board_closed')).toBe('1');

    unmount();                                         // a new visit: still open
    mount();
    expect(col('Completed')).not.toBeNull();

    fireEvent.click($('.kb-rail-close'));
    expect(col('Completed')).toBeNull();
    expect($('.kb-rail-n').textContent).toBe('✓ 2 closed');
    expect(localStorage.getItem('rie_board_closed')).toBe('0');
  });

  it('counts closed work and, separately, what closed since Monday', () => {
    setup({ closedOpen: false, tasks: [
      T({ id: 'a', status: 'Completed', closedAt: '2026-11-09T10:00:00' }),
      T({ id: 'b', status: 'Completed', closedAt: '2026-11-08T10:00:00' }),
      T({ id: 'c', status: 'Completed', closedAt: '', updatedAt: '2026-11-10T10:00:00' }),
      T({ id: 'd', status: 'Dropped', closedAt: '2026-11-10T10:00:00' }),
    ] });
    mount();
    expect($('.kb-rail-n').textContent).toBe('✓ 4 closed');
    expect($('.kb-rail-w').textContent).toBe('2 this week');
  });

  it('no "this week" line when nothing closed this week', () => {
    setup({ closedOpen: false, tasks: [T({ id: 'b', status: 'Completed', closedAt: '2026-10-01T10:00:00' })] });
    mount();
    expect($('.kb-rail-w')).toBeNull();
  });
});

describe('colour rule: red only where a task is P1, overdue and mine; overdue alone is amber; counts neutral', () => {
  const tagOf = (c, i) => $$('.kb-tag', c)[i];
  const rows = () => [
    T({ id: 'fire', task: 'Fire', priority: 'P1', nextFollowUp: '2026-11-01' }),                       // mine, P1, overdue
    T({ id: 'theirs', task: 'Theirs', priority: 'P1', nextFollowUp: '2026-11-01', owner: OT }),         // P1, overdue, not mine
    T({ id: 'late', task: 'Late', priority: 'P2', nextFollowUp: '2026-11-01' }),                        // mine, overdue, P2
    T({ id: 'today', task: 'Today', priority: 'P2', nextFollowUp: '2026-11-10' }),
    T({ id: 'hold', task: 'Held', priority: 'P1', nextFollowUp: '2026-11-01', status: 'On Hold' }),    // paused is never late
  ];

  it('P1 + overdue + mine: the due tag and the P1 tag both carry kb-due-ov', () => {
    setup({ tasks: rows() });
    mount();
    const c = card('Fire');
    expect(tagOf(c, 1).className).toBe('kb-tag kb-due-ov');
    expect(tagOf(c, 2).className).toBe('kb-tag kb-due-ov');
  });

  it('overdue alone is amber (kb-due-to), also P1 + overdue that is not mine; the P1 tag stays neutral', () => {
    setup({ tasks: rows() });
    mount();
    expect(tagOf(card('Late'), 1).className).toBe('kb-tag kb-due-to');
    expect(tagOf(card('Theirs'), 1).className).toBe('kb-tag kb-due-to');
    expect(tagOf(card('Theirs'), 2).className).toBe('kb-tag');
  });

  it('a task due today is not coloured, a held / closed task is muted, never late', () => {
    setup({ tasks: rows() });
    mount();
    expect(tagOf(card('Today'), 1).className).toBe('kb-tag');
    expect(tagOf(card('Held'), 1).className).toBe('kb-tag kb-due-mute');
    expect(tagOf(card('Held'), 1).textContent).toBe('1 Nov');            // a muted card shows the bare date
    expect(tagOf(card('Held'), 2).className).toBe('kb-tag');
  });

  it('for someone else the same cards swap: their P1 overdue is the red one', () => {
    setup({ tasks: rows(), seedExtra: { access: { person_code: OT, can_write: true } } });
    mount();
    expect(tagOf(card('Theirs'), 1).className).toBe('kb-tag kb-due-ov');
    expect(tagOf(card('Fire'), 1).className).toBe('kb-tag kb-due-to');
  });

  it('column counts are neutral: no colour class on kb-cnt', () => {
    setup({ tasks: rows() });
    mount();
    expect($$('.kb-cnt').every((e) => e.className === 'kb-cnt' && !e.getAttribute('style'))).toBe(true);
  });
});

describe('each filter of the legacy row narrows the list (and is a search param)', () => {
  // all five columns are open in these (closedOpen defaults to true), so closed work is visible
  it('no filter: all six', () => {
    setup();
    mount();
    expect(allTitles()).toEqual(['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot']);
  });

  it('project: the select offers the projects in the data and filters by exact match', () => {
    setup();
    mount();
    expect($$('#tf-proj option').map((o) => o.textContent)).toEqual(['All Projects', 'Proj A', 'Proj B']);
    fireEvent.change($('#tf-proj'), { target: { value: 'Proj A' } });
    expect(allTitles()).toEqual(['Alpha', 'Charlie']);
    expect(currentParams().get('pj')).toBe('Proj A');
  });

  it('category', () => {
    setup();
    mount();
    expect($$('#tf-cat option').map((o) => o.textContent)).toEqual(['All Categories', 'Ops', 'Sales']);
    fireEvent.change($('#tf-cat'), { target: { value: 'Sales' } });
    expect(allTitles()).toEqual(['Bravo', 'Charlie']);
    expect(currentParams().get('cat')).toBe('Sales');
  });

  it('search: title, contact and assignee text in any case, written to ?q= after a short pause', async () => {
    setup();
    mount();
    fireEvent.change($('#tf-task'), { target: { value: 'ZED' } });
    await waitFor(() => expect(currentParams().get('q')).toBe('ZED'));
    expect(allTitles()).toEqual(['Alpha']);
    fireEvent.change($('#tf-task'), { target: { value: 'olive' } });
    await waitFor(() => expect(allTitles()).toEqual(['Alpha', 'Bravo']));
  });

  it('search: #12 and "task 12" find legacy task 12', async () => {
    setup({ url: '/work/board?q=%2312' });
    mount();
    expect(allTitles()).toEqual(['Alpha']);
    cleanup();
    setup({ url: '/work/board?q=task+12' });
    mount();
    expect(allTitles()).toEqual(['Alpha']);
  });

  it('assigned to: multi-select, a shared task matches any of its people, Unassigned is a row', () => {
    setup();
    mount();
    fireEvent.click($('#tf-toggle'));
    fireEvent.click($('#tf-at-btn'));
    expect($('#tf-at-drop').style.display).toBe('block');
    expect($$('#tf-at-options label').map((l) => l.textContent)).toEqual(['Unassigned', 'Me Myself', 'Olive Other', 'Pat Third']);
    fireEvent.click(within($('#tf-at-options')).getByLabelText('Olive Other'));
    expect(allTitles()).toEqual(['Alpha', 'Bravo']);                    // Bravo is "Me Myself, Olive Other"
    expect($('#tf-at-btn').textContent).toBe('Assigned (1) ▾');
    fireEvent.click(within($('#tf-at-options')).getByLabelText('Unassigned'));
    expect(allTitles()).toEqual(['Alpha', 'Bravo', 'Charlie']);         // multi-select is an OR
    expect($('#tf-at-btn').textContent).toBe('Assigned (2) ▾');
    expect(currentParams().getAll('at')).toEqual(['Olive Other', '__unassigned__']);
    fireEvent.click(within($('#tf-at-drop')).getByText('Clear'));
    expect(allTitles()).toHaveLength(6);
    expect($('#tf-at-btn').textContent).toBe('Assigned to ▾');
  });

  it('priority: multi-select including "no priority"', () => {
    setup();
    mount();
    fireEvent.click($('#tf-toggle'));
    fireEvent.click($('#tf-pr-btn'));
    fireEvent.click(within($('#tf-pr-options')).getByLabelText('P1 (Highest)'));
    expect(allTitles()).toEqual(['Alpha', 'Echo']);
    fireEvent.click(within($('#tf-pr-options')).getByLabelText('— No priority'));
    expect(allTitles()).toEqual(['Alpha', 'Charlie', 'Echo']);
    expect($('#tf-pr-btn').textContent).toBe('Priority (2) ▾');
    expect(currentParams().getAll('pr')).toEqual(['P1', 'none']);
  });

  it('due: Overdue / Today / 3 Days / All', () => {
    setup();
    mount();
    fireEvent.click($('#tf-toggle'));
    const btn = (name) => within($('#tf-legacy .fb')).getByRole('button', { name });
    fireEvent.click(btn('Overdue'));
    expect(allTitles()).toEqual(['Alpha']);
    expect(btn('Overdue').classList.contains('active')).toBe(true);
    fireEvent.click(btn('Today'));
    expect(allTitles()).toEqual(['Bravo']);
    fireEvent.click(btn('3 Days'));
    expect(allTitles()).toEqual(['Bravo', 'Charlie', 'Foxtrot']);
    expect(currentParams().get('due')).toBe('3days');
    fireEvent.click(btn('All'));
    expect(allTitles()).toHaveLength(6);
    expect(currentParams().get('due')).toBeNull();
  });

  it('created: today / this week / this month / this quarter', () => {
    setup();
    mount();
    fireEvent.click($('#tf-toggle'));
    fireEvent.click($('#tf-cr-btn'));
    const opt = (label) => within($('#tf-cr-options')).getByText(label);
    fireEvent.click(opt('Today'));
    expect(allTitles()).toEqual(['Alpha']);
    expect($('#tf-cr-btn').textContent).toBe('Created today ▾');
    fireEvent.click(opt('This Week'));
    expect(allTitles()).toEqual(['Alpha', 'Bravo']);
    fireEvent.click(opt('This Month'));
    expect(allTitles()).toEqual(['Alpha', 'Bravo', 'Charlie']);
    fireEvent.click(opt('This Quarter'));
    expect(allTitles()).toEqual(['Alpha', 'Bravo', 'Charlie', 'Delta']);
    expect(currentParams().get('cr')).toBe('quarter');
    fireEvent.click(within($('#tf-cr-drop')).getByText('Clear'));
    expect(allTitles()).toHaveLength(6);
    expect($('#tf-cr-btn').textContent).toBe('Created ▾');
  });

  it('created: custom range, applied with the Apply button, end day included', () => {
    setup();
    mount();
    fireEvent.click($('#tf-toggle'));
    fireEvent.click($('#tf-cr-btn'));
    expect($('#tf-cr-custom-row').style.display).toBe('none');
    fireEvent.click(within($('#tf-cr-options')).getByText('Custom Range…'));
    expect($('#tf-cr-custom-row').style.display).toBe('block');
    expect($('#tf-cr-btn').textContent).toBe('Created: custom range ▾');
    fireEvent.change($('#tf-cr-from'), { target: { value: '2026-10-10' } });
    fireEvent.change($('#tf-cr-to'), { target: { value: '2026-11-02' } });
    expect(allTitles()).not.toEqual(['Charlie', 'Delta']);              // nothing applies until Apply
    fireEvent.click(within($('#tf-cr-custom-row')).getByRole('button', { name: 'Apply' }));
    expect(allTitles()).toEqual(['Charlie', 'Delta']);                  // Charlie was created 2 Nov 10:00
    expect(currentUrl()).toContain('cr=custom&crf=2026-10-10&crt=2026-11-02');
    fireEvent.change($('#tf-cr-to'), { target: { value: '2026-11-01' } });
    fireEvent.click(within($('#tf-cr-custom-row')).getByRole('button', { name: 'Apply' }));
    expect(allTitles()).toEqual(['Delta']);
  });

  it('tags: the tag bar lists the active tags, a chip removes one, "Clear all" removes them all', () => {
    setup({ url: '/work/board?tg=Priority&tg=Fox' });
    mount();
    expect($('#tag-filter-bar')).not.toBeNull();
    expect($('#tag-filter-bar').textContent).toContain('Tag filter:');
    expect($$('.tag-chip').map((c) => c.firstChild.textContent)).toEqual(['Priority', 'Fox']);
    expect(allTitles()).toEqual(['Echo', 'Foxtrot']);
    fireEvent.click($('.tag-chip-x', $$('.tag-chip')[0]));
    expect(allTitles()).toEqual(['Foxtrot']);
    expect(currentParams().getAll('tg')).toEqual(['Fox']);
    fireEvent.click(within($('#tag-filter-bar')).getByRole('button', { name: 'Clear all ✕' }));
    expect($('#tag-filter-bar')).toBeNull();
    expect(allTitles()).toHaveLength(6);
  });

  it('computed tags filter too (Overdue is derived from the due date and status)', () => {
    setup({ url: '/work/board?tg=Overdue' });
    mount();
    expect(allTitles()).toEqual(['Alpha']);
  });

  it('the Filters button counts active kinds, opens the row, and stays open while a filter is active', () => {
    setup({ url: '/work/board?pj=Proj+A&pr=P1' });
    mount();
    expect($('#tf-toggle').textContent).toBe('Filters · 2');
    expect($('#tf-toggle').classList.contains('on')).toBe(true);
    expect($('#tf-legacy').classList.contains('off')).toBe(false);
    expect(allTitles()).toEqual(['Alpha']);
  });

  it('filters combine, and values the data no longer has are ignored, not errors', () => {
    setup({ url: '/work/board?pj=Proj+B&cat=Sales&at=Nobody+Here&due=nextweek&cr=fortnight' });
    mount();
    expect(allTitles()).toEqual(['Bravo']);                              // pj and cat applied; the stale ones dropped
    cleanup();
    setup({ url: '/work/board?pj=Gone&zzz=1' });
    mount();
    expect(allTitles()).toHaveLength(6);                                 // a project nobody has is ignored
  });

  it('typing a search keeps the other params (scope) in the URL', async () => {
    setup({ url: '/work/board?scope=everyone&pr=P1' });
    mount();
    fireEvent.change($('#tf-task'), { target: { value: 'echo' } });
    await waitFor(() => expect(currentParams().get('q')).toBe('echo'));
    expect(currentParams().get('scope')).toBe('everyone');
    expect(currentParams().getAll('pr')).toEqual(['P1']);
  });
});

describe('scope: Mine / Team / Everyone, the same lists as the pill and the Matrix', () => {
  // The Matrix fixture (tests/helpers/matrix-fixture.js): open work for ME1 = A1, B2, U2; for the rest = A2, A4, B1, U1.
  // Matrix and the pill count open tasks; the Board shows them in its three live columns.
  const live = () => $$('.kb-col .kb-card .kb-task').map((e) => e.textContent).sort();

  it.each([
    ['mine', ['Alpha one', 'Beta two', 'Unsorted two']],
    ['team', ['Alpha four', 'Alpha two', 'Beta one', 'Unsorted one']],
    ['everyone', ['Alpha four', 'Alpha one', 'Alpha two', 'Beta one', 'Beta two', 'Unsorted one', 'Unsorted two']],
  ])('scope %s', (scope, expected) => {
    setup({ url: `/work/board?scope=${scope}`, tasks: MATRIX_TASKS, closedOpen: false });
    mount();
    expect(live()).toEqual(expected);
    const pill = document.getElementById('work-scope');
    const n = within(pill).getByRole('tab', { name: new RegExp('^' + scope, 'i') }).querySelector('b').textContent;
    expect(Number(n)).toBe(expected.length);                           // the pill, Today and the Board agree
    expect(within(pill).getAllByRole('tab').find((b) => b.getAttribute('aria-selected') === 'true').textContent).toMatch(new RegExp('^' + scope, 'i'));
  });

  it('closed work follows the scope in the rail too (Mine = A3 only; the dropped one is not mine)', () => {
    setup({ url: '/work/board?scope=mine', tasks: MATRIX_TASKS, closedOpen: false });
    mount();
    expect($('.kb-rail-n').textContent).toBe('✓ 1 closed');
    cleanup();
    setup({ url: '/work/board?scope=team', tasks: MATRIX_TASKS, closedOpen: false });
    mount();
    expect($('.kb-rail-n').textContent).toBe('✓ 1 closed');
  });

  it('switching scope on the pill rewrites ?scope= and keeps the filters', () => {
    setup({ url: '/work/board?pr=P1', tasks: MATRIX_TASKS, closedOpen: false });
    mount();
    fireEvent.click(within(document.getElementById('work-scope')).getByRole('tab', { name: /^Team/ }));
    expect(currentParams().get('scope')).toBe('team');
    expect(currentParams().getAll('pr')).toEqual(['P1']);
    expect(live()).toEqual(['Alpha four']);                            // team + P1
  });

  it('a user with no person code and scope Mine sees an explanation and everyone, not a crash', () => {
    setup({ url: '/work/board?scope=mine', tasks: MATRIX_TASKS, closedOpen: false, seedExtra: { access: { person_code: null, can_write: true } } });
    mount();
    expect($('.mx-empty').textContent).toMatch(/not linked to a person yet, so Mine is not available/);
    expect(live()).toHaveLength(7);
  });
});

describe('drag and drop: optimistic, written once, rolled back when the update is rejected', () => {
  const dt = () => ({ dataTransfer: { effectAllowed: '', dropEffect: '', setData: () => {}, getData: () => '' } });
  const dragTo = (title, target) => {
    const c = card(title);
    fireEvent.dragStart(c, dt());
    fireEvent.dragOver(target, dt());
    fireEvent.drop(target, dt());
    fireEvent.dragEnd(c, dt());
  };
  const patches = (f) => f.writes().filter((w) => w.method === 'PATCH');

  it('moves the card at once, then PATCHes entities with the raw status, once', async () => {
    const g = gate();
    const f = setup({ handler: async (url, init) => { if (init.method === 'PATCH') await g.p; } });
    mount();
    dragTo('Alpha', col('In Progress'));
    expect(task('n1').status).toBe('In Progress');                        // optimistic: the request has not resolved
    expect(colTitles('In Progress')).toContain('Alpha');
    expect(colTitles('Pending')).not.toContain('Alpha');
    expect(getStatus()).toMatchObject({ kind: 'syncing', msg: 'Updating status…' });
    g.release();
    await waitFor(() => expect(getStatus()).toMatchObject({ kind: 'online', msg: 'Moved to In Progress' }));
    expect(patches(f)).toHaveLength(1);
    expect(patches(f)[0].url).toContain('/rest/v1/entities?id=eq.n1');
    expect(patches(f)[0].body).toMatchObject({ status: 'in_progress', updated_by: 'Me Myself' });
    expect(task('n1').v3Status).toBe('in_progress');
    // the audit event says where it came from
    await waitFor(() => expect(f.writes().some((w) => w.method === 'POST' && w.url.includes('entity_events') && w.body?.notes === 'Kanban drag-drop')).toBe(true));
  });

  it('puts the card back and says so when the write is rejected', async () => {
    const f = setup({ handler: async (url, init) => (init.method === 'PATCH' ? failResponse('nope') : undefined) });
    mount();
    dragTo('Alpha', col('In Progress'));
    expect(task('n1').status).toBe('In Progress');
    await waitFor(() => expect(getStatus().kind).toBe('error'));
    expect(getStatus().msg).toMatch(/^Update failed: .*nope/);
    expect(task('n1').status).toBe('Pending');
    expect(colTitles('Pending')).toContain('Alpha');
    expect(colTitles('In Progress')).not.toContain('Alpha');
    expect(patches(f)).toHaveLength(1);
  });

  it('dropping on the same column writes nothing', () => {
    const f = setup();
    mount();
    dragTo('Alpha', col('Pending'));
    expect(f.writes()).toHaveLength(0);
    expect(task('n1').status).toBe('Pending');
  });

  it('dropping on the folded rail\'s Completed / Dropped buttons writes that status', async () => {
    const f = setup({ closedOpen: false });
    mount();
    const btn = $$('.kb-rail-drop button').find((b) => b.dataset.status === 'Completed');
    expect($$('.kb-rail-drop button').map((b) => b.textContent)).toEqual(['Completed', 'Dropped']);
    dragTo('Charlie', btn);
    await waitFor(() => expect(patches(f)).toHaveLength(1));
    expect(patches(f)[0].body.status).toBe('completed');
    expect(task('n3').status).toBe('Completed');
    expect($('.kb-rail-n').textContent).toBe('✓ 3 closed');                // the rail count moves visibly
    expect(history.filter((h) => h.href.startsWith('/work/tasks'))).toEqual([]);   // a drop on the rail's button does not also open the rail's click
  });

  it('a card moved out of a workstream group rolls the parent status up (kbDrop did)', async () => {
    const f = setup({
      tasks: [T({ id: 'k1', task: 'Kid', status: 'Pending' })],
      seedExtra: { workstreams: [{ id: 'w1', task: 'WS', status: 'Pending', v3Status: 'pending' }], entityLinks: [{ parentId: 'w1', childId: 'k1' }] },
    });
    mount();
    dragTo('Kid', col('In Progress'));
    await waitFor(() => expect(patches(f)).toHaveLength(2));
    expect(patches(f).map((p) => [p.url.split('?id=eq.')[1], p.body.status])).toEqual([['k1', 'in_progress'], ['w1', 'in_progress']]);
    expect(store.getState().workstreams[0].status).toBe('In Progress');
  });

  it('body.kb-dragging is on while a card is in flight (it reveals the rail\'s drop buttons) and off after', () => {
    setup({ closedOpen: false });
    mount();
    fireEvent.dragStart(card('Alpha'), dt());
    expect(document.body.classList.contains('kb-dragging')).toBe(true);
    fireEvent.dragEnd(card('Alpha'), dt());
    expect(document.body.classList.contains('kb-dragging')).toBe(false);
  });

  it('the column under the card lights up (drag-over) and clears when it leaves', () => {
    setup();
    mount();
    fireEvent.dragStart(card('Alpha'), dt());
    fireEvent.dragOver(col('On Hold'), dt());
    expect(col('On Hold').classList.contains('drag-over')).toBe(true);
    fireEvent.dragLeave(col('On Hold'));
    expect(col('On Hold').classList.contains('drag-over')).toBe(false);
  });
});

describe('a view-only user cannot write', () => {
  const viewer = { access: { person_code: ME, can_write: false, role: 'viewer' } };
  const dt = () => ({ dataTransfer: { effectAllowed: '', dropEffect: '', setData: () => {}, getData: () => '' } });

  it('cards are not draggable', () => {
    setup({ seedExtra: viewer });
    mount();
    expect($$('.kb-card').every((c) => c.getAttribute('draggable') === 'false')).toBe(true);
  });

  it('a drop that gets through anyway shows the view-only sentence and makes no request', async () => {
    const f = setup({ seedExtra: viewer });
    mount();
    fireEvent.dragStart(card('Alpha'), dt());
    fireEvent.drop(col('In Progress'), dt());
    await waitFor(() => expect(getStatus().kind).toBe('error'));
    expect(getStatus().msg).toContain(READ_ONLY);
    expect(f.fn).not.toHaveBeenCalled();                                  // not a single fetch
    expect(task('n1').status).toBe('Pending');
  });

  it('an editor\'s cards are draggable', () => {
    setup();
    mount();
    expect($$('.kb-card').every((c) => c.getAttribute('draggable') === 'true')).toBe(true);
  });
});
