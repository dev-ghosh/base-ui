// Pipeline (leads): the Kanban and the table with their filters as search params, the lead form (add, edit,
// convert from a task), stage moves (optimistic, rolled back on a rejected write), the lead viewer with its
// touchpoint log, delete, and the view-only user. The real lead-actions / rest.js run; only fetch is stubbed,
// so "no fetch" is a real assertion. Expected values are worked out by hand from rie-dashboard2/js/leads.js.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent, waitFor, act } from '@testing-library/react';

process.env.NEXT_PUBLIC_SB_URL = 'https://example.supabase.co';
process.env.NEXT_PUBLIC_SB_KEY = 'anon-key-123';

const route = vi.hoisted(() => ({ params: {}, back: vi.fn() }));
vi.mock('next/navigation', async () => {
  const base = (await import('./helpers/fake-router.js')).navigationMock;
  return { ...base, useRouter: () => ({ ...base.useRouter(), back: route.back }), useParams: () => route.params };
});
vi.mock('next/link', async () => (await import('./helpers/fake-router.js')).linkMock);

import PipelineLayout from '@/app/(app)/pipeline/layout.jsx';
import BoardPage from '@/app/(app)/pipeline/board/page.jsx';
import TablePage from '@/app/(app)/pipeline/table/page.jsx';
import { LeadViewModal, LeadViewPage } from '@/features/pipeline/LeadViewRoute.jsx';
import { LeadFormProvider } from '@/features/pipeline/LeadFormProvider.jsx';
import { useLeadActions } from '@/features/pipeline/hooks/useLeadActions.js';
import { useLeads } from '@/features/pipeline/hooks/useLeads.js';
import { TaskFormProvider } from '@/features/tasks/TaskFormProvider.jsx';
import { convertTaskToLead } from '@/lib/seams.js';
import { store } from '@/store/store.js';
import { getStatus } from '@/lib/status.js';
import { seed, makeTask, stubFetch, okResponse, failResponse } from './helpers/fixtures.js';
import { history, resetNav, currentParams, currentUrl } from './helpers/fake-router.js';

const READ_ONLY = 'You have view-only access to BASE, so this change was not saved.';
const NOW = new Date('2026-11-10T12:00:00');
const daysAgo = (n) => new Date(NOW.getTime() - n * 86400000).toISOString();

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const col = (stage) => $(`.kb-col[data-stage="${stage}"]`);
const titlesIn = (root) => $$('.kb-card .kb-task', root).map((e) => e.textContent);
const colTitles = (stage) => titlesIn(col(stage));
const card = (title) => $$('.kb-card').find((c) => $('.kb-task', c).textContent === title);
const field = (id) => document.getElementById(id);
const type = (id, value) => fireEvent.change(field(id), { target: { value } });
const gate = () => { let release; const p = new Promise((r) => { release = r; }); return { p, release }; };
const lead = (id) => store.getState().leads.find((l) => l.id === id);
const bodyOf = (calls, method, pathPart) => calls.find((c) => c.method === method && c.url.includes(pathPart))?.body;

let seq = 0;
/** A lead in the store's shape (rowToLead). */
const makeLead = (o = {}) => {
  const n = ++seq;
  return {
    id: o.id ?? n, title: 'Lead ' + n, type: 'Other', stage: 'Identified', org: '', contactId: null, contactName: '', amount: null,
    deadline: '', nextStep: '', nextFollowUp: '', notes: '', outcome: '', assignedTo: '', priority: '', sourceTaskId: null,
    stageChangedAt: '', createdBy: '', createdAt: '', updatedBy: '', updatedAt: '', ...o,
  };
};

const READER = { person_code: 'ME1', can_write: false, is_admin: false };
function setup({ url = '/pipeline/board', leads = [], tasks = [], contacts = [], viewer = false, handler } = {}) {
  seed({ leads, tasks, contacts, ...(viewer ? { access: READER } : {}) });
  resetNav(url);
  return stubFetch(handler);
}
const mountBoard = () => render(<LeadFormProvider><PipelineLayout><BoardPage /></PipelineLayout></LeadFormProvider>);
const mountTable = () => render(<LeadFormProvider><PipelineLayout><TablePage /></PipelineLayout></LeadFormProvider>);
const mountViewer = (framed = false) => render(
  <LeadFormProvider><TaskFormProvider>{framed ? <LeadViewPage /> : <LeadViewModal />}</TaskFormProvider></LeadFormProvider>,
);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  route.params = {};
  route.back.mockClear();
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

/* ── the Kanban ──────────────────────────────────────────────────────────────── */

describe('/pipeline/board', () => {
  it('puts a lead in the column of its stage; Won and Lost stay behind Closed', () => {
    setup({
      leads: [
        makeLead({ id: 1, title: 'A', stage: 'Identified' }), makeLead({ id: 2, title: 'B', stage: 'In Conversation' }),
        makeLead({ id: 3, title: 'C', stage: 'On Hold' }), makeLead({ id: 4, title: 'D', stage: 'Applied/Contacted' }),
        makeLead({ id: 5, title: 'E', stage: 'Won' }), makeLead({ id: 6, title: 'F', stage: 'Lost' }), makeLead({ id: 7, title: 'G', stage: 'Identified' }),
      ],
    });
    mountBoard();
    expect($$('.kb-col').map((c) => c.dataset.stage)).toEqual(['Identified', 'Applied/Contacted', 'In Conversation', 'On Hold']);
    expect($$('.kb-col').map((c) => c.className.split(' ')[1])).toEqual(['kb-wo', 'kb-ip', 'kb-cv', 'kb-oh']);
    expect(colTitles('Identified').sort()).toEqual(['A', 'G']);
    expect(colTitles('Applied/Contacted')).toEqual(['D']);
    expect(colTitles('In Conversation')).toEqual(['B']);
    expect(colTitles('On Hold')).toEqual(['C']);
    expect($('.kb-cnt', col('Identified')).textContent).toBe('2');
    expect(col('Won')).toBeNull();
    // the button counts the closed ones even while they are hidden
    expect($('#lead-closed-toggle').textContent).toBe('Closed (2)');
  });

  it('"Closed" is a search param that adds the Won and Lost columns', async () => {
    setup({ leads: [makeLead({ id: 1, title: 'A', stage: 'Won' }), makeLead({ id: 2, title: 'B', stage: 'Lost' }), makeLead({ id: 3, title: 'C' })] });
    mountBoard();
    fireEvent.click($('#lead-closed-toggle'));
    expect(currentParams().get('closed')).toBe('1');
    await waitFor(() => expect($$('.kb-col').map((c) => c.dataset.stage)).toEqual(
      ['Identified', 'Applied/Contacted', 'In Conversation', 'On Hold', 'Won', 'Lost']));
    expect(colTitles('Won')).toEqual(['A']);
    expect(colTitles('Lost')).toEqual(['B']);
    expect($('#lead-closed-toggle').textContent).toBe('Hide closed (2)');
    expect($('#lead-closed-toggle').style.borderColor).toBe('var(--ac)');
    fireEvent.click($('#lead-closed-toggle'));
    await waitFor(() => expect(col('Won')).toBeNull());
    expect(currentParams().get('closed')).toBeNull();
  });

  it('orders a column by priority, then by the soonest follow-up; the header totals the amounts', () => {
    setup({
      leads: [
        makeLead({ id: 1, title: 'none', amount: 1000 }),
        makeLead({ id: 2, title: 'P2 late', priority: 'P2', nextFollowUp: '2026-12-01', amount: 2500 }),
        makeLead({ id: 3, title: 'P1 undated', priority: 'P1' }),
        makeLead({ id: 4, title: 'P2 soon', priority: 'P2', nextFollowUp: '2026-11-15' }),
        makeLead({ id: 5, title: 'P1 soon', priority: 'P1', nextFollowUp: '2026-11-12' }),
      ],
    });
    mountBoard();
    expect(colTitles('Identified')).toEqual(['P1 soon', 'P1 undated', 'P2 soon', 'P2 late', 'none']);
    expect($('.kb-col-hdr', col('Identified')).textContent).toBe('Identified₹3,500' + '5');
  });

  it('a card shows the contact and org, chips, next step and deadline, with the due colour and the days in stage', () => {
    setup({
      leads: [
        makeLead({ id: 1, title: 'Hot one', contactName: 'Cy Contact', org: 'Cy Org', nextFollowUp: '2026-11-01', type: 'Investor', amount: 250000,
          assignedTo: 'Ann Lee', priority: 'P1', stageChangedAt: daysAgo(15), nextStep: 'Send deck', deadline: '2026-12-31' }),
        makeLead({ id: 2, title: 'Closed one', stage: 'Won', nextFollowUp: '2026-11-01', stageChangedAt: daysAgo(40), type: 'Other' }),
        makeLead({ id: 3, title: 'Org only', org: 'Just Org' }),
      ],
      viewer: false,
    });
    mountBoard();
    const c = card('Hot one');
    expect($('.kb-contact', c).textContent).toBe('Cy Contact · Cy Org');
    const tags = $$('.kb-tag', c);
    expect(tags[0].className).toBe('kb-tag kb-due-ov');             // 1 Nov is before the 10th
    expect(tags.map((t) => t.textContent)).toEqual(['1 Nov', 'Investor', '₹2,50,000', 'Ann Lee', 'P1', '15d in stage']);
    expect(tags[4].style.color).toBe('var(--hot)');
    expect(tags[5].style.color).toBe('var(--warm)');                 // 14 days or more
    expect($('.kb-created', c).textContent).toBe('→ Send deck');
    expect($$('.kb-created', c)[1].textContent).toMatch(/^Deadline /);
    expect($('.kb-contact', card('Org only')).textContent).toBe('Just Org');
    // a lead of type Other has no type chip; a closed lead's date is muted and has no days in stage
    expect($$('.kb-tag', card('Org only')).length).toBe(0);
    expect(titlesIn(document)).not.toContain('Closed one');
  });

  it('opens the lead viewer route on a click, the form on the pencil, and a delete confirmation on the bin', () => {
    setup({ leads: [makeLead({ id: 7, title: 'Seven' })] });
    mountBoard();
    fireEvent.click($('.kb-act-btn[aria-label="Edit"]', card('Seven')));
    expect($('#mo-lf.open')).not.toBeNull();
    expect(field('lf-name').value).toBe('Seven');
    expect(history).toEqual([]);                                     // the pencil did not open the card
    fireEvent.click($('.kb-act-btn[aria-label="Delete"]', card('Seven')));
    expect($('#mo-del-lead.open')).not.toBeNull();
    expect($('#del-body-lead').textContent).toMatch(/Seven/);
    fireEvent.click(card('Seven'));
    expect(history.at(-1)).toEqual({ kind: 'push', href: '/pipeline/leads/7' });
  });

  it('search, type and owner come from the URL; an owner nobody has is ignored', () => {
    seed({
      leads: [
        makeLead({ id: 1, title: 'Seed round', type: 'Investor', assignedTo: 'Me Myself' }),
        makeLead({ id: 2, title: 'Grant', type: 'Grant', notes: 'a seed plan', assignedTo: 'Olive Other' }),
        makeLead({ id: 3, title: 'Tender', type: 'Tender', assignedTo: 'Me Myself' }),
      ],
    });
    resetNav('/pipeline/board?q=SEED&at=Me+Myself');
    stubFetch();
    mountBoard();
    expect(titlesIn(document)).toEqual(['Seed round']);               // search: title or notes; owner: Me Myself
    expect(field('lf-search').value).toBe('SEED');
    expect(field('lf-at').value).toBe('Me Myself');
    cleanup();
    resetNav('/pipeline/board?type=Tender&at=Nobody+Real');
    mountBoard();
    expect(titlesIn(document)).toEqual(['Tender']);
    expect(field('lf-at').value).toBe('');
    // the owner options: everyone onboarded, plus names already on a lead
    expect($$('#lf-at option').map((o) => o.value)).toEqual(['', 'Me Myself', 'Olive Other']);
    expect($$('#lf-type option').map((o) => o.value)).toEqual(
      ['', 'Investor', 'Grant', 'Tender', 'Govt/Official Pitch', 'Sales/BD', 'Award/Program', 'Other']);
  });

  it('typing in the search box is debounced into ?q=', async () => {
    setup({ leads: [makeLead({ title: 'Needle' }), makeLead({ title: 'Hay' })] });
    mountBoard();
    fireEvent.change(field('lf-search'), { target: { value: 'need' } });
    expect(currentParams().get('q')).toBeNull();
    await waitFor(() => expect(currentParams().get('q')).toBe('need'));
    await waitFor(() => expect(titlesIn(document)).toEqual(['Needle']));
  });

  it('the Table / Kanban switch is a link between the two routes that keeps the filters', async () => {
    setup({ url: '/pipeline/board?q=a&closed=1', leads: [makeLead({ title: 'a' })] });
    mountBoard();
    const toggle = $('#lead-view-toggle');
    expect(toggle.textContent).toBe('Table');
    expect(toggle.getAttribute('href')).toBe('/pipeline/table?q=a&closed=1');
    fireEvent.click(toggle);
    expect(currentUrl()).toBe('/pipeline/table?q=a&closed=1');
    cleanup();
    mountTable();
    expect($('#lead-view-toggle').textContent).toBe('Kanban');
    expect($('#lead-view-toggle').getAttribute('href')).toBe('/pipeline/board?q=a&closed=1');
  });

  it('reads the leads from the store as they change (realtime)', () => {
    setup({ leads: [makeLead({ id: 1, title: 'Before' })] });
    mountBoard();
    act(() => { store.setState((s) => ({ leads: [...s.leads, makeLead({ id: 2, title: 'Arrived', stage: 'On Hold' })] })); });
    expect(colTitles('On Hold')).toEqual(['Arrived']);
  });
});

/* ── moving a lead between stages ────────────────────────────────────────────── */

function drag(title, toStage) {
  const c = card(title);
  fireEvent.dragStart(c);
  fireEvent.dragOver(col(toStage));
  fireEvent.drop(col(toStage));
}

describe('moving a lead between columns (moveStage)', () => {
  it('moves the card at once, then writes the stage, the stage time and the audit line', async () => {
    const g = gate();
    const { calls } = setup({
      leads: [makeLead({ id: 1, title: 'Mover', stage: 'Identified' })],
      handler: async (url, init) => (init.method === 'PATCH' && url.includes('/leads') ? (await g.p, okResponse([{}])) : undefined),
    });
    mountBoard();
    drag('Mover', 'Applied/Contacted');
    // optimistic: the card is already in the new column and the store says so, before the server answers
    expect(colTitles('Applied/Contacted')).toEqual(['Mover']);
    expect(colTitles('Identified')).toEqual([]);
    expect(lead(1).stage).toBe('Applied/Contacted');
    expect(getStatus()).toMatchObject({ kind: 'syncing', msg: 'Updating lead stage…' });
    g.release();
    await waitFor(() => expect(getStatus()).toMatchObject({ kind: 'online', msg: 'Moved to Applied/Contacted' }));
    const patch = calls().find((c) => c.method === 'PATCH');
    expect(patch.url).toBe('https://example.supabase.co/rest/v1/leads?id=eq.1');
    expect(Object.keys(patch.body).sort()).toEqual(['stage', 'stage_changed_at', 'updated_at', 'updated_by']);
    expect(patch.body).toMatchObject({ stage: 'Applied/Contacted', updated_by: 'Me Myself', stage_changed_at: NOW.toISOString(), updated_at: NOW.toISOString() });
    await waitFor(() => expect(calls().some((c) => c.method === 'POST' && c.url.includes('/lead_history'))).toBe(true));
    expect(bodyOf(calls(), 'POST', '/lead_history')).toEqual({
      lead_id: 1, type: 'stage', notes: 'Identified → Applied/Contacted (Kanban drag-drop)', created_by: 'Me Myself',
    });
    expect(colTitles('Applied/Contacted')).toEqual(['Mover']);
  });

  it('puts the card back, and says why, when the write is refused; no audit line is written', async () => {
    const { calls } = setup({
      leads: [makeLead({ id: 1, title: 'Mover', stage: 'In Conversation' })],
      handler: async (url, init) => (init.method === 'PATCH' ? failResponse('boom') : undefined),
    });
    mountBoard();
    drag('Mover', 'On Hold');
    expect(colTitles('On Hold')).toEqual(['Mover']);                 // moved first
    await waitFor(() => expect(getStatus().kind).toBe('error'));
    expect(getStatus().msg).toBe('Update failed: UPDATE leads failed: boom');
    expect(colTitles('In Conversation')).toEqual(['Mover']);
    expect(colTitles('On Hold')).toEqual([]);
    expect(lead(1).stage).toBe('In Conversation');
    expect(calls().filter((c) => c.method === 'POST')).toEqual([]);
  });

  it('a failed history write does not undo the move', async () => {
    setup({
      leads: [makeLead({ id: 1, title: 'Mover' })],
      handler: async (url, init) => (url.includes('/lead_history') ? failResponse('nope') : undefined),
    });
    mountBoard();
    drag('Mover', 'On Hold');
    await waitFor(() => expect(getStatus()).toMatchObject({ kind: 'online', msg: 'Moved to On Hold' }));
    await act(async () => { await Promise.resolve(); });
    expect(lead(1).stage).toBe('On Hold');
  });

  it('dropping a card on its own column writes nothing', () => {
    const { calls } = setup({ leads: [makeLead({ id: 1, title: 'Stay' })] });
    mountBoard();
    drag('Stay', 'Identified');
    expect(calls()).toEqual([]);
    expect(lead(1).stage).toBe('Identified');
  });

  it('a view-only user cannot move a lead: nothing is sent and the card goes back', async () => {
    const { calls } = setup({ viewer: true, leads: [makeLead({ id: 1, title: 'Locked' })] });
    mountBoard();
    drag('Locked', 'On Hold');
    await waitFor(() => expect(getStatus().kind).toBe('error'));
    expect(getStatus().msg).toBe('Update failed: ' + READ_ONLY);
    expect(lead(1).stage).toBe('Identified');
    expect(colTitles('Identified')).toEqual(['Locked']);
    expect(calls()).toEqual([]);
  });
});

/* ── useLeads ────────────────────────────────────────────────────────────────── */

describe('useLeads', () => {
  it('returns the leads and the same leads by stage, every stage present', () => {
    setup({ leads: [makeLead({ id: 1, title: 'one', stage: 'Won' }), makeLead({ id: 2, title: 'two', stage: 'Identified' }), makeLead({ id: 3, title: 'three', stage: 'Won' })] });
    let seen;
    function Probe({ filters }) { seen = useLeads(filters); return null; }
    const { rerender } = render(<Probe />);
    expect(seen.leads.map((l) => l.id)).toEqual([1, 2, 3]);
    expect(Object.keys(seen.byStage)).toEqual(['Identified', 'Applied/Contacted', 'In Conversation', 'On Hold', 'Won', 'Lost']);
    expect(seen.byStage.Won.map((l) => l.id)).toEqual([1, 3]);
    expect(seen.byStage.Lost).toEqual([]);
    rerender(<Probe filters={{ q: 'TWO' }} />);
    expect(seen.leads.map((l) => l.id)).toEqual([2]);
    expect(seen.byStage.Won).toEqual([]);
  });
});

/* ── the table ───────────────────────────────────────────────────────────────── */

describe('/pipeline/table', () => {
  const rows = [
    makeLead({ id: 1, title: 'beta', updatedAt: '2026-01-02', amount: 500, nextFollowUp: '2026-11-01', stage: 'In Conversation', org: 'Zed', contactName: 'Zoe', priority: 'P1' }),
    makeLead({ id: 2, title: 'Alpha', updatedAt: '2026-03-01', stage: 'Identified' }),
    makeLead({ id: 3, title: 'gamma', updatedAt: '2026-02-01', stage: 'Won', nextFollowUp: '2026-11-01' }),
  ];
  const titles = () => $$('tbody tr').map((r) => r.children[0].textContent);

  it('lists open leads newest-updated first, with Won and Lost behind Closed', () => {
    setup({ url: '/pipeline/table', leads: rows });
    mountTable();
    expect($$('thead th').map((h) => h.textContent.replace(/ [↕↑↓]$/, ''))).toEqual(
      ['Lead', 'Type', 'Stage', 'Org / Contact', 'Amount', 'Deadline', 'Next Follow-up', 'Next Step', 'Owner', 'Pr']);
    expect(titles()).toEqual(['Alpha', 'beta']);
    expect($('th .sort-arrow', $$('thead th')[0]).textContent).toBe('↕');
    const r = $$('tbody tr')[1].children;
    expect([r[1].textContent, r[2].textContent, r[3].textContent, r[4].textContent, r[5].textContent, r[9].textContent])
      .toEqual(['Other', 'In Conversation', 'ZedZoe', '₹500', '—', 'P1']);
    expect(r[6].style.color).toBe('var(--hot)');                      // overdue follow-up, open lead
    expect($$('tbody tr')[0].children[6].textContent).toBe('—');
  });

  it('a column header sorts, and its direction and the column are search params', async () => {
    setup({ url: '/pipeline/table?closed=1', leads: rows });
    mountTable();
    expect(titles()).toEqual(['Alpha', 'gamma', 'beta']);
    fireEvent.click($$('thead th')[0]);
    expect(currentParams().get('sort')).toBe('title');
    expect(currentParams().get('dir')).toBe('asc');
    expect(currentParams().get('closed')).toBe('1');                   // the filters stay
    await waitFor(() => expect(titles()).toEqual(['Alpha', 'beta', 'gamma']));
    expect($('.sort-arrow', $$('thead th')[0]).textContent).toBe('↑');
    fireEvent.click($$('thead th')[0]);
    await waitFor(() => expect(titles()).toEqual(['gamma', 'beta', 'Alpha']));
    expect($('.sort-arrow', $$('thead th')[0]).textContent).toBe('↓');
    // closed rows are greyed
    expect($$('tbody tr')[0].children[6].style.color).toBe('var(--txd)');
  });

  it('a row opens the lead; no match says so', () => {
    setup({ url: '/pipeline/table', leads: rows });
    mountTable();
    fireEvent.click($$('tbody tr')[0]);
    expect(history.at(-1)).toEqual({ kind: 'push', href: '/pipeline/leads/2' });
    cleanup();
    resetNav('/pipeline/table?q=zzz');
    mountTable();
    expect($('tbody').textContent).toBe('No leads match the current filters.');
  });
});

/* ── the lead form ───────────────────────────────────────────────────────────── */

describe('the lead form', () => {
  it('+ Lead opens a blank form with the old defaults and options', () => {
    setup({ leads: [], contacts: [{ id: 5, name: 'Bob Stone' }] });
    mountBoard();
    fireEvent.click(document.querySelector('.tbar .b-pr'));
    expect($('#mo-lf.open')).not.toBeNull();
    expect($('#mo-lf .mti').textContent).toBe('Add Lead');
    expect(field('lf-name').value).toBe('');
    expect(field('lf-type-f').value).toBe('Other');
    expect(field('lf-stage-f').value).toBe('Identified');
    expect($$('#lf-stage-f option').map((o) => o.value)).toEqual(['Identified', 'Applied/Contacted', 'In Conversation', 'On Hold', 'Won', 'Lost']);
    expect($$('#lf-at-f option').map((o) => o.textContent)).toEqual(['—', 'Me Myself', 'Olive Other']);
    expect($$('#lf-priority option').map((o) => o.textContent)).toEqual(['—', 'P1 (Highest)', 'P2', 'P3 (Lowest)']);
    expect($$('#lf-contact-list option').map((o) => o.value)).toEqual(['Bob Stone']);
  });

  it('a lead needs a title: the form stays open with the message and nothing is sent', () => {
    const { calls } = setup();
    mountBoard();
    fireEvent.click(document.querySelector('.tbar .b-pr'));
    type('lf-name', '   ');
    fireEvent.click($('#mo-lf .mf .b-pr'));
    expect(getStatus()).toMatchObject({ kind: 'error', msg: 'Lead title is required' });
    expect($('#mo-lf.open')).not.toBeNull();
    expect(calls()).toEqual([]);
  });

  it('saves a new lead: the row, the matched contact, the history line, and the card appears', async () => {
    const { calls } = setup({
      contacts: [{ id: 5, name: 'Bob Stone' }],
      handler: async (url, init) => (init.method === 'POST' && url.endsWith('/leads') ? okResponse([{ id: 42, ...JSON.parse(init.body), stage: 'Identified' }]) : undefined),
    });
    mountBoard();
    fireEvent.click(document.querySelector('.tbar .b-pr'));
    type('lf-name', ' Seed round ');
    type('lf-type-f', 'Investor');
    type('lf-org', 'Acme');
    type('lf-contact', 'bob stone');
    type('lf-amount', '2500000');
    type('lf-followup', '2026-12-01');
    type('lf-at-f', 'Olive Other');
    type('lf-priority', 'P2');
    type('lf-next-step', 'Send deck');
    type('lf-notes', ' warm intro ');
    fireEvent.click($('#mo-lf .mf .b-pr'));
    expect($('#mo-lf.open')).toBeNull();                              // the form closes, the write follows
    await waitFor(() => expect(getStatus()).toMatchObject({ kind: 'online', msg: 'Lead saved' }));
    const row = bodyOf(calls(), 'POST', '/rest/v1/leads');
    expect(row).toEqual({
      title: 'Seed round', type: 'Investor', stage: 'Identified', org: 'Acme', contact_id: 5, contact_name: 'bob stone', amount: 2500000,
      deadline: null, next_step: 'Send deck', next_follow_up: '2026-12-01', notes: 'warm intro', outcome: '', assigned_to: 'Olive Other',
      priority: 'P2', source_task_id: null, updated_by: 'Me Myself', updated_at: NOW.toISOString(), created_by: 'Me Myself',
    });
    expect(colTitles('Identified')).toEqual(['Seed round']);
    await waitFor(() => expect(bodyOf(calls(), 'POST', '/lead_history')).toEqual({
      lead_id: 42, type: 'note', notes: 'Lead created in stage Identified', created_by: 'Me Myself',
    }));
  });

  it('a realtime echo that arrives before the insert answers does not duplicate the lead', async () => {
    const g = gate();
    setup({ handler: async (url, init) => (init.method === 'POST' && url.endsWith('/leads') ? (await g.p, okResponse([{ id: 9, title: 'Echo', stage: 'Identified' }])) : undefined) });
    mountBoard();
    fireEvent.click(document.querySelector('.tbar .b-pr'));
    type('lf-name', 'Echo');
    fireEvent.click($('#mo-lf .mf .b-pr'));
    act(() => { store.setState((s) => ({ leads: [...s.leads, makeLead({ id: 9, title: 'Echo' })] })); });
    g.release();
    await waitFor(() => expect(getStatus().msg).toBe('Lead saved'));
    expect(store.getState().leads.filter((l) => l.id === 9)).toHaveLength(1);
  });

  it('editing a lead and changing its stage writes the row with stage_changed_at and an audit line', async () => {
    const { calls } = setup({
      leads: [makeLead({ id: 3, title: 'Old name', stage: 'Identified', org: 'Org', sourceTaskId: 'task-9' })],
      handler: async (url, init) => (init.method === 'PATCH' ? okResponse([{ id: 3, title: 'New name', stage: 'Won', source_task_id: 'task-9' }]) : undefined),
    });
    mountBoard();
    fireEvent.click($('.kb-act-btn[aria-label="Edit"]', card('Old name')));
    expect($('#mo-lf .mti').textContent).toBe('Edit Lead');
    expect(field('lf-org').value).toBe('Org');
    type('lf-name', 'New name');
    type('lf-stage-f', 'Won');
    fireEvent.click($('#mo-lf .mf .b-pr'));
    await waitFor(() => expect(getStatus().msg).toBe('Lead saved'));
    const patch = calls().find((c) => c.method === 'PATCH');
    expect(patch.url).toBe('https://example.supabase.co/rest/v1/leads?id=eq.3');
    expect(patch.body).toMatchObject({ title: 'New name', stage: 'Won', stage_changed_at: NOW.toISOString(), source_task_id: 'task-9' });
    expect(patch.body).not.toHaveProperty('created_by');
    expect(lead(3)).toMatchObject({ title: 'New name', stage: 'Won' });
    await waitFor(() => expect(bodyOf(calls(), 'POST', '/lead_history')).toMatchObject({ lead_id: 3, type: 'stage', notes: 'Identified → Won' }));
  });

  it('editing without a stage change leaves stage_changed_at alone and logs nothing', async () => {
    const { calls } = setup({ leads: [makeLead({ id: 3, title: 'Same', stage: 'On Hold' })], handler: async (url, init) => (init.method === 'PATCH' ? okResponse([{ id: 3, title: 'Same 2', stage: 'On Hold' }]) : undefined) });
    mountBoard();
    fireEvent.click($('.kb-act-btn[aria-label="Edit"]', card('Same')));
    type('lf-name', 'Same 2');
    fireEvent.click($('#mo-lf .mf .b-pr'));
    await waitFor(() => expect(getStatus().msg).toBe('Lead saved'));
    expect(calls().find((c) => c.method === 'PATCH').body).not.toHaveProperty('stage_changed_at');
    expect(calls().filter((c) => c.method === 'POST')).toEqual([]);
  });

  it('reports a refused save in the status bar after closing the form (the typed values are gone)', async () => {
    setup({ handler: async (url, init) => (init.method === 'POST' ? failResponse('bad') : undefined) });
    mountBoard();
    fireEvent.click(document.querySelector('.tbar .b-pr'));
    type('lf-name', 'Doomed');
    fireEvent.click($('#mo-lf .mf .b-pr'));
    await waitFor(() => expect(getStatus().kind).toBe('error'));
    expect(getStatus().msg).toBe('Save failed: INSERT leads failed: bad');
    expect($('#mo-lf.open')).toBeNull();
    expect(store.getState().leads).toEqual([]);
  });

  it('a view-only user cannot save: nothing is sent and no lead appears', async () => {
    const { calls } = setup({ viewer: true });
    mountBoard();
    fireEvent.click(document.querySelector('.tbar .b-pr'));
    type('lf-name', 'Sneaky');
    fireEvent.click($('#mo-lf .mf .b-pr'));
    await waitFor(() => expect(getStatus().kind).toBe('error'));
    expect(getStatus().msg).toBe('Save failed: ' + READ_ONLY);
    expect(calls()).toEqual([]);
    expect(store.getState().leads).toEqual([]);
    expect(colTitles('Identified')).toEqual([]);
  });

  it('Cancel closes the form without a request', () => {
    const { calls } = setup();
    mountBoard();
    fireEvent.click(document.querySelector('.tbar .b-pr'));
    fireEvent.click($('#mo-lf .mf .b-gh'));
    expect($('#mo-lf.open')).toBeNull();
    expect(calls()).toEqual([]);
  });
});

/* ── convert from a task ─────────────────────────────────────────────────────── */

describe('convertFromTask', () => {
  const TASK = () => makeTask({
    id: 'task-1', task: 'Pitch deck', contactOrg: 'Cy Org', contactName: 'Cy Contact', nextFollowUp: '2026-12-05', actionItem: 'Draft it',
    keyInputs: 'Use the Q3 numbers', assignedTo: 'Me Myself, Olive Other', priority: 'P1',
  });
  function Convert({ id }) {
    const { convertFromTask } = useLeadActions();
    return <button type="button" id="convert-btn" onClick={() => convertFromTask(id)}>convert</button>;
  }
  const echo = async (url, init) => (init.method === 'POST' && url.endsWith('/leads') ? okResponse([{ id: 77, ...JSON.parse(init.body) }]) : undefined);

  it('opens the lead form prefilled from the task and saving it sets source_task_id', async () => {
    const { calls } = setup({ tasks: [TASK()], handler: echo });
    render(<LeadFormProvider><Convert id="task-1" /></LeadFormProvider>);
    fireEvent.click(field('convert-btn'));
    expect($('#mo-lf.open')).not.toBeNull();
    expect($('#mo-lf .mti').textContent).toBe('Convert Task to Lead');
    expect(field('lf-name').value).toBe('Pitch deck');
    expect(field('lf-org').value).toBe('Cy Org');
    expect(field('lf-contact').value).toBe('Cy Contact');
    expect(field('lf-followup').value).toBe('2026-12-05');
    expect(field('lf-notes').value).toBe('Draft it\nUse the Q3 numbers');
    expect(field('lf-at-f').value).toBe('Me Myself');                  // the first assignee only
    expect(field('lf-priority').value).toBe('P1');
    expect(field('lf-stage-f').value).toBe('Identified');
    fireEvent.click($('#mo-lf .mf .b-pr'));
    await waitFor(() => expect(getStatus().msg).toBe('Lead saved'));
    const row = bodyOf(calls(), 'POST', '/rest/v1/leads');
    expect(row.source_task_id).toBe('task-1');
    expect(row).toMatchObject({ title: 'Pitch deck', org: 'Cy Org', notes: 'Draft it\nUse the Q3 numbers', assigned_to: 'Me Myself', priority: 'P1', stage: 'Identified', type: 'Other' });
    expect(lead(77).sourceTaskId).toBe('task-1');
  });

  it('is what the Work Board\'s convert button calls (the seam), and does nothing for an unknown task', () => {
    setup({ tasks: [TASK()] });
    const { unmount } = render(<LeadFormProvider><div /></LeadFormProvider>);
    convertTaskToLead('nope');
    expect($('#mo-lf.open')).toBeNull();
    act(() => { convertTaskToLead('task-1'); });
    expect($('#mo-lf.open')).not.toBeNull();
    expect(field('lf-name').value).toBe('Pitch deck');
    unmount();
    expect(() => convertTaskToLead('task-1')).not.toThrow();           // no provider mounted: a no-op
  });

  it('a lead edited after conversion keeps its source task', async () => {
    const { calls } = setup({ leads: [makeLead({ id: 5, title: 'Converted', sourceTaskId: 'task-1' })], handler: async (u, i) => (i.method === 'PATCH' ? okResponse([{ id: 5, title: 'Converted', source_task_id: 'task-1' }]) : undefined) });
    mountBoard();
    fireEvent.click($('.kb-act-btn[aria-label="Edit"]', card('Converted')));
    fireEvent.click($('#mo-lf .mf .b-pr'));
    await waitFor(() => expect(getStatus().msg).toBe('Lead saved'));
    expect(calls().find((c) => c.method === 'PATCH').body.source_task_id).toBe('task-1');
  });
});

/* ── the lead viewer ─────────────────────────────────────────────────────────── */

describe('the lead viewer', () => {
  const FULL = () => makeLead({
    id: 7, title: 'Big lead', type: 'Investor', stage: 'In Conversation', org: 'Acme', contactId: 5, contactName: 'Bob Stone', amount: 1500000,
    deadline: '2026-12-31', nextFollowUp: '2026-11-20', assignedTo: 'Olive Other', priority: 'P2', nextStep: 'Send deck', notes: 'line one\nline two',
    outcome: 'Pending', sourceTaskId: 'task-1', stageChangedAt: daysAgo(4), createdBy: 'Ann', createdAt: '2026-10-01T09:00:00Z',
  });
  const TASKS = () => [
    makeTask({ id: 'task-1', task: 'Source task', leadId: null }),
    makeTask({ id: 'task-2', task: 'Follow up', leadId: 7, status: 'In Progress', nextFollowUp: '2026-11-25' }),
    makeTask({ id: 'task-3', task: 'Other lead task', leadId: 8 }),
  ];
  const dd = (label) => $$('#ldet-body > div:first-child > div').find((d) => d.firstChild.textContent === label)?.children[1].textContent;
  const seedViewer = (extra = {}) => {
    route.params = { id: '7' };                                        // a route parameter: a string for a numeric id
    return setup({ leads: [FULL()], tasks: TASKS(), contacts: [{ id: 5, name: 'Bob Stone' }], ...extra });
  };

  it('shows every field of the lead, the next step, notes, outcome, the source task and the linked tasks', () => {
    seedViewer();
    mountViewer();
    expect($('#mo-ldet.open')).not.toBeNull();
    expect($('#mo-ldet .mti').textContent).toBe('Big lead');
    expect(dd('Type')).toBe('Investor');
    expect(dd('Stage')).toBe('In Conversation · 4d');
    expect(dd('Organisation')).toBe('Acme');
    expect(dd('Contact')).toBe('Bob Stone');
    expect(dd('Amount')).toBe('₹15,00,000');
    expect(dd('Deadline')).toBe('31 Dec');
    expect(dd('Next Follow-up')).toBe('20 Nov');
    expect(dd('Assigned To')).toBe('Olive Other');
    expect(dd('Priority')).toBe('P2');
    expect(dd('Created')).toBe('1 Oct by Ann');
    expect($('#ldet-body a[href="/contacts/people/5"]').textContent).toBe('Bob Stone');
    expect($('#ldet-body').textContent).toContain('Next step: Send deck');
    expect($('#ldet-body').textContent).toContain('Outcome: Pending');
    expect($('#ldet-body a[href="/work/tasks/task-1"]').textContent).toBe('Source task');
    expect($('#ldet-body').textContent).toContain('Converted from task: Source task');
    expect($('#ldet-body').textContent).toContain('Linked tasks (1)');
    expect($('#ldet-body').textContent).toContain('Follow upIn Progress25 Nov');
    expect($('#ldet-body').textContent).not.toContain('Other lead task');
    expect($$('#mo-ldet .mf button').map((b) => b.textContent)).toEqual(['Edit', '+ Task', 'Delete', 'Close']);
  });

  it('without a loaded contact, the typed contact name is shown as plain text; with nothing linked, a hint', () => {
    route.params = { id: '1' };
    setup({ leads: [makeLead({ id: 1, title: 'Plain', contactName: 'Typed Name' })] });
    mountViewer();
    expect(dd('Contact')).toBe('Typed Name');
    expect($('#ldet-body a')).toBeNull();
    expect($('#ldet-body').textContent).toContain('No linked tasks yet');
  });

  it('loads the touchpoint timeline from lead_history, newest first as returned', async () => {
    const { calls } = seedViewer({
      handler: async (url) => (url.includes('/lead_history') ? okResponse([
        { id: 2, lead_id: 7, type: 'call', notes: 'Spoke to Bob\nwent well', created_by: 'Ann', created_at: '2026-11-05T10:00:00Z' },
        { id: 1, lead_id: 7, type: 'stage', notes: 'Identified → In Conversation', created_by: 'Me Myself', created_at: '2026-11-01T10:00:00Z' },
      ]) : undefined),
    });
    mountViewer();
    expect($('#ldet-timeline').textContent).toBe('Loading history…');
    await waitFor(() => expect($$('#ldet-timeline .tp-ic').length).toBe(2));
    expect(calls()[0].url).toContain('/lead_history?lead_id=eq.7&order=created_at.desc&limit=100');
    expect($$('#ldet-timeline > div').map((d) => d.textContent)).toEqual([
      'Spoke to Bob\nwent wellcall · 5 Nov · Ann', 'Identified → In Conversationstage · 1 Nov · Me Myself',
    ]);
    expect($('#ldet-timeline .tp-ic svg')).not.toBeNull();
  });

  it('says so when there is no history, and when it cannot be loaded', async () => {
    seedViewer();
    mountViewer();
    await waitFor(() => expect($('#ldet-timeline').textContent).toBe('No touchpoints logged yet.'));
    cleanup();
    seedViewer({ handler: async (url) => (url.includes('/lead_history') ? failResponse('down') : undefined) });
    mountViewer();
    await waitFor(() => expect($('#ldet-timeline').textContent).toBe('Could not load history: GET lead_history failed: 500'));
  });

  it('logs a touchpoint: the entry, the new follow-up date, then reloads the timeline and clears the form', async () => {
    const { calls } = seedViewer();
    mountViewer();
    await waitFor(() => expect($('#ldet-timeline').textContent).toBe('No touchpoints logged yet.'));
    expect($$('#ldet-tp-type option').map((o) => o.value)).toEqual(['note', 'call', 'meeting', 'email', 'pitch', 'submission', 'follow-up']);
    type('ldet-tp-type', 'meeting');
    type('ldet-tp-notes', '  Met at the summit ');
    type('ldet-tp-next', '2026-12-10');
    fireEvent.click($('#ldet-body .b-pr'));
    await waitFor(() => expect(getStatus()).toMatchObject({ kind: 'online', msg: 'Touchpoint logged' }));
    expect(bodyOf(calls(), 'POST', '/lead_history')).toEqual({ lead_id: 7, type: 'meeting', notes: 'Met at the summit', created_by: 'Me Myself' });
    const patch = calls().find((c) => c.method === 'PATCH');
    expect(patch.url).toBe('https://example.supabase.co/rest/v1/leads?id=eq.7');
    expect(patch.body).toEqual({ next_follow_up: '2026-12-10', updated_by: 'Me Myself', updated_at: NOW.toISOString() });
    expect(lead(7).nextFollowUp).toBe('2026-12-10');
    await waitFor(() => expect(dd('Next Follow-up')).toBe('10 Dec'));
    expect(field('ldet-tp-notes').value).toBe('');
    expect(field('ldet-tp-type').value).toBe('note');
    expect(calls().filter((c) => c.method === 'GET' && c.url.includes('/lead_history'))).toHaveLength(2);   // reloaded
  });

  it('Enter in the notes box logs; with no date the lead itself is not touched', async () => {
    const { calls } = seedViewer();
    mountViewer();
    type('ldet-tp-notes', 'Quick note');
    fireEvent.keyDown(field('ldet-tp-notes'), { key: 'Enter' });
    await waitFor(() => expect(getStatus().msg).toBe('Touchpoint logged'));
    expect(bodyOf(calls(), 'POST', '/lead_history')).toMatchObject({ type: 'note', notes: 'Quick note' });
    expect(calls().filter((c) => c.method === 'PATCH')).toEqual([]);
  });

  it('refuses an empty touchpoint without a request', () => {
    const { calls } = seedViewer();
    mountViewer();
    type('ldet-tp-notes', '   ');
    fireEvent.click($('#ldet-body .b-pr'));
    expect(getStatus()).toMatchObject({ kind: 'error', msg: 'Describe the touchpoint before logging' });
    expect(calls().filter((c) => c.method !== 'GET')).toEqual([]);
  });

  it('keeps what was typed and reports the failure when the log is refused; a view-only user cannot log', async () => {
    seedViewer({ handler: async (url, init) => (init.method === 'POST' ? failResponse('nope') : undefined) });
    mountViewer();
    type('ldet-tp-notes', 'Will fail');
    fireEvent.click($('#ldet-body .b-pr'));
    await waitFor(() => expect(getStatus().kind).toBe('error'));
    expect(getStatus().msg).toBe('Log failed: INSERT lead_history failed: nope');
    expect(field('ldet-tp-notes').value).toBe('Will fail');
    cleanup();
    const { calls } = seedViewer({ viewer: true });
    mountViewer();
    type('ldet-tp-notes', 'Nope');
    fireEvent.click($('#ldet-body .b-pr'));
    await waitFor(() => expect(getStatus().kind).toBe('error'));
    expect(getStatus().msg).toBe('Log failed: ' + READ_ONLY);
    expect(calls().filter((c) => c.method !== 'GET')).toEqual([]);
  });

  it('Edit steps aside and opens the lead form; + Task opens the task form prefilled from the lead', async () => {
    seedViewer();
    mountViewer();
    fireEvent.click($$('#mo-ldet .mf button')[0]);
    expect(route.back).toHaveBeenCalledTimes(1);
    expect($('#mo-lf.open')).not.toBeNull();
    expect(field('lf-name').value).toBe('Big lead');
    expect(field('lf-stage-f').value).toBe('In Conversation');
    cleanup();
    seedViewer();
    mountViewer();
    fireEvent.click($$('#mo-ldet .mf button')[1]);
    expect(route.back).toHaveBeenCalledTimes(2);
    expect($('#mo-tf.open')).not.toBeNull();
    expect($('#mo-tf .mti').textContent).toBe('Add Task — Big lead');
    expect(field('tf-task-name').value).toBe('Send deck');
  });

  it('Delete asks first, then closes the viewer and deletes the lead and its history', async () => {
    const { calls } = seedViewer();
    mountViewer();
    fireEvent.click($$('#mo-ldet .mf button')[2]);
    expect($('#mo-del-lead.open')).not.toBeNull();
    expect($('#del-body-lead').textContent).toContain('Big lead');
    expect($('#del-body-lead').textContent).toContain('In Conversation · Acme');
    expect(calls().filter((c) => c.method === 'DELETE')).toEqual([]);   // nothing until confirmed
    fireEvent.click($('#del-confirm-btn-lead'));
    expect($('#mo-del-lead.open')).toBeNull();
    expect(route.back).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(getStatus().msg).toBe('Lead deleted'));
    expect(calls().find((c) => c.method === 'DELETE').url).toBe('https://example.supabase.co/rest/v1/leads?id=eq.7');
    expect(store.getState().leads).toEqual([]);
  });

  it('a refused delete is reported and the lead stays', async () => {
    seedViewer({ viewer: true });
    mountViewer();
    fireEvent.click($$('#mo-ldet .mf button')[2]);
    fireEvent.click($('#del-confirm-btn-lead'));
    await waitFor(() => expect(getStatus().kind).toBe('error'));
    expect(getStatus().msg).toBe('Delete failed: ' + READ_ONLY);
    expect(store.getState().leads).toHaveLength(1);
  });

  it('Close goes back from the modal; the framed page (a direct visit) goes to the Pipeline', () => {
    seedViewer();
    mountViewer();
    fireEvent.click($$('#mo-ldet .mf button')[3]);
    expect(route.back).toHaveBeenCalledTimes(1);
    cleanup();
    seedViewer();
    const { container } = mountViewer(true);
    expect($('#mo-ldet', container)).toBeNull();                       // not a modal
    expect($('.mti', container).textContent).toBe('Big lead');
    fireEvent.click($$('.mf button', container).at(-1));
    expect(history.at(-1)).toEqual({ kind: 'push', href: '/pipeline' });
    expect(route.back).toHaveBeenCalledTimes(1);
  });

  it('an unknown id shows a message, never a crash; before the lists arrive it says Loading…', () => {
    route.params = { id: '999' };
    setup({ leads: [makeLead({ id: 1 })] });
    mountViewer();
    expect($('#mo-ldet').textContent).toContain('Lead not found.');
    expect($('#mo-ldet').textContent).toContain('999');
    expect($$('#mo-ldet .mf button').map((b) => b.textContent)).toEqual(['Close']);
    cleanup();
    seed({ leads: [], dataLoaded: false });
    mountViewer();
    expect($('#mo-ldet').textContent).toContain('Loading…');
  });

  it('the viewer follows the store: a lead deleted underneath it turns into the not-found message', () => {
    seedViewer();
    mountViewer();
    act(() => { store.setState({ leads: [] }); });
    expect($('#mo-ldet').textContent).toContain('Lead not found.');
  });
});
