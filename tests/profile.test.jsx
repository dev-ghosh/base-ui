// Profile & settings: four sections as route segments, preferences saved to user_prefs (or this device),
// the access summary, the security actions, and /profile?pair=1 opening "Sign in another device".
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent, screen, act, within } from '@testing-library/react';

process.env.NEXT_PUBLIC_SB_URL = 'https://example.supabase.co';
process.env.NEXT_PUBLIC_SB_KEY = 'anon-key-123';

vi.mock('next/navigation', async () => (await import('./helpers/fake-router.js')).navigationMock);
vi.mock('next/link', async () => (await import('./helpers/fake-router.js')).linkMock);
vi.mock('@/lib/devicepair.js', async (importOriginal) => ({
  ...(await importOriginal()),
  startPairing: vi.fn(async () => ({ pairingId: 'p1', code: 'ABCDEFGHJKLM', expiresAt: new Date(Date.now() + 180000).toISOString() })),
  pairingStatus: vi.fn(async () => ({ found: true, claimed: false, expired: false })),
  cancelPairing: vi.fn(() => Promise.resolve()),
  buildQr: vi.fn(async () => ({ size: 33, d: 'M4 4h1v1h-1z' })),
}));
vi.mock('@/lib/load-data.js', () => ({ syncData: vi.fn(async () => true), loadData: vi.fn(async () => true) }));
vi.mock('@/lib/export-excel.js', () => ({ exportToExcel: vi.fn() }));

import ProfileScreen from '@/features/profile/ProfileScreen.jsx';
import ProfilePage from '@/app/(app)/profile/page.jsx';
import PairOverlay from '@/features/auth/PairOverlay.jsx';
import { SignOutProvider } from '@/hooks/useSignOut.jsx';
import { store } from '@/store/store.js';
import { isMoOpen } from '@/lib/modals.js';
import * as dp from '@/lib/devicepair.js';
import * as loader from '@/lib/load-data.js';
import * as xl from '@/lib/export-excel.js';
import { seed, stubFetch, failResponse, okResponse } from './helpers/fixtures.js';
import { history, resetNav, currentUrl } from './helpers/fake-router.js';
import { tourStore } from '@/features/help/tour.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const SESSION = { email: 'me@x.test', displayName: 'Me Myself' };
const ACCESS = {
  email: 'me@x.test', display_name: 'Me Myself', role: 'member', can_write: true, is_admin: false,
  person_code: 'ME1', task_scope: 'assigned', extra_access: ['leads'], companies: ['Acme'],
};
const mem = new Map();

function mount(segment = 'general', over = {}) {
  seed({ access: { ...ACCESS, ...over }, prefs: null });
  window.matchMedia = vi.fn((q) => ({ matches: q.includes('min-width: 1024px'), media: q, addEventListener() {}, removeEventListener() {} }));
  resetNav('/profile/' + segment);
  return render(<><ProfileScreen segment={segment} session={SESSION} /><PairOverlay /></>);
}

beforeEach(() => {
  vi.stubGlobal('localStorage', {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => { mem.set(k, String(v)); },
    removeItem: (k) => { mem.delete(k); },
  });
  mem.clear();
  mem.set('rie_session', JSON.stringify({ accessToken: 't', userId: 'u1', email: 'me@x.test', expiresAt: Date.parse('2026-11-12T10:00:00Z') }));
  tourStore.setState({ open: false, step: 0 });
  vi.clearAllMocks();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('Profile: the frame and the four sections', () => {
  it('has the title, the saved flag and a nav of four sections with the active one marked', () => {
    stubFetch();
    mount('notifications');
    expect($('#tab-profile .pg-head h1').textContent).toBe('Profile & settings');
    expect($('#pf-saved').getAttribute('role')).toBe('status');
    const nav = $$('.pf-nav button');
    expect(nav.map((b) => b.textContent)).toEqual(['Profile', 'Notifications', 'Appearance', 'Security']);
    expect(nav.map((b) => b.className)).toEqual(['', 'on', '', '']);
    expect(nav[1].getAttribute('aria-current')).toBe('true');
  });

  it('a nav button goes to its segment (general for "Profile") and the choice is remembered under the old key', () => {
    stubFetch();
    mount('general');
    expect(mem.get('rie_profile_tab')).toBe('profile');
    fireEvent.click(screen.getByRole('button', { name: 'Security' }));
    expect(history.at(-1).href).toBe('/profile/security');
    cleanup();
    mount('security');
    expect(mem.get('rie_profile_tab')).toBe('security');
  });

  it('/profile goes to the remembered section, else general, and keeps the query', () => {
    resetNav('/profile?pair=1');
    mem.set('rie_profile_tab', 'appearance');
    render(<ProfilePage />);
    expect(history.at(-1)).toEqual({ kind: 'replace', href: '/profile/appearance' + window.location.search });
    cleanup();
    resetNav('/profile');
    mem.delete('rie_profile_tab');
    render(<ProfilePage />);
    expect(history.at(-1).href.startsWith('/profile/general')).toBe(true);
  });
});

describe('Profile section', () => {
  it('shows who they are and the access an admin set (as words, from the data)', () => {
    stubFetch();
    mount('general');
    expect($('.pf-name').textContent).toBe('Me Myself');
    expect($('.pf-sub').textContent).toBe('me@x.test');
    expect($('.pf-hero .chip.role.r-member').textContent).toBe('Editor');
    expect($('.user-av.xl').textContent).toBe('MM');
    const text = $$('.pf-card')[1].textContent;
    expect(text).toContain('Set by an admin. If something here is wrong, ask them to change it in Manage access.');
    expect(text).toContain('Linked toMe Myself');                                   // personName(ME1)
    expect(text).toContain('Assigned only');
    expect(text).toContain('Also open to you');
    expect($$('.pf-card')[1].querySelectorAll('.chips .chip')[0].textContent).toBe('Acme');
    expect(text).toContain('Leads');
  });

  it('says so when the sign-in is not linked to a person, and "All companies" when there is no restriction', () => {
    stubFetch();
    mount('general', { person_code: null, companies: null, task_scope: 'all' });
    const text = $$('.pf-card')[1].textContent;
    expect(text).toContain('Not linked to a person yet');
    expect(text).toContain('Until an admin links you, “Mine” and your alerts stay empty.');
    expect(text).toContain('All companies');
    expect(text).not.toContain('Also open to you');
  });

  it('picking an avatar colour saves it, tints the avatar and shows "Saved"', async () => {
    const f = stubFetch();
    mount('general');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'sky' })); });
    expect($('.user-av.xl').style.background).toBe('rgb(91, 147, 211)');
    expect(screen.getByRole('button', { name: 'sky' }).getAttribute('aria-pressed')).toBe('true');
    const post = f.writes()[0];
    expect(post.url).toBe('https://example.supabase.co/rest/v1/user_prefs?on_conflict=email');
    expect(post.body.avatar_tone).toBe('sky');
    expect(post.body.email).toBe('me@x.test');
    expect($('#pf-saved').textContent).toBe('Saved');
    expect($('#pf-saved').className).toContain('show');
  });

  it('job title and phone are saved after the typing stops, trimmed', async () => {
    const f = stubFetch();
    mount('general');
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    fireEvent.change($('input[placeholder="e.g. Head of Operations"]'), { target: { value: '  Head of Ops ' } });
    expect(f.writes()).toHaveLength(0);
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });
    expect(f.writes()[0].body.job_title).toBe('Head of Ops');
  });

  it('"Saved on this device" when the table is not there', async () => {
    const f = stubFetch((url, init) => (init.method === 'GET' ? failResponse('no table', 404) : undefined));
    mount('general');
    await act(async () => { await (await import('@/lib/prefs.js')).loadPrefs(); });
    expect(store.getState().prefsRemote).toBe(false);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'sage' })); });
    expect(f.writes()).toHaveLength(0);
    expect($('#pf-saved').textContent).toBe('Saved on this device');
    expect(JSON.parse(mem.get('rie_prefs:me@x.test')).avatar_tone).toBe('sage');
  });
});

describe('Notifications section', () => {
  it('lists the e-mail choices; turning alerts off disables the kinds, the daily summary and the test button', async () => {
    const f = stubFetch();
    mount('notifications');
    expect(screen.getByText('Send me e-mail alerts')).toBeTruthy();
    expect(screen.getByText('To me@x.test')).toBeTruthy();
    expect($$('.sw input').map((i) => i.disabled)).toEqual([false, false, false, false, false]);
    expect($('#pf-test').disabled).toBe(false);
    const master = screen.getByLabelText('Send me e-mail alerts');
    await act(async () => { fireEvent.click(master); });
    expect(f.writes()[0].body.email_enabled).toBe(false);
    expect($$('.sw input').map((i) => i.disabled)).toEqual([false, true, true, true, true]);
    expect($('.pf-card:last-child .dim')).toBeTruthy();
    expect($('#pf-test').disabled).toBe(true);
    expect(screen.getByLabelText('Daily summary').disabled).toBe(true);
  });

  it('the daily summary and the hour are saved; "Never" hides the hour', async () => {
    const f = stubFetch();
    mount('notifications');
    await act(async () => { fireEvent.change(screen.getByLabelText('Send it at'), { target: { value: '17' } }); });
    expect(f.writes().at(-1).body.digest_hour).toBe(17);
    expect(within(screen.getByLabelText('Send it at')).getByText('5:00 pm')).toBeTruthy();
    await act(async () => { fireEvent.change(screen.getByLabelText('Daily summary'), { target: { value: 'off' } }); });
    expect(f.writes().at(-1).body.digest_frequency).toBe('off');
    expect(screen.queryByLabelText('Send it at')).toBeNull();
  });

  it('warns when the choices can only be kept on this device', async () => {
    stubFetch((url, init) => (init.method === 'GET' ? failResponse('x', 404) : undefined));
    mount('notifications');
    await act(async () => { await (await import('@/lib/prefs.js')).loadPrefs(); });
    expect($('.pf-banner').textContent).toBe('E-mail alerts need the latest database update. Your choices are saved on this device until an admin applies it.');
  });

  it('sends a test e-mail through the send-alerts function and reports the result', async () => {
    const f = stubFetch((url) => (url.endsWith('/functions/v1/send-alerts') ? okResponse({}) : undefined));
    mount('notifications');
    await act(async () => { fireEvent.click($('#pf-test')); });
    const call = f.calls().find((c) => c.url.endsWith('/functions/v1/send-alerts'));
    expect(call.method).toBe('POST');
    expect(call.body).toEqual({ mode: 'test' });
    expect($('#pf-test-msg').textContent).toBe('Sent to me@x.test. Check your inbox (and spam).');
    expect($('#pf-test').disabled).toBe(false);
  });

  it('a failed test e-mail says why', async () => {
    stubFetch((url) => (url.endsWith('/send-alerts') ? { ok: false, status: 500, json: async () => ({ error: 'smtp down' }), text: async () => '' } : undefined));
    mount('notifications');
    await act(async () => { fireEvent.click($('#pf-test')); });
    expect($('#pf-test-msg').textContent).toBe('Could not send: smtp down');
  });
});

describe('Appearance section', () => {
  it('has a card per theme, the current one on; clicking one switches and remembers it', () => {
    stubFetch();
    document.documentElement.setAttribute('data-theme', 'dark');
    mount('appearance');
    const cards = $$('.theme-card');
    expect(cards.map((c) => c.textContent)).toEqual(['Dark', 'Light', 'SPC', 'SPC Modern']);
    expect(cards[0].className).toContain('on');
    fireEvent.click(cards[1]);
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(mem.get('rie-theme')).toBe('light');
    expect($$('.theme-card')[1].getAttribute('aria-pressed')).toBe('true');
    document.documentElement.setAttribute('data-theme', 'dark');
  });
});

describe('Security section', () => {
  it('shows the sign-in details and the data and help actions', () => {
    stubFetch();
    mount('security');
    const t = $('.pf-main').textContent;
    expect(t).toContain('Signed in asme@x.test');
    expect(t).toContain('This session refreshes before');
    expect(t).toContain('You stay signed in while you use BASE.');
    expect(t).toContain('Scan it from BASE on your phone. No e-mail needed, valid for three minutes.');
    fireEvent.click(screen.getByText('Export to Excel'));
    expect(xl.exportToExcel).toHaveBeenCalled();
    fireEvent.click(screen.getByText('Sync now'));
    expect(loader.syncData).toHaveBeenCalled();
    fireEvent.click(screen.getByText('Open Help & tools'));
    expect(history.at(-1).href).toBe('/help');
    fireEvent.click(screen.getByText('Replay the tour'));
    expect(tourStore.getState()).toMatchObject({ open: true, step: 0 });
  });

  it('"Manage access" is offered to admins only, and opens the overlay', () => {
    stubFetch();
    mount('security');
    expect(screen.queryByText('Manage access')).toBeNull();
    cleanup();
    mount('security', { role: 'admin', is_admin: true });
    expect(screen.getByText('Add people, set roles, companies and what each person sees.')).toBeTruthy();
    fireEvent.click(screen.getByText('Manage access'));
    expect(isMoOpen('mo-access')).toBe(true);
  });

  it('Sign out calls the shell sign-out', () => {
    stubFetch();
    const out = vi.fn();
    seed({ access: ACCESS, prefs: null });
    render(<SignOutProvider signOut={out}><ProfileScreen segment="security" session={SESSION} /></SignOutProvider>);
    fireEvent.click(screen.getByText('Sign out'));
    expect(out).toHaveBeenCalled();
  });

  it('Show QR code opens "Sign in another device" and a code is minted; closing burns it', async () => {
    stubFetch();
    mount('security');
    expect($('#mo-pair')).toBeNull();
    await act(async () => { fireEvent.click(screen.getByText('Show QR code')); });
    expect(isMoOpen('mo-pair')).toBe(true);
    expect($('#mo-pair.mo.open .mti').textContent).toBe('Sign in another device');
    expect(dp.startPairing).toHaveBeenCalledTimes(1);
    expect($('#pair-code-text').textContent).toBe('ABCDE-FGHJKLM');
    await act(async () => { fireEvent.click($('#mo-pair .mx')); });
    expect(dp.cancelPairing).toHaveBeenCalledWith('p1');
    expect($('#mo-pair')).toBeNull();
    expect(isMoOpen('mo-pair')).toBe(false);
  });
});

describe('/profile?pair=1', () => {
  it('opens "Sign in another device" and takes the parameter off the address', async () => {
    stubFetch();
    seed({ access: ACCESS, prefs: null });
    resetNav('/profile/security?pair=1');
    render(<><ProfileScreen segment="security" session={SESSION} /><PairOverlay /></>);
    await act(async () => {});
    expect(isMoOpen('mo-pair')).toBe(true);
    expect(currentUrl()).toBe('/profile/security');
    expect(dp.startPairing).toHaveBeenCalledTimes(1);
  });
});
