// The Work frame: /work -> /work/matrix, one scope shared by every surface (the pill in the
// layout), the surface switcher as links, ?scope= and rie_work_scope, and Mine without an owner code.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';

vi.mock('next/navigation', async () => (await import('./helpers/fake-router.js')).navigationMock);
vi.mock('next/link', async () => (await import('./helpers/fake-router.js')).linkMock);

import WorkIndexPage from '@/app/(app)/work/page.jsx';
import WorkLayout from '@/app/(app)/work/layout.jsx';
import { useScope } from '@/features/work/hooks/useScope.js';
import { seed } from './helpers/fixtures.js';
import { TASKS } from './helpers/matrix-fixture.js';
import { history, redirects, resetNav, setUrl, currentUrl, currentParams } from './helpers/fake-router.js';

const KEY = 'rie_work_scope';
const SURFACES = ['Matrix', 'Board', 'Hierarchy', 'Initiatives', 'Decide'];

function mount(children = <div data-testid="surface">surface</div>) {
  return render(<WorkLayout>{children}</WorkLayout>);
}
const pill = () => document.getElementById('work-scope');
const scopeBtn = (name) => within(pill()).getByRole('tab', { name: new RegExp('^' + name) });
const selectedScope = () => within(pill()).getAllByRole('tab').find((b) => b.getAttribute('aria-selected') === 'true')?.textContent;
const switcher = () => document.getElementById('task-viewseg');
const surfaceLink = (name) => within(switcher()).getByRole('link', { name });

beforeEach(() => {
  localStorage.clear();
  resetNav('/work/matrix');
  seed({ tasks: TASKS });
});
afterEach(() => { cleanup(); localStorage.clear(); });

describe('/work', () => {
  it('redirects to /work/matrix', () => {
    WorkIndexPage();
    expect(redirects).toEqual(['/work/matrix']);
  });
});

describe('the frame', () => {
  it('shows the scope pill and the five surfaces as links, above the page', () => {
    mount();
    expect(pill().getAttribute('role')).toBe('tablist');
    expect(pill().getAttribute('aria-label')).toBe('Whose work');
    expect(pill().classList.contains('mx-seg') && pill().classList.contains('work-scope')).toBe(true);
    expect(within(switcher()).getAllByRole('link').map((a) => a.textContent)).toEqual(SURFACES);
    expect(surfaceLink('Matrix').getAttribute('href')).toBe('/work/matrix');
    expect(surfaceLink('Board').getAttribute('href')).toBe('/work/board');
    expect(surfaceLink('Hierarchy').getAttribute('href')).toBe('/work/hierarchy');
    expect(surfaceLink('Initiatives').getAttribute('href')).toBe('/work/initiatives');
    expect(surfaceLink('Decide').getAttribute('href')).toBe('/work/decide');
    const bar = document.querySelector('.tbar');
    expect(bar.contains(pill()) && bar.contains(switcher())).toBe(true);
    expect(bar.nextElementSibling.getAttribute('data-testid')).toBe('surface');
  });

  it('the active surface is derived from the pathname', () => {
    setUrl('/work/hierarchy');
    mount();
    const on = within(switcher()).getAllByRole('link').filter((a) => a.classList.contains('on')).map((a) => a.textContent);
    expect(on).toEqual(['Hierarchy']);
    expect(surfaceLink('Hierarchy').getAttribute('aria-current')).toBe('page');
    expect(surfaceLink('Matrix').getAttribute('aria-current')).toBeNull();
  });

  it('Decide stays lit on its sub-views (/work/decide/system)', () => {
    setUrl('/work/decide/system');
    mount();
    expect(surfaceLink('Decide').classList.contains('on')).toBe(true);
  });

  it('counts are open tasks, the same definition as Today: Mine 3 · Team 4 · Everyone 7', () => {
    mount();
    expect(scopeBtn('Mine').querySelector('b').textContent).toBe('3');
    expect(scopeBtn('Team').querySelector('b').textContent).toBe('4');
    expect(scopeBtn('Everyone').querySelector('b').textContent).toBe('7');
  });

  it('is a neutral frame for a page of its own: the surface renders unchanged beneath it', () => {
    mount(<main data-testid="child" />);
    expect(screen.getByTestId('child')).toBeTruthy();
  });
});

describe('one scope across all five surfaces', () => {
  it('the surface links keep a scope chosen in the URL', () => {
    setUrl('/work/matrix?scope=team');
    mount();
    expect(selectedScope()).toMatch(/^Team/);
    for (const s of SURFACES) {
      const href = surfaceLink(s).getAttribute('href');
      expect(new URL(href, 'http://x').searchParams.get('scope'), s).toBe('team');
    }
  });

  it('navigating to another surface keeps the same scope selected', () => {
    setUrl('/work/matrix?scope=everyone');
    mount();
    fireEvent.click(surfaceLink('Board'));
    expect(currentUrl()).toBe('/work/board?scope=everyone');
    expect(selectedScope()).toMatch(/^Everyone/);
    fireEvent.click(surfaceLink('Decide'));
    expect(currentUrl()).toBe('/work/decide?scope=everyone');
    expect(selectedScope()).toMatch(/^Everyone/);
  });

  it('without ?scope= a surface link carries none, and the default is the same on every surface', () => {
    mount();
    expect(surfaceLink('Board').getAttribute('href')).toBe('/work/board');
    expect(selectedScope()).toMatch(/^Mine/);
    fireEvent.click(surfaceLink('Board'));
    expect(selectedScope()).toMatch(/^Mine/);
  });

  it('every surface sees the same useScope() value', () => {
    function Probe() { const { scope } = useScope(); return <i data-testid="probe">{scope}</i>; }
    setUrl('/work/hierarchy?scope=team');
    mount(<Probe />);
    expect(screen.getByTestId('probe').textContent).toBe('team');
    fireEvent.click(surfaceLink('Initiatives'));
    expect(screen.getByTestId('probe').textContent).toBe('team');
  });
});

describe('changing the scope', () => {
  it('updates ?scope= with replace, keeps every other param, and stores the choice', () => {
    setUrl('/work/matrix?c=Acme&t=list&scope=mine');
    mount();
    fireEvent.click(scopeBtn('Team'));
    expect(history.at(-1)).toEqual({ kind: 'replace', href: '/work/matrix?c=Acme&t=list&scope=team' });
    expect(currentParams().get('c')).toBe('Acme');
    expect(localStorage.getItem(KEY)).toBe('team');
    expect(selectedScope()).toMatch(/^Team/);
  });

  it('adds ?scope= when the URL had none', () => {
    mount();
    fireEvent.click(scopeBtn('Everyone'));
    expect(currentUrl()).toBe('/work/matrix?scope=everyone');
    expect(localStorage.getItem(KEY)).toBe('everyone');
  });

  it('the stored choice is the default when the URL says nothing', () => {
    localStorage.setItem(KEY, 'team');
    mount();
    expect(selectedScope()).toMatch(/^Team/);
  });

  it('the URL wins over the stored choice', () => {
    localStorage.setItem(KEY, 'team');
    setUrl('/work/board?scope=everyone');
    mount();
    expect(selectedScope()).toMatch(/^Everyone/);
  });

  it('an unknown ?scope= value is ignored', () => {
    setUrl('/work/matrix?scope=nonsense');
    mount();
    expect(selectedScope()).toMatch(/^Mine/);
  });
});

describe('Mine without an owner code', () => {
  beforeEach(() => { seed({ tasks: TASKS, access: { can_write: true, is_admin: false } }); });

  it('is disabled, with the old explanation, and Everyone is the default', () => {
    mount();
    const mine = scopeBtn('Mine');
    expect(mine.disabled).toBe(true);
    expect(mine.getAttribute('title')).toBe('Your sign-in is not linked to a person yet. An admin can fix that under Account → Manage access.');
    expect(selectedScope()).toMatch(/^Everyone/);
  });

  it('a ?scope=mine URL (or a stored mine) falls back safely to Everyone and does not crash', () => {
    localStorage.setItem(KEY, 'mine');
    setUrl('/work/matrix?scope=mine');
    mount();
    expect(selectedScope()).toMatch(/^Everyone/);
    expect(screen.getByTestId('surface')).toBeTruthy();
  });

  it('clicking the disabled Mine changes nothing', () => {
    mount();
    fireEvent.click(scopeBtn('Mine'));
    expect(history).toHaveLength(0);
    expect(localStorage.getItem(KEY)).toBeNull();
  });
});

describe('the signed-in person is read from the store', () => {
  it('uses access.person_code', async () => {
    seed({ tasks: TASKS, access: { person_code: 'OT1', can_write: true } });
    mount();
    await waitFor(() => expect(scopeBtn('Mine').querySelector('b').textContent).toBe('3'));   // A2, A4, U1 (D1 is closed, so not open work)
  });
});
