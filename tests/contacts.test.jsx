// Contacts: the table and cards with their filters, sort and growing window as search params, bulk select
// and delete, the contact form (add, edit, duplicate dialog, delete), the viewer (modal and full page), Smart
// Search, the Excel export loader, the Claude edge calls, and the view-only user. The real contact-actions /
// rest.js run; only fetch is stubbed, so "no fetch" is a real assertion. Expected values are worked out by
// hand from rie-dashboard2/js/contacts.js.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent, waitFor, act, renderHook } from '@testing-library/react';

process.env.NEXT_PUBLIC_SB_URL = 'https://example.supabase.co';
process.env.NEXT_PUBLIC_SB_KEY = 'anon-key-123';

const route = vi.hoisted(() => ({ params: {}, back: vi.fn() }));
vi.mock('next/navigation', async () => {
  const base = (await import('./helpers/fake-router.js')).navigationMock;
  return {
    ...base,
    useRouter: () => ({ ...base.useRouter(), back: route.back }),
    useParams: () => route.params,
    // the routed segment of the contacts layout's children slot: /contacts/<segment>/...
    useSelectedLayoutSegment: () => base.usePathname().split('/')[2] ?? null,
  };
});
vi.mock('next/link', async () => (await import('./helpers/fake-router.js')).linkMock);

import ContactsLayout from '@/app/(app)/contacts/layout.jsx';
import TablePage from '@/app/(app)/contacts/table/page.jsx';
import ContactsScreen from '@/features/contacts/ContactsScreen.jsx';
import { ContactViewModal, ContactViewPage } from '@/features/contacts/ContactViewRoute.jsx';
import { ContactFormProvider } from '@/features/contacts/ContactFormProvider.jsx';
import { useContactForm } from '@/features/contacts/hooks/useContactForm.js';
import { useContactAi } from '@/features/contacts/hooks/useContactAi.js';
import { useContacts } from '@/features/contacts/hooks/useContacts.js';
import { useBulkSelection } from '@/features/contacts/hooks/useBulkSelection.js';
import SmartSearch from '@/features/search/SmartSearch.jsx';
import { exportToExcel, loadSheetJS, SHEETJS_URL } from '@/lib/export-excel.js';
import { store } from '@/store/store.js';
import { getStatus } from '@/lib/status.js';
import { seed, makeTask, stubFetch, okResponse, failResponse } from './helpers/fixtures.js';
import { resetNav, currentParams, currentUrl, history } from './helpers/fake-router.js';

const READ_ONLY = 'You have view-only access to BASE, so this change was not saved.';
const NOW = new Date('2026-11-10T12:00:00');

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const field = (id) => document.getElementById(id);
const type = (id, value) => fireEvent.change(field(id), { target: { value } });
const names = () => $$('#ctbody tr.clickable td:nth-child(2)').map((e) => e.textContent);
const cardNames = () => $$('#cgrid .ccn').map((e) => e.textContent);
const bodyOf = (calls, method, pathPart) => calls.find((c) => c.method === method && c.url.includes(pathPart))?.body;

let seq = 0;
/** A contact in the store's shape (rowToContact). */
const makeContact = (o = {}) => {
  const n = ++seq;
  return {
    id: o.id ?? n, name: 'Contact ' + n, org: '', designation: '', category: '', priority: '', priorityFull: '', location: '', email: '', phone: '',
    linkedin: '', source: '', poc2Email: '', poc2Phone: '', assignedTo: '', project: '', intro: '', introDate: '', lastMtg: '', lastAgenda: '',
    nextFollowUp: '', nextStep: '', keyInputs: '', actionItem: '', status: '', workStatus: '', remarks: '', remarks2: '', birthday: '',
    interests: '', score: 0, warmthMode: '', createdBy: '', updatedBy: '', createdAt: '', updatedAt: '', tags: [], ...o,
  };
};
const many = (n, o = () => ({})) => Array.from({ length: n }, (_, i) => makeContact({ id: i + 1, name: 'P' + String(i + 1).padStart(3, '0'), ...o(i) }));

const READER = { person_code: 'ME1', can_write: false, is_admin: false };
const ADMIN = { person_code: 'ME1', can_write: true, is_admin: true };
function setup({ url = '/contacts/table', contacts = [], tasks = [], access, handler } = {}) {
  seed({ contacts, tasks, ...(access ? { access } : {}) });
  resetNav(url);
  return stubFetch(handler);
}
const mountTable = () => render(<ContactFormProvider><ContactsScreen view="table" /></ContactFormProvider>);
const mountCards = () => render(<ContactFormProvider><ContactsScreen view="cards" /></ContactFormProvider>);
const mountViewer = (framed = false) => render(<ContactFormProvider>{framed ? <ContactViewPage /> : <ContactViewModal />}</ContactFormProvider>);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  route.params = {};
  route.back.mockClear();
  localStorage.clear();
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); delete window.XLSX; $$('script').forEach((e) => e.remove()); });

/* ── the list ────────────────────────────────────────────────────────────────── */

describe('/contacts/table', () => {
  it('shows one window of pageSize rows, the count, and "N of M"', () => {
    setup({ contacts: many(130) });
    mountTable();
    expect(names().length).toBe(60);
    expect(names()[0]).toBe('P001');
    expect(field('ccount').textContent).toBe('130 contacts');
    expect(field('c-pagination').textContent).toBe('60 of 130Show more');
  });

  it('"Show more" grows the window by one page and writes page= to the URL', async () => {
    setup({ contacts: many(130) });
    mountTable();
    fireEvent.click($('#c-pagination button'));
    expect(currentParams().get('page')).toBe('2');
    await waitFor(() => expect(names().length).toBe(120));
    fireEvent.click($('#c-pagination button'));
    await waitFor(() => expect(names().length).toBe(130));
    expect(field('c-pagination').textContent).toBe('All 130 contacts');
  });

  it('opens on the window in the URL (page=2)', () => {
    setup({ url: '/contacts/table?page=2', contacts: many(130) });
    mountTable();
    expect(names().length).toBe(120);
  });

  it('a short list shows everything and "All N contacts"; an empty one hides the footer', () => {
    setup({ contacts: many(3) });
    mountTable();
    expect(names().length).toBe(3);
    expect(field('c-pagination').textContent).toBe('All 3 contacts');
    cleanup();
    setup({ contacts: [] });
    mountTable();
    expect($('#ctbody td').textContent).toBe('No contacts match');
    expect(field('c-pagination')).toBeNull();
    expect(field('ccount').textContent).toBe('0 contacts');
  });

  it('default order is priority A, B, C, then unset; the header arrows show nothing sorted', () => {
    setup({ contacts: [makeContact({ id: 1, name: 'none' }), makeContact({ id: 2, name: 'cee', priority: 'C' }), makeContact({ id: 3, name: 'ay', priority: 'A' }), makeContact({ id: 4, name: 'bee', priority: 'B' })] });
    mountTable();
    expect(names()).toEqual(['ay', 'bee', 'cee', 'none']);
    expect($$('th .sort-arrow').map((e) => e.textContent)).toEqual(['↕', '↕', '↕', '↕', '↕']);
    expect($$('th.sorted').length).toBe(0);
  });

  it('a column header sorts (sort= / dir=), the same header flips it, and the arrow follows', async () => {
    setup({ contacts: [makeContact({ id: 1, name: 'b' }), makeContact({ id: 2, name: 'c' }), makeContact({ id: 3, name: 'a' })] });
    mountTable();
    const nameTh = () => $$('th').find((t) => t.textContent.startsWith('Name'));
    fireEvent.click(nameTh());
    expect(currentParams().get('sort')).toBe('name');
    expect(currentParams().get('dir')).toBeNull();
    await waitFor(() => expect(names()).toEqual(['a', 'b', 'c']));
    expect(nameTh().className).toBe('sorted');
    expect($('.sort-arrow', nameTh()).textContent).toBe('↑');
    fireEvent.click(nameTh());
    expect(currentParams().get('dir')).toBe('desc');
    await waitFor(() => expect(names()).toEqual(['c', 'b', 'a']));
    expect($('.sort-arrow', nameTh()).textContent).toBe('↓');
  });

  it('search, ABC, category and location are filters that round-trip through the search params', async () => {
    const list = [
      makeContact({ id: 1, name: 'Asha', org: 'Acme', category: 'Investor', location: 'Pune', project: 'Alpha', priority: 'A' }),
      makeContact({ id: 2, name: 'Bo', org: 'Beta', category: 'Media', location: 'Delhi', project: 'Beta', priority: 'B' }),
      makeContact({ id: 3, name: 'Cy', org: 'Acme', category: 'Investor', location: 'Pune', project: 'Alpha' }),
    ];
    setup({ contacts: list });
    mountTable();
    // sidebar options are the distinct values in the data
    expect($$('#f-cat option').map((o) => o.textContent)).toEqual(['All Categories', 'Investor', 'Media']);
    expect($$('#f-loc option').map((o) => o.textContent)).toEqual(['All Locations', 'Delhi', 'Pune']);
    expect($$('#f-proj option').map((o) => o.textContent)).toEqual(['All Projects', 'Alpha', 'Beta']);

    type('f-cat', 'Investor');
    expect(currentParams().get('cat')).toBe('Investor');
    await waitFor(() => expect(names()).toEqual(['Asha', 'Cy']));
    type('f-loc', 'Pune');
    type('f-proj', 'Alpha');
    expect(currentUrl()).toBe('/contacts/table?proj=Alpha&cat=Investor&loc=Pune');
    fireEvent.click($$('.fbb').find((b) => b.textContent === 'A'));
    expect(currentParams().get('prio')).toBe('A');
    await waitFor(() => expect(names()).toEqual(['Asha']));
    expect($$('.fbb').find((b) => b.textContent === 'A').className).toContain('active');
    fireEvent.click($$('.fbb').find((b) => b.textContent === 'A'));          // again: off
    expect(currentParams().get('prio')).toBeNull();

    fireEvent.change(field('csearch'), { target: { value: 'asha' } });
    await waitFor(() => expect(currentParams().get('q')).toBe('asha'));
    await waitFor(() => expect(names()).toEqual(['Asha']));
    expect(field('ccount').textContent).toBe('1 contacts');

    // a fresh mount from that URL shows the same filters
    const url = currentUrl();
    cleanup();
    resetNav(url);
    mountTable();
    expect(field('csearch').value).toBe('asha');
    expect(field('f-cat').value).toBe('Investor');
    expect(field('f-loc').value).toBe('Pune');
    expect(field('f-proj').value).toBe('Alpha');
    expect(names()).toEqual(['Asha']);
  });

  it('a category in the URL that no contact has is ignored (the old select fell back to All)', () => {
    setup({ url: '/contacts/table?cat=Nope&loc=Mars', contacts: [makeContact({ id: 1, name: 'A', category: 'X' })] });
    mountTable();
    expect(names()).toEqual(['A']);
    expect(field('f-cat').value).toBe('');
  });

  it('a filter change starts the window over (page is dropped)', async () => {
    setup({ url: '/contacts/table?page=2', contacts: many(130, (i) => ({ category: i % 2 ? 'odd' : 'even' })) });
    mountTable();
    type('f-cat', 'odd');
    expect(currentParams().get('page')).toBeNull();
    await waitFor(() => expect(names().length).toBe(60));
    expect(field('ccount').textContent).toBe('65 contacts');
  });

  it('a row opens the contact (its own URL); the checkbox does not', () => {
    setup({ contacts: [makeContact({ id: 7, name: 'Row', org: 'Org', category: 'Cat', lastMtg: '2026-11-01', nextStep: 'Call' })] });
    mountTable();
    const tr = $('#ctbody tr');
    expect($$('td', tr).map((t) => t.textContent)).toEqual(['', 'Row', 'Org', 'Cat', '1 Nov', 'Call']);
    fireEvent.click($('input[type=checkbox]', tr));
    expect(history.length).toBe(0);
    fireEvent.click($$('td', tr)[1]);
    expect(history.at(-1)).toEqual({ kind: 'push', href: '/contacts/people/7' });
  });

  it('empty cells show a dash', () => {
    setup({ contacts: [makeContact({ id: 1, name: '' })] });
    mountTable();
    expect($$('#ctbody tr td').map((t) => t.textContent)).toEqual(['', '—', '—', '—', '—', '—']);
  });

  it('the Cards button goes to /contacts/cards and carries the filters', () => {
    setup({ url: '/contacts/table?cat=Investor&sort=name', contacts: [makeContact({ id: 1, category: 'Investor' })] });
    mountTable();
    expect(field('vt-table').className).toBe('vt-btn active');
    fireEvent.click(field('vt-card'));
    expect(history.at(-1).href).toBe('/contacts/cards?cat=Investor&sort=name');
  });

  it('the filter drawer opens and closes (component state)', () => {
    setup({ contacts: [] });
    mountTable();
    expect(field('contacts-sb').className).toBe('sb');
    fireEvent.click($('.filter-toggle'));
    expect(field('contacts-sb').className).toBe('sb open');
    expect(field('sb-overlay').className).toBe('sb-overlay open');
    fireEvent.click(field('sb-overlay'));
    expect(field('contacts-sb').className).toBe('sb');
  });

  it('useContacts: a window of pageSize rows and the total', () => {
    setup({ url: '/contacts/table?page=1', contacts: many(70) });
    const { result } = renderHook(() => useContacts());
    expect(result.current.contacts.length).toBe(60);
    expect([result.current.page, result.current.pageSize, result.current.total]).toEqual([1, 60, 70]);
  });
});

/* ── cards and tags ──────────────────────────────────────────────────────────── */

describe('/contacts/cards', () => {
  it('a card shows name, designation · organisation, the first email, location and next step', () => {
    setup({ url: '/contacts/cards', contacts: [makeContact({ id: 1, name: 'Dee', designation: 'CEO', org: 'Orbit', email: 'a@x.test, b@x.test', location: 'Pune', nextStep: 'Call', nextFollowUp: '2026-12-01', lastMtg: '2026-11-01' })] });
    mountCards();
    const card = $('.ccd');
    expect($('.ccn', card).textContent).toBe('Dee');
    expect($('.cco', card).textContent).toBe('CEO · Orbit');
    expect($('.ccf', card).textContent).toBe('✉ a@x.test' + 'Pune');
    expect($('.ccns', card).textContent).toBe('→ Call');
    fireEvent.click(card);
    expect(history.at(-1).href).toBe('/contacts/people/1');
  });

  it('a tag chip filters by that tag (tg=) without opening the contact; the bar removes it', async () => {
    setup({ url: '/contacts/cards', contacts: [makeContact({ id: 1, name: 'Vip', tags: ['VIP'], nextFollowUp: '2026-12-01', lastMtg: '2026-11-01' }), makeContact({ id: 2, name: 'Plain', nextFollowUp: '2026-12-01', lastMtg: '2026-11-01' })] });
    mountCards();
    const chip = $$('.auto-tag').find((e) => e.textContent === 'VIP');
    expect(chip.className).toBe('auto-tag tag-stored');
    fireEvent.click(chip);
    expect(history.length).toBe(1);                       // only the filter replace, no navigation to the viewer
    expect(history[0].kind).toBe('replace');
    expect(currentParams().getAll('tg')).toEqual(['VIP']);
    await waitFor(() => expect(cardNames()).toEqual(['Vip']));
    expect($('#tag-filter-chips').textContent).toBe('VIP✕');
    expect($$('.auto-tag').find((e) => e.textContent === 'VIP').className).toContain('tag-active');
    fireEvent.click($('.tag-chip-x'));
    await waitFor(() => expect(cardNames().length).toBe(2));
    expect(field('tag-filter-bar')).toBeNull();
  });

  it('computed tags are tag-rule chips', () => {
    setup({ url: '/contacts/cards', contacts: [makeContact({ id: 1, priority: 'A', nextFollowUp: '2026-12-01', lastMtg: '2026-11-01' })] });
    mountCards();
    const chip = $$('.auto-tag').find((e) => e.textContent === 'Priority-A');
    expect(chip.className).toBe('auto-tag tag-rule');
  });

  it('no match shows the empty message', () => {
    setup({ url: '/contacts/cards', contacts: [] });
    mountCards();
    expect($('#cgrid .empty').textContent).toBe('No contacts match');
  });
});

/* ── bulk select and delete ──────────────────────────────────────────────────── */

describe('bulk select', () => {
  it('select-all selects only the rows on screen, not the ones behind "Show more"', () => {
    setup({ contacts: many(70) });
    mountTable();
    fireEvent.click($('thead input[type=checkbox]'));
    expect($('#bulk-bar').textContent).toContain('60 selected');
    expect($$('#ctbody input:checked').length).toBe(60);
    expect($$('#ctbody tr.bulk-sel').length).toBe(60);
    expect($('thead input[type=checkbox]').checked).toBe(true);
    fireEvent.click($('thead input[type=checkbox]'));
    expect(field('bulk-bar')).toBeNull();
  });

  it('the hook: select-all works on the visible ids only and keeps a hidden selection', () => {
    const { result } = renderHook(() => useBulkSelection([1, 2, 3]));
    act(() => result.current.toggle(99));
    act(() => result.current.toggleAll());
    expect([...result.current.selected].sort((a, b) => a - b)).toEqual([1, 2, 3, 99]);
    expect(result.current.allVisible).toBe(true);
    act(() => result.current.toggleAll());
    expect([...result.current.selected]).toEqual([99]);
    act(() => result.current.clear());
    expect(result.current.size).toBe(0);
  });

  it('a single tick selects it and highlights the row; Clear empties the bar', () => {
    setup({ contacts: many(3) });
    mountTable();
    fireEvent.click($$('#ctbody input[type=checkbox]')[1]);
    expect($('#bulk-bar').textContent).toContain('1 selected');
    expect($$('#ctbody tr')[1].className).toBe('clickable bulk-sel');
    fireEvent.click($$('#bulk-bar button').find((b) => b.textContent === '✕ Clear'));
    expect(field('bulk-bar')).toBeNull();
  });

  it('Delete selected asks first; cancelling writes nothing', async () => {
    const { writes } = setup({ contacts: many(3) });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    mountTable();
    fireEvent.click($$('#ctbody input[type=checkbox]')[0]);
    fireEvent.click($$('#bulk-bar button').find((b) => b.textContent.includes('Delete selected')));
    expect(confirm).toHaveBeenCalledWith('Delete 1 contacts (P001)? Cannot be undone.');
    await act(async () => {});
    expect(writes().length).toBe(0);
    expect(store.getState().contacts.length).toBe(3);
  });

  it('confirming deletes each contact and removes them from the list', async () => {
    const { writes } = setup({ contacts: many(4) });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    mountTable();
    fireEvent.click($$('#ctbody input[type=checkbox]')[0]);
    fireEvent.click($$('#ctbody input[type=checkbox]')[2]);
    fireEvent.click($$('#bulk-bar button').find((b) => b.textContent.includes('Delete selected')));
    await waitFor(() => expect(store.getState().contacts.map((c) => c.id)).toEqual([2, 4]));
    expect(writes().map((w) => [w.method, w.url.split('/rest/v1/')[1]]).sort()).toEqual([['DELETE', 'contacts?id=eq.1'], ['DELETE', 'contacts?id=eq.3']]);
    expect(getStatus().msg).toBe('Deleted 2 contacts');
    expect(field('bulk-bar')).toBeNull();
  });

  it('an admin also deletes the tasks linked to those contacts (entity first), and the confirm says so', async () => {
    const t = makeTask({ id: 'e1', entityId: 'e1', contactId: 1, legacyTaskId: 55 });
    const { writes } = setup({ contacts: many(2), tasks: [t, makeTask({ id: 'e2', contactId: 2 })], access: ADMIN });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    mountTable();
    fireEvent.click($$('#ctbody input[type=checkbox]')[0]);
    fireEvent.click($$('#bulk-bar button').find((b) => b.textContent.includes('Delete selected')));
    expect(confirm).toHaveBeenCalledWith('Delete 1 contacts (P001) and 1 linked tasks? Cannot be undone.');
    await waitFor(() => expect(store.getState().contacts.length).toBe(1));
    expect(writes().map((w) => w.url.split('/rest/v1/')[1]).sort()).toEqual(['contacts?id=eq.1', 'entities?id=eq.e1', 'tasks?id=eq.55']);
    expect(store.getState().tasks.map((x) => x.id)).toEqual(['e2']);
  });

  it('a failed bulk delete reports it and keeps the selection', async () => {
    setup({ contacts: many(2), handler: (url, init) => (init.method === 'DELETE' ? failResponse('nope') : null) });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    mountTable();
    fireEvent.click($$('#ctbody input[type=checkbox]')[0]);
    fireEvent.click($$('#bulk-bar button').find((b) => b.textContent.includes('Delete selected')));
    await waitFor(() => expect(getStatus().kind).toBe('error'));
    expect(getStatus().msg).toContain('Bulk delete failed');
    expect(store.getState().contacts.length).toBe(2);
    expect($('#bulk-bar').textContent).toContain('1 selected');
  });

  it('a view-only user is refused before any request', async () => {
    const { fn } = setup({ contacts: many(2), access: READER });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    mountTable();
    fireEvent.click($$('#ctbody input[type=checkbox]')[0]);
    fireEvent.click($$('#bulk-bar button').find((b) => b.textContent.includes('Delete selected')));
    await waitFor(() => expect(getStatus().msg).toBe('Bulk delete failed: ' + READ_ONLY));
    expect(fn).not.toHaveBeenCalled();
  });
});

/* ── the form ────────────────────────────────────────────────────────────────── */

function Opener({ edit }) {
  const f = useContactForm();
  return (
    <>
      <button id="t-add" onClick={f.openAdd}>add</button>
      <button id="t-edit" onClick={() => f.openEdit(edit)}>edit</button>
      <span id="t-pending">{f.pendingContactData ? f.pendingContactData.name : 'none'}</span>
    </>
  );
}
const mountForm = (edit) => render(<ContactFormProvider><Opener edit={edit} /></ContactFormProvider>);
const save = () => fireEvent.click($$('#mo-cf .mf button').find((b) => b.textContent === 'Save'));

describe('the contact form', () => {
  it('Add Contact: a blank form with the old labels; a name is required (the form stays open)', () => {
    const { fn } = setup();
    mountForm();
    fireEvent.click(field('t-add'));
    expect(field('mo-cf').className).toBe('mo open');
    expect($('#mo-cf .mti').textContent).toBe('Add Contact');
    expect($$('#mo-cf .msl').map((e) => e.textContent)).toEqual(['Identity', 'Contact Info', 'Relationship', 'Notes']);
    expect($$('#cf-abcFull option').map((o) => o.textContent)).toEqual(['— Not set —', 'A - Beneficial at Real Time', 'B - Beneficial in Short-Mid Term', 'C - Beneficial in Long Term']);
    save();
    expect(getStatus()).toMatchObject({ kind: 'error', msg: 'Name is required' });
    expect(field('mo-cf').className).toBe('mo open');
    expect(fn).not.toHaveBeenCalled();
  });

  it('saves a new contact: POSTs the old payload (birthday as typed, empty dates null, tags split)', async () => {
    const { writes } = setup({ handler: (url, init) => (init.method === 'POST' ? okResponse([{ id: 50, n: 'Dee Sharma', bday: '15/03/1990', tags: ['VIP', 'Pune'] }]) : null) });
    store.setState({ currentUser: 'Me Myself' });
    mountForm();
    fireEvent.click(field('t-add'));
    type('cf-n', '  Dee Sharma ');
    type('cf-abcFull', 'B - Beneficial in Short-Mid Term');
    type('cf-bday', '15/03/1990');
    type('cf-tags', 'VIP, ,Pune');
    type('cf-nextFollowUp', '2026-12-01');
    save();
    expect(field('mo-cf').className).toBe('mo');                    // closes before the write
    await waitFor(() => expect(store.getState().contacts.length).toBe(1));
    const w = writes().find((x) => x.method === 'POST');
    expect(w.url).toBe('https://example.supabase.co/rest/v1/contacts');
    expect(w.body).toMatchObject({
      n: 'Dee Sharma', abc: 'B', abc_full: 'B - Beneficial in Short-Mid Term', bday: '15/03/1990', tags: ['VIP', 'Pune'],
      next_follow_up: '2026-12-01', last_mtg: null, intro_date: null, created_by: 'Me Myself', updated_by: 'Me Myself',
    });
    expect(store.getState().contacts[0].id).toBe(50);
    expect(getStatus().msg).toBe('Contact saved');
  });

  it('Edit Contact: prefilled; saving PATCHes the contact and replaces it in the list', async () => {
    const c = makeContact({ id: 4, name: 'Old Name', org: 'Org', priorityFull: 'A - Beneficial at Real Time', priority: 'A', tags: ['x', 'y'], lastMtg: '2026-10-01', birthday: '01/02/1980' });
    const { writes } = setup({ contacts: [c], handler: (url, init) => (init.method === 'PATCH' && url.includes('id=eq.4') && !JSON.stringify(init.body).includes('"sc"') ? okResponse([{ id: 4, n: 'New Name', o: 'Org' }]) : null) });
    mountForm(4);
    fireEvent.click(field('t-edit'));
    expect($('#mo-cf .mti').textContent).toBe('Edit Contact');
    expect([field('cf-n').value, field('cf-o').value, field('cf-abcFull').value, field('cf-tags').value, field('cf-lastMtg').value, field('cf-bday').value])
      .toEqual(['Old Name', 'Org', 'A - Beneficial at Real Time', 'x, y', '2026-10-01', '01/02/1980']);
    type('cf-n', 'New Name');
    save();
    await waitFor(() => expect(store.getState().contacts[0].name).toBe('New Name'));
    const patch = writes().find((x) => x.method === 'PATCH' && x.url.includes('contacts?id=eq.4'));
    expect(patch.body).toMatchObject({ n: 'New Name', o: 'Org', abc: 'A', last_mtg: '2026-10-01', bday: '01/02/1980', tags: ['x', 'y'] });
    expect('created_by' in patch.body).toBe(false);
    expect(getStatus().msg).toBe('Contact saved');
  });

  it('a failed save is reported', async () => {
    setup({ handler: (url, init) => (init.method === 'POST' ? failResponse('bad row') : null) });
    mountForm();
    fireEvent.click(field('t-add'));
    type('cf-n', 'Z');
    save();
    await waitFor(() => expect(getStatus().kind).toBe('error'));
    expect(getStatus().msg).toBe('Save failed: INSERT contacts failed: bad row');
  });

  it('a view-only user saving is refused before any request', async () => {
    const { fn } = setup({ access: READER });
    mountForm();
    fireEvent.click(field('t-add'));
    type('cf-n', 'Z');
    save();
    await waitFor(() => expect(getStatus().msg).toBe('Save failed: ' + READ_ONLY));
    expect(fn).not.toHaveBeenCalled();
  });
});

/* ── duplicates ──────────────────────────────────────────────────────────────── */

describe('a duplicate on create', () => {
  const existing = () => [
    makeContact({ id: 10, name: 'Dee Sharma', org: 'Orbit', email: 'dee@x.test', phone: '98 76', designation: 'Old role', linkedin: 'https://li/dee' }),
    makeContact({ id: 11, name: 'Sam Roy', org: 'Orbit' }),
    makeContact({ id: 12, name: 'Sam Roy', org: 'Nova' }),
  ];

  it('opens the dedup dialog holding pendingContactData and writes nothing', async () => {
    const { fn } = setup({ contacts: existing() });
    mountForm();
    fireEvent.click(field('t-add'));
    type('cf-n', 'Dee S.');
    type('cf-e', 'DEE@x.test');
    type('cf-d', 'New role');
    save();
    await waitFor(() => expect(field('mo-dedup').className).toBe('mo open'));
    expect(fn).not.toHaveBeenCalled();
    expect(field('t-pending').textContent).toBe('Dee S.');
    expect(field('dedup-body').textContent).toContain('Email match: dee@x.test — an existing contact looks like a match:');
    const rows = $$('#dedup-body tbody tr').map((tr) => $$('td', tr).map((t) => t.textContent));
    expect(rows).toContainEqual(['Designation', 'Old role', 'New role']);
    expect(rows).toContainEqual(['Email', 'dee@x.test', 'DEE@x.test']);
    expect($$('#dedup-body tbody tr').find((tr) => tr.textContent.startsWith('Designation')).children[2].style.fontWeight).toBe('600');
    expect(field('dedup-patch-btn').style.display).not.toBe('none');
  });

  it('"Save as New" inserts the pending data', async () => {
    const { writes } = setup({ contacts: existing(), handler: (url, init) => (init.method === 'POST' ? okResponse([{ id: 60, n: 'Dee S.' }]) : null) });
    mountForm();
    fireEvent.click(field('t-add'));
    type('cf-n', 'Dee S.');
    type('cf-e', 'dee@x.test');
    save();
    await waitFor(() => expect(field('mo-dedup').className).toBe('mo open'));
    fireEvent.click(field('dedup-insert-btn'));
    expect(field('mo-dedup').className).toBe('mo');
    await waitFor(() => expect(store.getState().contacts.length).toBe(4));
    expect(writes().find((w) => w.method === 'POST').body).toMatchObject({ n: 'Dee S.', e: 'dee@x.test' });
    expect(getStatus().msg).toBe('Contact saved');
  });

  it('"Update Existing" patches the matched contact and keeps its LinkedIn when none was typed', async () => {
    const { writes } = setup({ contacts: existing(), handler: (url, init) => (init.method === 'PATCH' ? okResponse([{ id: 10, n: 'Dee S.', e: 'dee@x.test', li: 'https://li/dee' }]) : null) });
    mountForm();
    fireEvent.click(field('t-add'));
    type('cf-n', 'Dee S.');
    type('cf-e', 'dee@x.test');
    type('cf-p', '');
    save();
    await waitFor(() => expect(field('mo-dedup').className).toBe('mo open'));
    fireEvent.click(field('dedup-patch-btn'));
    await waitFor(() => expect(store.getState().contacts.find((c) => c.id === 10).name).toBe('Dee S.'));
    const patch = writes().find((w) => w.method === 'PATCH');
    expect(patch.url).toContain('contacts?id=eq.10');
    expect(patch.body).toMatchObject({ n: 'Dee S.', e: 'dee@x.test', p: '98 76', li: 'https://li/dee' });
    expect(getStatus().msg).toBe('Contact updated');
    expect(store.getState().contacts.length).toBe(3);
  });

  it('several same-name contacts: pick one (no Update Existing button), or Save as New', async () => {
    const { writes } = setup({ contacts: existing(), handler: (url, init) => (init.method === 'PATCH' ? okResponse([{ id: 12, n: 'Sam Roy', o: 'Other' }]) : null) });
    mountForm();
    fireEvent.click(field('t-add'));
    type('cf-n', 'sam roy');
    type('cf-o', 'Other');
    save();
    await waitFor(() => expect(field('mo-dedup').className).toBe('mo open'));
    expect(field('dedup-body').textContent).toContain('Multiple contacts match the name sam roy. Which one did you mean?');
    expect(field('dedup-patch-btn').style.display).toBe('none');
    const picks = $$('.dedup-pick');
    expect(picks.length).toBe(2);
    expect(picks[0].textContent).toBe('Sam Roy · Orbit · no contact infoClick to update →');
    fireEvent.click(picks[1]);
    await waitFor(() => expect(writes().length).toBe(1));
    expect(writes()[0].url).toContain('contacts?id=eq.12');
  });

  it('Cancel closes the dialog and writes nothing', async () => {
    const { fn } = setup({ contacts: existing() });
    mountForm();
    fireEvent.click(field('t-add'));
    type('cf-n', 'Dee Sharma');
    save();
    await waitFor(() => expect(field('mo-dedup').className).toBe('mo open'));
    fireEvent.click($$('#mo-dedup .mf button').find((b) => b.textContent === 'Cancel'));
    expect(field('mo-dedup').className).toBe('mo');
    expect(fn).not.toHaveBeenCalled();
  });

  it('editing never looks for a duplicate', async () => {
    const list = existing();
    const { writes } = setup({ contacts: list, handler: (url, init) => (init.method === 'PATCH' && !url.includes('sc') ? okResponse([{ id: 10, n: 'Dee Sharma' }]) : null) });
    mountForm(10);
    fireEvent.click(field('t-edit'));
    save();                                                   // same email, same name as itself
    await waitFor(() => expect(writes().length).toBeGreaterThan(0));
    expect(field('mo-dedup').className).toBe('mo');
  });
});

/* ── the viewer ──────────────────────────────────────────────────────────────── */

const ANN = () => makeContact({
  id: 9, name: 'Ann Lee', org: 'Orbit', designation: 'CEO', category: 'Investor', priority: 'A', priorityFull: 'A - Beneficial at Real Time',
  email: 'ann@x.test', phone: '555', linkedin: 'https://li/ann', nextStep: 'Send deck', lastMtg: '2026-11-01', nextFollowUp: '2026-12-02',
  createdBy: 'Me', updatedBy: 'Me', updatedAt: '2026-11-02T10:00:00Z', birthday: '15/03/1990',
});

describe('the contact viewer', () => {
  it('shows the sections and rows of the old mo-det, with history loaded after', async () => {
    setup({ contacts: [ANN()], handler: (url) => (url.includes('contact_history') ? okResponse([{ id: 1, contact_id: 9, type: 'call', notes: 'Rang', created_at: '2026-11-03T10:00:00Z' }]) : null) });
    route.params = { id: '9' };
    mountViewer();
    expect(field('mo-det').className).toBe('mo open');
    expect($('#mo-det .mti').textContent).toBe('Ann Lee — Orbit');
    expect($$('#mo-det .msl').map((e) => e.textContent)).toEqual(['Identity', 'Contact Info', 'Relationship', 'Notes', 'Audit', 'Activity History', 'AI Actions']);
    const row = (label) => $$('#det-body .fro').find((r) => $('.fla', r).textContent === label);
    expect($('.fva', row('ABC')).textContent).toBe('[A] A - Beneficial at Real Time');
    expect($('.fva a', row('Email')).getAttribute('href')).toBe('mailto:ann@x.test');
    expect($('.fva a', row('LinkedIn')).textContent).toBe('View Profile');
    expect($('.fva a', row('LinkedIn')).getAttribute('href')).toBe('https://li/ann');
    expect($('.fva', row('Last Meeting')).textContent).toBe('1 Nov');
    expect($('.fva', row('Birthday')).textContent).toBe('15/03/1990');
    expect(row('Next Step').className).toBe('fro full');
    expect($('.fva', row('Designation')).textContent).toBe('CEO');
    expect($('.fva', row('Remarks')).className).toBe('fva fva-empty');
    expect($('.fva', row('Remarks')).textContent).toBe('—');
    expect(field('det-history').textContent).toBe('Loading…');
    await waitFor(() => expect(field('det-history').textContent).toBe('3 NovcallRang'));
    expect($$('#mo-det .mf button').map((b) => b.textContent)).toEqual(['Edit', 'Delete', 'Close']);
  });

  it('an empty history shows the old sentence', async () => {
    setup({ contacts: [ANN()] });
    route.params = { id: '9' };
    mountViewer();
    await waitFor(() => expect(field('det-history').textContent).toBe('No history yet — create contact_history table in Supabase to enable this.'));
  });

  it('Close goes back (the intercepted route); Edit opens the form and closes the viewer', () => {
    setup({ contacts: [ANN()] });
    route.params = { id: '9' };
    render(<ContactFormProvider><ContactViewModal /></ContactFormProvider>);
    fireEvent.click($$('#mo-det .mf button').find((b) => b.textContent === 'Close'));
    expect(route.back).toHaveBeenCalledTimes(1);
    fireEvent.click($$('#mo-det .mf button').find((b) => b.textContent === 'Edit'));
    expect(route.back).toHaveBeenCalledTimes(2);
    expect(field('mo-cf').className).toBe('mo open');
    expect(field('cf-n').value).toBe('Ann Lee');
  });

  it('Delete closes the viewer, asks, and on confirm deletes the contact', async () => {
    const { writes } = setup({ contacts: [ANN()] });
    route.params = { id: '9' };
    mountViewer();
    fireEvent.click($$('#mo-det .mf button').find((b) => b.textContent === 'Delete'));
    expect(route.back).toHaveBeenCalledTimes(1);
    expect(field('mo-del-contact').className).toBe('mo open');
    expect(field('del-body-contact').textContent).toContain('Ann Lee · Orbit');
    expect(field('del-body-contact').textContent).toContain('ann@x.test · 555');
    expect(field('del-body-contact').textContent).not.toContain('linked task');
    fireEvent.click(field('del-confirm-btn-contact'));
    expect(field('mo-del-contact').className).toBe('mo');
    await waitFor(() => expect(store.getState().contacts.length).toBe(0));
    expect(writes().map((w) => [w.method, w.url.split('/rest/v1/')[1]])).toEqual([['DELETE', 'contacts?id=eq.9']]);
    expect(getStatus().msg).toBe('Contact deleted');
  });

  it('an admin is told about, and deletes, the linked tasks', async () => {
    const tasks = [makeTask({ id: 'a', entityId: 'a', contactId: 9 }), makeTask({ id: 'b', entityId: 'b', contactId: 9 })];
    const { writes } = setup({ contacts: [ANN()], tasks, access: ADMIN });
    route.params = { id: '9' };
    mountViewer();
    fireEvent.click($$('#mo-det .mf button').find((b) => b.textContent === 'Delete'));
    expect(field('del-body-contact').textContent).toContain('This will also delete 2 linked tasks.');
    fireEvent.click(field('del-confirm-btn-contact'));
    await waitFor(() => expect(store.getState().tasks.length).toBe(0));
    expect(writes().map((w) => w.url.split('/rest/v1/')[1]).sort()).toEqual(['contacts?id=eq.9', 'entities?id=eq.a', 'entities?id=eq.b']);
    expect(getStatus().msg).toBe('Contact deleted · 2 linked tasks removed');
  });

  it('a view-only user cannot delete: the write is refused', async () => {
    const { writes } = setup({ contacts: [ANN()], access: READER });
    route.params = { id: '9' };
    mountViewer();
    fireEvent.click($$('#mo-det .mf button').find((b) => b.textContent === 'Delete'));
    fireEvent.click(field('del-confirm-btn-contact'));
    await waitFor(() => expect(getStatus().msg).toBe('Delete failed: ' + READ_ONLY));
    expect(writes().length).toBe(0);
    expect(store.getState().contacts.length).toBe(1);
  });

  it('an unknown or non-numeric id shows a message, not a crash; before data arrives it says Loading', () => {
    setup({ contacts: [ANN()] });
    route.params = { id: '404' };
    mountViewer();
    expect(field('det-body').textContent).toContain('Contact not found.');
    cleanup();
    route.params = { id: 'abc' };
    mountViewer();
    expect(field('det-body').textContent).toContain('Contact not found.');
    cleanup();
    store.setState({ dataLoaded: false });
    route.params = { id: '404' };
    mountViewer();
    expect(field('det-body').textContent).toBe('Loading…');
  });

  it('the full page (direct visit) shows the same card in the frame; Close leaves for the table', () => {
    setup({ contacts: [ANN()] });
    route.params = { id: '9' };
    mountViewer(true);
    expect(field('mo-det')).toBeNull();
    expect(field('det-title').textContent).toBe('Ann Lee — Orbit');
    fireEvent.click($$('.mf button').find((b) => b.textContent === 'Close'));
    expect(history.at(-1)).toEqual({ kind: 'push', href: '/contacts/table' });
  });
});

/* ── the layout ──────────────────────────────────────────────────────────────── */

describe('contacts/layout', () => {
  it('draws the screen for table and cards, and only the viewer for a direct visit to a contact', () => {
    setup({ url: '/contacts/table', contacts: many(2) });
    const { rerender } = render(<ContactFormProvider><ContactsLayout><TablePage /></ContactsLayout></ContactFormProvider>);
    expect(field('ctbl-wrap')).not.toBeNull();
    act(() => { resetNav('/contacts/cards'); });
    rerender(<ContactFormProvider><ContactsLayout><TablePage /></ContactsLayout></ContactFormProvider>);
    expect(field('cgrid')).not.toBeNull();
    expect(field('ctbl-wrap')).toBeNull();
    act(() => { resetNav('/contacts/people/1'); });
    rerender(<ContactFormProvider><ContactsLayout><div id="viewer-only" /></ContactsLayout></ContactFormProvider>);
    expect(field('viewer-only')).not.toBeNull();
    expect(field('cgrid')).toBeNull();
  });
});

/* ── Smart Search and presets ────────────────────────────────────────────────── */

describe('Smart Search', () => {
  it('Ctrl+K toggles it; two letters find contacts and tasks; a click opens the viewer route', async () => {
    setup({ contacts: [makeContact({ id: 3, name: 'Acme Anna', org: 'Orbit' })], tasks: [makeTask({ id: 'e9', task: 'Acme deck', assignedTo: 'Ann' })] });
    render(<SmartSearch />);
    expect(field('mo-smart-search').className).toBe('mo');
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    await waitFor(() => expect(field('mo-smart-search').className).toBe('mo open'));
    fireEvent.change(field('smart-search-input'), { target: { value: 'a' } });
    expect(field('smart-search-results').textContent).toBe('');
    fireEvent.change(field('smart-search-input'), { target: { value: 'acme' } });
    expect(field('smart-search-results').textContent).toBe('TASKSAcme deck (Ann)CONTACTSAcme Anna (Orbit)');
    fireEvent.change(field('smart-search-input'), { target: { value: 'zzzz' } });
    expect(field('smart-search-results').textContent).toBe('No matches found');
    fireEvent.change(field('smart-search-input'), { target: { value: 'acme' } });
    fireEvent.click($$('#smart-search-results div').find((d) => d.textContent.startsWith('Acme Anna')));
    expect(history.at(-1).href).toBe('/contacts/people/3');
    expect(field('mo-smart-search').className).toBe('mo');
    fireEvent.keyDown(window, { key: 'K', metaKey: true });
    await waitFor(() => expect(field('mo-smart-search').className).toBe('mo open'));
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    await waitFor(() => expect(field('mo-smart-search').className).toBe('mo'));
  });

  it('saves a preset by name, lists it, and deletes it', async () => {
    setup();
    render(<SmartSearch />);
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    await waitFor(() => expect(field('mo-smart-search').className).toBe('mo open'));
    expect(field('saved-filters-list').textContent).toBe('No saved filters yet');
    const prompt = vi.spyOn(window, 'prompt').mockReturnValue('My view');
    fireEvent.click($$('#mo-smart-search .mf button').find((b) => b.textContent === '+ Save Current View Filters'));
    expect(prompt).toHaveBeenCalledWith('Enter a name for current filter preset:');
    expect(field('saved-filters-list').textContent).toBe('🔍 My view✕');
    expect(JSON.parse(localStorage.getItem('rie_saved_filters'))[0].name).toBe('My view');
    fireEvent.click($('#saved-filters-list button'));
    expect(field('saved-filters-list').textContent).toBe('No saved filters yet');
    prompt.mockReturnValue(null);
    fireEvent.click($$('#mo-smart-search .mf button').find((b) => b.textContent === '+ Save Current View Filters'));
    expect(field('saved-filters-list').textContent).toBe('No saved filters yet');
  });
});

/* ── Excel export ────────────────────────────────────────────────────────────── */

describe('Export to Excel', () => {
  it('loads SheetJS from the CDN build only when asked, once', async () => {
    expect($$('script').some((s) => s.src === SHEETJS_URL)).toBe(false);
    const p = loadSheetJS();
    const tag = $$('script').find((s) => s.src === SHEETJS_URL);
    expect(tag).toBeTruthy();
    window.XLSX = { marker: 1 };
    tag.onload();
    await expect(p).resolves.toBe(window.XLSX);
    await loadSheetJS();
    expect($$('script').filter((s) => s.src === SHEETJS_URL).length).toBe(1);
  });

  it('writes BASE_Export_<date>.xlsx with a sheet per list', async () => {
    setup({ contacts: [makeContact({ id: 1, name: 'Dee' })], tasks: [] });
    const sheets = [];
    let file = null;
    window.XLSX = {
      utils: {
        book_new: () => ({ s: [] }),
        aoa_to_sheet: (rows) => ({ rows }),
        book_append_sheet: (wb, ws, name) => sheets.push([name, ws.rows.length, ws['!cols']?.length]),
      },
      writeFile: (wb, name) => { file = name; },
    };
    await exportToExcel();
    expect(sheets).toEqual([['Contacts', 2, 34], ['Tasks', 1, 19]]);
    expect(file).toBe('BASE_Export_2026-11-10.xlsx');
    expect(getStatus().msg).toBe('Export complete — 1 contacts, 0 tasks');
  });

  it('says so when the library cannot be loaded', async () => {
    setup();
    delete window.XLSX;
    const p = exportToExcel();
    $$('script').find((s) => s.src === SHEETJS_URL).onerror();
    await p;
    expect(getStatus()).toMatchObject({ kind: 'error', msg: 'Export library not loaded — try refreshing the page' });
  });
});

/* ── Claude edge functions ───────────────────────────────────────────────────── */

describe('useContactAi', () => {
  const edge = (calls) => calls().filter((c) => c.url.includes('/functions/v1/'));
  it('nlSearch posts { query }', async () => {
    const { calls } = setup({ handler: (url) => (url.includes('nl-search') ? okResponse({ contactIds: [1, 2], explanation: 'both are investors' }) : null) });
    const { result } = renderHook(() => useContactAi());
    let out;
    await act(async () => { out = await result.current.nlSearch('investors in Pune'); });
    expect(edge(calls)).toEqual([{ url: 'https://example.supabase.co/functions/v1/nl-search', method: 'POST', body: { query: 'investors in Pune' } }]);
    expect(out.contactIds).toEqual([1, 2]);
    expect(getStatus().msg).toBe('AI found 2 matches · both are investors');
    await act(async () => { out = await result.current.nlSearch(''); });
    expect(out).toBeNull();
    expect(edge(calls).length).toBe(1);
  });

  it('nlSearch with no matches says so', async () => {
    setup({ handler: () => okResponse({ contactIds: [], explanation: '' }) });
    const { result } = renderHook(() => useContactAi());
    await act(async () => { await result.current.nlSearch('nobody'); });
    expect(getStatus().msg).toBe('No matches found: "nobody"');
  });

  it('enrich posts { contactId, name, org, linkedinUrl } of the stored contact', async () => {
    const { calls } = setup({ contacts: [ANN()], handler: () => okResponse({ bio: 'b', keyFacts: [], suggestedCategory: 'Other', suggestedNextStep: '' }) });
    const { result } = renderHook(() => useContactAi());
    await act(async () => { await result.current.enrich(9); });
    expect(edge(calls)[0].url.endsWith('/functions/v1/enrich-contact')).toBe(true);
    expect(edge(calls)[0].body).toEqual({ contactId: 9, name: 'Ann Lee', org: 'Orbit', linkedinUrl: 'https://li/ann' });
    expect(getStatus().msg).toBe('Enrichment ready');
    let out;
    await act(async () => { out = await result.current.enrich(12345); });
    expect(out).toBeNull();                                      // unknown contact: nothing asked
  });

  it('suggestFollowup posts { contactId }; a failure is reported', async () => {
    const { calls } = setup({ handler: () => okResponse({ suggestedNextStep: 'x', draftMessage: 'y', followUpDate: '2026-12-01', rationale: 'z' }) });
    const { result } = renderHook(() => useContactAi());
    await act(async () => { await result.current.suggestFollowup(9); });
    expect(edge(calls)[0].body).toEqual({ contactId: 9 });
    cleanup();
    setup({ handler: () => failResponse('model down') });
    const again = renderHook(() => useContactAi());
    let out;
    await act(async () => { out = await again.result.current.suggestFollowup(9); });
    expect(out).toBeNull();
    expect(getStatus()).toMatchObject({ kind: 'error' });
    expect(getStatus().msg).toBe('Suggestion failed: suggest-followup failed: model down');
  });
});
