// Help & tools: grouped tool cards with a search and the shortcuts; every card's Open button goes to an
// existing route or overlay; the guided tour can be started, advanced, walked back, closed (Esc, Skip,
// Done) and remembers that it was seen.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent, screen, act, within } from '@testing-library/react';

vi.mock('next/navigation', async () => (await import('./helpers/fake-router.js')).navigationMock);
vi.mock('next/link', async () => (await import('./helpers/fake-router.js')).linkMock);

import HelpScreen from '@/features/help/HelpScreen.jsx';
import TourOverlay from '@/features/help/TourOverlay.jsx';
import { Header, Sidebar } from '@/components';
import { STEPS, tourStore, startTour } from '@/features/help/tour.js';
import { TOOLS, helpTarget } from '@/features/help/registry.js';
import { isMoOpen } from '@/lib/modals.js';
import { menuStore, setMenu } from '@/lib/menus.js';
import { seed } from './helpers/fixtures.js';
import { history, resetNav } from './helpers/fake-router.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const ADMIN = { email: 'me@x.test', display_name: 'Me', role: 'admin', can_write: true, is_admin: true, person_code: 'ME1' };
const SESSION = { email: 'me@x.test', displayName: 'Me' };
const mem = new Map();

const mount = (access) => {
  seed({ access: access || { ...ADMIN, role: 'member', is_admin: false } });
  resetNav('/help');
  window.matchMedia = vi.fn((q) => ({ matches: q.includes('min-width: 1024px'), media: q, addEventListener() {}, removeEventListener() {} }));
  return render(<HelpScreen />);
};
const type = (v) => fireEvent.change($('#help-q'), { target: { value: v } });
const card = (name) => $$('.hp-card').find((c) => $('.hp-name', c).textContent === name);
const openBtn = (name) => within(card(name)).getByRole('button', { name: `Open ${name}` });

beforeEach(() => {
  vi.stubGlobal('localStorage', {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => { mem.set(k, String(v)); },
    removeItem: (k) => { mem.delete(k); },
  });
  mem.clear();
  tourStore.setState({ open: false, step: 0 });
  setMenu(null);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('Help page', () => {
  it('has the title, the tour button, the search and the five groups of foldable cards', () => {
    mount();
    expect($('#tab-help .pg-head h1').textContent).toBe('Help & tools');
    expect(screen.getByText('Everything BASE can do, where to find it, and how to use it.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Take the 2-minute tour' })).toBeTruthy();
    expect($('#help-q').getAttribute('placeholder')).toBe('Search tools, e.g. escalate, export, alerts…');
    expect($$('#help-tools .hp-group > h2').map((h) => h.textContent)).toEqual(['Daily work', 'People & pipeline', 'Staying on top', 'Money & people', 'You & the system']);
    expect($$('.hp-card')).toHaveLength(24);                           // not the admin-only card
    expect($$('.hp-card').every((c) => !c.open)).toBe(true);           // folded
    const today = card('Today');
    expect($('.hp-where', today).textContent).toBe('Menu → Today');
    expect($$('.hp-body li', today)).toHaveLength(3);
    expect($('.hp-keys', today).textContent).toBe('J / K move · Enter open · D done · 2 push a week');
    expect($('svg', $('.hp-ic', today))).toBeTruthy();
  });

  it('lists the keyboard shortcuts', () => {
    mount();
    const rows = $$('.hp-keys-grid > div');
    expect(rows).toHaveLength(7);
    expect($('kbd', rows[0]).textContent).toBe('Ctrl / ⌘ + K');
    expect(rows[0].textContent).toContain('Smart search');
    expect(rows.at(-1).textContent).toBe('[Collapse or expand the menu');
  });

  it('shows Manage access to admins only', () => {
    mount();
    expect(card('Manage access')).toBeUndefined();
    cleanup();
    mount(ADMIN);
    expect(card('Manage access')).toBeTruthy();
    expect($$('.hp-card')).toHaveLength(25);
  });

  it('searches names, descriptions, places and steps; matches are open; no match says so', () => {
    mount();
    type('export');
    const names = $$('.hp-name').map((n) => n.textContent);
    expect(names).toContain('Export & sync');
    expect(names.length).toBeLessThan(24);
    expect($$('.hp-card').every((c) => c.open)).toBe(true);
    type('ZZZZ nothing');
    expect($('.empty-state h2').textContent).toBe('No tool matches “zzzz nothing”');
    expect($('.empty-state p').textContent).toBe('Try a different word, like “task”, “alert” or “export”.');
    type('');
    expect($$('.hp-card')).toHaveLength(24);
  });
});

describe('Help actions go to routes and overlays that exist', () => {
  const goes = [
    ['Today', '/today'], ['Triage', '/today/triage'], ['Work', '/work'], ['Matrix view', '/work/matrix'],
    ['Board view', '/work/board'], ['Hierarchy view', '/work/hierarchy'], ['Decide', '/work/decide'],
    ['Bulk edit', '/work/board?bulk=1'], ['Pipeline', '/pipeline'], ['Contacts', '/contacts'], ['Events', '/events'],
    ['Escalations', '/escalations'], ['Analytics', '/analytics'], ['Expenses', '/expenses'], ['Team', '/team'],
    ['Profile & settings', '/profile'], ['Sign in another device', '/profile?pair=1'], ['Themes', '/profile'],
  ];
  it.each(goes)('%s -> %s', (name, href) => {
    mount();
    fireEvent.click(openBtn(name));
    expect(history.at(-1)).toEqual({ kind: 'push', href });
  });

  it('Team workload, Activity feed and Smart search open their overlays in place', () => {
    mount();
    fireEvent.click(openBtn('Team workload'));
    expect(isMoOpen('mo-workload')).toBe(true);
    fireEvent.click(openBtn('Activity feed'));
    expect(isMoOpen('mo-activity')).toBe(true);
    fireEvent.click(openBtn('Smart search'));
    expect(isMoOpen('mo-smart-search')).toBe(true);
    expect(history).toEqual([]);
  });

  it('Manage access opens the Access overlay for an admin', () => {
    mount(ADMIN);
    fireEvent.click(openBtn('Manage access'));
    expect(isMoOpen('mo-access')).toBe(true);
  });

  it('every card has an action that resolves', () => {
    for (const t of TOOLS) expect(helpTarget(t.open), t.id).not.toBeNull();
  });

  it('New and Export & sync open the top-bar menus (after the click has finished)', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    mount();
    fireEvent.click(openBtn('New (task, contact, lead, event)'));
    expect(menuStore.getState().menu).toBeNull();
    act(() => { vi.advanceTimersByTime(1); });
    expect(menuStore.getState().menu).toBe('new');
    fireEvent.click(openBtn('Export & sync'));
    act(() => { vi.advanceTimersByTime(1); });
    expect(menuStore.getState().menu).toBe('user');
  });

  it('the New menu really opens in the top bar', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    seed({ access: ADMIN });
    resetNav('/help');
    window.matchMedia = vi.fn((q) => ({ matches: true, media: q, addEventListener() {}, removeEventListener() {} }));
    render(<><Header session={SESSION} onSignOut={() => {}} /><HelpScreen /></>);
    expect($('#new-menu').className).not.toContain('open');
    fireEvent.click(openBtn('New (task, contact, lead, event)'));
    act(() => { vi.advanceTimersByTime(1); });
    expect($('#new-menu').className).toContain('open');
  });
});

describe('The guided tour', () => {
  const mountTour = () => {
    seed({ access: ADMIN });
    resetNav('/today');
    window.matchMedia = vi.fn((q) => ({ matches: q.includes('min-width: 1024px'), media: q, addEventListener() {}, removeEventListener() {} }));
    return render(<><Sidebar session={SESSION} /><HelpScreen /><TourOverlay /></>);
  };
  const text = () => $('#tour-card').textContent;

  it('"Take the 2-minute tour" starts it at the welcome step', () => {
    mountTour();
    expect($('#tour-root')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Take the 2-minute tour' }));
    expect($('#tour-root').getAttribute('role')).toBe('dialog');
    expect($('#tour-root').getAttribute('aria-modal')).toBe('true');
    expect($('#tour-card h3').textContent).toBe('Welcome to BASE');
    expect(text()).toContain(`Step 1 of ${STEPS.length}`);
    expect($('.tour-bar i').style.width).toBe(`${(1 / STEPS.length) * 100}%`);
    expect(screen.getByRole('button', { name: 'Skip' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
  });

  it('Next and Back walk the steps; the arrow keys and Enter do too', () => {
    mountTour();
    act(() => startTour(true));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect($('#tour-card h3').textContent).toBe('The menu');
    expect(text()).toContain('Step 2 of');
    fireEvent.keyDown(document, { key: 'ArrowRight' });
    expect($('#tour-card h3').textContent).toBe('Today');
    fireEvent.keyDown(document, { key: 'Enter' });
    expect($('#tour-card h3').textContent).toBe('Work');
    fireEvent.keyDown(document, { key: 'ArrowLeft' });
    expect($('#tour-card h3').textContent).toBe('Today');
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect($('#tour-card h3').textContent).toBe('The menu');
  });

  it('says so when the control it points at is not on screen', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    mountTour();
    act(() => startTour(true));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));              // the menu button: jsdom has no layout
    expect($('.tour-miss')).toBeNull();                                         // not before it has looked
    act(() => { vi.advanceTimersByTime(40); });
    expect($('.tour-miss').textContent).toBe('This control is hidden on this screen size or for your role.');
    expect($('#tour-hole').className).toContain('none');
  });

  it('highlights a control that is on screen', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    mountTour();
    const btn = $('#side [data-nav="home"]');
    Object.defineProperty(btn, 'offsetParent', { get: () => document.body });
    btn.getBoundingClientRect = () => ({ top: 100, left: 20, width: 200, height: 40, bottom: 140, right: 220 });
    act(() => startTour(true));
    fireEvent.keyDown(document, { key: 'ArrowRight' });
    fireEvent.keyDown(document, { key: 'ArrowRight' });                         // Today (a menu step: waits for the slide-in)
    expect($('#tour-card h3').textContent).toBe('Today');
    act(() => { vi.advanceTimersByTime(300); });
    const hole = $('#tour-hole');
    expect(hole.className).not.toContain('none');
    expect(hole.style.top).toBe('94px');
    expect(hole.style.left).toBe('14px');
    expect(hole.style.width).toBe('212px');
    expect($('.tour-miss')).toBeNull();
  });

  it('the last step says Done and closes; the tour is remembered as seen', () => {
    mountTour();
    act(() => startTour(true));
    for (let i = 0; i < STEPS.length - 1; i++) fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect($('#tour-card h3').textContent).toBe('Help & tools');
    expect(screen.getByRole('button', { name: 'Close' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect($('#tour-root')).toBeNull();
    expect(mem.get('rie_tour_v2_seen')).toBe('1');
  });

  it('Esc and Skip close it, and stop listening to the keys', () => {
    mountTour();
    act(() => startTour(true));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect($('#tour-root')).toBeNull();
    expect(mem.get('rie_tour_v2_seen')).toBe('1');
    fireEvent.keyDown(document, { key: 'ArrowRight' });
    expect(tourStore.getState().step).toBe(0);
    act(() => startTour(true));
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }));
    expect($('#tour-root')).toBeNull();
  });

  it('a finished tour does not start by itself again, but can be replayed', () => {
    mountTour();
    act(() => startTour(true));
    fireEvent.keyDown(document, { key: 'Escape' });
    act(() => startTour());
    expect($('#tour-root')).toBeNull();
    act(() => startTour(true));
    expect($('#tour-root')).not.toBeNull();
  });
});
