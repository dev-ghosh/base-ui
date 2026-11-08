// Activity: the sidebar item opens mo-activity ("Real-time Activity Timeline") as an overlay (no route). The
// feed is the events recorded in this browser (through the seam the task writes call), the tasks in the store
// and contact history; recording an event redraws an open panel. The merge itself is checked against the old
// function in activity.test.mjs; here the screen.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent, screen, within, act } from '@testing-library/react';

vi.mock('next/navigation', async () => (await import('./helpers/fake-router.js')).navigationMock);
vi.mock('next/link', async () => (await import('./helpers/fake-router.js')).linkMock);

import { Sidebar } from '@/components';
import ActivityModal from '@/features/activity/ActivityModal.jsx';
import { recordActivity as seamRecord } from '@/lib/seams.js';
import { recordActivity, getStoredActivities, ACTIVITY_STORAGE_KEY } from '@/lib/activity.js';
import { onSessionEnded } from '@/lib/user-data.js';
import { store } from '@/store/store.js';
import { seed, makeTask } from './helpers/fixtures.js';
import { history, resetNav } from './helpers/fake-router.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

function mount(tasks = []) {
  localStorage.clear();
  seed({ tasks });
  resetNav('/today');
  window.matchMedia = vi.fn((q) => ({ matches: q.includes('min-width: 1024px'), media: q, addEventListener() {}, removeEventListener() {} }));
  return render(<><Sidebar session={{ email: 'me@x.test', displayName: 'Me Myself' }} /><ActivityModal /></>);
}
const open = () => fireEvent.click($$('#side .nv').find((b) => $('.nv-t', b).textContent === 'Activity'));
const isOpen = () => $('#mo-activity').classList.contains('open');
const rows = () => $$('#activity-feed-content > div > div').slice(1);

beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-11-10T12:00:00')); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('the Activity overlay', () => {
  it('is closed until the sidebar item is clicked, and is not a route', () => {
    mount();
    expect(isOpen()).toBe(false);
    expect($('#mo-activity .mti').textContent).toBe('Real-time Activity Timeline');
    open();
    expect(isOpen()).toBe(true);
    expect(history).toEqual([]);
  });

  it('says so with no activity', () => {
    mount();
    open();
    expect(screen.getByText('No recent activity recorded yet.')).toBeTruthy();
  });

  it('draws one row per event: who, what, which task, how long ago, and a Done chip for completions', () => {
    mount([
      makeTask({ task: 'Ship the report', status: 'Completed', assignedTo: 'Asha Rao', updatedAt: '2026-11-10T11:00:00' }),
      makeTask({ task: 'Review contract', status: 'In Progress', assignedTo: 'Ben Cole', updatedAt: '2026-11-10T08:30:00' }),
      makeTask({ task: 'Call vendor', status: 'Pending', assignedTo: 'Cy Dunn', updatedAt: '2026-11-08T12:00:00' }),
    ]);
    open();
    expect($('#activity-feed-content').textContent).toContain('Live Audit Stream (3)');
    expect($('#activity-feed-content').textContent).toContain('Auto-syncs on every action');
    const r = rows();
    expect(r.map((x) => x.textContent)).toEqual([
      'Asha Rao marked completed Ship the report1h agoDone',
      'Ben Cole actively working on Review contract3h ago',
      'Cy Dunn set to pending Call vendor2d ago',
    ]);
    expect($$('div', r[0])[0].style.background).toBe('var(--ac,#D97757)');
    expect($$('div', r[1])[0].style.background).toBe('var(--cold,#74ABE2)');
    expect($$('div', r[2])[0].style.background).toBe('var(--sf4,#71717a)');
  });

  it('shows what the task writes record (the seam is the real thing) and redraws while open', () => {
    mount();
    open();
    expect(screen.getByText('No recent activity recorded yet.')).toBeTruthy();
    act(() => seamRecord('marked completed', 'Ship the report', 'Asha Rao', 'task'));
    expect(rows().map((x) => x.textContent)).toEqual(['Asha Rao marked completed Ship the report' + 'just nowDone']);
    // the writer is the signed-in user when none is given
    store.setState({ currentUser: 'Me Myself' });
    act(() => seamRecord('moved to On Hold', 'Old thing', undefined, 'task'));
    expect(rows()[0].textContent).toBe('Me Myself moved to On Hold Old thingjust now');
    expect(getStoredActivities()).toHaveLength(2);
  });

  it('keeps the newest 60 of a longer feed', () => {
    mount(Array.from({ length: 70 }, (_, i) => makeTask({ task: 'T' + i, assignedTo: 'P', updatedAt: new Date(Date.UTC(2026, 10, 1) + i * 3600e3).toISOString() })));
    open();
    expect(rows()).toHaveLength(60);
    expect($('#activity-feed-content').textContent).toContain('Live Audit Stream (60)');
    expect(rows()[0].textContent).toContain('T69');
  });

  it('the stream is forgotten when the session ends (R25)', () => {
    mount();
    recordActivity('marked completed', 'Secret task', 'Asha Rao');
    expect(localStorage.getItem(ACTIVITY_STORAGE_KEY)).toContain('Secret task');
    act(() => onSessionEnded());
    expect(localStorage.getItem(ACTIVITY_STORAGE_KEY)).toBeNull();
  });

  it('closes with the Close button, the ✕ and the backdrop', () => {
    mount();
    open();
    fireEvent.click(within($('#mo-activity')).getByText('Close'));
    expect(isOpen()).toBe(false);
    open();
    fireEvent.click($('#mo-activity .mx'));
    expect(isOpen()).toBe(false);
    open();
    fireEvent.click($('#mo-activity'));
    expect(isOpen()).toBe(false);
  });

  it('the panel scrolls inside the box (max-height 65vh)', () => {
    mount();
    open();
    expect($('#activity-feed-content').style.maxHeight).toBe('65vh');
    expect($('#activity-feed-content').style.overflowY).toBe('auto');
  });
});
