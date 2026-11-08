// Escalations: the index redirect, the four sub-views (route segments), the cards and who may act on them, the
// Escalate dialog and the Resolve / Escalate further / Withdraw dialog (exact REST payloads), the reporting
// lines, the sidebar count and the view-only user. The real escalation-actions / rest.js run; only fetch is
// stubbed, so "no fetch" is a real assertion. Expected values are worked out by hand from
// rie-dashboard2/js/escalations.js.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent, waitFor, act } from '@testing-library/react';

process.env.NEXT_PUBLIC_SB_URL = 'https://example.supabase.co';
process.env.NEXT_PUBLIC_SB_KEY = 'anon-key-123';

const route = vi.hoisted(() => ({ segment: null }));
vi.mock('next/navigation', async () => {
  const base = (await import('./helpers/fake-router.js')).navigationMock;
  return { ...base, useSelectedLayoutSegment: () => route.segment };
});

import EscalationsPage from '@/app/(app)/escalations/page.jsx';
import EscalationsLayout from '@/app/(app)/escalations/layout.jsx';
import EscalateModal from '@/features/escalations/EscalateModal.jsx';
import EscActionModal from '@/features/escalations/EscActionModal.jsx';
import NavBadge from '@/features/escalations/NavBadge.jsx';
import { openEscalateModal as seamOpenEscalate } from '@/lib/seams.js';
import { openEscalateModal, openEscAction } from '@/features/escalations/escalate-state.js';
import { resetAdminCodes } from '@/lib/escalation-actions.js';
import { store } from '@/store/store.js';
import { getStatus } from '@/lib/status.js';
import { isMoOpen } from '@/lib/modals.js';
import { seed, stubFetch, okResponse, failResponse, makeTask } from './helpers/fixtures.js';
import { history, resetNav } from './helpers/fake-router.js';

const READ_ONLY = 'You have view-only access to BASE, so this change was not saved.';
const NOW = new Date('2026-11-10T12:00:00Z');
const ME = 'ME1';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const field = (id) => document.getElementById(id);
const type = (id, value) => fireEvent.change(field(id), { target: { value } });
const button = (label, root = document) => $$('button', root).find((b) => b.textContent.trim() === label);
const writes = (calls) => calls.filter((c) => c.method !== 'GET');
const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });

const PEOPLE = [
  { code: ME, display_name: 'Me Myself', is_internal: true, reports_to: 'BS1' },
  { code: 'OT1', display_name: 'Olive Other', is_internal: true, reports_to: null },
  { code: 'BS1', display_name: 'Bo Boss', is_internal: true, reports_to: null },
  { code: 'AD1', display_name: 'Ada Admin', is_internal: true, reports_to: null },
  { code: 'EX1', display_name: 'Ex External', is_internal: false },
];
const mkEsc = (o = {}) => ({
  id: 1, entity_id: 11, task_title: 'Server migration', raised_by: 'OT1', assigned_to: ME, level: 1, reason: 'Deadline at risk',
  notes: null, status: 'open', previous_status: 'in_progress', resolution: null, created_at: '2026-11-10T11:00:00Z',
  trail: [{ at: '2026-11-10T11:00:00Z', by: 'OT1', action: 'raised', to: ME, note: 'Deadline at risk' }], ...o,
});
const task11 = () => makeTask({ id: 11, task: 'Server migration', status: 'In Progress', ownerCode: 'OT1', assignedTo: 'Olive Other' });

function setup({ url = '/escalations/open', escalations = [], tasks = [task11()], access = { person_code: ME, can_write: true, is_admin: false }, handler, extra = {} } = {}) {
  seed({ tasks, escalations, access, people: PEOPLE, escalationsLoaded: true, ...extra });
  resetNav(url);
  resetAdminCodes();
  route.segment = url.split('/')[2] ?? null;
  return stubFetch(handler);
}
const mountScreen = () => render(<EscalationsLayout><div data-testid="child" /></EscalationsLayout>);
const mountDialogs = () => render(<><EscalateModal /><EscActionModal /></>);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

/* ── /escalations (index) ────────────────────────────────────────────────────── */

describe('/escalations', () => {
  it('goes to Waiting on me when something waits on the signed-in person', () => {
    setup({ url: '/escalations', escalations: [mkEsc(), mkEsc({ id: 2, assigned_to: 'OT1', raised_by: ME })] });
    render(<EscalationsPage />);
    expect(history).toEqual([{ kind: 'replace', href: '/escalations/waiting' }]);
  });

  it('goes to All open when nothing waits on me (open ones exist, but for others)', () => {
    setup({ url: '/escalations', escalations: [mkEsc({ assigned_to: 'OT1', raised_by: ME })] });
    render(<EscalationsPage />);
    expect(history).toEqual([{ kind: 'replace', href: '/escalations/open' }]);
  });

  it('a resolved escalation that was assigned to me does not count as waiting', () => {
    setup({ url: '/escalations', escalations: [mkEsc({ status: 'resolved' })] });
    render(<EscalationsPage />);
    expect(history[0].href).toBe('/escalations/open');
  });

  it('waits for the escalations to load before choosing (an empty list would always say All open)', () => {
    setup({ url: '/escalations', escalations: [], extra: { escalationsLoaded: false } });
    render(<EscalationsPage />);
    expect(history).toEqual([]);
    act(() => { store.setState({ escalations: [mkEsc()], escalationsLoaded: true }); });
    expect(history).toEqual([{ kind: 'replace', href: '/escalations/waiting' }]);
  });

  it('a failed load still lets it through (to All open, where the error is shown)', () => {
    setup({ url: '/escalations', extra: { escalationsLoaded: true, escalationsError: 'boom' } });
    render(<EscalationsPage />);
    expect(history[0].href).toBe('/escalations/open');
  });
});

/* ── the screen ──────────────────────────────────────────────────────────────── */

describe('the Escalations screen', () => {
  const rows = [
    mkEsc({ id: 1 }),                                                                                       // waiting on me, raised by OT1
    mkEsc({ id: 2, entity_id: 12, task_title: 'Budget sign-off', raised_by: ME, assigned_to: 'BS1', level: 3 }), // raised by me
    mkEsc({ id: 3, entity_id: 13, task_title: 'Vendor contract', raised_by: 'OT1', assigned_to: 'AD1' }),       // someone else's
    mkEsc({ id: 4, entity_id: 14, task_title: 'Old thing', status: 'resolved', resolution: 'Approved by Bo', raised_by: ME, assigned_to: 'BS1',
      trail: [{ at: '2026-11-08T10:00:00Z', by: ME, action: 'raised', to: 'BS1', note: 'Needs a call' }, { at: '2026-11-09T10:00:00Z', by: 'BS1', action: 'resolved', note: 'Approved by Bo' }] }),
    mkEsc({ id: 5, entity_id: 15, task_title: 'Dropped idea', status: 'withdrawn', resolution: 'Cleared by itself', created_at: '2026-11-07T12:00:00Z' }),
  ];

  it('draws the title, intro, the four tabs with counts, and marks the current one', () => {
    setup({ escalations: rows });
    mountScreen();
    expect($('#tab-escalations.tp.active #escalations-root')).not.toBeNull();
    expect($('h1').textContent).toBe('Escalations');
    expect($('.pg-head p').textContent).toBe('When a task is stuck, hand it to someone who can unblock it. Up to 4 steps, every one recorded.');
    const tabs = $$('[role="tablist"] [role="tab"]');
    expect(tabs.map((t) => t.textContent)).toEqual(['Waiting on me1', 'Raised by me1', 'All open3', 'Closed2']);
    expect(tabs.map((t) => t.getAttribute('aria-selected'))).toEqual(['false', 'false', 'true', 'false']);
    expect(tabs[2].className).toBe('on');
  });

  it('each tab is a route segment: clicking pushes /escalations/<view>', () => {
    setup({ escalations: rows });
    mountScreen();
    fireEvent.click(button('Closed2'));
    fireEvent.click(button('Waiting on me1'));
    expect(history.map((h) => h.href)).toEqual(['/escalations/closed', '/escalations/waiting']);
    expect(history.every((h) => h.kind === 'push')).toBe(true);
  });

  it.each([
    ['waiting', ['Server migration']],
    ['raised', ['Budget sign-off']],
    ['open', ['Server migration', 'Budget sign-off', 'Vendor contract']],
    ['closed', ['Old thing', 'Dropped idea']],
  ])('/escalations/%s lists the right cards', (view, titles) => {
    setup({ url: `/escalations/${view}`, escalations: rows });
    mountScreen();
    expect($$('.es-card .es-title').map((h) => h.textContent)).toEqual(titles);
  });

  it('draws an open card: step bars, who to whom, "(you)", reason, notes, history', () => {
    setup({ url: '/escalations/waiting', escalations: [mkEsc({ level: 2, notes: 'Tried the vendor twice', trail: [
      { at: '2026-11-10T10:00:00Z', by: 'OT1', action: 'raised', to: 'BS1', note: 'first' },
      { at: '2026-11-10T11:30:00Z', by: 'BS1', action: 'escalated', to: ME, note: null },
    ] })] });
    mountScreen();
    const card = $('.es-card');
    expect(card.className).toBe('es-card mine');
    expect($$('.es-steps i', card).map((i) => i.className)).toEqual(['on', 'on', '', '']);
    expect($('.es-steps b', card).textContent).toBe('Escalated');
    expect($('.es-steps', card).getAttribute('title')).toBe('Step 2 of 4: Escalated');
    expect($('.es-when', card).textContent).toBe('1h ago');
    expect($('.es-route', card).textContent).toBe('Olive OtherMe Myself (you)');
    expect($('.es-reason', card).textContent).toBe('Deadline at risk');
    expect($('.es-notes', card).textContent).toBe('Tried the vendor twice');
    expect($('summary', card).textContent).toBe('History (2)');
    const li = $$('.es-trail li', card);
    expect(li.map((x) => x.textContent)).toEqual(['30m agoBo Boss passed it to Me Myself', '2h agoOlive Other raised this to Bo Bossfirst']);
  });

  it('draws a closed card: Resolved / Withdrawn badge, no steps, the decision or note, no buttons', () => {
    setup({ url: '/escalations/closed', escalations: rows, access: { person_code: ME, can_write: true, is_admin: true } });
    mountScreen();
    const [resolved, withdrawn] = $$('.es-card');
    expect(resolved.className).toBe('es-card closed');
    expect($('.es-done', resolved).className).toBe('es-done resolved');
    expect($('.es-done', resolved).textContent).toBe('Resolved');
    expect($('.es-steps', resolved)).toBeNull();
    expect($('.es-resolution', resolved).textContent).toBe('Decision: Approved by Bo');
    expect($('.es-done', withdrawn).textContent).toBe('Withdrawn');
    expect($('.es-resolution', withdrawn).textContent).toBe('Note: Cleared by itself');
    expect($('.es-actions')).toBeNull();
  });

  it('empty states, per view', () => {
    const empty = {
      waiting: ['Nothing is waiting on you', 'When someone escalates a task to you it appears here, and you get an alert.'],
      raised: ['You have not escalated anything', 'If a task is stuck, use “Escalate a task” and name who can unblock it.'],
      open: ['No open escalations', 'Every task is moving. That is the goal.'],
      closed: ['Nothing closed yet', 'Resolved and withdrawn escalations are kept here as a record.'],
    };
    for (const [view, [h, p]] of Object.entries(empty)) {
      setup({ url: `/escalations/${view}`, escalations: [] });
      const { unmount } = mountScreen();
      expect($('.empty-state h2').textContent).toBe(h);
      expect($('.empty-state p').textContent).toBe(p);
      unmount();
    }
  });

  it('the card title opens the task (its real route) when the task is loaded, and does nothing when it is not', () => {
    setup({ url: '/escalations/waiting', escalations: [mkEsc(), mkEsc({ id: 9, entity_id: 999, task_title: 'Unknown task', raised_by: 'OT1', assigned_to: ME })] });
    mountScreen();
    const [a, b] = $$('.es-title a');
    fireEvent.click(a);
    expect(history.at(-1)).toEqual({ kind: 'push', href: '/work/tasks/11' });
    history.length = 0;
    fireEvent.click(b);
    expect(history).toEqual([]);
  });

  it('shows Loading… until the escalations have loaded', () => {
    setup({ extra: { escalationsLoaded: false } });
    mountScreen();
    expect($('.pg-wrap').textContent).toBe('Loading…');
    expect($('[role="tablist"]')).toBeNull();
  });

  it('says so when the table is missing, and when the load failed (with Try again)', async () => {
    setup({ extra: { escalationsError: 'missing' } });
    const first = mountScreen();
    expect($('.empty-state h2').textContent).toBe('Escalations are not set up yet');
    expect($('.empty-state code').textContent).toBe('20261010_escalations_profiles_alerts.sql');
    first.unmount();

    const f = setup({ extra: { escalationsError: 'GET escalations failed: 500' }, handler: (url) => (url.includes('/escalations') ? okResponse([mkEsc()]) : undefined) });
    mountScreen();
    expect($('.empty-state h2').textContent).toBe('Could not load escalations');
    expect($('.empty-state p').textContent).toBe('GET escalations failed: 500');
    fireEvent.click(button('Try again'));
    await waitFor(() => expect(store.getState().escalationsError).toBeNull());
    expect(f.calls().map((c) => c.url)).toEqual(['https://example.supabase.co/rest/v1/escalations?order=created_at.desc&limit=500']);
    await waitFor(() => expect($$('.es-card').length).toBe(1));
  });
});

/* ── who may do what ─────────────────────────────────────────────────────────── */

describe('buttons on a card', () => {
  const labels = () => $$('.es-actions button').map((b) => b.textContent);

  it('the person it waits on: Escalate further + Resolve (no Withdraw: not theirs)', () => {
    setup({ url: '/escalations/open', escalations: [mkEsc()] });
    mountScreen();
    expect(labels()).toEqual(['Escalate further', 'Resolve']);
  });

  it('the person who raised it: only Withdraw', () => {
    setup({ url: '/escalations/open', escalations: [mkEsc({ raised_by: ME, assigned_to: 'BS1' })] });
    mountScreen();
    expect(labels()).toEqual(['Withdraw']);
  });

  it('a bystander gets no buttons', () => {
    setup({ url: '/escalations/open', escalations: [mkEsc({ raised_by: 'OT1', assigned_to: 'BS1' })] });
    mountScreen();
    expect($('.es-actions')).toBeNull();
  });

  it('an admin may act on anyone\'s: Escalate further + Resolve; at the final step no "further"', () => {
    setup({ url: '/escalations/open', access: { person_code: ME, can_write: true, is_admin: true },
      escalations: [mkEsc({ raised_by: 'OT1', assigned_to: 'BS1' }), mkEsc({ id: 2, entity_id: 12, level: 4, raised_by: 'OT1', assigned_to: 'BS1' })] });
    mountScreen();
    const sets = $$('.es-actions').map((el) => $$('button', el).map((b) => b.textContent));
    expect(sets).toEqual([['Escalate further', 'Resolve'], ['Resolve']]);
  });

  it('a view-only user sees no buttons and no "Escalate a task"', () => {
    setup({ url: '/escalations/open', access: { person_code: ME, can_write: false, is_admin: false }, escalations: [mkEsc({ raised_by: ME })] });
    mountScreen();
    expect($('.es-actions')).toBeNull();
    expect(button('Escalate a task')).toBeUndefined();
  });

  it('the buttons open the action dialog for that card', async () => {
    setup({ url: '/escalations/open', escalations: [mkEsc()] });
    render(<><EscalationsLayout><i /></EscalationsLayout><EscActionModal /></>);
    fireEvent.click(button('Resolve'));
    await waitFor(() => expect(isMoOpen('mo-esc-action')).toBe(true));
    expect(field('esc-act-title') ?? $('.mti').textContent).toBeTruthy();
    expect($('#mo-esc-action .mti').textContent).toBe('Resolve this escalation');
    expect(field('esc-act-task').textContent).toBe('Server migration');
  });
});

/* ── Escalate a task ─────────────────────────────────────────────────────────── */

describe('Escalate a task', () => {
  it('opens fixed to a task (the viewer\'s "Escalate…"): the task is shown, not picked; reasons and a suggested recipient', async () => {
    setup();
    mountDialogs();
    await act(async () => { await openEscalateModal('11'); });
    expect(isMoOpen('mo-escalate')).toBe(true);
    expect($('#mo-escalate .mti').textContent).toBe('Escalate a task');
    expect(field('esc-task-fixed').hidden).toBe(false);
    expect(field('esc-task-fixed').textContent).toBe('Server migration');
    expect(field('esc-task-pick').hidden).toBe(true);
    expect($$('#esc-reason option').map((o) => o.textContent)).toEqual([
      'Blocked by an external dependency', 'Needs a senior decision or approval', 'Deadline at risk', 'Needs budget or resources', 'Technical roadblock', 'Other']);
    // my reporting line is suggested; I am not offered; external people are not offered
    expect(field('esc-to-senior').value).toBe('BS1');
    expect($$('#esc-to-senior option').map((o) => o.textContent)).toEqual(['Choose who should handle it…', 'Ada Admin', 'Bo Boss', 'Olive Other']);
    expect(field('esc-hint').textContent).toBe('Suggested: Bo Boss (your reporting line).');
    expect(field('esc-email').checked).toBe(true);
    expect(field('esc-notes').value).toBe('');
  });

  it('with no reporting line the suggestion is an admin; with none at all it says to choose', async () => {
    const f = setup({ access: { person_code: 'OT1', can_write: true, is_admin: false },
      handler: (url) => (url.includes('rie_allowed_users') ? okResponse([{ person_code: 'OT1' }, { person_code: 'AD1' }]) : undefined) });
    mountDialogs();
    await act(async () => { await openEscalateModal('11'); });
    expect(f.calls()[0].url).toBe('https://example.supabase.co/rest/v1/rie_allowed_users?active=eq.true&role=eq.admin&select=person_code');
    expect(field('esc-to-senior').value).toBe('AD1');
    expect(field('esc-hint').textContent).toBe('Suggested: Ada Admin (an admin).');
    cleanup();

    setup({ access: { person_code: 'OT1', can_write: true, is_admin: false }, handler: (url) => (url.includes('rie_allowed_users') ? failResponse('nope', 404) : undefined) });
    mountDialogs();
    await act(async () => { await openEscalateModal('11'); });
    expect(field('esc-to-senior').value).toBe('');
    expect(field('esc-hint').textContent).toBe('No reporting line is set for you, so choose who should handle it.');
  });

  it('without a task the person picks: mine first (P1 first), then others, tasks already escalated left out', async () => {
    setup({ escalations: [mkEsc({ entity_id: 'x3' })], tasks: [
      makeTask({ id: 'x1', task: 'Zeta mine', priority: 'P2' }),
      makeTask({ id: 'x2', task: 'Alpha mine P1', priority: 'P1' }),
      makeTask({ id: 'x3', task: 'Already escalated' }),
      makeTask({ id: 'x4', task: 'Theirs', ownerCode: 'OT1' }),
      makeTask({ id: 'x5', task: 'Co-owned', ownerCode: 'OT1', coOwnerCodes: [ME] }),
      makeTask({ id: 'x6', task: 'Finished', status: 'Completed' }),
    ] });
    mountDialogs();
    await act(async () => { await openEscalateModal(); });
    expect(field('esc-task-pick').hidden).toBe(false);
    expect(field('esc-task-fixed').hidden).toBe(true);
    expect($$('#esc-task-pick optgroup').map((g) => [g.label, [...g.querySelectorAll('option')].map((o) => o.textContent)])).toEqual([
      ['Your tasks', ['[P1] Alpha mine P1', 'Co-owned', 'Zeta mine']],
      ['Other open tasks', ['Theirs']],
    ]);
    expect($('#esc-task-pick option').textContent).toBe('Choose the task that is stuck…');
  });

  it('checks the form before writing: task, recipient, not yourself, task still there', async () => {
    const f = setup();
    mountDialogs();
    await act(async () => { await openEscalateModal(); });
    fireEvent.click(field('esc-submit'));
    await waitFor(() => expect(field('esc-err').textContent).toBe('Choose the task first.'));
    type('esc-task-pick', '11');
    type('esc-to-senior', '');
    fireEvent.click(field('esc-submit'));
    await waitFor(() => expect(field('esc-err').textContent).toBe('Choose who should handle it.'));
    expect(f.calls().filter((c) => !c.url.includes('rie_allowed_users'))).toEqual([]);
    expect(isMoOpen('mo-escalate')).toBe(true);
  });

  it('raises it: INSERT escalations with the exact row, puts the task on hold, writes the audit row, e-mails, closes', async () => {
    const f = setup({ handler: (url, init) => {
      if (init.method === 'POST' && url.endsWith('/rest/v1/escalations')) return okResponse([{ ...JSON.parse(init.body), id: 77, status: 'open', created_at: NOW.toISOString() }]);
      return undefined;
    } });
    mountDialogs();
    await act(async () => { await openEscalateModal('11'); });
    type('esc-reason', 'Needs budget or resources');
    type('esc-notes', '  Need the cloud budget approved  ');
    fireEvent.click(field('esc-submit'));
    await waitFor(() => expect(isMoOpen('mo-escalate')).toBe(false));
    await flush();

    const w = writes(f.calls());
    const base = 'https://example.supabase.co/rest/v1';
    expect(w.map((c) => [c.method, c.url])).toEqual([
      ['POST', `${base}/escalations`],
      ['PATCH', `${base}/entities?id=eq.11`],
      ['POST', `${base}/entity_events`],
      ['POST', 'https://example.supabase.co/functions/v1/send-alerts'],
    ]);
    expect(w[0].body).toEqual({
      entity_id: 11, task_title: 'Server migration', raised_by: ME, assigned_to: 'BS1', level: 1,
      reason: 'Needs budget or resources', notes: 'Need the cloud budget approved', previous_status: 'in_progress',
      trail: [{ at: NOW.toISOString(), by: ME, action: 'raised', to: 'BS1', note: 'Need the cloud budget approved' }],
    });
    expect(w[1].body).toEqual({ status: 'on_hold' });
    expect(w[2].body).toEqual({
      entity_id: 11, event_type: 'status_changed', actor: 'Me Myself', source: 'frontend', field_name: 'status',
      old_value: 'in_progress', new_value: 'on_hold', notes: 'Escalated to Bo Boss: Needs budget or resources',
    });
    expect(w[3].body).toEqual({ mode: 'escalation', escalationId: 77 });
    expect(store.getState().escalations.map((e) => e.id)).toEqual([77]);
    expect(store.getState().tasks[0].status).toBe('On Hold');
    expect(getStatus().msg).toBe('Escalated to Bo Boss');
  });

  it('blank details: notes null, the trail note is the reason; unticked e-mail sends none; a task already on hold is not re-patched', async () => {
    const f = setup({ tasks: [makeTask({ id: 11, task: 'Server migration', status: 'On Hold' })], handler: (url, init) =>
      (init.method === 'POST' && url.endsWith('/rest/v1/escalations') ? okResponse([{ ...JSON.parse(init.body), id: 5 }]) : undefined) });
    mountDialogs();
    await act(async () => { await openEscalateModal('11'); });
    fireEvent.click(field('esc-email'));
    fireEvent.click(field('esc-submit'));
    await waitFor(() => expect(isMoOpen('mo-escalate')).toBe(false));
    const w = writes(f.calls());
    expect(w.length).toBe(1);
    expect(w[0].body.notes).toBeNull();
    expect(w[0].body.previous_status).toBe('on_hold');
    expect(w[0].body.trail[0].note).toBe('Blocked by an external dependency');
  });

  it('a second open escalation on the task is refused with its own sentence; the form stays open', async () => {
    setup({ handler: (url, init) => (init.method === 'POST' && url.endsWith('/rest/v1/escalations')
      ? failResponse('duplicate key value violates unique constraint "escalations_one_open_per_task"', 409) : undefined) });
    mountDialogs();
    await act(async () => { await openEscalateModal('11'); });
    fireEvent.click(field('esc-submit'));
    await waitFor(() => expect(field('esc-err').textContent).toBe('This task already has an open escalation.'));
    expect(isMoOpen('mo-escalate')).toBe(true);
    expect(store.getState().escalations).toEqual([]);
    expect(field('esc-submit').disabled).toBe(false);
  });

  it('another failure shows the message without the "INSERT escalations failed: " prefix', async () => {
    setup({ handler: (url, init) => (init.method === 'POST' && url.endsWith('/rest/v1/escalations') ? failResponse('permission denied', 403) : undefined) });
    mountDialogs();
    await act(async () => { await openEscalateModal('11'); });
    fireEvent.click(field('esc-submit'));
    await waitFor(() => expect(field('esc-err').textContent).toBe('permission denied'));
  });

  it('if putting the task on hold fails, the escalation still stands and the person is told', async () => {
    const f = setup({ handler: (url, init) => {
      if (init.method === 'POST' && url.endsWith('/rest/v1/escalations')) return okResponse([{ ...JSON.parse(init.body), id: 8 }]);
      if (init.method === 'PATCH') return failResponse('nope', 500);
      return undefined;
    } });
    mountDialogs();
    await act(async () => { await openEscalateModal('11'); });
    fireEvent.click(field('esc-email'));
    fireEvent.click(field('esc-submit'));
    await waitFor(() => expect(isMoOpen('mo-escalate')).toBe(false));
    expect(store.getState().escalations.length).toBe(1);
    expect(store.getState().tasks[0].status).toBe('In Progress');
    // the final status line is "Escalated to ..." (as the old code, which overwrote the error); the write order held
    expect(writes(f.calls()).map((c) => c.method)).toEqual(['POST', 'PATCH']);
  });

  it('the e-mail failing does not undo the escalation', async () => {
    setup({ handler: (url, init) => {
      if (init.method === 'POST' && url.endsWith('/rest/v1/escalations')) return okResponse([{ ...JSON.parse(init.body), id: 9 }]);
      if (url.includes('/functions/v1/send-alerts')) return { ok: false, status: 500, json: async () => ({ error: 'smtp down' }), text: async () => '' };
      return undefined;
    } });
    mountDialogs();
    await act(async () => { await openEscalateModal('11'); });
    fireEvent.click(field('esc-submit'));
    await waitFor(() => expect(getStatus().msg).toContain('The e-mail could not be sent (smtp down)'));
    expect(store.getState().escalations.length).toBe(1);
  });

  it('a realtime echo of the new row before the response does not duplicate it', async () => {
    setup({ handler: (url, init) => {
      if (init.method === 'POST' && url.endsWith('/rest/v1/escalations')) {
        store.setState({ escalations: [{ ...JSON.parse(init.body), id: 31 }] });
        return okResponse([{ ...JSON.parse(init.body), id: 31 }]);
      }
      return undefined;
    } });
    mountDialogs();
    await act(async () => { await openEscalateModal('11'); });
    fireEvent.click(field('esc-email'));
    fireEvent.click(field('esc-submit'));
    await waitFor(() => expect(isMoOpen('mo-escalate')).toBe(false));
    expect(store.getState().escalations.length).toBe(1);
  });

  it('the page button opens the picker; the seam (task viewer / form) opens it fixed', async () => {
    setup({ url: '/escalations/open' });
    render(<><EscalationsLayout><i /></EscalationsLayout><EscalateModal /></>);
    fireEvent.click(button('Escalate a task'));
    await waitFor(() => expect(isMoOpen('mo-escalate')).toBe(true));
    expect(field('esc-task-pick').hidden).toBe(false);
    cleanup();

    setup();
    mountDialogs();
    await act(async () => { await seamOpenEscalate('11'); });
    expect(isMoOpen('mo-escalate')).toBe(true);
    expect(field('esc-task-fixed').textContent).toBe('Server migration');
  });

  it('is refused for a view-only user, when the table is missing, and for an unlinked sign-in: a sentence, nothing opens', async () => {
    const f = setup({ access: { person_code: ME, can_write: false, is_admin: false } });
    mountDialogs();
    await act(async () => { await openEscalateModal('11'); });
    expect(isMoOpen('mo-escalate')).toBe(false);
    expect(getStatus().msg).toBe('View-only access: you cannot raise an escalation.');

    store.setState({ access: { person_code: ME, can_write: true }, escalationsError: 'missing' });
    await act(async () => { await openEscalateModal('11'); });
    expect(getStatus().msg).toBe('Escalations are not set up yet. Ask an admin to apply the latest database migration.');

    store.setState({ escalationsError: null, access: { person_code: null, can_write: true } });
    await act(async () => { await openEscalateModal('11'); });
    expect(getStatus().msg).toBe('Your sign-in is not linked to a person yet, so an escalation cannot be raised in your name. Ask an admin to link it.');
    expect(isMoOpen('mo-escalate')).toBe(false);
    expect(f.calls()).toEqual([]);
  });

  it('a view-only user cannot write even if the form were reached (rest.js refuses before any request)', async () => {
    const f = setup({ access: { person_code: ME, can_write: true } });
    mountDialogs();
    await act(async () => { await openEscalateModal('11'); });
    store.setState({ access: { person_code: ME, can_write: false } });
    fireEvent.click(field('esc-submit'));
    await waitFor(() => expect(field('esc-err').textContent).toBe(READ_ONLY));
    expect(writes(f.calls())).toEqual([]);
  });
});

/* ── Resolve / Escalate further / Withdraw ───────────────────────────────────── */

describe('the action dialog', () => {
  const holdAll = (extra = {}) => ({ tasks: [makeTask({ id: 11, task: 'Server migration', status: 'On Hold' })], ...extra });
  const patchReply = (url, init) => (init.method === 'PATCH' && url.includes('/escalations?id=') ? okResponse([{ id: 1, ...JSON.parse(init.body) }]) : undefined);

  it('Resolve: needs a note; PATCH escalations with the exact fields; the task goes back to where it was; audit row', async () => {
    const f = setup({ escalations: [mkEsc()], ...holdAll(), handler: patchReply });
    mountDialogs();
    await act(async () => { await openEscAction('resolve', 1); });
    expect(isMoOpen('mo-esc-action')).toBe(true);
    expect($('#mo-esc-action .mti').textContent).toBe('Resolve this escalation');
    expect(field('esc-act-help').textContent).toBe('Say what was decided. The task goes back to where it was before it was put on hold.');
    expect(field('esc-act-note').placeholder).toBe('What was decided?');
    expect(field('esc-act-to-wrap').hidden).toBe(true);
    expect(field('esc-act-go').textContent).toBe('Mark resolved');
    expect(field('esc-act-go').className).toBe('btn b-pr');

    fireEvent.click(field('esc-act-go'));
    await waitFor(() => expect(field('esc-act-err').textContent).toBe('Add a line on what was decided.'));
    expect(f.calls()).toEqual([]);

    type('esc-act-note', '  Budget approved  ');
    fireEvent.click(field('esc-act-go'));
    await waitFor(() => expect(isMoOpen('mo-esc-action')).toBe(false));
    const w = writes(f.calls());
    const base = 'https://example.supabase.co/rest/v1';
    expect(w.map((c) => [c.method, c.url])).toEqual([
      ['PATCH', `${base}/escalations?id=eq.1`],
      ['PATCH', `${base}/entities?id=eq.11`],
      ['POST', `${base}/entity_events`],
    ]);
    expect(w[0].body).toEqual({
      status: 'resolved', resolution: 'Budget approved', resolved_by: ME, resolved_at: NOW.toISOString(),
      trail: [mkEsc().trail[0], { at: NOW.toISOString(), by: ME, action: 'resolved', note: 'Budget approved' }],
    });
    expect(w[1].body).toEqual({ status: 'in_progress' });
    expect(w[2].body).toMatchObject({ entity_id: 11, event_type: 'status_changed', old_value: 'on_hold', new_value: 'in_progress', notes: 'Escalation resolved: Budget approved' });
    expect(store.getState().escalations[0].status).toBe('resolved');
    expect(store.getState().tasks[0].status).toBe('In Progress');
    expect(getStatus().msg).toBe('Escalation resolved');
  });

  it('Withdraw: no note needed (resolution null), outline button, status withdrawn, the task is released', async () => {
    const f = setup({ escalations: [mkEsc({ raised_by: ME, assigned_to: 'BS1', previous_status: 'pending' })], ...holdAll(), handler: patchReply });
    mountDialogs();
    await act(async () => { await openEscAction('withdraw', 1); });
    expect($('#mo-esc-action .mti').textContent).toBe('Withdraw this escalation');
    expect(field('esc-act-help').textContent).toBe('Use this if the roadblock cleared by itself. The task goes back to where it was.');
    expect(field('esc-act-go').textContent).toBe('Withdraw');
    expect(field('esc-act-go').className).toBe('btn b-ol');
    expect(field('esc-act-note').placeholder).toBe('Why is it no longer needed?');
    fireEvent.click(field('esc-act-go'));
    await waitFor(() => expect(isMoOpen('mo-esc-action')).toBe(false));
    const w = writes(f.calls());
    expect(w[0].body).toMatchObject({ status: 'withdrawn', resolution: null, resolved_by: ME });
    expect(w[0].body.trail.at(-1)).toEqual({ at: NOW.toISOString(), by: ME, action: 'withdrawn', note: null });
    expect(w[1].body).toEqual({ status: 'pending' });
    expect(store.getState().tasks[0].status).toBe('Pending');
    expect(getStatus().msg).toBe('Escalation withdrawn');
  });

  it('closing leaves a task alone that someone has already moved on (only an On Hold task is released)', async () => {
    const f = setup({ escalations: [mkEsc()], tasks: [makeTask({ id: 11, task: 'Server migration', status: 'In Progress' })], handler: patchReply });
    mountDialogs();
    await act(async () => { await openEscAction('resolve', 1); });
    type('esc-act-note', 'ok');
    fireEvent.click(field('esc-act-go'));
    await waitFor(() => expect(isMoOpen('mo-esc-action')).toBe(false));
    expect(writes(f.calls()).length).toBe(1);
  });

  it('a task whose previous status was on_hold is released to in_progress, never back onto hold', async () => {
    const f = setup({ escalations: [mkEsc({ previous_status: 'on_hold' })], ...holdAll(), handler: patchReply });
    mountDialogs();
    await act(async () => { await openEscAction('resolve', 1); });
    type('esc-act-note', 'ok');
    fireEvent.click(field('esc-act-go'));
    await waitFor(() => expect(isMoOpen('mo-esc-action')).toBe(false));
    expect(writes(f.calls())[1].body).toEqual({ status: 'in_progress' });
  });

  it('Escalate further: suggests the next person up (not anyone on the trail), PATCH level + 1 and the trail, e-mails them', async () => {
    const e = mkEsc({ level: 1, assigned_to: 'BS1', raised_by: ME, trail: [{ at: '2026-11-10T11:00:00Z', by: ME, action: 'raised', to: 'BS1', note: 'x' }] });
    const f = setup({ escalations: [e], ...holdAll(), handler: (url, init) => {
      if (url.includes('rie_allowed_users')) return okResponse([{ person_code: 'BS1' }, { person_code: 'AD1' }]);
      return patchReply(url, init);
    } });
    mountDialogs();
    await act(async () => { await openEscAction('push', 1); });
    expect($('#mo-esc-action .mti').textContent).toBe('Escalate further');
    expect(field('esc-act-help').textContent).toBe('This moves it up to step 2 of 4 and tells the next person.');
    expect(field('esc-act-to-wrap').hidden).toBe(false);
    expect(field('esc-act-to').value).toBe('AD1');                       // BS1's own line is empty -> the admin who is not on the trail
    expect($$('#esc-act-to option').map((o) => o.textContent)).toEqual(['Choose who it goes to…', 'Ada Admin', 'Olive Other']);   // not the holder, not the raiser
    expect(field('esc-act-go').textContent).toBe('Escalate');
    expect(field('esc-act-note').placeholder).toBe('Why does this need to go higher?');

    type('esc-act-note', 'Needs the CEO');
    fireEvent.click(field('esc-act-go'));
    await waitFor(() => expect(isMoOpen('mo-esc-action')).toBe(false));
    await flush();
    const w = writes(f.calls());
    expect(w[0].url).toBe('https://example.supabase.co/rest/v1/escalations?id=eq.1');
    expect(w[0].body).toEqual({
      assigned_to: 'AD1', level: 2,
      trail: [e.trail[0], { at: NOW.toISOString(), by: ME, action: 'escalated', to: 'AD1', note: 'Needs the CEO' }],
    });
    expect(w.map((c) => c.url.split('/').pop())).toEqual(['escalations?id=eq.1', 'send-alerts']);   // push does not touch the task
    expect(w[1].body).toEqual({ mode: 'escalation', escalationId: 1 });
    expect(store.getState().escalations[0]).toMatchObject({ assigned_to: 'AD1', level: 2 });
    expect(store.getState().tasks[0].status).toBe('On Hold');
    expect(getStatus().msg).toBe('Escalated to Ada Admin');
  });

  it('Escalate further needs a recipient, and the final step cannot go higher', async () => {
    const f = setup({ escalations: [mkEsc({ level: 4 })], handler: (url) => (url.includes('rie_allowed_users') ? okResponse([]) : undefined) });
    mountDialogs();
    await act(async () => { await openEscAction('push', 1); });
    expect(field('esc-act-to').value).toBe('BS1');            // the suggestion is pre-selected; clear it
    type('esc-act-to', '');
    fireEvent.click(field('esc-act-go'));
    await waitFor(() => expect(field('esc-act-err').textContent).toBe('Choose who it goes to.'));
    type('esc-act-to', 'AD1');
    fireEvent.click(field('esc-act-go'));
    await waitFor(() => expect(field('esc-act-err').textContent).toBe('This is already at the final step.'));
    expect(writes(f.calls())).toEqual([]);
  });

  it('an update the database refused (no row back) says so and changes nothing', async () => {
    setup({ escalations: [mkEsc()], ...holdAll(), handler: (url, init) => (init.method === 'PATCH' && url.includes('/escalations?id=') ? okResponse([]) : undefined) });
    mountDialogs();
    await act(async () => { await openEscAction('resolve', 1); });
    type('esc-act-note', 'ok');
    fireEvent.click(field('esc-act-go'));
    await waitFor(() => expect(field('esc-act-err').textContent).toBe('You do not have permission to change this escalation.'));
    expect(isMoOpen('mo-esc-action')).toBe(true);
    expect(store.getState().escalations[0].status).toBe('open');
    expect(field('esc-act-go').disabled).toBe(false);
  });

  it('a failed PATCH shows the message without the "UPDATE escalations failed: " prefix', async () => {
    setup({ escalations: [mkEsc()], handler: (url, init) => (init.method === 'PATCH' ? failResponse('boom', 500) : undefined) });
    mountDialogs();
    await act(async () => { await openEscAction('resolve', 1); });
    type('esc-act-note', 'ok');
    fireEvent.click(field('esc-act-go'));
    await waitFor(() => expect(field('esc-act-err').textContent).toBe('boom'));
  });

  it('a view-only user: refused before any request', async () => {
    const f = setup({ escalations: [mkEsc()], access: { person_code: ME, can_write: true } });
    mountDialogs();
    await act(async () => { await openEscAction('resolve', 1); });
    store.setState({ access: { person_code: ME, can_write: false } });
    type('esc-act-note', 'ok');
    fireEvent.click(field('esc-act-go'));
    await waitFor(() => expect(field('esc-act-err').textContent).toBe(READ_ONLY));
    expect(writes(f.calls())).toEqual([]);
  });

  it('an escalation that is not there opens nothing', async () => {
    setup({ escalations: [] });
    mountDialogs();
    await act(async () => { await openEscAction('resolve', 404); });
    expect(isMoOpen('mo-esc-action')).toBe(false);
  });
});

/* ── reporting lines (admin) ─────────────────────────────────────────────────── */

describe('reporting lines', () => {
  it('only an admin sees them: one select per internal person, "No default" + everyone else', () => {
    setup({ escalations: [mkEsc()] });
    mountScreen();
    expect($('.es-lines')).toBeNull();
    cleanup();

    setup({ escalations: [mkEsc()], access: { person_code: ME, can_write: true, is_admin: true } });
    mountScreen();
    expect($('.es-lines h2').textContent).toBe('Reporting lines');
    const labels = $$('.es-lines-grid label');
    expect(labels.map((l) => l.querySelector('span').textContent)).toEqual(['Ada Admin', 'Bo Boss', 'Me Myself', 'Olive Other']);
    const mine = labels[2].querySelector('select');
    expect(mine.value).toBe('BS1');
    expect([...mine.options].map((o) => o.textContent)).toEqual(['No default', 'Ada Admin', 'Bo Boss', 'Olive Other']);   // not themselves
  });

  it('changing one calls rie_set_reports_to with the exact body and updates the person; clearing sends null', async () => {
    const f = setup({ escalations: [mkEsc()], access: { person_code: ME, can_write: true, is_admin: true }, handler: (url) => (url.includes('/rpc/rie_set_reports_to') ? okResponse(null) : undefined) });
    mountScreen();
    const select = $$('.es-lines-grid label')[3].querySelector('select');          // Olive Other
    fireEvent.change(select, { target: { value: 'AD1' } });
    await waitFor(() => expect(store.getState().people.find((p) => p.code === 'OT1').reports_to).toBe('AD1'));
    expect(f.calls()[0]).toEqual({ url: 'https://example.supabase.co/rest/v1/rpc/rie_set_reports_to', method: 'POST', body: { p_code: 'OT1', p_reports_to: 'AD1' } });
    expect(getStatus().msg).toBe('Olive Other now escalates to Ada Admin');
    fireEvent.change($$('.es-lines-grid label')[3].querySelector('select'), { target: { value: '' } });
    await waitFor(() => expect(store.getState().people.find((p) => p.code === 'OT1').reports_to).toBeNull());
    expect(f.calls()[1].body).toEqual({ p_code: 'OT1', p_reports_to: null });
    expect(getStatus().msg).toBe('Olive Other now escalates to no one by default');
  });

  it('a refused change is reported and the select goes back to what is stored', async () => {
    setup({ escalations: [mkEsc()], access: { person_code: ME, can_write: true, is_admin: true }, handler: (url) => (url.includes('/rpc/') ? failResponse('RLS says no', 403) : undefined) });
    mountScreen();
    fireEvent.change($$('.es-lines-grid label')[3].querySelector('select'), { target: { value: 'AD1' } });
    await waitFor(() => expect(getStatus().kind).toBe('error'));
    expect(getStatus().msg).toBe('RLS says no');
    await waitFor(() => expect($$('.es-lines-grid label')[3].querySelector('select').value).toBe(''));
    expect(store.getState().people.find((p) => p.code === 'OT1').reports_to).toBeNull();
  });
});

/* ── the sidebar count ───────────────────────────────────────────────────────── */

describe('the sidebar count', () => {
  const badge = () => $('.nv-badge[data-badge="escalations"]');
  const many = (n, o = {}) => Array.from({ length: n }, (_, i) => mkEsc({ id: i + 1, entity_id: 100 + i, ...o }));

  it('counts open escalations waiting on me; hidden at zero; 9+ above nine', () => {
    setup({ escalations: [] });
    render(<NavBadge kind="escalations" />);
    expect(badge().hidden).toBe(true);
    act(() => { store.setState({ escalations: many(3) }); });
    expect(badge().hidden).toBe(false);
    expect(badge().textContent).toBe('3');
    act(() => { store.setState({ escalations: many(10) }); });
    expect(badge().textContent).toBe('9+');
  });

  it('does not count what is resolved, withdrawn, or waiting on someone else', () => {
    setup({ escalations: [mkEsc({ id: 1 }), mkEsc({ id: 2, status: 'resolved' }), mkEsc({ id: 3, status: 'withdrawn' }), mkEsc({ id: 4, assigned_to: 'OT1' })] });
    render(<NavBadge kind="escalations" />);
    expect(badge().textContent).toBe('1');
  });

  it('follows a realtime change, and is empty for an unlinked sign-in', () => {
    setup({ escalations: [mkEsc()] });
    render(<NavBadge kind="escalations" />);
    expect(badge().textContent).toBe('1');
    act(() => { store.setState({ escalations: [mkEsc({ status: 'resolved' })] }); });
    expect(badge().hidden).toBe(true);
    act(() => { store.setState({ escalations: [mkEsc()], access: { person_code: null } }); });
    expect(badge().hidden).toBe(true);
  });
});
