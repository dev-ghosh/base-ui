// Team workload: the sidebar item opens mo-workload ("Team Capacity & Workload Balance") as an overlay
// (component state, no route), listing one bar per person with open work. Numbers are worked out by hand
// from rie-dashboard2/js/workload.js (the pure function is checked against the old one in workload.test.mjs).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent, screen, within, act } from '@testing-library/react';

vi.mock('next/navigation', async () => (await import('./helpers/fake-router.js')).navigationMock);
vi.mock('next/link', async () => (await import('./helpers/fake-router.js')).linkMock);

import { Sidebar } from '@/components';
import WorkloadModal from '@/features/workload/WorkloadModal.jsx';
import { store } from '@/store/store.js';
import { seed, makeTask, PEOPLE } from './helpers/fixtures.js';
import { history, resetNav } from './helpers/fake-router.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

function mount(tasks) {
  seed({ tasks });
  resetNav('/today');
  window.matchMedia = vi.fn((q) => ({ matches: q.includes('min-width: 1024px'), media: q, addEventListener() {}, removeEventListener() {} }));
  return render(<><Sidebar session={{ email: 'me@x.test', displayName: 'Me Myself' }} /><WorkloadModal /></>);
}
const open = () => fireEvent.click($$('#side .nv').find((b) => $('.nv-t', b).textContent === 'Team workload'));
const isOpen = () => $('#mo-workload').classList.contains('open');

const many = (n, o) => Array.from({ length: n }, () => makeTask(o));

beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-11-10T12:00:00')); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('the Team workload overlay', () => {
  it('is closed until the sidebar item is clicked, and is not a route', () => {
    mount([]);
    expect(isOpen()).toBe(false);
    expect($('#mo-workload .mti').textContent).toBe('Team Capacity & Workload Balance');
    open();
    expect(isOpen()).toBe(true);
    expect(history).toEqual([]);                                // nothing was navigated to
  });

  it('says so when nobody has open work', () => {
    mount([makeTask({ status: 'Completed' }), makeTask({ status: 'Dropped' })]);
    open();
    expect(screen.getByText('No active task distribution recorded.')).toBeTruthy();
  });

  it('lists a bar per person, most loaded first, with the capacity line and member count', () => {
    mount([
      ...many(12, { assignedTo: 'Olive Other', ownerCode: 'OT1', nextFollowUp: '2026-11-09' }),   // Active, 12 overdue
      ...many(3, { assignedTo: 'Me Myself', priority: 'P1' }),                                     // Normal, 3 P1
      makeTask({ assignedTo: 'Me Myself, Olive Other' }),                                          // shared: counts for both
      makeTask({ assignedTo: 'Me Myself', status: 'Completed' }),                                  // not open
    ]);
    open();
    const body = $('#workload-panel-content');
    expect(body.textContent).toContain('Capacity standard: Max 25 open items');
    expect(body.textContent).toContain('2 Members Active');
    const rows = $$('#workload-panel-content > div > div:last-child > div');
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toBe('Olive OtherActive12 Overdue13 Open');
    expect(rows[1].textContent).toBe('Me MyselfNormal3 P14 Open');
    // 13/25 = 52 %, 4/25 = 16 %
    expect($$('div[style*="transition"]', rows[0])[0].style.width).toBe('52%');
    expect($$('div[style*="transition"]', rows[1])[0].style.width).toBe('16%');
    expect($$('span', rows[0]).find((s) => s.textContent === 'Active').style.color).toBe('var(--cold, #3b82f6)');
  });

  it('follows the data while open', () => {
    mount(many(2, { assignedTo: 'Me Myself' }));
    open();
    expect($('#workload-panel-content').textContent).toContain('2 Open');
    act(() => store.setState({ tasks: [...store.getState().tasks, ...many(3, { assignedTo: 'Me Myself' })] }));
    expect($('#workload-panel-content').textContent).toContain('5 Open');
  });

  it('closes with the Close button, the ✕ and the backdrop', () => {
    mount([]);
    open();
    fireEvent.click(within($('#mo-workload')).getByText('Close'));
    expect(isOpen()).toBe(false);
    open();
    fireEvent.click($('#mo-workload .mx'));
    expect(isOpen()).toBe(false);
    open();
    fireEvent.click($('#mo-workload'));
    expect(isOpen()).toBe(false);
  });

  it('uses the owner names of the people list for the rows (PEOPLE is only the vocabulary)', () => {
    mount(many(1, { assignedTo: PEOPLE[1].display_name }));
    open();
    expect($('#workload-panel-content').textContent).toContain(PEOPLE[1].display_name);
  });
});
