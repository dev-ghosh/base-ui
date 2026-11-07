// The Matrix surface: the grid (registry x companies, status split, risk line), KPI row, filters as
// search params, and the drill slide-over (cells, tabs, pivot axis, writes), all on the hand-counted
// fixture in tests/helpers/matrix-fixture.js. Expected numbers are derived by hand from the old
// rie-dashboard2/js/matrix.js (see tests/matrix-model.test.mjs for the working).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, within, act } from '@testing-library/react';

process.env.NEXT_PUBLIC_SB_URL = 'https://example.supabase.co';
process.env.NEXT_PUBLIC_SB_KEY = 'anon-key-123';

vi.mock('next/navigation', async () => (await import('./helpers/fake-router.js')).navigationMock);
vi.mock('next/link', async () => (await import('./helpers/fake-router.js')).linkMock);

import MatrixRoute from '@/app/(app)/work/matrix/page.jsx';
import WorkLayout from '@/app/(app)/work/layout.jsx';
import { TaskFormProvider } from '@/features/tasks/TaskFormProvider.jsx';
import { store } from '@/store/store.js';
import { registryStore } from '@/lib/registry.js';
import { getStatus } from '@/lib/status.js';
import { seed, stubFetch, okResponse, failResponse } from './helpers/fixtures.js';
import { NOW, REGISTRY, TASKS } from './helpers/matrix-fixture.js';
import { history, resetNav, setUrl, currentUrl, currentParams } from './helpers/fake-router.js';

const READ_ONLY = 'You have view-only access to BASE, so this change was not saved.';
const FUNCS = ['Ops', 'Sales', 'Legal'];
const COMPANIES = ['Acme', 'Beta'];

function mount({ layout = false } = {}) {
  return render(layout ? <WorkLayout><MatrixRoute /></WorkLayout> : <MatrixRoute />);
}
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/** The td at (function row, company column) of the grid; company '' = the All column, func '' = the footer. */
function cellAt(func, company) {
  const rows = $$('table.mx-grid tbody tr');
  const tr = func === '' ? $('table.mx-grid tfoot tr') : rows.find((r) => $('.mx-rh-n', r)?.textContent === func);
  const col = company === '' ? COMPANIES.length : COMPANIES.indexOf(company);
  return $$('td', tr)[col];
}
const read = (td) => ({
  cls: td.className.replace('mx-cell', '').trim(),
  n: $('.mx-n', td)?.textContent ?? null,
  risk: $$('.mx-risk span', td).map((s) => s.textContent),
  riskColors: $$('.mx-risk span', td).map((s) => s.style.color),
  bar: $$('.mx-bar i', td).map((i) => i.getAttribute('title')),
  review: !!$('.mx-revdot', td),
  text: td.textContent,
});
const kpis = () => $$('.mx-kpi').map((k) => [$('.mx-kpi-l', k).textContent, $('.mx-kpi-n', k).textContent]);
const panel = () => document.getElementById('mx-panel');
const pTitle = () => document.getElementById('mx-panel-title')?.textContent;
const tabBtn = (name) => within($('.mx-tabs', panel())).getByRole('button', { name });
const waitPanelGone = () => waitFor(() => expect(panel()).toBeNull());

function setup({ url = '/work/matrix', tasks = TASKS, seedExtra = {}, registry = REGISTRY } = {}) {
  seed({ tasks, ...seedExtra });
  registryStore.setState({ rows: registry, error: null });
  resetNav(url);
  localStorage.setItem('rie_work_scope', 'everyone');      // the default scope for these tests; a ?scope= in the URL wins
  return stubFetch();
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  localStorage.clear();
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); localStorage.clear(); });

describe('the grid', () => {
  it('is task_functions x companies: functions in registry order, a retired one is no row, companies sorted', () => {
    setup();
    mount();
    expect($$('table.mx-grid thead th').map((h) => h.textContent)).toEqual(['Function', ...COMPANIES, 'All']);
    expect($$('table.mx-grid tbody th .mx-rh-n').map((e) => e.textContent)).toEqual(FUNCS);
    expect($$('table.mx-grid tbody th .mx-rh-d').map((e) => e.textContent)).toEqual(['Keep the lights on', 'Win business', 'Contracts']);
    expect($('table.mx-grid tfoot th').textContent).toBe('All functions');
  });

  it('cell counts, risk lines and status split match the old computation (everyone, Live)', () => {
    setup();
    mount();
    // Acme/Ops: A1 (Pending, P1, overdue, mine) + A2 (In Progress). Acme/Sales: A4 (On Hold, P1, overdue, not mine).
    expect(read(cellAt('Ops', 'Acme'))).toMatchObject({ cls: '', n: '2', risk: ['1 od', '1 P1'], bar: ['Pending: 1', 'In Progress: 1'], review: false });
    expect(read(cellAt('Sales', 'Acme'))).toMatchObject({ n: '1', risk: ['1 od', '1 P1'], bar: ['On Hold: 1'] });
    expect(read(cellAt('Ops', 'Beta'))).toMatchObject({ n: '1', bar: ['Pending: 1'] });
    expect(read(cellAt('Ops', 'Beta')).risk).toEqual([]);
    expect(read(cellAt('Legal', 'Beta'))).toMatchObject({ n: '1', review: true });
    // not applicable is not zero
    expect(read(cellAt('Legal', 'Acme'))).toMatchObject({ cls: 'inactive', n: null, text: '—' });
    expect(cellAt('Legal', 'Acme').getAttribute('title')).toBe('Not an active function for Acme');
    expect(read(cellAt('Sales', 'Beta')).cls).toBe('inactive');
  });

  it('a cell with nothing is a zero, and it is not a button', () => {
    setup({ url: '/work/matrix?p=P1' });
    mount();
    const zero = cellAt('Ops', 'Beta');
    expect(zero.className).toContain('zero');
    expect($('.mx-n', zero)).toBeNull();
    expect(zero.textContent).toBe('0');
    expect($('button', zero)).toBeNull();
  });

  it('totals: row, column, grand', () => {
    setup();
    mount();
    expect(read(cellAt('Ops', '')).n).toBe('3');
    expect(read(cellAt('Sales', '')).n).toBe('1');
    expect(read(cellAt('Legal', '')).n).toBe('1');
    expect(read(cellAt('', 'Acme'))).toMatchObject({ n: '3', risk: ['2 od', '2 P1'] });
    expect(read(cellAt('', 'Beta')).n).toBe('2');
    expect(read(cellAt('', '')).n).toBe('5');
    expect(cellAt('Ops', '').className).toContain('mx-total');
  });

  it('colour rule: red only where a task is P1, overdue and mine; overdue alone is amber; counts are neutral ink', () => {
    setup();
    mount();
    // A1 is mine -> "1 od" is red. A4 is P1 + overdue but not mine -> amber. The P1 count is a muted count.
    expect(read(cellAt('Ops', 'Acme')).riskColors).toEqual(['var(--hot)', 'var(--txd)']);
    expect(read(cellAt('Sales', 'Acme')).riskColors).toEqual(['var(--warm)', 'var(--txd)']);
    expect($('.mx-n', cellAt('Ops', 'Acme')).style.color).toBe('var(--tx)');
    // For someone else the same cell is amber
    cleanup();
    setup({ seedExtra: { access: { person_code: 'OT1', can_write: true } } });
    mount();
    expect(read(cellAt('Ops', 'Acme')).riskColors[0]).toBe('var(--warm)');
    expect(read(cellAt('Sales', 'Acme')).riskColors[0]).toBe('var(--hot)');
  });

  it('every cell button names its numbers for a screen reader', () => {
    setup();
    mount();
    expect($('button', cellAt('Ops', 'Acme')).getAttribute('aria-label')).toBe('Acme, Ops: 2 tasks, 1 overdue, 1 P1');
    expect($('button', cellAt('Ops', '')).getAttribute('aria-label')).toBe('Total 3 tasks');
  });

  it('a registry row added as data is a new row; deactivating a function greys the cell', () => {
    setup({ registry: [...REGISTRY, { company: 'Beta', func: 'Zeta', active: true, sort_order: 0, definition: 'New' }] });
    mount();
    expect($$('table.mx-grid tbody th .mx-rh-n').map((e) => e.textContent)).toEqual(['Zeta', ...FUNCS]);
    expect(read(cellAt('Zeta', 'Acme')).cls).toBe('inactive');
    expect(read(cellAt('Zeta', 'Beta')).cls).toBe('zero');
  });
});

describe('KPI row', () => {
  it('Everyone: eight tiles in neutral ink', () => {
    setup();
    mount();
    expect(kpis()).toEqual([
      ['In scope', '7'], ['Due this week', '2'], ['Overdue', '3'], ['No due date', '2'],
      ['P1', '2'], ['Unowned', '1'], ['Needs review', '1'], ['Untagged', '2'],
    ]);
    $$('.mx-kpi-n').forEach((n) => expect(n.style.color).toBe('var(--tx)'));
  });

  it('Mine: my week only (P1 and Unowned are team facts)', () => {
    setup({ url: '/work/matrix?scope=mine' });
    mount();
    expect(kpis()).toEqual([['In scope', '3'], ['Due this week', '1'], ['Overdue', '1'], ['No due date', '1'], ['Needs review', '1'], ['Untagged', '1']]);
  });

  it('Team: P1 and Unowned appear, Needs review hides at zero', () => {
    setup({ url: '/work/matrix?scope=team' });
    mount();
    expect(kpis()).toEqual([['In scope', '4'], ['Due this week', '1'], ['Overdue', '2'], ['No due date', '1'], ['P1', '1'], ['Unowned', '1'], ['Untagged', '1']]);
  });

  it('a zero reads in the muted ink; Needs review and Untagged are buttons, the rest are not', () => {
    setup({ url: '/work/matrix?p=P3' });
    mount();
    const tiles = $$('.mx-kpi');
    expect(tiles.filter((t) => t.classList.contains('clickable'))).toEqual([]);   // no review / untagged under P3 live
    expect($('.mx-kpi-n', tiles[0]).style.color).toBe('var(--txd)');
    cleanup();
    setup();
    mount();
    const clickable = $$('.mx-kpi.clickable');
    expect(clickable.map((t) => t.getAttribute('role'))).toEqual(['button', 'button']);
    expect(clickable.map((t) => $('.mx-kpi-l', t).textContent)).toEqual(['Needs review', 'Untagged']);
  });
});

describe('filters are search params', () => {
  it('status chips carry counts that ignore the status selection, and the legend lists all five', () => {
    setup();
    mount();
    const chips = $$('.mx-chip').map((c) => [$('.mx-chip-l', c).textContent, $('.mx-chip-n', c).textContent, c.getAttribute('aria-checked')]);
    expect(chips).toEqual([['Pending', '4', 'true'], ['In Progress', '2', 'true'], ['On Hold', '1', 'true'], ['Completed', '1', 'false'], ['Dropped', '1', 'false']]);
    expect($$('.mx-legend span').map((s) => s.textContent)).toEqual(['Pending', 'In Progress', 'On Hold', 'Completed', 'Dropped']);
    expect($$('.mx-seg button', $('.mx-fbar')).map((b) => [b.textContent, b.classList.contains('on')])).toEqual([['Live', true], ['All', false], ['Closed', false]]);
  });

  it('toggling a chip writes s=, and the grid follows', () => {
    setup();
    mount();
    fireEvent.click(screen.getByRole('switch', { name: /Completed/ }));
    expect(history.at(-1)).toEqual({ kind: 'replace', href: '/work/matrix?s=Pending%7CIn+Progress%7COn+Hold%7CCompleted' });
    expect(read(cellAt('Ops', 'Acme')).n).toBe('3');           // A3 joins
    expect(screen.getByRole('switch', { name: /Completed/ }).getAttribute('aria-checked')).toBe('true');
    expect($$('.mx-seg button', $('.mx-fbar')).some((b) => b.classList.contains('on'))).toBe(false);   // no preset lit
  });

  it('emptying the selection snaps back to Live', () => {
    setup({ url: '/work/matrix?s=Pending' });
    mount();
    fireEvent.click(screen.getByRole('switch', { name: /Pending/ }));
    expect(currentParams().get('s')).toBeNull();
    expect($$('.mx-chip').filter((c) => c.classList.contains('on')).map((c) => $('.mx-chip-l', c).textContent)).toEqual(['Pending', 'In Progress', 'On Hold']);
  });

  it('presets: Closed and All', () => {
    setup();
    mount();
    fireEvent.click(within($('.mx-fbar')).getByRole('button', { name: 'Closed' }));
    expect(currentParams().get('s')).toBe('Completed|Dropped');
    expect(read(cellAt('Ops', 'Acme')).n).toBe('1');          // A3
    expect(read(cellAt('Sales', 'Acme')).n).toBe('1');        // D1
    fireEvent.click(within($('.mx-fbar')).getByRole('button', { name: 'All' }));
    expect(currentParams().get('s')).toBe('Pending|In Progress|On Hold|Completed|Dropped');
    expect(read(cellAt('Ops', 'Acme')).n).toBe('3');
    fireEvent.click(within($('.mx-fbar')).getByRole('button', { name: 'Live' }));
    expect(currentParams().get('s')).toBeNull();
  });

  it('priority narrows the grid', () => {
    setup();
    mount();
    fireEvent.change(screen.getByLabelText('Priority'), { target: { value: 'P1' } });
    expect(currentParams().get('p')).toBe('P1');
    expect(read(cellAt('Ops', 'Acme')).n).toBe('1');
    expect(read(cellAt('Sales', 'Acme')).n).toBe('1');
    expect(read(cellAt('Ops', 'Beta')).cls).toBe('zero');
    expect(kpis()[0]).toEqual(['In scope', '2']);
    expect($$('option', screen.getByLabelText('Priority')).map((o) => o.textContent)).toEqual(['Any', 'P1', 'P2', 'P3']);
  });

  it('owner narrows the grid; the list is the people plus the names on tasks; it is hidden under Mine', () => {
    setup();
    mount();
    const owner = screen.getByLabelText('Owner');
    expect($$('option', owner).map((o) => o.textContent)).toEqual(['Anyone', 'Me Myself', 'Olive Other', 'Pat Third']);
    fireEvent.change(owner, { target: { value: 'Pat Third' } });
    expect(currentParams().get('o')).toBe('Pat Third');
    expect(kpis()[0]).toEqual(['In scope', '1']);
    cleanup();
    setup({ url: '/work/matrix?scope=mine&o=Pat+Third' });
    mount();
    expect(screen.queryByLabelText('Owner')).toBeNull();
    expect(kpis()[0]).toEqual(['In scope', '3']);       // the owner param is ignored under Mine
  });

  it('overdue only and needs review are checkboxes; Needs review shows only when something needs review', () => {
    setup();
    mount();
    fireEvent.click(screen.getByLabelText('Overdue only'));
    expect(currentParams().get('od')).toBe('1');
    expect(kpis()[0]).toEqual(['In scope', '3']);
    fireEvent.click(screen.getByLabelText('Overdue only'));
    fireEvent.click(screen.getByLabelText('Needs review'));
    expect(currentParams().get('rv')).toBe('1');
    expect(kpis()[0]).toEqual(['In scope', '1']);
    cleanup();
    setup({ tasks: TASKS.map((t) => ({ ...t, funcReview: false })) });
    mount();
    expect(screen.queryByLabelText('Needs review')).toBeNull();
  });

  it('search is debounced into q=, matches the counterparty, and the box keeps what was typed', async () => {
    setup();
    mount();
    const box = screen.getByLabelText('Search');
    fireEvent.change(box, { target: { value: 'zed' } });
    expect(currentParams().get('q')).toBeNull();         // not yet: 150 ms debounce
    await waitFor(() => expect(currentParams().get('q')).toBe('zed'));
    expect(kpis()[0]).toEqual(['In scope', '1']);
    expect(box.value).toBe('zed');
  });

  it('Reset clears every filter, keeps the scope, and does not close an open drill', async () => {
    setup({ url: '/work/matrix?scope=team&p=P1&o=Olive+Other&q=al&od=1&s=Pending&c=Acme&f=Ops&t=list' });
    mount();
    expect(panel()).toBeTruthy();
    fireEvent.click(within($('.mx-fbar')).getByRole('button', { name: 'Reset' }));
    expect(currentUrl()).toBe('/work/matrix?scope=team&c=Acme&f=Ops&t=list');
    await waitFor(() => expect(screen.getByLabelText('Search').value).toBe(''));
    expect(panel()).toBeTruthy();
  });

  it('the filters are read from the URL on load', () => {
    setup({ url: '/work/matrix?p=P1&s=Pending%7COn+Hold' });
    mount();
    expect(screen.getByLabelText('Priority').value).toBe('P1');
    expect(read(cellAt('Ops', 'Acme')).n).toBe('1');
    expect(read(cellAt('Sales', 'Acme')).n).toBe('1');
  });

  it('unknown and stale values in the URL are ignored, never an error', () => {
    setup({ url: '/work/matrix?s=Bogus&t=nope&pv=nope&c=Vanished&f=Gone&zzz=1' });
    mount();
    expect(panel()).toBeNull();
    expect(kpis()[0]).toEqual(['In scope', '7']);
    expect($('.mx-hard-error')).toBeNull();
  });
});

describe('empty and error states', () => {
  it('nothing matches: says so, with a Reset link', () => {
    setup({ url: '/work/matrix?q=nothing-matches-this' });
    mount();
    expect($('.mx-empty').textContent).toBe('No tasks match these filters. Reset');
    fireEvent.click(within($('.mx-empty')).getByText('Reset'));
    expect(currentParams().get('q')).toBeNull();
  });

  it('matches exist but none carry a company and function: names that cause', () => {
    setup({ url: '/work/matrix?q=Unsorted' });
    mount();
    expect($('.mx-empty').textContent).toBe('2 tasks match these filters, but none carry a company and function yet, so no cell can hold them. Open the Untagged tile above to classify them.');
  });

  it('the registry could not be read: a hard error that names the failure', () => {
    setup();
    registryStore.setState({ rows: [], error: 'permission denied' });
    mount();
    expect($('.mx-hard-error strong').textContent).toBe('task_functions unavailable, run the v2 migration');
    expect($('.mx-hard-error').textContent).toContain('permission denied');
    expect($('table.mx-grid')).toBeNull();
  });

  it('an empty registry is the same hard error', async () => {
    setup();
    registryStore.setState({ rows: [], error: null });
    stubFetch(async (url) => (url.includes('/task_functions') ? okResponse([]) : undefined));
    mount();
    await waitFor(() => expect($('.mx-hard-error')).toBeTruthy());
  });

  it('while the registry loads the grid is simply absent, not an error', async () => {
    setup();
    registryStore.setState({ rows: [], error: null });
    let release;
    const gate = new Promise((r) => { release = r; });
    stubFetch(async (url) => { if (url.includes('/task_functions')) { await gate; return okResponse(REGISTRY); } });
    mount();
    expect($('.mx-hard-error')).toBeNull();
    expect($('table.mx-grid')).toBeNull();
    release();
    await waitFor(() => expect($('table.mx-grid')).toBeTruthy());
  });

  it('Mine for a sign-in with no owner code falls back to Everyone with an explanation, no crash', () => {
    setup({ url: '/work/matrix?scope=mine', seedExtra: { access: { can_write: true } } });
    mount();
    expect($('.mx-empty')?.textContent ?? document.body.textContent).toContain('Your sign-in is not linked to a person yet');
    expect(document.body.textContent).toContain('Mine is not available');
    expect(kpis()[0]).toEqual(['In scope', '7']);
    expect($('table.mx-grid')).toBeTruthy();
  });
});

describe('the same scope drives the grid', () => {
  it('Mine / Team / Everyone change what the grid counts', () => {
    setup({ url: '/work/matrix?scope=mine' });
    mount({ layout: true });
    expect(read(cellAt('Ops', 'Acme')).n).toBe('1');                   // A1 only
    expect(read(cellAt('Sales', 'Acme')).cls).toBe('zero');
    fireEvent.click(screen.getByRole('tab', { name: /^Team/ }));
    expect(currentParams().get('scope')).toBe('team');
    expect(read(cellAt('Ops', 'Acme')).n).toBe('1');                   // A2 only
    expect(read(cellAt('Sales', 'Acme')).n).toBe('1');                 // A4
    fireEvent.click(screen.getByRole('tab', { name: /^Everyone/ }));
    expect(read(cellAt('Ops', 'Acme')).n).toBe('2');
  });
});

describe('hover tooltip', () => {
  it('shows the status split and overdue for the cell, and hides on leave', () => {
    setup();
    mount();
    const btn = $('button', cellAt('Ops', 'Acme'));
    fireEvent.mouseMove(btn, { clientX: 40, clientY: 50 });
    const tip = document.getElementById('mx-tip');
    expect(tip.style.display).toBe('block');
    expect($('.mx-tip-t', tip).textContent).toBe('Acme · Ops');
    expect($$('div', tip).filter((d) => $('i', d)).map((d) => d.textContent)).toEqual(['Pending1', 'In Progress1', 'On Hold0']);
    expect(tip.textContent).toContain('Overdue1');
    fireEvent.mouseLeave(btn);
    expect(tip.style.display).toBe('none');
  });

  it('the "Overdue" row keeps the old class (od) whoever owns the tasks, while the grid risk line follows the fire rule', () => {
    setup();
    mount();
    // Acme/Sales: A4 is P1 + overdue but not mine -> the grid risk line is amber...
    expect(read(cellAt('Sales', 'Acme')).riskColors[0]).toBe('var(--warm)');
    // ...the tooltip and the drill are the old markup
    fireEvent.mouseMove($('button', cellAt('Sales', 'Acme')), { clientX: 10, clientY: 10 });
    const od = $$('div', document.getElementById('mx-tip')).find((d) => d.textContent.startsWith('Overdue'));
    expect(od.className).toBe('od');
    expect(od.style.color).toBe('');
  });

  it('is not shown while the drill is open', () => {
    setup({ url: '/work/matrix?c=Acme&f=Ops' });
    mount();
    fireEvent.mouseMove($('button', cellAt('Ops', 'Beta')), { clientX: 10, clientY: 10 });
    const tip = document.getElementById('mx-tip');
    expect(!tip || tip.style.display === 'none').toBe(true);
  });
});

describe('the drill slide-over', () => {
  it('clicking a cell sets c f t and opens the panel with its numbers, definition and board', () => {
    setup();
    mount();
    fireEvent.click($('button', cellAt('Ops', 'Acme')));
    expect(history.at(-1)).toEqual({ kind: 'replace', href: '/work/matrix?c=Acme&f=Ops&t=board' });
    expect(panel().getAttribute('role')).toBe('dialog');
    expect(panel().getAttribute('aria-modal')).toBe('true');
    expect(pTitle()).toBe('Acme · Ops');
    const sub = $$('.mx-ph-sub span', panel()).map((s) => s.textContent);
    expect(sub).toEqual(['3 tasks', '1 overdue', '1 P1', 'all statuses']);
    expect($('.mx-ph-def', panel()).textContent).toBe('Keep the lights on');
    // all five columns, in workflow order, ignoring the Live chips
    expect($$('.mx-kbcol .mx-kbh', panel()).map((h) => h.textContent)).toEqual(['Pending1', 'In Progress1', 'On Hold0', 'Completed1', 'Dropped0']);
    expect($('.mx-ph-note', panel()).textContent).toBe('The grid behind this is filtered to Pending, In Progress, On Hold. This panel shows everything in the cell, so a task you change status on moves column instead of disappearing.');
    expect($$('.mx-card-t', panel()).map((c) => c.textContent).sort()).toEqual(['Alpha one', 'Alpha three', 'Alpha two']);
  });

  it('a company header, a function header, the All header and the totals open the matching scopes', () => {
    setup();
    mount();
    fireEvent.click(within($('table.mx-grid thead')).getByRole('button', { name: 'Acme' }));
    expect(currentUrl()).toBe('/work/matrix?c=Acme&t=board');
    expect(pTitle()).toBe('Acme · All functions');
    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.click(within($('table.mx-grid tbody')).getAllByRole('button', { name: /Sales/ })[0]);
    expect(currentUrl()).toBe('/work/matrix?f=Sales&t=board');
    expect(pTitle()).toBe('All companies · Sales');
    fireEvent.click($('.mx-close', panel()));
    fireEvent.click(within($('table.mx-grid thead')).getByRole('button', { name: 'All' }));
    expect(pTitle()).toBe('All companies · All functions');
  });

  it('a Needs review / Untagged tile opens its kind', () => {
    setup();
    mount();
    fireEvent.click(screen.getByText('Untagged').closest('.mx-kpi'));
    expect(currentUrl()).toBe('/work/matrix?k=untagged&t=board');
    expect(pTitle()).toBe('Untagged tasks');
    expect($$('.mx-card-t', panel()).map((c) => c.textContent).sort()).toEqual(['Unsorted one', 'Unsorted two']);
    fireEvent.click($('.mx-close', panel()));
    fireEvent.keyDown(screen.getByText('Needs review', { selector: '.mx-kpi-l' }).closest('.mx-kpi'), { key: 'Enter' });
    expect(currentParams().get('k')).toBe('review');
    expect(pTitle()).toBe('Needs review');
  });

  it('opens straight from a URL, and the filters survive', () => {
    setup({ url: '/work/matrix?c=Beta&f=Legal&p=P2' });
    mount();
    expect(pTitle()).toBe('Beta · Legal');
    expect($$('.mx-card-t', panel()).map((c) => c.textContent)).toEqual(['Beta two']);
  });

  it('the drill honours the Work scope', () => {
    setup({ url: '/work/matrix?c=Acme&f=Ops&scope=mine' });
    mount();
    expect($$('.mx-card-t', panel()).map((c) => c.textContent).sort()).toEqual(['Alpha one', 'Alpha three']);
  });

  it('Kanban / List / Pivot are search params', () => {
    setup({ url: '/work/matrix?c=Acme&f=Ops&t=board' });
    mount();
    expect(tabBtn('Kanban').classList.contains('on')).toBe(true);
    fireEvent.click(tabBtn('List'));
    expect(currentUrl()).toBe('/work/matrix?c=Acme&f=Ops&t=list');
    expect($('table.mx-list', panel())).toBeTruthy();
    expect(tabBtn('List').classList.contains('on')).toBe(true);
    fireEvent.click(tabBtn('Pivot'));
    expect(currentUrl()).toBe('/work/matrix?c=Acme&f=Ops&t=pivot&pv=assignedTo');
    expect($('table.mx-pivot', panel())).toBeTruthy();
    fireEvent.click(tabBtn('Kanban'));
    expect(currentUrl()).toBe('/work/matrix?c=Acme&f=Ops&t=board');
    expect($('.mx-kb', panel())).toBeTruthy();
  });

  it('the pivot axis is a param: Owner, then Due bucket in bucket order', () => {
    setup({ url: '/work/matrix?c=Acme&f=Ops&t=pivot' });
    mount();
    const rows = () => $$('table.mx-pivot tbody tr', panel()).map((r) => [$('.mx-pv-l', r).textContent, $('.mx-pv-b span', r).textContent]);
    expect($$('table.mx-pivot thead th', panel()).map((h) => h.textContent)).toEqual(['Owner', 'Tasks', 'Status mix', 'Risk']);
    expect(rows()).toEqual([['Me Myself', '2'], ['Olive Other', '1'], ['Pat Third', '1']]);      // a shared task sits under each person
    const axis = within(panel()).getByLabelText('Pivot axis');
    expect($$('option', axis).map((o) => o.textContent)).toEqual(['Owner', 'Priority', 'Due bucket', 'Function', 'Company', 'Counterparty']);
    fireEvent.change(axis, { target: { value: 'dueBucket' } });
    expect(currentUrl()).toBe('/work/matrix?c=Acme&f=Ops&t=pivot&pv=dueBucket');
    expect(rows()).toEqual([['Overdue 30d+', '1'], ['Overdue 8-30d', '1'], ['Due this week', '1']]);
    expect($$('table.mx-pivot thead th', panel())[0].textContent).toBe('Due bucket');
    // bars are relative to the largest group
    expect($$('.mx-pvbar i', panel()).map((i) => i.style.width)).toEqual(['100%', '100%', '100%']);
    fireEvent.change(axis, { target: { value: 'contactOrg' } });
    expect(rows()).toEqual([['— none —', '2'], ['Zed Corp', '1']]);
  });

  it('pivot risk cell keeps the old colours: overdue is crit, P1 is warn, "clear" otherwise', () => {
    setup({ url: '/work/matrix?c=Acme&t=pivot&pv=priority' });
    mount();
    const risk = (label) => {
      const row = $$('table.mx-pivot tbody tr', panel()).find((r) => $('.mx-pv-l', r).textContent === label);
      return $$('span', $('.mx-pv-r', row)).map((x) => [x.className, x.textContent]);
    };
    expect(risk('P1')).toEqual([['crit', '2 overdue'], ['warn', '2 P1']]);
    expect(risk('P2')).toEqual([['good', 'clear']]);
    expect(risk('P3')).toEqual([['good', 'clear']]);
    cleanup();
    setup({ url: '/work/matrix?scope=team&c=Acme&t=pivot&pv=priority' });
    mount();
    expect(risk('P1')).toEqual([['crit', '1 overdue'], ['warn', '1 P1']]);        // A4 is not mine: still crit here (old markup)
  });

  it('the drill ignores the status chips; its header says so only while the chips narrow the grid', () => {
    setup({ url: '/work/matrix?c=Acme&f=Ops&s=Pending%7CIn+Progress%7COn+Hold%7CCompleted%7CDropped' });
    mount();
    expect($('.mx-ph-note', panel())).toBeNull();
    cleanup();
    setup({ url: '/work/matrix?c=Acme&f=Ops&s=Dropped' });
    mount();
    expect($$('.mx-card-t', panel())).toHaveLength(3);
    expect($('.mx-ph-note', panel()).textContent).toContain('filtered to Dropped.');
  });

  it('an empty scope shows a message and stays open', () => {
    setup({ url: '/work/matrix?c=Beta&f=Ops&p=P3' });
    mount();
    expect($('.mx-empty', panel()).textContent).toBe('No tasks in this scope.');
    expect(panel()).toBeTruthy();
  });

  it('closes with the × button, Escape and the scrim, drops c f k t pv, and the panel leaves after its transition', async () => {
    setup({ url: '/work/matrix?scope=everyone&c=Acme&f=Ops&t=pivot&pv=priority&p=P2' });
    mount();
    fireEvent.click($('.mx-close', panel()));
    expect(currentUrl()).toBe('/work/matrix?scope=everyone&p=P2');
    await waitPanelGone();
    expect(document.getElementById('mx-scrim')).toBeNull();

    act(() => setUrl('/work/matrix?c=Acme'));
    await waitFor(() => expect(panel()).toBeTruthy());
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(currentParams().get('c')).toBeNull();
    await waitPanelGone();

    act(() => setUrl('/work/matrix?c=Acme'));
    await waitFor(() => expect(panel()).toBeTruthy());
    fireEvent.click(document.getElementById('mx-scrim'));
    expect(currentParams().get('c')).toBeNull();
    await waitPanelGone();
  });

  it('focus moves to the title on open and back to the cell that opened it on close', async () => {
    setup();
    mount();
    const btn = $('button', cellAt('Ops', 'Acme'));
    btn.focus();
    fireEvent.click(btn);
    await waitFor(() => expect(document.activeElement).toBe(document.getElementById('mx-panel-title')));
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(document.activeElement).toBe(btn));
  });

  it('a task opens at /work/tasks/[id]: the card\'s Open button and the list title', () => {
    setup({ url: '/work/matrix?c=Acme&f=Ops' });
    mount();
    const card = $$('.mx-card', panel()).find((c) => $('.mx-card-t', c).textContent === 'Alpha one');
    fireEvent.click(card);                                                           // expands
    expect($('.mx-card-x', card)).toBeTruthy();
    fireEvent.click(within(card).getByRole('button', { name: 'Open' }));
    expect(history.at(-1)).toEqual({ kind: 'push', href: '/work/tasks/A1' });
    act(() => setUrl('/work/matrix?c=Acme&f=Ops'));                // (the fake router really navigated; come back)
    fireEvent.click(tabBtn('List'));
    fireEvent.click(within(panel()).getByRole('button', { name: 'Alpha two' }));
    expect(history.at(-1)).toEqual({ kind: 'push', href: '/work/tasks/A2' });
  });
});

describe('kanban cards', () => {
  it('chips: priority, overdue, id, the unscoped axis, owner or "unowned", review', () => {
    setup({ url: '/work/matrix?k=review' });
    mount();
    const card = $('.mx-card', panel());
    expect($$('.mx-card-m > *', card).map((c) => c.textContent)).toEqual(['P2', '#B2', 'Beta', 'Legal', 'Me Myself', 'review']);
    cleanup();
    setup({ url: '/work/matrix?c=Beta&f=Ops' });
    mount();
    expect($$('.mx-card-m > *', $('.mx-card', panel())).map((c) => c.textContent)).toEqual(['P2', '#B1', 'unowned']);
  });

  it('badges keep the old colours: P1 and overdue are crit whoever owns the task, other priorities warn', () => {
    setup({ url: '/work/matrix?c=Acme&f=' });
    mount();
    const badges = (title) => $$('.mx-badge', $$('.mx-card', panel()).find((c) => $('.mx-card-t', c).textContent === title)).map((b) => [b.textContent, b.className.replace('mx-badge ', '')]);
    expect(badges('Alpha one')).toEqual([['P1', 'crit'], ['overdue', 'crit']]);       // P1 + overdue + mine
    expect(badges('Alpha four')).toEqual([['P1', 'crit'], ['overdue', 'crit']]);      // P1 + overdue, not mine: same as the old markup
    expect(badges('Alpha two')).toEqual([['P2', 'warn']]);
    // header: the overdue count is crit
    expect($('.mx-ph-sub span:nth-child(2)', panel()).className).toBe('crit');
  });

  it('the header overdue count is crit even when none of the overdue tasks is a P1 of mine (old markup)', () => {
    setup({ url: '/work/matrix?c=Acme&f=Sales' });
    mount();
    expect($$('.mx-ph-sub span', panel()).map((s) => [s.textContent, s.className])).toEqual([['2 tasks', ''], ['1 overdue', 'crit'], ['1 P1', 'warn'], ['all statuses', 'muted']]);
  });

  it('a card expands to its detail, and a flagged one shows the review note', () => {
    setup({ url: '/work/matrix?k=review' });
    mount();
    const card = $('.mx-card', panel());
    fireEvent.click(card);
    const x = $('.mx-card-x', card);
    expect(x.textContent).toContain('Next follow-up');
    expect($('.mx-revnote', x).textContent).toContain('Thin evidence');
    fireEvent.click($('.mx-card-t', card));
    expect($('.mx-card-x', card)).toBeNull();
  });

  it('more than 60 in a column fold into "+ N more — open as List"', () => {
    const many = Array.from({ length: 65 }, (_, i) => ({ ...TASKS[0], id: 'M' + i, task: 'Many ' + i, ownerCode: 'OT1', assignedTo: 'Olive Other' }));
    setup({ tasks: many, url: '/work/matrix?c=Acme&f=Ops' });
    mount();
    const pending = $$('.mx-kbcol', panel())[0];
    expect($$('.mx-card', pending)).toHaveLength(60);
    const more = $('.mx-more button', pending);
    expect(more.textContent).toBe('+ 5 more — open as List');
    fireEvent.click(more);
    expect(currentParams().get('t')).toBe('list');
  });
});

describe('the list tab', () => {
  it('has the old columns, sorts by due with undated last, and the header toggles direction', () => {
    setup({ url: '/work/matrix?c=Acme&t=list' });
    mount();
    expect($$('table.mx-list thead th', panel()).map((h) => h.textContent)).toEqual(['#', 'Company', 'Function', 'Task', 'Status', 'P', 'Owner', 'Due ↑']);
    const titles = () => $$('table.mx-list tbody tr', panel()).map((r) => $('.mx-tt', r).textContent);
    expect(titles()).toEqual(['Alpha three', 'Alpha one', 'Alpha four', 'Alpha two', 'Dropped one']);   // 10-01, 11-01, 11-02, 11-12, none
    fireEvent.click(within(panel()).getByRole('button', { name: /^Due/ }));
    expect(titles()).toEqual(['Alpha two', 'Alpha four', 'Alpha one', 'Alpha three', 'Dropped one']);
    fireEvent.click(within(panel()).getByRole('button', { name: /^Task/ }));
    expect(titles()).toEqual(['Alpha four', 'Alpha one', 'Alpha three', 'Alpha two', 'Dropped one']);
  });

  it('overdue dates are mx-due-od, others mx-due (old classes); counterparty and review note show under the title', () => {
    setup({ url: '/work/matrix?c=Acme&t=list' });
    mount();
    const rowOf = (title) => $$('table.mx-list tbody tr', panel()).find((r) => $('.mx-tt', r).textContent === title);
    expect($('td:last-child', rowOf('Alpha one')).className).toBe('mx-due-od');
    expect($('td:last-child', rowOf('Alpha four')).className).toBe('mx-due-od');     // overdue, not mine: same class as the old markup
    expect($('td:last-child', rowOf('Alpha two')).className).toBe('mx-due');
    expect($('td:last-child', rowOf('Dropped one')).textContent).toBe('—');
    expect($('.mx-sub', rowOf('Alpha two')).textContent).toBe('Zed Corp');
  });

  it('the function select offers only the functions ACTIVE for that row\'s company', () => {
    setup({ url: '/work/matrix?c=Beta&t=list' });
    mount();
    const row = $$('table.mx-list tbody tr', panel()).find((r) => $('.mx-tt', r).textContent === 'Beta two');
    expect($$('select.mx-inline option', $$('td', row)[2]).map((o) => o.textContent)).toEqual(['Ops', 'Legal']);
    cleanup();
    setup({ url: '/work/matrix?k=untagged&t=list' });
    mount();
    const u1 = $$('table.mx-list tbody tr', panel()).find((r) => $('.mx-tt', r).textContent === 'Unsorted one');
    expect($$('select.mx-inline option', $$('td', u1)[2]).map((o) => o.textContent)).toEqual(['-- none --', 'Ops', 'Sales']);
  });
});

describe('writes from the drill (optimistic, rolled back on failure)', () => {
  const task = (id) => store.getState().tasks.find((t) => t.id === id);

  it('dragging a card to another column PATCHes the status, with the Matrix drill audit note', async () => {
    const f = setup({ url: '/work/matrix?c=Acme&f=Ops' });
    mount();
    const card = $$('.mx-card', panel()).find((c) => $('.mx-card-t', c).textContent === 'Alpha one');
    const col = (s) => $$('.mx-kbcol', panel()).find((c) => c.dataset.status === s);
    fireEvent.dragStart(card);
    fireEvent.dragOver(col('On Hold'));
    expect(col('On Hold').classList.contains('drag-over')).toBe(true);
    fireEvent.drop(col('On Hold'));
    expect(task('A1').status).toBe('On Hold');                                  // optimistic
    await waitFor(() => expect(getStatus()).toMatchObject({ kind: 'online', msg: 'Moved to On Hold' }));
    const patch = f.writes().find((w) => w.method === 'PATCH' && w.url.includes('/entities?id=eq.A1'));
    expect(patch.body).toMatchObject({ status: 'on_hold', updated_by: 'Me Myself' });
    await waitFor(() => expect(f.writes().some((w) => w.url.includes('/entity_events') && w.body.notes === 'Matrix drill')).toBe(true));
    expect(task('A1').v3Status).toBe('on_hold');
    // and the card moved column in the panel
    expect($$('.mx-card-t', col('On Hold')).map((c) => c.textContent)).toEqual(['Alpha one']);
  });

  it('dropping on its own column does nothing', () => {
    const f = setup({ url: '/work/matrix?c=Acme&f=Ops' });
    mount();
    const card = $$('.mx-card', panel()).find((c) => $('.mx-card-t', c).textContent === 'Alpha one');
    fireEvent.dragStart(card);
    fireEvent.drop($$('.mx-kbcol', panel()).find((c) => c.dataset.status === 'Pending'));
    expect(f.writes()).toHaveLength(0);
  });

  it('the status select in an expanded card, and a failed write puts the card back with a friendly error', async () => {
    const f = setup({ url: '/work/matrix?c=Acme&f=Ops' });
    f.fn.mockImplementation(async (url, init = {}) => ((init.method || 'GET') === 'PATCH' ? failResponse('violates check constraint "entities_status_check"', 400) : okResponse([])));
    mount();
    const card = $$('.mx-card', panel()).find((c) => $('.mx-card-t', c).textContent === 'Alpha one');
    fireEvent.click(card);
    fireEvent.click($('.mx-card-sel', card));                   // clicking inside the controls does not collapse the card
    expect($('.mx-card-x', card)).toBeTruthy();
    fireEvent.change(within(card).getByLabelText('Status'), { target: { value: 'Completed' } });
    expect(task('A1').status).toBe('Completed');
    await waitFor(() => expect(task('A1').status).toBe('Pending'));
    expect(getStatus()).toMatchObject({ kind: 'error', msg: 'Update failed: Invalid status value' });
  });

  it('picking a function writes func and clears the review flag; Confirm clears just the flag', async () => {
    const f = setup({ url: '/work/matrix?k=review' });
    mount();
    const card = $('.mx-card', panel());
    fireEvent.click(card);
    fireEvent.click(within(card).getByRole('button', { name: 'Confirm' }));
    expect(task('B2').funcReview).toBe(false);
    await waitFor(() => expect(getStatus().msg).toBe('Classification confirmed'));
    expect(f.writes().find((w) => w.url.includes('/entities?id=eq.B2')).body).toMatchObject({ func_review: false, func_review_note: null });
    expect(task('B2').func).toBe('Legal');

    cleanup();
    setup({ url: '/work/matrix?k=untagged&t=list' });
    const g = stubFetch();
    mount();
    const row = $$('table.mx-list tbody tr', panel()).find((r) => $('.mx-tt', r).textContent === 'Unsorted one');
    fireEvent.change($('select.mx-inline', $$('td', row)[2]), { target: { value: 'Sales' } });
    expect(task('U1').func).toBe('Sales');
    await waitFor(() => expect(getStatus().msg).toBe('Function set to Sales'));
    expect(g.writes().find((w) => w.url.includes('/entities?id=eq.U1')).body).toMatchObject({ func: 'Sales', func_review: false, func_review_note: null });
  });

  it('a view-only user is refused before any request and the card goes back', async () => {
    const f = setup({ url: '/work/matrix?c=Acme&f=Ops', seedExtra: { access: { person_code: 'ME1', can_write: false } } });
    mount();
    const card = $$('.mx-card', panel()).find((c) => $('.mx-card-t', c).textContent === 'Alpha one');
    fireEvent.dragStart(card);
    fireEvent.drop($$('.mx-kbcol', panel()).find((c) => c.dataset.status === 'Dropped'));
    await waitFor(() => expect(getStatus().kind).toBe('error'));
    expect(getStatus().msg).toBe('Update failed: ' + READ_ONLY);
    expect(task('A1').status).toBe('Pending');
    expect(f.writes()).toHaveLength(0);
  });

  it('Delete in an expanded card opens the task form confirmation, and sends nothing yet', () => {
    const f = setup({ url: '/work/matrix?c=Acme&f=Ops', seedExtra: { access: { person_code: 'ME1', can_write: true, is_admin: true } } });
    render(<TaskFormProvider><MatrixRoute /></TaskFormProvider>);
    const card = $$('.mx-card', panel()).find((c) => $('.mx-card-t', c).textContent === 'Alpha one');
    fireEvent.click(card);
    fireEvent.click(within(card).getByRole('button', { name: 'Delete' }));
    expect(document.getElementById('mo-del').classList.contains('open')).toBe(true);
    expect(document.getElementById('del-body').textContent).toContain('Alpha one');
    expect(f.writes()).toHaveLength(0);
  });
});

describe('today is an input of the model', () => {
  it('the counts follow the day: the same page after midnight sees the next day', () => {
    setup();
    mount();
    expect(kpis().find(([l]) => l === 'Overdue')[1]).toBe('3');            // 2026-11-10: A1, A4, U1
    vi.setSystemTime(new Date('2026-11-13T12:00:00Z'));                     // A2 (due 11-12) is now overdue too
    fireEvent.mouseMove($('button', cellAt('Ops', 'Acme')), { clientX: 5, clientY: 5 });   // a re-render with no changed data
    expect(kpis().find(([l]) => l === 'Overdue')[1]).toBe('4');
  });
});

describe('the route', () => {
  it('/work/matrix renders the Matrix inside a Suspense boundary (it reads the URL)', () => {
    setup();
    mount();
    expect(document.getElementById('mx-root').classList.contains('mx-wrap')).toBe(true);
  });
});
