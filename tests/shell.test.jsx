import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup, fireEvent, act } from '@testing-library/react';

process.env.NEXT_PUBLIC_SB_URL = 'https://example.supabase.co';
process.env.NEXT_PUBLIC_SB_KEY = 'anon-key-123';

const nav = vi.hoisted(() => ({ path: '/today', router: { replace: null, push: null, back: null } }));
vi.mock('next/navigation', () => ({
  useRouter: () => nav.router,
  usePathname: () => nav.path,
  useParams: () => ({ id: '42' }),
  useSearchParams: () => new URLSearchParams(''),
}));
// The shell must not start the refresh timer in tests.
vi.mock('@/lib/auth.js', async (importOriginal) => {
  const real = await importOriginal();
  return { ...real, scheduleAutoRefresh: vi.fn() };
});

import AppLayout from '@/app/(app)/layout.jsx';
import { Modal } from '@/components';
import { useModal } from '@/hooks/useModal.js';
import { useStatus } from '@/hooks/useStatus.js';
import { resetAccess } from '@/lib/access.js';
import { setStatus, resetStatus } from '@/lib/status.js';
import { resetSplash } from '@/lib/splash.js';
import { closeAllMo } from '@/lib/modals.js';
import { store } from '@/store/store.js';

const DAY = 24 * 60 * 60 * 1000;
const html = document.documentElement;
const ACCESS_ROOT_CLASSES = ['ro', 'is-admin', 'scoped', 'side-collapsed', 'side-open', 'installed'];

const signIn = () => localStorage.setItem('rie_session', JSON.stringify({
  accessToken: 'tok', refreshToken: 'ref', userId: 'u1', email: 'pat@example.com',
  displayName: 'Pat Example', expiresAt: Date.now() + 30 * DAY,
}));

/** fetch stub: rie_my_access answers `access` (or fails with `fail`), anything else is empty. */
function stubBackend({ access, fail = false } = {}) {
  const fetchMock = vi.fn(async (url) => {
    if (String(url).includes('/rpc/rie_my_access')) {
      if (fail) return { ok: false, status: 500, text: async () => 'boom', json: async () => ({}) };
      return { ok: true, status: 200, json: async () => [access], text: async () => '' };
    }
    return { ok: true, status: 200, json: async () => ({}), text: async () => '' };
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}
const rpcCalls = (f) => f.mock.calls.filter(([u]) => String(u).includes('/rpc/rie_my_access')).length;

/** matchMedia stub: `(min-width: 1024px)` follows `wide`; everything else is false. */
function stubViewport({ wide = true } = {}) {
  const state = { wide, listeners: new Set() };
  window.matchMedia = vi.fn((q) => ({
    matches: q.includes('min-width: 1024px') ? state.wide : false,
    media: q,
    addEventListener: (_t, fn) => state.listeners.add(fn),
    removeEventListener: (_t, fn) => state.listeners.delete(fn),
  }));
  return state;
}

const mount = (props = {}) => render(
  <AppLayout modal={<div data-testid="modal-slot" />} {...props}><div data-testid="page">page</div></AppLayout>,
);
const mountReady = async (access) => {
  const fetchMock = stubBackend({ access });
  signIn();
  mount();
  await waitFor(() => expect(store.getState().accessLoaded).toBe(true));
  return fetchMock;
};
const nv = (key) => document.querySelector(`#side [data-nav="${key}"]`);

beforeEach(() => {
  localStorage.clear();
  ACCESS_ROOT_CLASSES.forEach((c) => html.classList.remove(c));
  html.setAttribute('data-theme', 'dark');
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.remove());
  nav.path = '/today';
  nav.router.replace = vi.fn();
  nav.router.push = vi.fn();
  nav.router.back = vi.fn();
  resetAccess();
  resetStatus();
  resetSplash();
  closeAllMo();
  stubViewport({ wide: true });
  window.history.replaceState(null, '', '/today');
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('session gate', () => {
  it('sends a signed-out user to /login and renders no shell', async () => {
    stubBackend({ access: {} });
    mount();
    await waitFor(() => expect(nav.router.replace).toHaveBeenCalledWith('/login'));
    expect(document.getElementById('side')).toBeNull();
    expect(screen.queryByTestId('page')).toBeNull();
  });

  it('does not ask for access while signed out', async () => {
    const f = stubBackend({ access: {} });
    mount();
    await waitFor(() => expect(nav.router.replace).toHaveBeenCalled());
    expect(rpcCalls(f)).toBe(0);
  });

  it('renders sidebar, header, status bar, the page and the @modal slot for a signed-in user', async () => {
    await mountReady({ can_write: true, is_admin: false, role: 'member' });
    expect(document.getElementById('side')).not.toBeNull();
    expect(document.querySelector('header.topbar')).not.toBeNull();
    expect(document.querySelector('.sbar')).not.toBeNull();
    expect(screen.getByTestId('page')).toBeTruthy();
    expect(screen.getByTestId('modal-slot')).toBeTruthy();
    expect(nav.router.replace).not.toHaveBeenCalled();
  });
});

describe('access mode (C15)', () => {
  it('read-only: html gets "ro" and the banner shows the old text, right after the status bar', async () => {
    await mountReady({ can_write: false, is_admin: false, role: 'viewer' });
    expect(html.classList.contains('ro')).toBe(true);
    expect(html.classList.contains('is-admin')).toBe(false);
    const bar = document.getElementById('ro-bar');
    expect(bar).not.toBeNull();
    expect(bar.textContent).toBe('View only. You can read everything here but not change it.');
    expect(document.querySelector('.sbar').nextElementSibling).toBe(bar);
  });

  it('admin: html gets "is-admin", no "ro", and the Manage access item shows', async () => {
    await mountReady({ can_write: true, is_admin: true, role: 'admin' });
    expect(html.classList.contains('is-admin')).toBe(true);
    expect(html.classList.contains('ro')).toBe(false);
    expect(document.getElementById('ro-bar')).toBeNull();
    expect(screen.getByRole('button', { name: 'Manage access' })).toBeTruthy();
  });

  it('a writer who is not an admin gets neither class, no banner and no Manage access', async () => {
    await mountReady({ can_write: true, is_admin: false, role: 'member' });
    expect(html.classList.contains('ro')).toBe(false);
    expect(html.classList.contains('is-admin')).toBe(false);
    expect(document.getElementById('ro-bar')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Manage access' })).toBeNull();
  });

  it('mirrors task_scope "assigned" to html.scoped (shell.css hides Team for scoped people)', async () => {
    await mountReady({ can_write: true, is_admin: false, role: 'member', task_scope: 'assigned' });
    expect(html.classList.contains('scoped')).toBe(true);
  });

  it('fails closed: a failed rie_my_access leaves html "ro" but shows no banner (as the old app)', async () => {
    stubBackend({ fail: true });
    signIn();
    mount();
    await waitFor(() => expect(store.getState().accessLoaded).toBe(true));
    expect(store.getState().access).toBeNull();
    expect(html.classList.contains('ro')).toBe(true);
    expect(document.getElementById('ro-bar')).toBeNull();
  });

  it('does not mark the page read-only before the answer arrives', async () => {
    let release;
    vi.stubGlobal('fetch', vi.fn(() => new Promise((res) => { release = () => res({ ok: true, status: 200, json: async () => [{ can_write: true }], text: async () => '' }); })));
    signIn();
    mount();
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(html.classList.contains('ro')).toBe(false);
    release();
    await waitFor(() => expect(store.getState().accessLoaded).toBe(true));
  });

  it('calls rie_my_access once per sign-in, however many components read it', async () => {
    const f = await mountReady({ can_write: true, is_admin: true, role: 'admin' });
    expect(rpcCalls(f)).toBe(1);
  });

  it('forgets the previous user on sign-out so the next sign-in asks again', async () => {
    const f = await mountReady({ can_write: false, is_admin: false, role: 'viewer' });
    expect(html.classList.contains('ro')).toBe(true);
    fireEvent.click(document.getElementById('user-chip'));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Sign out' }));
    await waitFor(() => expect(nav.router.replace).toHaveBeenCalledWith('/login'));
    await waitFor(() => expect(store.getState().accessLoaded).toBe(false));
    expect(html.classList.contains('ro')).toBe(false);
    expect(localStorage.getItem('rie_session')).toBeNull();
    expect(rpcCalls(f)).toBe(1);
  });
});

describe('sidebar', () => {
  it('lights Work for /work/initiatives (initiatives keeps Work lit) and titles the page "Work"', async () => {
    nav.path = '/work/initiatives';
    await mountReady({ can_write: true });
    expect(nv('tasks').classList.contains('active')).toBe(true);
    expect(nv('tasks').getAttribute('aria-current')).toBe('page');
    expect(document.querySelectorAll('#side .active')).toHaveLength(1);
    expect(document.getElementById('page-title').textContent).toBe('Work');
  });

  it('lights Work for /work/decide/system too', async () => {
    nav.path = '/work/decide/system';
    await mountReady({ can_write: true });
    expect(nv('tasks').classList.contains('active')).toBe(true);
    expect(document.querySelectorAll('#side .active')).toHaveLength(1);
  });

  it('lights Pipeline, and the footer user button for /profile/security', async () => {
    nav.path = '/pipeline/board';
    await mountReady({ can_write: true });
    expect(nv('leads').classList.contains('active')).toBe(true);
    cleanup();
    nav.path = '/profile/security';
    mount();
    await waitFor(() => expect(nv('profile')).not.toBeNull());
    expect(nv('profile').classList.contains('active')).toBe(true);
    expect(document.getElementById('page-title').textContent).toBe('Profile & settings');
  });

  it('has the old sections, labels and order', async () => {
    await mountReady({ can_write: true, is_admin: false });
    const secs = [...document.querySelectorAll('#side .side-sec')].map((e) => e.textContent);
    expect(secs).toEqual(['Operate', 'Insight', 'Finance', 'Automation', 'People']);
    const labels = [...document.querySelectorAll('#side .nv .nv-t')].map((e) => e.textContent);
    expect(labels).toEqual(['Today', 'Work', 'Pipeline', 'Escalations', 'Analytics', 'Team workload', 'Activity',
      'Expenses', 'HR automation', 'Team', 'Contacts', 'Events', 'Help & tools']);
  });

  it('navigates when an item is clicked', async () => {
    await mountReady({ can_write: true });
    fireEvent.click(nv('leads'));
    expect(nav.router.push).toHaveBeenCalledWith('/pipeline');
    fireEvent.click(nv('profile'));
    expect(nav.router.push).toHaveBeenCalledWith('/profile');
  });

  it('collapse persists rie_side_collapsed on a wide screen, and the [ key toggles it', async () => {
    await mountReady({ can_write: true });
    const burger = document.getElementById('menu-btn');
    expect(burger.getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(burger);
    expect(html.classList.contains('side-collapsed')).toBe(true);
    expect(localStorage.getItem('rie_side_collapsed')).toBe('1');
    expect(burger.getAttribute('aria-label')).toBe('Open menu');
    expect(burger.getAttribute('aria-expanded')).toBe('false');
    fireEvent.keyDown(document.body, { key: '[' });
    expect(html.classList.contains('side-collapsed')).toBe(false);
    expect(localStorage.getItem('rie_side_collapsed')).toBe('0');
    expect(burger.getAttribute('aria-label')).toBe('Close menu');
  });

  it('restores a collapsed menu from storage on a wide screen', async () => {
    localStorage.setItem('rie_side_collapsed', '1');
    await mountReady({ can_write: true });
    expect(html.classList.contains('side-collapsed')).toBe(true);
  });

  it('ignores [ while typing in a field or with a modifier key', async () => {
    await mountReady({ can_write: true });
    const input = document.createElement('input');
    document.body.appendChild(input);
    fireEvent.keyDown(input, { key: '[' });
    fireEvent.keyDown(document.body, { key: '[', ctrlKey: true });
    fireEvent.keyDown(document.body, { key: '[', metaKey: true });
    expect(html.classList.contains('side-collapsed')).toBe(false);
    input.remove();
  });

  it('is a drawer below 1024px: the burger opens it with a scrim, Esc and the scrim close it, nothing is stored', async () => {
    stubViewport({ wide: false });
    await mountReady({ can_write: true });
    const side = document.getElementById('side');
    expect(side.getAttribute('aria-hidden')).toBe('true');
    fireEvent.click(document.getElementById('menu-btn'));
    expect(html.classList.contains('side-open')).toBe(true);
    expect(side.getAttribute('aria-hidden')).toBe('false');
    expect(localStorage.getItem('rie_side_collapsed')).toBeNull();
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(html.classList.contains('side-open')).toBe(false);
    fireEvent.click(document.getElementById('menu-btn'));
    expect(html.classList.contains('side-open')).toBe(true);
    fireEvent.click(document.getElementById('side-scrim'));
    expect(html.classList.contains('side-open')).toBe(false);
  });

  it('closes the drawer when a destination is chosen', async () => {
    stubViewport({ wide: false });
    await mountReady({ can_write: true });
    fireEvent.click(document.getElementById('menu-btn'));
    expect(html.classList.contains('side-open')).toBe(true);
    fireEvent.click(nv('events'));
    expect(html.classList.contains('side-open')).toBe(false);
  });

  it('never carries an open drawer across the 1024px breakpoint', async () => {
    const vp = stubViewport({ wide: false });
    await mountReady({ can_write: true });
    fireEvent.click(document.getElementById('menu-btn'));
    expect(html.classList.contains('side-open')).toBe(true);
    act(() => { vp.wide = true; vp.listeners.forEach((fn) => fn()); });
    expect(html.classList.contains('side-open')).toBe(false);
  });
});

describe('header and account menu', () => {
  it('shows the signed-in name, initials, e-mail and the role line from rie_my_access', async () => {
    await mountReady({ can_write: true, is_admin: true, role: 'admin', display_name: 'Pat Example' });
    expect(document.getElementById('user-name').textContent).toBe('Pat Example');
    expect(document.getElementById('user-av').textContent).toBe('PE');
    expect(document.getElementById('user-email').textContent).toBe('pat@example.com');
    expect(document.getElementById('user-name-side').textContent).toBe('Pat Example');
    expect(document.getElementById('user-role-side').textContent).toBe('Admin');
    expect(document.getElementById('profile-role').textContent).toBe('Admin · Can change what they see, and can manage who else has access.');
  });

  it('opens one menu at a time, closes on an outside click and on Esc', async () => {
    await mountReady({ can_write: true });
    const user = document.getElementById('user-menu');
    const theme = document.getElementById('theme-menu');
    const add = document.getElementById('new-menu');
    fireEvent.click(document.getElementById('user-chip'));
    expect(user.classList.contains('open')).toBe(true);
    expect(document.getElementById('user-chip').getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(document.getElementById('theme-btn'));
    expect(theme.classList.contains('open')).toBe(true);
    expect(user.classList.contains('open')).toBe(false);
    fireEvent.click(document.getElementById('new-btn'));
    expect(add.classList.contains('open')).toBe(true);
    expect(theme.classList.contains('open')).toBe(false);
    fireEvent.click(document.body);
    expect(add.classList.contains('open')).toBe(false);
    fireEvent.click(document.getElementById('user-chip'));
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(user.classList.contains('open')).toBe(false);
  });

  it('routes Profile, Notification settings and Help from the account menu', async () => {
    await mountReady({ can_write: true });
    fireEvent.click(document.getElementById('user-chip'));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Profile & settings' }));
    expect(nav.router.push).toHaveBeenLastCalledWith('/profile');
    fireEvent.click(document.getElementById('user-chip'));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Notification settings' }));
    expect(nav.router.push).toHaveBeenLastCalledWith('/profile/notifications');
    fireEvent.click(document.getElementById('user-chip'));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Help & tools' }));
    expect(nav.router.push).toHaveBeenLastCalledWith('/help');
  });

  it('keeps the search pill, sync, bell and New menu buttons in the bar', async () => {
    await mountReady({ can_write: true });
    for (const id of ['search-btn', 'sync-btn', 'theme-btn', 'notif-btn', 'new-btn', 'user-chip']) {
      expect(document.getElementById(id), id).not.toBeNull();
    }
    expect([...document.querySelectorAll('#new-menu button')].map((b) => b.textContent)).toEqual(['Task', 'Contact', 'Lead', 'Event']);
    // stubs for later tasks do not throw
    fireEvent.click(document.getElementById('search-btn'));
    fireEvent.click(document.getElementById('sync-btn'));
    fireEvent.click(document.getElementById('notif-btn'));
  });
});

describe('theme', () => {
  const COLOUR = { dark: '#262624', light: '#FAF9F5', spc: '#FAF9F5', 'spc-modern': '#FAF9F5' };

  it('offers Dark, Light, SPC and SPC Modern, and every one is selectable, persisted and applied', async () => {
    await mountReady({ can_write: true });
    const items = [...document.querySelectorAll('#theme-menu .menu-theme')];
    expect(items.map((b) => [b.dataset.themeOpt, b.textContent])).toEqual([
      ['dark', 'Dark'], ['light', 'Light'], ['spc', 'SPC'], ['spc-modern', 'SPC Modern'],
    ]);
    for (const id of ['light', 'spc', 'spc-modern', 'dark']) {
      fireEvent.click(document.getElementById('theme-btn'));
      expect(document.getElementById('theme-menu').classList.contains('open')).toBe(true);
      fireEvent.click(document.querySelector(`#theme-menu [data-theme-opt="${id}"]`));
      expect(html.getAttribute('data-theme')).toBe(id);
      expect(localStorage.getItem('rie-theme')).toBe(id);
      expect(document.getElementById('theme-menu').classList.contains('open')).toBe(false);
      const metas = document.querySelectorAll('meta[name="theme-color"]');
      expect(metas.length).toBeGreaterThan(0);
      metas.forEach((m) => expect(m.getAttribute('content')).toBe(COLOUR[id]));
      expect(document.querySelectorAll('#theme-menu .menu-theme.on')).toHaveLength(1);
      expect(document.querySelector('#theme-menu .menu-theme.on').dataset.themeOpt).toBe(id);
    }
  });

  it('starts from the theme the early script set', async () => {
    html.setAttribute('data-theme', 'spc');
    await mountReady({ can_write: true });
    expect(document.querySelector('#theme-menu .menu-theme.on').dataset.themeOpt).toBe('spc');
    expect(html.getAttribute('data-theme')).toBe('spc');
  });

  it('re-syncs an existing theme-color meta in place instead of replacing it', async () => {
    const meta = document.createElement('meta');
    meta.name = 'theme-color';
    meta.content = '#000000';
    meta.media = '(prefers-color-scheme: dark)';
    document.head.appendChild(meta);
    await mountReady({ can_write: true });
    fireEvent.click(document.getElementById('theme-btn'));
    fireEvent.click(document.querySelector('#theme-menu [data-theme-opt="light"]'));
    expect(document.contains(meta)).toBe(true);
    expect(meta.getAttribute('content')).toBe('#FAF9F5');
    expect(meta.hasAttribute('media')).toBe(false);   // pinned: the in-app choice beats the OS scheme
  });
});

describe('legacy URLs', () => {
  it('converts ?tab= once on mount, using location.search', async () => {
    window.history.replaceState(null, '', '/today?tab=work');
    await mountReady({ can_write: true });
    await waitFor(() => expect(nav.router.replace).toHaveBeenCalledWith('/work/matrix'));
    expect(nav.router.replace).toHaveBeenCalledTimes(1);
  });

  it('converts #mx? into search params on /work/matrix', async () => {
    window.history.replaceState(null, '', '/work/matrix#mx?s=pending&o=ABC');
    await mountReady({ can_write: true });
    await waitFor(() => expect(nav.router.replace).toHaveBeenCalledWith('/work/matrix?s=pending&o=ABC'));
  });

  it('sends an unknown tab to /today', async () => {
    window.history.replaceState(null, '', '/today?tab=bogus');
    await mountReady({ can_write: true });
    await waitFor(() => expect(nav.router.replace).toHaveBeenCalledWith('/today'));
  });

  it('does nothing for a plain URL', async () => {
    await mountReady({ can_write: true });
    expect(nav.router.replace).not.toHaveBeenCalled();
  });
});

describe('status bar and splash', () => {
  it('shows "Loading…" until told otherwise, then reproduces setStatus', async () => {
    await mountReady({ can_write: true });
    expect(document.getElementById('stext').textContent).toBe('Loading…');
    expect(document.getElementById('sdot').className).toBe('sdot');
    act(() => setStatus('error', 'Could not sync', 'cached 5m ago'));
    expect(document.getElementById('sdot').className).toBe('sdot error');
    expect(document.getElementById('stext').textContent).toBe('Could not sync');
    expect(document.getElementById('smeta').textContent).toBe('cached 5m ago');
    // meta is only replaced when a new one is given
    act(() => setStatus('online', 'Signed in'));
    expect(document.getElementById('sdot').className).toBe('sdot online');
    expect(document.getElementById('stext').textContent).toBe('Signed in');
    expect(document.getElementById('smeta').textContent).toBe('cached 5m ago');
    act(() => setStatus('', 'Idle'));
    expect(document.getElementById('sdot').className).toBe('sdot');
  });

  it('useStatus exposes the same state and setter', () => {
    let api;
    function Probe() { api = useStatus(); return <span data-testid="s">{api.status.msg}</span>; }
    render(<Probe />);
    act(() => api.setStatus('syncing', 'Syncing…'));
    expect(screen.getByTestId('s').textContent).toBe('Syncing…');
    expect(api.status.kind).toBe('syncing');
  });

  it('fades the splash once the shell is up', async () => {
    await mountReady({ can_write: true });
    await waitFor(() => expect(document.getElementById('splash').classList.contains('hide')).toBe(true));
    expect(document.getElementById('splash').textContent).toContain('BASE');
    expect(document.getElementById('sp-msg')).not.toBeNull();
  });
});

describe('Modal and useModal', () => {
  function Host() {
    const m = useModal('mo-del');
    return (
      <>
        <button onClick={m.show}>show</button>
        <span data-testid="state">{String(m.open)}</span>
        <Modal id="mo-del" title="Confirm delete"><p>sure?</p></Modal>
      </>
    );
  }

  it('renders the old .mo/.mb structure and toggles .open', () => {
    render(<Host />);
    const mo = document.getElementById('mo-del');
    expect(mo.classList.contains('mo')).toBe(true);
    expect(mo.classList.contains('open')).toBe(false);
    expect(mo.querySelector(':scope > .mb > .mh > .mti').textContent).toBe('Confirm delete');
    fireEvent.click(screen.getByText('show'));
    expect(mo.classList.contains('open')).toBe(true);
    expect(screen.getByTestId('state').textContent).toBe('true');
    expect(screen.getByText('sure?')).toBeTruthy();
    fireEvent.click(mo.querySelector('.mx'));
    expect(mo.classList.contains('open')).toBe(false);
  });

  it('closes on a backdrop click but not on a click inside the box', () => {
    render(<Host />);
    const mo = document.getElementById('mo-del');
    fireEvent.click(screen.getByText('show'));
    fireEvent.click(mo.querySelector('.mb'));
    expect(mo.classList.contains('open')).toBe(true);
    fireEvent.click(mo);
    expect(mo.classList.contains('open')).toBe(false);
  });

  it('can be made non-dismissible by backdrop (mo-user, mo-triage in the old app)', () => {
    function Locked() {
      const m = useModal('mo-triage');
      return (<><button onClick={m.show}>show</button><Modal id="mo-triage" title="Triage" dismissible={false}>x</Modal></>);
    }
    render(<Locked />);
    fireEvent.click(screen.getByText('show'));
    fireEvent.click(document.getElementById('mo-triage'));
    expect(document.getElementById('mo-triage').classList.contains('open')).toBe(true);
  });

  it('two hooks on one id share state', () => {
    let a, b;
    function Two() { a = useModal('mo-x'); b = useModal('mo-x'); return null; }
    render(<Two />);
    act(() => a.show());
    expect(b.open).toBe(true);
    act(() => b.hide());
    expect(a.open).toBe(false);
  });
});
