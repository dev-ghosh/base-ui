// Events: the list with its search-param filters, the event viewer (guests, RSVP changes, invites, RSVP sync),
// the event and guest forms, deletes, and the view-only user. The real event-actions / rest.js run; only fetch
// (and the full reload the RSVP sync ends with) is stubbed, so "no fetch" is a real assertion. Expected values
// are worked out by hand from rie-dashboard2/js/events.js.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent, waitFor, act, renderHook } from '@testing-library/react';

process.env.NEXT_PUBLIC_SB_URL = 'https://example.supabase.co';
process.env.NEXT_PUBLIC_SB_KEY = 'anon-key-123';

const route = vi.hoisted(() => ({ params: {}, back: vi.fn() }));
vi.mock('next/navigation', async () => {
  const base = (await import('./helpers/fake-router.js')).navigationMock;
  return { ...base, useRouter: () => ({ ...base.useRouter(), back: route.back }), useParams: () => route.params };
});
vi.mock('next/link', async () => (await import('./helpers/fake-router.js')).linkMock);
const reload = vi.hoisted(() => ({ syncData: vi.fn(async () => true) }));
vi.mock('@/lib/load-data.js', () => reload);

import EventsPage from '@/app/(app)/events/page.jsx';
import { EventViewModal, EventViewPage } from '@/features/events/EventViewRoute.jsx';
import { EventFormProvider } from '@/features/events/EventFormProvider.jsx';
import { useEventForm } from '@/features/events/hooks/useEventForm.js';
import { useEvents } from '@/features/events/hooks/useEvents.js';
import { useGuests } from '@/features/events/hooks/useGuests.js';
import { store } from '@/store/store.js';
import { getStatus } from '@/lib/status.js';
import { isMoOpen } from '@/lib/modals.js';
import { seed, stubFetch, okResponse, failResponse } from './helpers/fixtures.js';
import { history, resetNav, currentParams } from './helpers/fake-router.js';

const READ_ONLY = 'You have view-only access to BASE, so this change was not saved.';
const NOW = new Date('2026-11-10T12:00:00');

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const field = (id) => document.getElementById(id);
const type = (id, value) => fireEvent.change(field(id), { target: { value } });
const button = (label, root = document) => $$('button', root).find((b) => b.textContent.trim() === label);
const gate = () => { let release; const p = new Promise((r) => { release = r; }); return { p, release }; };
const guest = (id) => store.getState().guests.find((g) => g.id === id);
const evt = (id) => store.getState().events.find((e) => e.id === id);
const writes = (calls) => calls.filter((c) => c.method !== 'GET');

const makeEvent = (o = {}) => ({
  id: 1, title: 'Annual Dinner', type: 'Party', date: '2026-12-01', time: '7:30 PM', venue: 'Lake House',
  description: '', status: 'Draft', createdBy: '', createdAt: '', ...o,
});
const makeGuest = (o = {}) => ({
  id: 10, eventId: 1, contactId: null, name: 'Ann Guest', email: 'ann@example.com', phone: '', rsvp: 'Pending', plusOne: 0,
  inviteSentAt: '', rsvpUpdatedAt: '', notes: '', ...o,
});

const READER = { person_code: 'ME1', can_write: false, is_admin: false };
function setup({ url = '/events', events = [], guests = [], contacts = [], viewer = false, handler } = {}) {
  seed({ events, guests, contacts, ...(viewer ? { access: READER } : {}) });
  resetNav(url);
  return stubFetch(handler);
}
const mountPage = () => render(<EventFormProvider><EventsPage /></EventFormProvider>);
const mountViewer = (framed = false) => render(<EventFormProvider>{framed ? <EventViewPage /> : <EventViewModal />}</EventFormProvider>);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  route.params = {};
  route.back.mockClear();
  reload.syncData.mockClear();
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

/* ── the list ────────────────────────────────────────────────────────────────── */

describe('/events', () => {
  it('draws one card per event with type, title, date + time, venue, RSVP counts and status', () => {
    setup({
      events: [makeEvent()],
      guests: [
        makeGuest({ id: 1, rsvp: 'Yes', plusOne: 2 }), makeGuest({ id: 2, rsvp: 'Yes', plusOne: 1 }), makeGuest({ id: 3, rsvp: 'No' }),
        makeGuest({ id: 4, rsvp: 'Maybe' }), makeGuest({ id: 5, rsvp: 'Pending' }), makeGuest({ id: 6, rsvp: 'Pending' }),
        makeGuest({ id: 7, eventId: 99, rsvp: 'No' }),
      ],
    });
    mountPage();
    const card = $('#ev-grid .ev-card');
    expect($('.ev-type', card).textContent).toBe('Party');
    expect($('.ev-title', card).textContent).toBe('Annual Dinner');
    expect($('.ev-meta', card).textContent).toBe('1 Dec 7:30 PM · Lake House');
    expect($('.rsvp-y', card).textContent).toBe('✓ 2 +3');
    expect($('.rsvp-n', card).textContent).toBe('✗ 1');
    expect($('.rsvp-m', card).textContent).toBe('? 1');
    expect($('.rsvp-p', card).textContent).toBe('2 pending');
    const status = $('.ev-status-draft', card);
    expect(status.textContent).toBe('Draft');
  });

  it('an event with no date says so; a count of zero is not drawn', () => {
    setup({ events: [makeEvent({ date: '', venue: '' })], guests: [makeGuest({ rsvp: 'Yes' })] });
    mountPage();
    expect($('.ev-meta').textContent).toBe('No date set');
    expect($('.rsvp-y').textContent).toBe('✓ 1');
    expect($('.rsvp-n')).toBeNull();
    expect($('.rsvp-p')).toBeNull();
  });

  it('with no events (or none matching) shows the empty line', () => {
    setup({ events: [] });
    mountPage();
    expect($('#ev-grid .empty').textContent).toBe('No events yet — click + Event to create one');
    expect($$('.ev-card')).toHaveLength(0);
  });

  it('keeps the list in the order it was loaded', () => {
    setup({ events: [makeEvent({ id: 1, title: 'B' }), makeEvent({ id: 2, title: 'A' })] });
    mountPage();
    expect($$('.ev-title').map((e) => e.textContent)).toEqual(['B', 'A']);
  });

  it('type and status are search params that filter the grid; unknown values are ignored', () => {
    setup({
      url: '/events?type=Cricket',
      events: [makeEvent({ id: 1, title: 'A', type: 'Party' }), makeEvent({ id: 2, title: 'B', type: 'Cricket', status: 'Completed' })],
    });
    mountPage();
    expect($$('.ev-title').map((e) => e.textContent)).toEqual(['B']);
    expect(field('ev-type-f').value).toBe('Cricket');
    fireEvent.change(field('ev-type-f'), { target: { value: '' } });
    expect(currentParams().get('type')).toBeNull();
    fireEvent.change(field('ev-status-f'), { target: { value: 'Completed' } });
    expect(currentParams().get('status')).toBe('Completed');
    expect(history.every((h) => h.kind === 'replace')).toBe(true);
  });

  it('the search box (debounced) writes q and filters on title, venue and type', async () => {
    vi.useRealTimers();
    setup({ events: [makeEvent({ id: 1, title: 'A', venue: 'Lake' }), makeEvent({ id: 2, title: 'B', venue: 'Oval' })] });
    mountPage();
    fireEvent.change(field('ev-search'), { target: { value: 'OVAL' } });
    await waitFor(() => expect(currentParams().get('q')).toBe('OVAL'));
    expect($$('.ev-title').map((e) => e.textContent)).toEqual(['B']);
  });

  it('offers the old type and status options', () => {
    setup({});
    mountPage();
    expect($$('#ev-type-f option').map((o) => o.textContent)).toEqual(['All Types', 'Birthday', 'Party', 'Cricket', 'Golf', 'Other']);
    expect($$('#ev-status-f option').map((o) => o.textContent)).toEqual(['All Statuses', 'Draft', 'Invites Sent', 'Completed', 'Cancelled']);
  });

  it('a card opens /events/<id>', () => {
    setup({ events: [makeEvent({ id: 5 })] });
    mountPage();
    fireEvent.click($('.ev-card'));
    expect(history.at(-1)).toEqual({ kind: 'push', href: '/events/5' });
  });

  it('tracks the store: a new guest or event appears without a reload', () => {
    setup({ events: [makeEvent()] });
    mountPage();
    expect($('.rsvp-p')).toBeNull();
    act(() => store.setState((s) => ({ guests: [...s.guests, makeGuest()] })));
    expect($('.rsvp-p').textContent).toBe('1 pending');
    act(() => store.setState((s) => ({ events: [...s.events, makeEvent({ id: 2, title: 'Second' })] })));
    expect($$('.ev-title').map((e) => e.textContent)).toEqual(['Annual Dinner', 'Second']);
  });
});

/* ── hooks ───────────────────────────────────────────────────────────────────── */

describe('useEvents / useGuests', () => {
  it('useEvents gives the events and the guests grouped by event', () => {
    setup({ events: [makeEvent({ id: 1 }), makeEvent({ id: 2, type: 'Golf' })], guests: [makeGuest({ id: 1, eventId: 1 }), makeGuest({ id: 2, eventId: 2 }), makeGuest({ id: 3, eventId: 1 })] });
    const { result } = renderHook(() => useEvents());
    expect(result.current.events.map((e) => e.id)).toEqual([1, 2]);
    expect(result.current.guestsByEvent[1].map((g) => g.id)).toEqual([1, 3]);
    expect(result.current.guestsByEvent[2].map((g) => g.id)).toEqual([2]);
    const filtered = renderHook(() => useEvents({ type: 'Golf' }));
    expect(filtered.result.current.events.map((e) => e.id)).toEqual([2]);
  });

  it('useGuests(eventId) lists that event\'s guests', () => {
    setup({ events: [makeEvent()], guests: [makeGuest({ id: 1 }), makeGuest({ id: 2, eventId: 9 })] });
    const { result } = renderHook(() => useGuests('1'));
    expect(result.current.guests.map((g) => g.id)).toEqual([1]);
  });

  it('setRsvp is optimistic: the store changes before the write finishes, and the write body is the old one', async () => {
    const g = gate();
    const f = setup({ events: [makeEvent()], guests: [makeGuest()], handler: async () => { await g.p; } });
    const { result } = renderHook(() => useGuests(1));
    let done;
    act(() => { done = result.current.setRsvp(10, 'Yes'); });
    expect(guest(10).rsvp).toBe('Yes');                       // before the response
    expect(guest(10).rsvpUpdatedAt).toBe(NOW.toISOString());
    await act(async () => { g.release(); await done; });
    const w = writes(f.calls());
    expect(w).toHaveLength(1);
    expect(w[0].method).toBe('PATCH');
    expect(w[0].url).toContain('/rest/v1/event_guests?id=eq.10');
    expect(w[0].body).toEqual({ rsvp: 'Yes', rsvp_updated_at: NOW.toISOString() });
    expect(guest(10).rsvp).toBe('Yes');
    expect(getStatus()).toMatchObject({ kind: 'online', msg: 'RSVP updated' });
  });

  it('setRsvp rolls back (value and timestamp) when the write is refused, and says so', async () => {
    setup({ events: [makeEvent()], guests: [makeGuest({ rsvp: 'No', rsvpUpdatedAt: '2026-01-01T00:00:00Z' })], handler: async () => failResponse('nope') });
    const { result } = renderHook(() => useGuests(1));
    let ok;
    await act(async () => { ok = await result.current.setRsvp(10, 'Yes'); });
    expect(ok).toBe(false);
    expect(guest(10).rsvp).toBe('No');
    expect(guest(10).rsvpUpdatedAt).toBe('2026-01-01T00:00:00Z');
    expect(getStatus().kind).toBe('error');
    expect(getStatus().msg).toMatch(/^RSVP update failed: UPDATE event_guests failed: nope/);
  });

  it('setRsvp for a guest that is not loaded does nothing', async () => {
    const f = setup({ events: [makeEvent()], guests: [] });
    const { result } = renderHook(() => useGuests(1));
    let ok;
    await act(async () => { ok = await result.current.setRsvp(404, 'Yes'); });
    expect(ok).toBe(false);
    expect(f.calls()).toHaveLength(0);
  });

  it('setPlusOne is optimistic with rollback, and the body is { plus_one }', async () => {
    const f = setup({ events: [makeEvent()], guests: [makeGuest({ plusOne: 1 })] });
    const { result } = renderHook(() => useGuests(1));
    await act(async () => { await result.current.setPlusOne(10, '3'); });
    expect(writes(f.calls())[0].body).toEqual({ plus_one: 3 });
    expect(guest(10).plusOne).toBe(3);
    expect(getStatus().msg).toBe('+1 updated');
    await act(async () => { await result.current.setPlusOne(10, 'abc'); });
    expect(writes(f.calls())[1].body).toEqual({ plus_one: 0 });
    expect(guest(10).plusOne).toBe(0);

    stubFetch(async () => failResponse('bad'));
    await act(async () => { await result.current.setPlusOne(10, '5'); });
    expect(guest(10).plusOne).toBe(0);
    expect(getStatus().msg).toMatch(/^Update failed: /);
  });

  it('addGuest posts the old body (event_id, contact_id, trimmed fields), adds the guest, and reports', async () => {
    const f = setup({ events: [makeEvent()], handler: async (url, init) => (init.method === 'POST' ? okResponse([{ id: 77, event_id: 1, contact_id: 12, name: 'Ann', email: 'a@x', phone: '1', rsvp: 'Yes', plus_one: 2, notes: 'n' }]) : null) });
    const { result } = renderHook(() => useGuests(1));
    let ok;
    await act(async () => { ok = await result.current.addGuest({ contactId: '12', name: ' Ann ', email: ' a@x ', phone: ' 1 ', rsvp: 'Yes', plusOne: '2', notes: ' n ' }); });
    expect(ok).toBe(true);
    const w = writes(f.calls());
    expect(w[0].method).toBe('POST');
    expect(w[0].url).toContain('/rest/v1/event_guests');
    expect(w[0].body).toEqual({ event_id: 1, contact_id: 12, name: 'Ann', email: 'a@x', phone: '1', rsvp: 'Yes', plus_one: 2, notes: 'n' });
    expect(guest(77)).toMatchObject({ name: 'Ann', eventId: 1, rsvp: 'Yes', plusOne: 2 });
    expect(getStatus()).toMatchObject({ kind: 'online', msg: 'Guest added' });
  });

  it('addGuest without a name writes nothing', async () => {
    const f = setup({ events: [makeEvent()] });
    const { result } = renderHook(() => useGuests(1));
    let ok;
    await act(async () => { ok = await result.current.addGuest({ name: '  ' }); });
    expect(ok).toBe(false);
    expect(f.calls()).toHaveLength(0);
    expect(getStatus()).toMatchObject({ kind: 'error', msg: 'Guest name is required' });
  });

  it('addGuest reports a refused insert and adds nothing', async () => {
    setup({ events: [makeEvent()], handler: async () => failResponse('rls') });
    const { result } = renderHook(() => useGuests(1));
    await act(async () => { await result.current.addGuest({ name: 'Ann' }); });
    expect(store.getState().guests).toHaveLength(0);
    expect(getStatus().msg).toMatch(/^Failed to add guest: /);
  });

  it('removeGuest deletes the row and the guest', async () => {
    const f = setup({ events: [makeEvent()], guests: [makeGuest(), makeGuest({ id: 11, name: 'B' })], handler: async (u, i) => (i.method === 'DELETE' ? okResponse([{ id: 10 }]) : null) });
    const { result } = renderHook(() => useGuests(1));
    let ok;
    await act(async () => { ok = await result.current.removeGuest(10); });
    expect(ok).toBe(true);
    expect(writes(f.calls())[0].url).toContain('/rest/v1/event_guests?id=eq.10');
    expect(store.getState().guests.map((g) => g.id)).toEqual([11]);
    expect(getStatus().msg).toBe('Guest removed');
  });

  it('syncRsvps posts { eventId, emailText } to sync-rsvps, reloads the data and reports the count', async () => {
    const f = setup({ events: [makeEvent()], handler: async (url) => (url.includes('/functions/v1/sync-rsvps') ? okResponse({ updated: 2 }) : null) });
    const { result } = renderHook(() => useGuests(1));
    let ok;
    await act(async () => { ok = await result.current.syncRsvps('  Ann: yes please  '); });
    expect(ok).toBe(true);
    const call = f.calls().find((c) => c.url.includes('/functions/v1/sync-rsvps'));
    expect(call.method).toBe('POST');
    expect(call.body).toEqual({ eventId: 1, emailText: 'Ann: yes please' });
    expect(reload.syncData).toHaveBeenCalledTimes(1);
    expect(getStatus()).toMatchObject({ kind: 'online', msg: 'RSVPs synced — 2 updates' });
  });

  it('syncRsvps with no text says so and calls nothing; one update is singular', async () => {
    const f = setup({ events: [makeEvent()], handler: async () => okResponse({ updated: 1 }) });
    const { result } = renderHook(() => useGuests(1));
    await act(async () => { await result.current.syncRsvps('   '); });
    expect(f.calls()).toHaveLength(0);
    expect(getStatus()).toMatchObject({ kind: 'error', msg: 'Paste the email thread text first' });
    await act(async () => { await result.current.syncRsvps('x'); });
    expect(getStatus().msg).toBe('RSVPs synced — 1 update');
  });

  it('syncRsvps reports a failing function and does not reload', async () => {
    setup({ events: [makeEvent()], handler: async () => failResponse('model down') });
    const { result } = renderHook(() => useGuests(1));
    let ok;
    await act(async () => { ok = await result.current.syncRsvps('x'); });
    expect(ok).toBe(false);
    expect(reload.syncData).not.toHaveBeenCalled();
    expect(getStatus().kind).toBe('error');
    expect(getStatus().msg).toMatch(/^Sync failed: .*model down/);
  });

  it('sendInvites posts { eventId, template } to send-invites and marks the returned guests as invited', async () => {
    const f = setup({ events: [makeEvent()], guests: [makeGuest({ id: 1 }), makeGuest({ id: 2 }), makeGuest({ id: 3 })], handler: async (url) => (url.includes('/functions/v1/send-invites') ? okResponse({ guestIds: [1, 3], count: 2 }) : null) });
    const { result } = renderHook(() => useGuests(1));
    let ok;
    await act(async () => { ok = await result.current.sendInvites('  Hi {{name}}  '); });
    expect(ok).toBe(true);
    const call = f.calls().find((c) => c.url.includes('/functions/v1/send-invites'));
    expect(call.body).toEqual({ eventId: 1, template: 'Hi {{name}}' });
    expect(guest(1).inviteSentAt).toBe(NOW.toISOString());
    expect(guest(2).inviteSentAt).toBe('');
    expect(guest(3).inviteSentAt).toBe(NOW.toISOString());
    expect(getStatus()).toMatchObject({ kind: 'online', msg: 'Invites sent to 2 guests' });
  });

  it('sendInvites without a template says so and sends nothing', async () => {
    const f = setup({ events: [makeEvent()] });
    const { result } = renderHook(() => useGuests(1));
    await act(async () => { await result.current.sendInvites('  '); });
    expect(f.calls()).toHaveLength(0);
    expect(getStatus()).toMatchObject({ kind: 'error', msg: 'Paste your invite template first' });
  });

  it('a view-only user cannot change an RSVP, add or remove a guest, send invites or sync (no request at all)', async () => {
    const f = setup({ viewer: true, events: [makeEvent()], guests: [makeGuest({ rsvp: 'No' })] });
    const { result } = renderHook(() => useGuests(1));
    await act(async () => { await result.current.setRsvp(10, 'Yes'); });
    expect(guest(10).rsvp).toBe('No');
    expect(getStatus().msg).toContain(READ_ONLY);
    await act(async () => { await result.current.setPlusOne(10, '2'); });
    expect(guest(10).plusOne).toBe(0);
    await act(async () => { await result.current.addGuest({ name: 'X' }); });
    expect(store.getState().guests).toHaveLength(1);
    await act(async () => { await result.current.removeGuest(10); });
    expect(store.getState().guests).toHaveLength(1);
    await act(async () => { await result.current.sendInvites('Hi'); });
    expect(getStatus().msg).toContain(READ_ONLY);
    await act(async () => { await result.current.syncRsvps('text'); });
    expect(getStatus().msg).toContain(READ_ONLY);
    expect(f.calls()).toHaveLength(0);
    expect(reload.syncData).not.toHaveBeenCalled();
  });
});

/* ── the viewer ──────────────────────────────────────────────────────────────── */

describe('the event viewer', () => {
  const seedDinner = (extra = {}) => setup({
    url: '/events/1',
    events: [makeEvent({ description: 'Bring a hat' })],
    guests: [
      makeGuest({ id: 1, name: 'Ann', rsvp: 'Yes', plusOne: 2, email: 'ann@x', inviteSentAt: '2026-11-01T00:00:00Z' }),
      makeGuest({ id: 2, name: 'Bob', rsvp: 'No', email: 'bob@x' }),
      makeGuest({ id: 3, name: 'Cy', rsvp: 'Maybe', email: '' }),
      makeGuest({ id: 4, name: 'Di', rsvp: 'Pending', email: 'di@x', inviteSentAt: '2026-11-01T00:00:00Z' }),
    ],
    ...extra,
  });

  it('shows the details, the four tiles, the guest list and the two flows', () => {
    seedDinner();
    route.params = { id: '1' };
    mountViewer();
    expect($('#mo-edet').classList.contains('open')).toBe(true);
    expect($('#mo-edet .mti').textContent).toBe('Annual Dinner');
    const fva = $$('#edet-body .fro .fva').map((e) => e.textContent);
    expect(fva).toEqual(['1 Dec · 7:30 PM', 'Lake House', 'Party', 'Draft', 'Bring a hat']);
    const tiles = $$('#edet-body .edet-tile').map((e) => e.textContent);
    expect(tiles).toEqual(['3Attending', '1Declined', '1Maybe', '1Pending']);
    expect($('#edet-body').textContent).toContain('Guest List (4)');
    const rows = $$('.guest-list tbody tr');
    expect(rows).toHaveLength(4);
    expect($$('td', rows[0]).slice(0, 3).map((t) => t.textContent)).toEqual(['Ann', 'ann@x', '—']);
    expect($('.rsvp-sel', rows[0]).value).toBe('Yes');
    expect($('input[type=number]', rows[0]).value).toBe('2');
    expect($$('td', rows[0])[5].textContent).toBe('✓ Sent');
    expect($$('td', rows[1])[5].textContent).toBe('—');
    expect($$('.rsvp-sel option', rows[0]).map((o) => o.textContent)).toEqual(['Pending', 'Yes', 'No', 'Maybe']);
    expect(field('invite-tmpl-1')).not.toBeNull();
    expect(field('rsvp-email-text-1')).not.toBeNull();
    expect($('#edet-body').textContent).toContain('1 not yet invited');      // Bob has an email and no invite; Cy has no email
    expect($('#edet-body').textContent).toContain('1 awaiting RSVP');        // Di
  });

  it('omits the notes row when there are none, and says "No guests yet" for an empty list', () => {
    setup({ url: '/events/1', events: [makeEvent()], guests: [] });
    route.params = { id: '1' };
    mountViewer();
    expect($$('#edet-body .fro')).toHaveLength(4);
    expect($('.guest-list tbody').textContent).toBe('No guests yet');
    expect($('#edet-body').textContent).toContain('Guest List (0)');
    expect($('#edet-body').textContent).not.toContain('not yet invited');
  });

  it('Close goes back; the footer has Edit, + Add Guest and Delete event', () => {
    seedDinner();
    route.params = { id: '1' };
    mountViewer();
    expect($$('#mo-edet .mf button').map((b) => b.textContent)).toEqual(['Edit', '+ Add Guest', 'Delete event', 'Close']);
    fireEvent.click(button('Close'));
    expect(route.back).toHaveBeenCalled();
  });

  it('an RSVP change in the list updates the guest at once and counts follow', async () => {
    const g = gate();
    const f = seedDinner({ handler: async () => { await g.p; } });
    route.params = { id: '1' };
    mountViewer();
    const sel = $('.guest-list tbody tr:nth-child(2) .rsvp-sel');           // Bob, No
    fireEvent.change(sel, { target: { value: 'Yes' } });
    expect(guest(2).rsvp).toBe('Yes');
    await waitFor(() => expect($$('#edet-body .edet-tile')[0].textContent).toBe('4Attending'));
    await act(async () => { g.release(); });
    expect(writes(f.calls())[0].body.rsvp).toBe('Yes');
  });

  it('a refused RSVP change is put back', async () => {
    seedDinner({ handler: async () => failResponse('no') });
    route.params = { id: '1' };
    mountViewer();
    fireEvent.change($('.guest-list tbody tr:nth-child(2) .rsvp-sel'), { target: { value: 'Maybe' } });
    await waitFor(() => expect(getStatus().kind).toBe('error'));
    expect(guest(2).rsvp).toBe('No');
    await waitFor(() => expect($('.guest-list tbody tr:nth-child(2) .rsvp-sel').value).toBe('No'));
  });

  it('a +1 change is saved when the box is left', async () => {
    const f = seedDinner();
    route.params = { id: '1' };
    mountViewer();
    const box = $('.guest-list tbody tr:nth-child(2) input[type=number]');
    fireEvent.change(box, { target: { value: '4' } });
    expect(f.calls()).toHaveLength(0);
    fireEvent.blur(box);
    await waitFor(() => expect(guest(2).plusOne).toBe(4));
    expect(writes(f.calls())[0].body).toEqual({ plus_one: 4 });
  });

  it('Send via Claude sends the template, then clears both boxes', async () => {
    const f = seedDinner({ handler: async (url) => (url.includes('send-invites') ? okResponse({ guestIds: [2], count: 1 }) : null) });
    route.params = { id: '1' };
    mountViewer();
    fireEvent.change(field('invite-tmpl-1'), { target: { value: 'Hello {{name}}' } });
    fireEvent.click(button('⚡ Send via Claude'));
    await waitFor(() => expect(getStatus().msg).toBe('Invites sent to 1 guest'));
    expect(f.calls().find((c) => c.url.includes('send-invites')).body).toEqual({ eventId: 1, template: 'Hello {{name}}' });
    expect(field('invite-tmpl-1').value).toBe('');
    await waitFor(() => expect($('.guest-list tbody tr:nth-child(2)').textContent).toContain('✓ Sent'));
  });

  it('Send via Claude with an empty template complains and sends nothing', () => {
    const f = seedDinner();
    route.params = { id: '1' };
    mountViewer();
    fireEvent.click(button('⚡ Send via Claude'));
    expect(getStatus().msg).toBe('Paste your invite template first');
    expect(f.calls()).toHaveLength(0);
  });

  it('Sync RSVPs sends the pasted text', async () => {
    const f = seedDinner({ handler: async (url) => (url.includes('sync-rsvps') ? okResponse({ updated: 3 }) : null) });
    route.params = { id: '1' };
    mountViewer();
    fireEvent.change(field('rsvp-email-text-1'), { target: { value: 'Bob: yes' } });
    fireEvent.click(button('⚡ Sync RSVPs'));
    await waitFor(() => expect(getStatus().msg).toBe('RSVPs synced — 3 updates'));
    expect(f.calls().find((c) => c.url.includes('sync-rsvps')).body).toEqual({ eventId: 1, emailText: 'Bob: yes' });
    expect(reload.syncData).toHaveBeenCalled();
  });

  it('Copy prompt writes the prompt to the clipboard; without a template it complains', async () => {
    seedDinner();
    const writeText = vi.fn(async () => {});
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    route.params = { id: '1' };
    mountViewer();
    fireEvent.click(button('📧 Copy prompt'));
    expect(getStatus().msg).toBe('Please paste your invite template first');
    expect(writeText).not.toHaveBeenCalled();
    fireEvent.change(field('invite-tmpl-1'), { target: { value: 'Hi' } });
    fireEvent.click(button('📧 Copy prompt'));
    expect(writeText).toHaveBeenCalledWith('Send invites for the event "Annual Dinner" (ID: 1). Here is the invite template:\n\nHi');
    await waitFor(() => expect(getStatus().msg).toBe('Prompt copied — paste it into Claude chat to send invites'));
    fireEvent.click(button('↻ Copy prompt'));
    expect(writeText).toHaveBeenLastCalledWith('Sync RSVPs for the event "Annual Dinner" (ID: 1)');
    await waitFor(() => expect(getStatus().msg).toBe('Prompt copied — paste it into Claude chat to sync RSVPs'));
  });

  it('Edit closes the viewer and opens the form filled with the event', () => {
    seedDinner();
    route.params = { id: '1' };
    mountViewer();
    fireEvent.click(button('Edit'));
    expect(route.back).toHaveBeenCalled();
    expect($('#mo-ef').classList.contains('open')).toBe(true);
    expect($('#mo-ef .mti').textContent).toBe('Edit Event');
    expect(field('ef-title-f').value).toBe('Annual Dinner');
    expect(field('ef-type-f').value).toBe('Party');
    expect(field('ef-date').value).toBe('2026-12-01');
  });

  it('on a direct visit (framed) Edit leaves the page alone, and Close goes to /events', () => {
    seedDinner();
    route.params = { id: '1' };
    mountViewer(true);
    expect($('.tp.active .mb')).not.toBeNull();
    expect($('#mo-edet')).toBeNull();
    fireEvent.click(button('Edit'));
    expect(route.back).not.toHaveBeenCalled();
    expect($('#mo-ef').classList.contains('open')).toBe(true);
    fireEvent.click($('.tp.active .mx'));
    expect(history.at(-1)).toEqual({ kind: 'push', href: '/events' });
  });

  it('an id that is not a loaded event shows a message in place of the card, never a crash', () => {
    setup({ url: '/events/404', events: [makeEvent()] });
    route.params = { id: '404' };
    mountViewer(true);
    expect($('.tp.active').textContent).toContain('Event not found');
    expect($$('.guest-list')).toHaveLength(0);
    cleanup();
    route.params = { id: 'abc' };
    mountViewer();
    expect($('#mo-edet').textContent).toContain('Event not found');
    expect(button('Edit')).toBeUndefined();
    expect(button('Close')).toBeDefined();
  });

  it('says Loading… (not "not found") while the data has not arrived', () => {
    setup({ url: '/events/1', events: [] });
    store.setState({ dataLoaded: false });
    route.params = { id: '1' };
    mountViewer();
    expect($('#edet-body').textContent).toContain('Loading…');
  });

  it('+ Add Guest closes the viewer and opens the guest form with the contacts to pick from', () => {
    seedDinner({ contacts: [{ id: 5, name: 'Cara', org: 'Acme', email: 'c@x.com, d@x.com', phone: '99' }] });
    route.params = { id: '1' };
    mountViewer();
    fireEvent.click(button('+ Add Guest'));
    expect(route.back).toHaveBeenCalled();
    expect($('#mo-guest').classList.contains('open')).toBe(true);
    expect($$('#g-contact option').map((o) => o.textContent)).toEqual(['— External guest —', 'Cara — Acme']);
    fireEvent.change(field('g-contact'), { target: { value: '5' } });
    expect(field('g-name').value).toBe('Cara');
    expect(field('g-email').value).toBe('c@x.com');
    expect(field('g-phone').value).toBe('99');
    fireEvent.change(field('g-contact'), { target: { value: '' } });
    expect(field('g-name').value).toBe('');
    expect(field('g-email').value).toBe('');
  });

  it('saving the guest form adds the guest and shows the event again; an empty name keeps the form open', async () => {
    const f = seedDinner({ handler: async (url, init) => (init.method === 'POST' ? okResponse([{ id: 50, event_id: 1, name: 'Eve', rsvp: 'Pending', plus_one: 0 }]) : null) });
    route.params = { id: '1' };
    mountViewer();
    fireEvent.click(button('+ Add Guest'));
    fireEvent.click($$('#mo-guest .mf button').find((b) => b.textContent === 'Add Guest'));
    expect(getStatus()).toMatchObject({ kind: 'error', msg: 'Guest name is required' });
    expect($('#mo-guest').classList.contains('open')).toBe(true);
    expect(f.calls()).toHaveLength(0);
    type('g-name', 'Eve');
    fireEvent.click($$('#mo-guest .mf button').find((b) => b.textContent === 'Add Guest'));
    expect($('#mo-guest').classList.contains('open')).toBe(false);
    await waitFor(() => expect(guest(50)).toBeDefined());
    expect(history.at(-1)).toEqual({ kind: 'push', href: '/events/1' });
  });

  it('removing a guest asks first, then deletes and shows the event again', async () => {
    const f = seedDinner({ handler: async (url, init) => (init.method === 'DELETE' ? okResponse([{ id: 2 }]) : null) });
    route.params = { id: '1' };
    mountViewer();
    fireEvent.click($('.guest-list tbody tr:nth-child(2) button'));
    expect(route.back).toHaveBeenCalled();
    const dlg = $('#mo-del-guest');
    expect(dlg.classList.contains('open')).toBe(true);
    expect(dlg.textContent).toContain('Remove guest from this event?');
    expect(dlg.textContent).toContain('Bob');
    expect(dlg.textContent).toContain('bob@x');
    expect(f.calls()).toHaveLength(0);
    fireEvent.click(button('Delete permanently', dlg));
    await waitFor(() => expect(store.getState().guests.map((x) => x.id)).toEqual([1, 3, 4]));
    expect(writes(f.calls())[0].url).toContain('/rest/v1/event_guests?id=eq.2');
    expect(history.at(-1)).toEqual({ kind: 'push', href: '/events/1' });
  });

  it('Delete event lists the guest count, then deletes the guests and the event', async () => {
    const f = seedDinner({ handler: async (url, init) => (init.method === 'DELETE' ? okResponse([{}]) : null) });
    route.params = { id: '1' };
    mountViewer();
    fireEvent.click(button('Delete event'));
    expect(route.back).toHaveBeenCalled();
    const dlg = $('#mo-del-event');
    expect(dlg.textContent).toContain('Permanently delete this event?');
    expect(dlg.textContent).toContain('Annual Dinner · Party');
    expect(dlg.textContent).toContain('This will also remove 4 guest records.');
    expect(dlg.textContent).toContain('This cannot be undone.');
    fireEvent.click(button('Delete permanently', dlg));
    await waitFor(() => expect(store.getState().events).toHaveLength(0));
    const urls = writes(f.calls()).map((c) => c.url.replace('https://example.supabase.co/rest/v1/', ''));
    expect(urls.slice(0, 4).sort()).toEqual(['event_guests?id=eq.1', 'event_guests?id=eq.2', 'event_guests?id=eq.3', 'event_guests?id=eq.4']);
    expect(urls[4]).toBe('events?id=eq.1');                                  // the event goes after its guests
    expect(store.getState().guests).toHaveLength(0);
    expect(getStatus().msg).toBe('Event deleted');
  });

  it('a single guest is "1 guest record"; no guests, no line', () => {
    setup({ events: [makeEvent()], guests: [makeGuest()] });
    render(<EventFormProvider><Opener id={1} fn="confirmDeleteEvent" /></EventFormProvider>);
    fireEvent.click(button('go'));
    expect($('#mo-del-event').textContent).toContain('This will also remove 1 guest record.');
    cleanup();
    setup({ events: [makeEvent()], guests: [] });
    render(<EventFormProvider><Opener id={1} fn="confirmDeleteEvent" /></EventFormProvider>);
    fireEvent.click(button('go'));
    expect($('#mo-del-event').textContent).not.toContain('This will also remove');
  });

  it('a failing delete is reported and the event stays', async () => {
    seedDinner({ handler: async (url, init) => (init.method === 'DELETE' ? failResponse('rls') : null) });
    route.params = { id: '1' };
    mountViewer();
    fireEvent.click(button('Delete event'));
    fireEvent.click(button('Delete permanently', $('#mo-del-event')));
    await waitFor(() => expect(getStatus().kind).toBe('error'));
    expect(getStatus().msg).toMatch(/^Delete failed: /);
    expect(store.getState().events).toHaveLength(1);
  });

  it('a view-only user keeps the old controls, and every write is refused with the view-only sentence', async () => {
    const f = seedDinner({ viewer: true });
    route.params = { id: '1' };
    mountViewer();
    expect(button('Edit')).toBeDefined();
    fireEvent.change($('.guest-list tbody tr:nth-child(2) .rsvp-sel'), { target: { value: 'Yes' } });
    await waitFor(() => expect(getStatus().msg).toContain(READ_ONLY));
    expect(guest(2).rsvp).toBe('No');
    expect(f.calls()).toHaveLength(0);
  });
});

/* a button that opens a provider dialog directly (the deletes are normally reached through the viewer) */
function Opener({ id, fn }) {
  const form = useEventForm();
  return <button type="button" onClick={() => form[fn](id)}>go</button>;
}

/* ── the forms ───────────────────────────────────────────────────────────────── */

describe('the event form', () => {
  function FormHost() {
    const { openAdd } = useEventForm();
    return <button type="button" onClick={openAdd}>new</button>;
  }
  const open = () => { render(<EventFormProvider><FormHost /></EventFormProvider>); fireEvent.click(button('new')); };

  it('opens blank as "Create Event" with the old options', () => {
    setup({});
    open();
    expect($('#mo-ef').classList.contains('open')).toBe(true);
    expect($('#mo-ef .mti').textContent).toBe('Create Event');
    expect(field('ef-title-f').value).toBe('');
    expect($$('#ef-type-f option').map((o) => o.textContent)).toEqual(['Birthday', 'Party', 'Cricket', 'Golf', 'Other']);
    expect(field('ef-type-f').value).toBe('Birthday');
    expect($$('#ef-status-f option').map((o) => o.textContent)).toEqual(['Draft', 'Invites Sent', 'Completed', 'Cancelled']);
    expect(field('ef-status-f').value).toBe('Draft');
    expect(field('ef-date').type).toBe('date');
    expect(field('ef-time').placeholder).toBe('e.g. 7:30 PM');
    expect($$('#mo-ef .mf button').map((b) => b.textContent)).toEqual(['Save Event', 'Cancel']);
  });

  it('without a title nothing is written and the form stays open', () => {
    const f = setup({});
    open();
    fireEvent.click(button('Save Event'));
    expect(getStatus()).toMatchObject({ kind: 'error', msg: 'Event title is required' });
    expect($('#mo-ef').classList.contains('open')).toBe(true);
    expect(f.calls()).toHaveLength(0);
  });

  it('a new event is inserted with created_by, closes the form, and joins the list', async () => {
    const f = setup({ handler: async (url, init) => (init.method === 'POST' ? okResponse([{ id: 9, title: 'Picnic', type: 'Party', status: 'Draft', date: null, time: '', venue: 'Park', description: '' }]) : null) });
    open();
    type('ef-title-f', '  Picnic ');
    type('ef-type-f', 'Party');
    type('ef-venue', 'Park');
    fireEvent.click(button('Save Event'));
    expect($('#mo-ef').classList.contains('open')).toBe(false);
    await waitFor(() => expect(evt(9)).toBeDefined());
    const w = writes(f.calls());
    expect(w).toHaveLength(1);
    expect(w[0].method).toBe('POST');
    expect(w[0].url).toContain('/rest/v1/events');
    expect(w[0].body).toEqual({ title: 'Picnic', type: 'Party', status: 'Draft', date: null, time: '', venue: 'Park', description: '', created_by: 'Me Myself' });
    expect(getStatus()).toMatchObject({ kind: 'online', msg: 'Event saved' });
  });

  it('an edit is a PATCH without created_by, and replaces the event in the list', async () => {
    const f = setup({ events: [makeEvent()], handler: async (url, init) => (init.method === 'PATCH' ? okResponse([{ id: 1, title: 'Renamed', type: 'Golf', status: 'Completed', date: '2026-12-02', time: '', venue: '', description: '' }]) : null) });
    function Edit() { const { openEdit } = useEventForm(); return <button type="button" onClick={() => openEdit(1)}>edit</button>; }
    render(<EventFormProvider><Edit /></EventFormProvider>);
    fireEvent.click(button('edit'));
    expect($('#mo-ef .mti').textContent).toBe('Edit Event');
    expect(field('ef-time').value).toBe('7:30 PM');
    type('ef-title-f', 'Renamed');
    type('ef-date', '');
    fireEvent.click(button('Save Event'));
    await waitFor(() => expect(evt(1).title).toBe('Renamed'));
    const w = writes(f.calls());
    expect(w[0].method).toBe('PATCH');
    expect(w[0].url).toContain('/rest/v1/events?id=eq.1');
    expect(w[0].body).toEqual({ title: 'Renamed', type: 'Party', status: 'Draft', date: null, time: '7:30 PM', venue: 'Lake House', description: '' });
    expect(store.getState().events).toHaveLength(1);
  });

  it('a missing table is named in the status bar; other failures say "Save failed"', async () => {
    setup({ handler: async () => failResponse('404 relation does not exist') });
    open();
    type('ef-title-f', 'X');
    fireEvent.click(button('Save Event'));
    await waitFor(() => expect(getStatus().kind).toBe('error'));
    expect(getStatus().msg).toBe('Events table not found — create it in Supabase first');
    cleanup();
    setup({ handler: async () => failResponse('rls denied') });
    open();
    type('ef-title-f', 'X');
    fireEvent.click(button('Save Event'));
    await waitFor(() => expect(getStatus().msg).toMatch(/^Save failed: /));
    expect(store.getState().events).toHaveLength(0);
  });

  it('a view-only user is refused before any request', async () => {
    const f = setup({ viewer: true });
    open();
    type('ef-title-f', 'X');
    fireEvent.click(button('Save Event'));
    await waitFor(() => expect(getStatus().msg).toContain(READ_ONLY));
    expect(f.calls()).toHaveLength(0);
    expect(store.getState().events).toHaveLength(0);
  });

  it('Cancel closes without writing', () => {
    const f = setup({});
    open();
    fireEvent.click(button('Cancel', $('#mo-ef')));
    expect($('#mo-ef').classList.contains('open')).toBe(false);
    expect(f.calls()).toHaveLength(0);
    expect(isMoOpen('mo-ef')).toBe(false);
  });
});
