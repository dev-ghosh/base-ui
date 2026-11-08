// Toasts, the alerts panel and the bell, useAlerts, the Sync button and the first-run tour offer. The real
// alerts / toasts / sync / load-data run; only fetch is stubbed. Expected values are worked out by hand from
// rie-dashboard2/js/notifications.js, js/app.js (syncNow, offerTourOnce) and js/shell.js (Esc).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent, waitFor, act, renderHook } from '@testing-library/react';

process.env.NEXT_PUBLIC_SB_URL = 'https://example.supabase.co';
process.env.NEXT_PUBLIC_SB_KEY = 'anon-key-123';

vi.mock('next/navigation', async () => (await import('./helpers/fake-router.js')).navigationMock);

import ToastHost from '@/features/notifications/ToastHost.jsx';
import AlertsPanel from '@/features/notifications/AlertsPanel.jsx';
import Header from '@/components/Header.jsx';
import { useAlerts, useAlertState } from '@/hooks/useAlerts.js';
import { pushNotification, openAlertsPanel } from '@/lib/seams.js';
import {
  alertsUi, closeAlertsPanel, resetAlertsSession, announceNewAlerts,
} from '@/features/notifications/alerts.js';
import { showToast, toastStore, clearToasts, TOAST_MS } from '@/features/notifications/toasts.js';
import { READ_KEY, SEEN_KEY } from '@/features/notifications/model.js';
import { offerTourOnce, cancelTourOffer, TOUR_OFFERED_KEY } from '@/features/help/tour-offer.js';
import { tourStore, TOUR_SEEN_KEY } from '@/features/help/tour.js';
import { syncNow, syncStore } from '@/lib/sync.js';
import { loadData } from '@/lib/load-data.js';
import { onSessionEnded } from '@/lib/user-data.js';
import { store } from '@/store/store.js';
import { getStatus } from '@/lib/status.js';
import { seed, stubFetch, okResponse, failResponse, makeTask, todayISO } from './helpers/fixtures.js';
import { history, resetNav } from './helpers/fake-router.js';

const ME = 'ME1';
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const toasts = () => toastStore.getState().toasts;

const esc = (o = {}) => ({
  id: 5, status: 'open', level: 2, assigned_to: ME, raised_by: 'OT1', task_title: 'Server migration', reason: 'Deadline at risk', created_at: '2026-11-09T10:00:00Z', ...o,
});
function setup({ tasks = [], escalations = [], access = { person_code: ME, can_write: true, is_admin: false }, extra = {} } = {}) {
  localStorage.clear();
  sessionStorage.clear();
  seed({ tasks, escalations, access, ...extra });
  clearToasts();
  resetAlertsSession();
  cancelTourOffer();
  resetNav('/today');
}
const overdue = (o = {}) => makeTask({ nextFollowUp: '2020-01-02', ...o });

beforeEach(() => { localStorage.clear(); sessionStorage.clear(); });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); clearToasts(); cancelTourOffer(); });

/* ── toasts ──────────────────────────────────────────────────────────────────── */

describe('toasts', () => {
  it('draws into #rie-toast-container (role=status, polite): title, message, a ✕, the type as a class', async () => {
    setup();
    render(<ToastHost />);
    const box = document.getElementById('rie-toast-container');
    expect(box.getAttribute('role')).toBe('status');
    expect(box.getAttribute('aria-live')).toBe('polite');
    act(() => { pushNotification('Task Updated', '"X" updated successfully', 'info'); pushNotification('Task not deleted', 'why', 'alert'); });
    const [a, b] = $$('.toast');
    expect(a.className.startsWith('toast info')).toBe(true);
    expect(b.className.startsWith('toast alert')).toBe(true);
    expect($('.toast-t', a).textContent).toBe('Task Updated');
    expect($('.toast-m', a).textContent).toBe('"X" updated successfully');
    expect($('.toast-x', a).getAttribute('aria-label')).toBe('Dismiss');
    await waitFor(() => expect(a.classList.contains('in')).toBe(true));   // fades in on the next frame
    expect(a.classList.contains('click')).toBe(false);
  });

  it('goes by itself after 5 seconds (fade, then removed)', async () => {
    setup();
    vi.useFakeTimers();
    render(<ToastHost />);
    act(() => { pushNotification('Hello', 'there'); });
    expect($$('.toast').length).toBe(1);
    act(() => { vi.advanceTimersByTime(TOAST_MS - 10); });
    expect($$('.toast').length).toBe(1);
    act(() => { vi.advanceTimersByTime(20); });
    expect($('.toast').classList.contains('in')).toBe(false);          // fading
    act(() => { vi.advanceTimersByTime(350); });
    expect($$('.toast').length).toBe(0);
  });

  it('the ✕ only dismisses: a clickable toast\'s own handler does not run', () => {
    setup();
    vi.useFakeTimers();
    render(<ToastHost />);
    const onClick = vi.fn();
    act(() => { showToast({ title: 'T', message: 'm', onClick }); });
    expect($('.toast').classList.contains('click')).toBe(true);
    fireEvent.click($('.toast-x'));
    expect(onClick).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(350); });
    expect($$('.toast').length).toBe(0);
  });

  it('clicking a clickable toast runs its handler and removes it at once', () => {
    setup();
    render(<ToastHost />);
    const onClick = vi.fn();
    act(() => { showToast({ title: 'T', message: 'm', onClick }); });
    fireEvent.click($('.toast-t'));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect($$('.toast').length).toBe(0);
  });

  it('text is text, never markup', () => {
    setup();
    render(<ToastHost />);
    act(() => { pushNotification('<b>bold</b>', '<img src=x onerror=alert(1)>'); });
    expect($('.toast-t').textContent).toBe('<b>bold</b>');
    expect($('.toast img')).toBeNull();
  });
});

/* ── the alerts panel ────────────────────────────────────────────────────────── */

describe('the alerts panel', () => {
  const scene = () => {
    const mine = [
      overdue({ id: 'a1', task: 'Pay the vendor', priority: 'P1' }),
      overdue({ id: 'a2', task: 'File the return' }),
      makeTask({ id: 'a3', task: 'Call back', nextFollowUp: todayISO(1) }),
    ];
    const notMine = [
      overdue({ id: 'b1', task: 'Olive\'s overdue', ownerCode: 'OT1', assignedTo: 'Olive Other' }),
      overdue({ id: 'b2', task: 'Same name different code', ownerCode: 'ZZ9', assignedTo: 'Me Myself' }),
    ];
    return { tasks: [...mine, ...notMine], escalations: [esc(), esc({ id: 6, assigned_to: 'OT1', task_title: 'Not for me' })] };
  };
  const mount = () => render(<AlertsPanel />);

  it('is closed until opened (the bell / Help call openAlertsPanel); the scrim and ✕ close it', () => {
    setup(scene());
    mount();
    expect($('#alerts-panel').classList.contains('open')).toBe(false);
    expect($('#alerts-scrim').classList.contains('open')).toBe(false);
    act(() => { openAlertsPanel(); });
    expect($('#alerts-panel').classList.contains('open')).toBe(true);
    expect($('#alerts-scrim').classList.contains('open')).toBe(true);
    fireEvent.click($('#alerts-scrim'));
    expect($('#alerts-panel').classList.contains('open')).toBe(false);
    act(() => { openAlertsPanel(); });
    fireEvent.click($('[aria-label="Close alerts"]'));
    expect(alertsUi.getState().open).toBe(false);
  });

  it('Esc closes it', () => {
    setup(scene());
    mount();
    act(() => { openAlertsPanel(); });
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(alertsUi.getState().open).toBe(false);
  });

  it('shows ONLY what is assigned to me, grouped, with counts and the urgent / kind classes', () => {
    setup(scene());
    mount();
    expect($('.al-head h2').textContent).toBe('Alerts');
    expect($('.al-head p').textContent).toBe('Only what is assigned to you');
    expect($$('.al-group h3').map((h) => h.textContent)).toEqual(['Waiting on you1', 'Overdue2', 'Coming up1']);
    const items = $$('.al-item');
    expect(items.map((i) => $('.al-title', i).textContent)).toEqual(['Server migration', 'Pay the vendor', 'File the return', 'Call back']);
    expect($('.al-sub', items[0]).textContent).toBe('Escalated to you by Olive Other · Deadline at risk');
    expect(items[0].className).toBe('al-item urgent k-escalation');
    expect(items[1].className).toBe('al-item urgent k-overdue');
    expect(items[2].className).toBe('al-item k-overdue');
    expect(items[3].className).toBe('al-item k-soon');
    expect($('.al-sub', items[1]).textContent.endsWith(' · P1')).toBe(true);
    const text = $('#alerts-body').textContent;
    expect(text).not.toContain('Olive\'s overdue');
    expect(text).not.toContain('Same name different code');   // matching is by person code, never by name
    expect(text).not.toContain('Not for me');
  });

  it('the filter: All / Unread with counts; opening an alert marks it read, closes the panel and goes to the task', () => {
    setup(scene());
    mount();
    act(() => { openAlertsPanel(); });
    const seg = $$('#alerts-seg button');
    expect(seg.map((b) => b.textContent)).toEqual(['All4', 'Unread4']);
    expect(seg[0].className).toBe('on');
    fireEvent.click(seg[1]);
    expect($$('#alerts-seg button').map((b) => b.className)).toEqual(['', 'on']);

    fireEvent.click($$('.al-item').find((i) => $('.al-title', i).textContent === 'File the return'));
    expect(history.at(-1)).toEqual({ kind: 'push', href: '/work/tasks/a2' });
    expect(alertsUi.getState().open).toBe(false);
    expect(JSON.parse(localStorage.getItem(READ_KEY(ME)))).toEqual(['overdue:a2:2020-01-02']);
    expect($$('#alerts-seg button').map((b) => b.textContent)).toEqual(['All4', 'Unread3']);
    act(() => { openAlertsPanel(); });
    expect($$('.al-item').map((i) => $('.al-title', i).textContent)).not.toContain('File the return');   // Unread filter hides it
    fireEvent.click($$('#alerts-seg button')[0]);
    const read = $$('.al-item').find((i) => $('.al-title', i).textContent === 'File the return');
    expect(read.classList.contains('read')).toBe(true);
  });

  it('an escalation alert goes to the Escalations page', () => {
    setup(scene());
    mount();
    fireEvent.click($$('.al-item')[0]);
    expect(history.at(-1)).toEqual({ kind: 'push', href: '/escalations' });
  });

  it('Mark all read: hidden when nothing is unread; clears the unread count and the unread view', () => {
    setup(scene());
    mount();
    const btn = $('#alerts-readall');
    expect(btn.hidden).toBe(false);
    expect(btn.textContent).toBe('Mark all read');
    fireEvent.click(btn);
    expect($('#alerts-readall').hidden).toBe(true);
    expect($$('#alerts-seg button').map((b) => b.textContent)).toEqual(['All4', 'Unread0']);
    expect(JSON.parse(localStorage.getItem(READ_KEY(ME))).length).toBe(4);
    fireEvent.click($$('#alerts-seg button')[1]);
    expect($('.empty-state h2').textContent).toBe('You are all caught up');
    expect($('.empty-state p').textContent).toBe('Alerts appear when something is assigned to you, becomes overdue, or is escalated to you.');
  });

  it('with nothing assigned: "Nothing needs you right now"', () => {
    setup({ tasks: [overdue({ ownerCode: 'OT1' })] });
    mount();
    expect($('.empty-state h2').textContent).toBe('Nothing needs you right now');
    expect($('.empty-ic').textContent).toBe('✓');
  });

  it('a sign-in not linked to a person gets the explanation and no alerts at all', () => {
    setup({ ...scene(), access: { person_code: null, can_write: true } });
    mount();
    expect($('.empty-state h2').textContent).toBe('Your sign-in is not linked to a person');
    expect($('.empty-state p').textContent).toBe('Alerts follow the work assigned to you. Ask an admin to link your sign-in to your name in Manage access.');
    expect($$('.al-item').length).toBe(0);
    expect($('#alerts-readall').hidden).toBe(true);
  });

  it('the footer goes to the notification settings and closes the panel', () => {
    setup(scene());
    mount();
    act(() => { openAlertsPanel(); });
    fireEvent.click($$('.al-foot button').find((b) => b.textContent === 'E-mail & alert settings'));
    expect(history.at(-1)).toEqual({ kind: 'push', href: '/profile/notifications' });
    expect(alertsUi.getState().open).toBe(false);
  });

  it('follows the data: a realtime change redraws it', () => {
    setup(scene());
    mount();
    expect($$('.al-item').length).toBe(4);
    act(() => { store.setState({ escalations: [] }); });
    expect($$('.al-item').length).toBe(3);
  });
});

/* ── useAlerts ───────────────────────────────────────────────────────────────── */

describe('useAlerts(me)', () => {
  it('assigned-to-me only, by person code: someone else\'s task and a same-name different-code task give nothing', () => {
    setup({ tasks: [
      overdue({ id: 'm1' }), overdue({ id: 'o1', ownerCode: 'OT1' }), overdue({ id: 'n1', ownerCode: 'ZZ9', assignedTo: 'Me Myself' }),
      overdue({ id: 'c1', ownerCode: 'OT1', coOwnerCodes: [ME] }),
    ] });
    const { result } = renderHook(() => useAlerts(ME));
    expect(result.current.map((a) => a.go.id).sort()).toEqual(['c1', 'm1']);
    expect(renderHook(() => useAlerts('OT1')).result.current.map((a) => a.go.id).sort()).toEqual(['c1', 'o1']);
    expect(renderHook(() => useAlerts(null)).result.current).toEqual([]);
  });

  it('draws again when the store changes, and useAlertState counts the unread', () => {
    setup({ tasks: [overdue({ id: 'm1' })] });
    const { result } = renderHook(() => useAlertState(ME));
    expect(result.current.unread).toBe(1);
    act(() => { store.setState({ tasks: [...store.getState().tasks, overdue({ id: 'm2' })] }); });
    expect(result.current.alerts.length).toBe(2);
    expect(result.current.unread).toBe(2);
    act(() => { localStorage.setItem(READ_KEY(ME), JSON.stringify(['overdue:m1:2020-01-02'])); alertsUi.setState((s) => ({ version: s.version + 1 })); });
    expect(result.current.unread).toBe(1);
  });
});

/* ── the header bell ─────────────────────────────────────────────────────────── */

describe('the bell', () => {
  const mount = () => render(<Header session={{ displayName: 'Me Myself', email: 'me@example.com' }} onSignOut={() => {}} />);
  const badge = () => $('#notif-btn .dot-badge');

  it('shows the number of unread alerts (9+ above nine), hidden at zero, and marks the bell', () => {
    setup({ tasks: [] });
    mount();
    expect(badge().hidden).toBe(true);
    expect($('#notif-btn').classList.contains('has-alerts')).toBe(false);
    act(() => { store.setState({ tasks: [overdue({ id: 'm1' }), overdue({ id: 'm2' }), overdue({ id: 'm3' })] }); });
    expect(badge().hidden).toBe(false);
    expect(badge().textContent).toBe('3');
    expect($('#notif-btn').classList.contains('has-alerts')).toBe(true);
    act(() => { store.setState({ tasks: Array.from({ length: 11 }, (_, i) => overdue({ id: 'x' + i })) }); });
    expect(badge().textContent).toBe('9+');
  });

  it('counts only unread: reading everything empties it', () => {
    setup({ tasks: [overdue({ id: 'm1' })], escalations: [esc()] });
    mount();
    expect(badge().textContent).toBe('2');
    act(() => { localStorage.setItem(READ_KEY(ME), JSON.stringify(['esc:5:2', 'overdue:m1:2020-01-02'])); alertsUi.setState((s) => ({ version: s.version + 1 })); });
    expect(badge().hidden).toBe(true);
  });

  it('is empty for someone else\'s work and for an unlinked sign-in', () => {
    setup({ tasks: [overdue({ id: 'o1', ownerCode: 'OT1' })], access: { person_code: null, can_write: true } });
    mount();
    expect(badge().hidden).toBe(true);
  });

  it('opens the panel, and aria-expanded follows it', () => {
    setup({ tasks: [overdue({ id: 'm1' })] });
    render(<><Header session={{ displayName: 'Me Myself', email: 'me@example.com' }} onSignOut={() => {}} /><AlertsPanel /></>);
    expect($('#notif-btn').getAttribute('aria-expanded')).toBe('false');
    fireEvent.click($('#notif-btn'));
    expect($('#alerts-panel').classList.contains('open')).toBe(true);
    expect($('#notif-btn').getAttribute('aria-expanded')).toBe('true');
    act(() => { closeAlertsPanel(); });
    expect($('#notif-btn').getAttribute('aria-expanded')).toBe('false');
  });
});

/* ── announcing new alerts ───────────────────────────────────────────────────── */

describe('announcing', () => {
  it('a realtime arrival toasts once, only for work assigned to me, and clicking the toast opens the panel', () => {
    setup({ tasks: [] });
    announceNewAlerts();
    expect(toasts()).toEqual([]);
    act(() => { store.setState({ tasks: [overdue({ id: 'o1', ownerCode: 'OT1' })] }); });
    announceNewAlerts();
    expect(toasts()).toEqual([]);                                  // someone else's: nobody hears
    act(() => { store.setState({ tasks: [overdue({ id: 'o1', ownerCode: 'OT1' }), overdue({ id: 'm1', task: 'Mine now', priority: 'P1' })] }); });
    announceNewAlerts();
    announceNewAlerts();
    expect(toasts().map((t) => [t.title, t.message, t.type])).toEqual([['Overdue', 'Mine now', 'alert']]);
    toasts()[0].onClick();
    expect(alertsUi.getState().open).toBe(true);
  });

  it('loadData announces once, as a summary, then the first-run tour offer follows', async () => {
    setup({ tasks: [] });
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const t1 = overdue({ id: 'e1', task: 'One' }); const t2 = overdue({ id: 'e2', task: 'Two' });
    stubFetch((url) => {
      if (url.includes('/rest/v1/entities?tier=eq.task')) return okResponse([
        { id: 'e1', tier: 'task', title: t1.task, status: 'pending', owner_code: ME, next_follow_up: '2020-01-02', priority: 'P2' },
        { id: 'e2', tier: 'task', title: t2.task, status: 'pending', owner_code: ME, next_follow_up: '2020-01-02', priority: 'P2' },
      ]);
      return undefined;
    });
    expect(await loadData()).toBe(true);
    expect(store.getState().escalationsLoaded).toBe(true);
    expect(toasts().map((t) => t.title)).toEqual(['2 alerts for you']);
    expect(toasts()[0].message).toBe('Open the bell to see them.');
    expect(localStorage.getItem(SEEN_KEY(ME))).not.toBeNull();     // the seen-tasks baseline was written
    act(() => { vi.advanceTimersByTime(2500); });
    expect(toasts().map((t) => t.title)).toEqual(['2 alerts for you', 'New to BASE?']);
  });

  it('sign-out clears the toasts and forgets what was announced', () => {
    setup({ tasks: [overdue({ id: 'm1' })] });
    announceNewAlerts();
    expect(toasts().length).toBe(1);
    onSessionEnded();
    expect(toasts()).toEqual([]);
    store.setState({ access: { person_code: ME }, tasks: [overdue({ id: 'm1' })] });
    announceNewAlerts();
    expect(toasts().length).toBe(1);                               // announced again for the next sign-in
  });
});

/* ── the first-run tour offer ────────────────────────────────────────────────── */

describe('the "New to BASE?" tour offer', () => {
  beforeEach(() => { setup(); vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }); tourStore.setState({ open: false, step: 0 }); });

  it('toasts 2.5 s after the first load of a session; clicking it starts the tour', () => {
    offerTourOnce();
    expect(toasts()).toEqual([]);
    act(() => { vi.advanceTimersByTime(2499); });
    expect(toasts()).toEqual([]);
    act(() => { vi.advanceTimersByTime(2); });
    expect(toasts().map((t) => [t.title, t.message, t.type])).toEqual([['New to BASE?', 'Take the 2-minute tour. Tap here to start.', 'info']]);
    expect(sessionStorage.getItem(TOUR_OFFERED_KEY)).toBe('1');
    toasts()[0].onClick();
    expect(tourStore.getState()).toMatchObject({ open: true, step: 0 });
  });

  it('only once per session', () => {
    offerTourOnce(); offerTourOnce();
    act(() => { vi.advanceTimersByTime(3000); });
    expect(toasts().length).toBe(1);
    offerTourOnce();
    act(() => { vi.advanceTimersByTime(3000); });
    expect(toasts().length).toBe(1);
  });

  it('never when the tour has been finished before', () => {
    localStorage.setItem(TOUR_SEEN_KEY, '1');
    offerTourOnce();
    act(() => { vi.advanceTimersByTime(3000); });
    expect(toasts()).toEqual([]);
    expect(sessionStorage.getItem(TOUR_OFFERED_KEY)).toBeNull();
  });

  it('a pending offer does not survive sign-out', () => {
    offerTourOnce();
    onSessionEnded();
    act(() => { vi.advanceTimersByTime(3000); });
    expect(toasts()).toEqual([]);
  });
});

/* ── the Sync button ─────────────────────────────────────────────────────────── */

describe('the Sync button', () => {
  const mount = () => render(<Header session={{ displayName: 'Me Myself', email: 'me@example.com' }} onSignOut={() => {}} />);
  const ACCESS = { person_code: ME, can_write: true, is_admin: false, task_scope: 'all' };

  it('re-reads access, then reloads the data, then says "Synced"; spins and is aria-busy meanwhile; a second click is ignored', async () => {
    setup({ tasks: [] });
    let release;
    const gate = new Promise((r) => { release = r; });
    const f = stubFetch(async (url) => {
      if (url.includes('/rpc/rie_my_access')) return okResponse([{ ...ACCESS, can_write: false }]);
      if (url.includes('/rest/v1/contacts')) { await gate; return okResponse([]); }
      return undefined;
    });
    mount();
    fireEvent.click($('#sync-btn'));
    await waitFor(() => expect($('#sync-btn').classList.contains('spinning')).toBe(true));
    expect($('#sync-btn').getAttribute('aria-busy')).toBe('true');
    fireEvent.click($('#sync-btn'));                                   // already running
    release();
    await waitFor(() => expect(toasts().map((t) => t.title)).toEqual(['Synced']));
    expect(toasts()[0].message).toBe('You are looking at the latest.');
    expect(toasts()[0].type).toBe('info');
    expect($('#sync-btn').classList.contains('spinning')).toBe(false);
    expect($('#sync-btn').getAttribute('aria-busy')).toBeNull();
    const calls = f.calls().map((c) => c.url);
    expect(calls[0]).toBe('https://example.supabase.co/rest/v1/rpc/rie_my_access');             // access first
    expect(calls.filter((u) => u.includes('/rpc/rie_my_access')).length).toBe(1);
    expect(calls.some((u) => u.includes('/rest/v1/contacts'))).toBe(true);                       // then the data
    expect(calls.filter((u) => u.includes('/rest/v1/contacts')).length).toBe(1);
    expect(store.getState().access.can_write).toBe(false);                                        // a role change shows up without a reload
    expect(store.getState().accessLoaded).toBe(true);
    expect(syncStore.getState().busy).toBe(false);
  });

  it('says "Could not sync" (warm) when the server did not answer, and shows what was loaded last', async () => {
    setup({ tasks: [] });
    stubFetch((url) => {
      if (url.includes('/rpc/rie_my_access')) return okResponse([ACCESS]);
      if (url.includes('/rest/v1/contacts')) return failResponse('down', 503);
      return undefined;
    });
    mount();
    fireEvent.click($('#sync-btn'));
    await waitFor(() => expect(toasts().map((t) => t.title)).toEqual(['Could not sync']));
    expect(toasts()[0]).toMatchObject({ message: 'Check your connection. Showing what was last loaded.', type: 'alert' });
    expect(getStatus().kind).toBe('error');
  });

  it('the account menu\'s "Sync now" does the same', async () => {
    setup({ tasks: [] });
    stubFetch((url) => (url.includes('/rpc/rie_my_access') ? okResponse([ACCESS]) : undefined));
    mount();
    fireEvent.click($('#user-chip'));
    fireEvent.click($$('#user-menu button').find((b) => b.textContent === 'Sync now'));
    await waitFor(() => expect(toasts().map((t) => t.title)).toEqual(['Synced']));
  });

  it('on Team and Expenses it also re-fetches the tables those screens keep for themselves', async () => {
    setup({ tasks: [] });
    const f = stubFetch((url) => (url.includes('/rpc/rie_my_access') ? okResponse([ACCESS]) : undefined));
    await syncNow('/team/cards');
    expect(f.calls().some((c) => c.url.includes('/rest/v1/employees?'))).toBe(true);
    expect(f.calls().some((c) => c.url.includes('/rest/v1/expenses?'))).toBe(false);
    f.fn.mockClear();
    await syncNow('/expenses');
    expect(f.calls().some((c) => c.url.includes('/rest/v1/expenses?'))).toBe(true);
    expect(f.calls().some((c) => c.url.includes('/rest/v1/cards?'))).toBe(true);
    expect(f.calls().some((c) => c.url.includes('/rest/v1/employees?'))).toBe(false);
    f.fn.mockClear();
    await syncNow('/today');
    expect(f.calls().some((c) => /employees|expenses\?/.test(c.url))).toBe(false);
  });

  it('a failed access read fails closed (read-only), as the old loadMyAccess did; the shell stays up', async () => {
    setup({ tasks: [] });
    stubFetch((url) => (url.includes('/rpc/rie_my_access') ? failResponse('boom', 500) : undefined));
    await syncNow('/today');
    expect(store.getState().access).toBeNull();
    expect(store.getState().accessLoaded).toBe(true);
  });
});
