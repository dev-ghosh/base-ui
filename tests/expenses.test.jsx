// Expenses: the empty / missing / error states, the numbers, the card rail and the transactions with
// month and filters as search params, the expense form (payloads, validation, who may edit), the review
// buttons, the cards manager, the CSV export, and the people who may not write. The real
// expense-actions / rest.js run; only fetch is stubbed. Expected values are worked out by hand from
// rie-dashboard2/js/expenses.js.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent, waitFor, screen, within } from '@testing-library/react';

process.env.NEXT_PUBLIC_SB_URL = 'https://example.supabase.co';
process.env.NEXT_PUBLIC_SB_KEY = 'anon-key-123';

vi.mock('next/navigation', async () => (await import('./helpers/fake-router.js')).navigationMock);
vi.mock('next/link', async () => (await import('./helpers/fake-router.js')).linkMock);

import ExpensesPage from '@/app/(app)/expenses/page.jsx';
import { store } from '@/store/store.js';
import { getStatus } from '@/lib/status.js';
import { saveExpense } from '@/lib/expense-actions.js';
import { seed, makeTask, stubFetch, okResponse, failResponse } from './helpers/fixtures.js';
import { resetNav, currentUrl } from './helpers/fake-router.js';

const READ_ONLY = 'You have view-only access to BASE, so this change was not saved.';
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const ADMIN = { person_code: 'ME1', can_write: true, is_admin: true, email: 'me@x.test' };
const EDITOR = { person_code: 'ME1', can_write: true, is_admin: false, email: 'me@x.test' };
const VIEWER = { person_code: 'ME1', can_write: false, is_admin: false, email: 'me@x.test' };
const M = 'Meals & entertainment';
const S = 'Software & subscriptions';

const CARDS = [
  { id: 1, nickname: 'HDFC', last4: '1234', network: 'visa', card_type: 'credit', holder_code: 'ME1', company: 'Acme', monthly_limit: 2000, active: true },
  { id: 2, nickname: 'Axis', last4: '9876', network: 'rupay', card_type: 'debit', holder_code: null, company: null, monthly_limit: null, active: true },
  { id: 3, nickname: 'Old', last4: '1111', network: 'visa', card_type: 'credit', holder_code: null, company: null, monthly_limit: null, active: false },
];
const ex = (id, spent_on, amount, category, card_id, paid_by, status, o = {}) => ({
  id, spent_on, amount, category, card_id, paid_by, status, currency: 'INR', vendor: null, description: null,
  payment_method: card_id ? 'card' : 'cash', company: null, receipt_url: null, created_by: null, ...o,
});
const EXPENSES = [
  ex(1, '2026-11-03', 1000, 'Travel', 1, 'ME1', 'approved', { vendor: 'Air Co', receipt_url: 'https://r.test/1' }),
  ex(2, '2026-11-05', 500, M, 1, 'ME1', 'pending', { created_by: 'Me@X.test', description: 'Lunch' }),
  ex(3, '2026-11-06', 2000, 'Travel', null, 'OT1', 'rejected'),
  ex(4, '2026-11-08', 300, S, 2, 'OT1', 'approved'),
  ex(5, '2026-10-15', 800, 'Travel', 1, 'ME1', 'approved'),
  ex(6, '2026-10-20', 200, M, null, 'OT1', 'approved'),
];

function setup({ url = '/expenses', cards = CARDS, expenses = EXPENSES, access = EDITOR, tasks = [], handler, loaded = true, ...rest } = {}) {
  seed({ cards, expenses, expensesLoaded: loaded, tasks, access, ...rest });
  resetNav(url);
  return stubFetch(handler);
}
const mount = () => render(<ExpensesPage />);
const tiles = () => $$('.stat').map((t) => [$('.stat-l', t).textContent, $('.stat-v', t).textContent, $('.stat-s', t).textContent]);
const rowsText = () => $$('tbody tr', $('.split')).map((r) => $$('td', r).map((c) => c.textContent));
const fill = (id, value) => fireEvent.change(document.getElementById(id), { target: { value } });

beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-11-10T12:00:00')); });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('states', () => {
  it('shows the empty states with empty data (editor: no cards assigned, Add expense in the table)', () => {
    setup({ cards: [], expenses: [] });
    mount();
    expect(screen.getByText('No cards yet')).toBeTruthy();
    expect(screen.getByText('No cards are assigned to you yet.')).toBeTruthy();
    expect(screen.getByText('No expenses here')).toBeTruthy();
    expect(screen.getByText('Nothing matches this month and these filters.')).toBeTruthy();
    expect(screen.getAllByText('Add expense')).toHaveLength(2);       // header + empty table
    expect(tiles()).toEqual([
      ['Total spent', '₹0', '0 expenses'], ['Awaiting approval', '0', '₹0'], ['Top category', '—', 'Nothing yet'], ['Cards used', '0', 'of 0 active'],
    ]);
    expect(screen.getByText('No spending in this view.')).toBeTruthy();
  });

  it('offers an admin to add the first card', () => {
    setup({ cards: [], expenses: [], access: ADMIN });
    mount();
    expect(screen.getByText('Add the company cards to see what each one was used for.')).toBeTruthy();
    expect(screen.getByText('Add a card')).toBeTruthy();
    expect(screen.getByText('Every expense across the company, and which card paid for it.')).toBeTruthy();
  });

  it('loads on first use: "Loading expenses…", then both tables (cards and expenses)', async () => {
    const net = setup({
      loaded: false, cards: [], expenses: [],
      handler: (url) => (url.includes('/cards?') ? okResponse(CARDS) : url.includes('/expenses?') ? okResponse(EXPENSES) : undefined),
    });
    mount();
    expect(screen.getByText('Loading expenses…')).toBeTruthy();
    await waitFor(() => expect($('.pay-card')).toBeTruthy());
    const urls = net.calls().map((c) => c.url.replace('https://example.supabase.co/rest/v1/', ''));
    expect(urls.sort()).toEqual(['cards?order=nickname.asc', 'expenses?order=spent_on.desc,id.desc&limit=3000']);
    expect(store.getState().expensesLoaded).toBe(true);
  });

  it('says the migration is missing on a 404, and shows other failures with Try again', async () => {
    setup({ loaded: false, cards: [], expenses: [], handler: () => failResponse('', 404) });
    mount();
    await waitFor(() => expect(screen.getByText('Expenses are not set up yet')).toBeTruthy());
    expect(screen.getByText('An admin needs to apply the database migration 20261011_expenses_team.sql, then refresh.')).toBeTruthy();
    cleanup();
    let fail = true;
    setup({ loaded: false, cards: [], expenses: [], handler: (url) => (fail ? failResponse('x', 500) : url.includes('/cards?') ? okResponse(CARDS) : okResponse(EXPENSES)) });
    mount();
    await waitFor(() => expect(screen.getByText('Could not load expenses')).toBeTruthy());
    fail = false;
    fireEvent.click(screen.getByText('Try again'));
    await waitFor(() => expect($('.pay-card')).toBeTruthy());
  });
});

describe('the numbers, the cards and the transactions', () => {
  it('shows this month by default, with the change against last month', () => {
    setup();
    mount();
    expect($('.month-pick span').textContent).toBe('November 2026');
    expect(tiles()).toEqual([
      ['Total spent', '₹1,800', '↑ 80% vs October'],      // 1000 + 500 + 300; the rejected 2000 is not counted
      ['Awaiting approval', '1', '₹500'],
      ['Top category', 'Travel', '₹1,000'],
      ['Cards used', '2', 'of 2 active'],
    ]);
    expect($$('.bar-row').map((r) => [$('.bar-l', r).textContent, $('.bar-v', r).textContent])).toEqual([['Travel', '₹1k'], [M, '₹500'], [S, '₹300']]);
    expect($('.ui-card-h p', $$('.split section')[1]).textContent).toBe('4 in this view');
  });

  it('lists the transactions: details, paid with, status, amounts (rejected struck through)', () => {
    setup();
    mount();
    const rows = rowsText();
    expect(rows).toHaveLength(4);
    expect(rows[0].slice(0, 5)).toEqual(['3 Nov', 'Air CoTravel', 'HDFC ••1234', '₹1,000.00', 'Approved']);
    expect(rows[1].slice(0, 3)).toEqual(['5 Nov', 'Lunch' + M, 'HDFC ••1234']);
    expect(rows[2].slice(0, 4)).toEqual(['6 Nov', 'TravelTravel', 'Cash', '₹2,000.00']);
    expect($('.amt.struck').textContent).toBe('₹2,000.00');
    expect($$('thead th', $('.split')).map((t) => t.textContent)).toEqual(['Date', 'Details', 'Paid with', 'Amount', 'Status', '']);   // no "Paid by" for a non-admin
    expect($('a.btn', $$('tbody tr', $('.split'))[0]).getAttribute('href')).toBe('https://r.test/1');
  });

  it('the card rail: spend, count, percentage of the limit, and the "No card" tile', () => {
    setup();
    mount();
    const cardTexts = $$('.pay-card').map((b) => b.textContent);
    expect(cardTexts[0]).toBe('HDFCVisa credit•••• •••• •••• 1234Me MyselfAcme₹1,5002 txns · 75% of ₹2k');
    expect(cardTexts[1]).toBe('AxisRuPay debit•••• •••• •••• 9876Shared₹3001 txns');
    expect(cardTexts[2]).toBe('No cardcash, UPI, transfer₹01 txns');
    expect($$('.pay-card')).toHaveLength(3);                      // the inactive card with no spend is not shown
    expect($('.pc-bar i').style.width).toBe('75%');
    expect($('.pay-card').getAttribute('aria-pressed')).toBe('false');
  });

  it('reads month and filters from the URL', () => {
    setup({ url: '/expenses?month=2026-10&category=' + encodeURIComponent(M) });
    mount();
    expect($('.month-pick span').textContent).toBe('October 2026');
    expect(rowsText().map((r) => r[0])).toEqual(['20 Oct']);
    expect(screen.getByLabelText('Category').value).toBe(M);
    expect(tiles()[0]).toEqual(['Total spent', '₹200', '1 expenses']);   // no September data: a count, not a percentage
  });

  it('picking a card filters the table (and keeps the other cards on the rail), and clear removes it', () => {
    setup();
    mount();
    fireEvent.click($$('.pay-card')[1]);
    expect(currentUrl()).toBe('/expenses?card=2');
    expect(rowsText().map((r) => r[0])).toEqual(['8 Nov']);
    expect($$('.pay-card')).toHaveLength(3);
    expect($$('.pay-card')[1].getAttribute('aria-pressed')).toBe('true');
    expect($('.ui-card-h p', $$('.split section')[1]).textContent).toBe('1 in this view · filtered to Axis ••9876 clear');
    fireEvent.click(screen.getByText('clear'));
    expect(currentUrl()).toBe('/expenses');
    fireEvent.click($$('.pay-card')[2]);
    expect(currentUrl()).toBe('/expenses?card=none');
    expect(rowsText().map((r) => r[0])).toEqual(['6 Nov']);
    expect($('.ui-card-h p', $$('.split section')[1]).textContent).toContain('filtered to non-card payments');
    fireEvent.click($$('.pay-card')[2]);                          // the same tile again clears it
    expect(currentUrl()).toBe('/expenses');
  });

  it('the month buttons step back, jump to All time and back to this month; Next stops at this month', () => {
    setup();
    mount();
    expect(screen.getByLabelText('Next month').disabled).toBe(true);
    fireEvent.click(screen.getByLabelText('Previous month'));
    expect(currentUrl()).toBe('/expenses?month=2026-10');
    expect(screen.getByLabelText('Next month').disabled).toBe(false);
    fireEvent.click(screen.getByText('All time'));
    expect(currentUrl()).toBe('/expenses?month=all');
    expect($('.month-pick span').textContent).toBe('All time');
    expect(screen.getByLabelText('Previous month').disabled).toBe(true);
    expect(rowsText()).toHaveLength(6);
    expect(tiles()[0][2]).toBe('5 expenses');
    fireEvent.click(screen.getByText('This month'));
    expect(currentUrl()).toBe('/expenses');
  });

  it('status and category selects write search params; Person is for admins only', () => {
    setup();
    mount();
    expect(screen.queryByLabelText('Person')).toBeNull();
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'pending' } });
    expect(currentUrl()).toBe('/expenses?status=pending');
    expect(rowsText().map((r) => r[0])).toEqual(['5 Nov']);
    cleanup();
    setup({ access: ADMIN });
    mount();
    expect($$('select[aria-label="Person"] option').map((o) => o.textContent)).toEqual(['Everyone', 'Me Myself', 'Olive Other']);
    fireEvent.change(screen.getByLabelText('Person'), { target: { value: 'OT1' } });
    expect(currentUrl()).toBe('/expenses?person=OT1');
    expect($$('thead th', $('.split')).map((t) => t.textContent)).toContain('Paid by');
  });
});

describe('the expense form', () => {
  const openAdd = () => { fireEvent.click(screen.getByText('Add expense', { selector: 'header button' })); return $('#mo-dyn.open'); };
  const submit = () => fireEvent.click($('.mf .b-pr'));

  it('validates before writing anything', () => {
    const net = setup();
    mount();
    openAdd();
    expect($('.mti').textContent).toBe('Add expense');
    submit();
    expect($('#exp-err').textContent).toBe('Date, amount and category are required.');
    fill('f-amount', '0'); fill('f-category', 'Travel');
    submit();
    expect($('#exp-err').textContent).toBe('The amount must be more than zero.');
    fill('f-amount', '40');
    submit();
    expect($('#exp-err').textContent).toBe('Choose which card was used.');
    expect(net.writes()).toHaveLength(0);
  });

  it('starts today, by card, by me; the card choice shows only for a card payment', () => {
    setup();
    mount();
    openAdd();
    expect(document.getElementById('f-spent_on').value).toBe('2026-11-10');
    expect(document.getElementById('f-payment_method').value).toBe('card');
    expect($('#exp-card-wrap').hidden).toBe(false);
    expect($$('#f-card_id option').map((o) => o.textContent)).toEqual(['Choose a card…', 'HDFC ••1234', 'Axis ••9876']);   // not the inactive one
    fill('f-payment_method', 'upi');
    expect($('#exp-card-wrap').hidden).toBe(true);
    expect($('input[name="paid_by"]').value).toBe('ME1');                      // not an admin: always me
    expect($('#f-paid_by')).toBeNull();
  });

  it('an editor\'s new expense is posted as pending, with the exact payload', async () => {
    const net = setup({ handler: (url, init) => (init.method === 'POST' ? okResponse([{ id: 99, ...ex(99, '2026-11-10', 12.5, 'Travel', 2, 'ME1', 'pending') }]) : undefined) });
    mount();
    openAdd();
    fill('f-amount', '12.50'); fill('f-category', 'Travel'); fill('f-card_id', '2'); fill('f-vendor', ' Metro ');
    submit();
    await waitFor(() => expect(net.writes()).toHaveLength(1));
    const w = net.writes()[0];
    expect(w.url).toBe('https://example.supabase.co/rest/v1/expenses');
    expect(w.body).toEqual({
      spent_on: '2026-11-10', amount: 12.5, category: 'Travel', vendor: 'Metro', description: null, payment_method: 'card',
      card_id: 2, paid_by: 'ME1', company: null, receipt_url: null, status: 'pending',
    });
    await waitFor(() => expect($('#mo-dyn')).toBeNull());
    expect(store.getState().expenses[0].id).toBe(99);
    expect(getStatus().msg).toBe('Expense added');
  });

  it('an admin has to choose who spent it', () => {
    const net = setup({ access: ADMIN });
    mount();
    openAdd();
    fill('f-payment_method', 'cash'); fill('f-amount', '5'); fill('f-category', 'Other'); fill('f-paid_by', '');
    submit();
    expect($('#exp-err').textContent).toBe('Say who spent it.');
    expect(net.writes()).toHaveLength(0);
  });

  it('an admin picks who spent it and the expense is approved on the spot', async () => {
    const net = setup({ access: ADMIN, handler: (url, init) => (init.method === 'POST' ? okResponse([ex(98, '2026-11-10', 5, 'Other', null, 'OT1', 'approved')]) : undefined) });
    mount();
    openAdd();
    fill('f-payment_method', 'cash'); fill('f-amount', '5'); fill('f-category', 'Other'); fill('f-paid_by', 'OT1');
    submit();
    await waitFor(() => expect(net.writes()).toHaveLength(1));
    expect(net.writes()[0].body).toMatchObject({ paid_by: 'OT1', status: 'approved' });
  });

  it('an admin\'s new expense defaults to themselves and is approved on the spot', async () => {
    const net = setup({ access: ADMIN, handler: (url, init) => (init.method === 'POST' ? okResponse([ex(98, '2026-11-10', 5, 'Other', null, 'ME1', 'approved')]) : undefined) });
    mount();
    openAdd();
    expect(document.getElementById('f-paid_by').value).toBe('ME1');
    fill('f-payment_method', 'cash'); fill('f-amount', '5'); fill('f-category', 'Other');
    submit();
    await waitFor(() => expect(net.writes()).toHaveLength(1));
    expect(net.writes()[0].body).toMatchObject({ payment_method: 'cash', card_id: null, paid_by: 'ME1', status: 'approved' });
  });

  it('shows the database\'s sentence, without its prefix, and stays open', async () => {
    setup({ handler: (url, init) => (init.method === 'POST' ? failResponse('new row violates policy') : undefined) });
    mount();
    openAdd();
    fill('f-payment_method', 'cash'); fill('f-amount', '5'); fill('f-category', 'Other');
    submit();
    await waitFor(() => expect($('#exp-err').textContent).toBe('new row violates policy'));
    expect($('#mo-dyn.open')).toBeTruthy();
  });

  it('edits your own pending expense: PATCH expenses?id=eq.N, no status in the payload', async () => {
    const net = setup({ handler: (url, init) => (init.method === 'PATCH' ? okResponse([{ ...EXPENSES[1], amount: 450 }]) : undefined) });
    mount();
    const row = $$('tbody tr', $('.split'))[1];
    fireEvent.click(within(row).getByText('Edit'));
    expect($('.mti').textContent).toBe('Edit expense');
    expect(document.getElementById('f-amount').value).toBe('500');
    expect(document.getElementById('f-description').value).toBe('Lunch');
    expect(screen.queryByText('Delete')).toBeNull();                       // delete is for admins
    fill('f-amount', '450');
    submit();
    await waitFor(() => expect(net.writes()).toHaveLength(1));
    expect(net.writes()[0].method).toBe('PATCH');
    expect(net.writes()[0].url).toBe('https://example.supabase.co/rest/v1/expenses?id=eq.2');
    expect(net.writes()[0].body.amount).toBe(450);
    expect('status' in net.writes()[0].body).toBe(false);
    await waitFor(() => expect(store.getState().expenses.find((e) => e.id === 2).amount).toBe(450));
    expect(getStatus().msg).toBe('Expense updated');
  });

  it('an update that changes nothing (refused by the database) says so', async () => {
    setup({ handler: (url, init) => (init.method === 'PATCH' ? okResponse([]) : undefined) });
    mount();
    fireEvent.click(within($$('tbody tr', $('.split'))[1]).getByText('Edit'));
    submit();
    await waitFor(() => expect($('#exp-err').textContent).toBe('You do not have permission to change this expense.'));
  });

  it('only an admin can edit anything else; others see Edit only on their own pending ones', () => {
    setup();
    mount();
    expect($$('tbody tr', $('.split')).map((r) => !!within(r).queryByText('Edit'))).toEqual([false, true, false, false]);
    cleanup();
    setup({ access: ADMIN });
    mount();
    expect($$('tbody tr', $('.split')).map((r) => !!within(r).queryByText('Edit'))).toEqual([true, true, true, true]);
  });

  it('an admin deletes after confirming', async () => {
    const confirm = vi.fn(() => true);
    vi.stubGlobal('confirm', confirm);
    const net = setup({ access: ADMIN, handler: (url, init) => (init.method === 'DELETE' ? okResponse([{ id: 4 }]) : undefined) });
    mount();
    fireEvent.click(within($$('tbody tr', $('.split'))[3]).getByText('Edit'));
    fireEvent.click(screen.getByText('Delete'));
    expect(confirm).toHaveBeenCalledWith('Delete this expense? This cannot be undone.');
    await waitFor(() => expect(net.writes()).toHaveLength(1));
    expect(net.writes()[0].url).toBe('https://example.supabase.co/rest/v1/expenses?id=eq.4');
    await waitFor(() => expect(store.getState().expenses.map((e) => e.id)).toEqual([1, 2, 3, 5, 6]));
    expect(getStatus().msg).toBe('Expense deleted');
  });
});

describe('review (admin)', () => {
  it('Approve and Reject appear on pending rows only, and write status, reviewer and time', async () => {
    const net = setup({ access: ADMIN, handler: (url, init) => (init.method === 'PATCH' ? okResponse([{ ...EXPENSES[1], status: 'approved' }]) : undefined) });
    mount();
    const rows = $$('tbody tr', $('.split'));
    expect(rows.map((r) => !!within(r).queryByText('Approve'))).toEqual([false, true, false, false]);
    fireEvent.click(within(rows[1]).getByText('Approve'));
    await waitFor(() => expect(net.writes()).toHaveLength(1));
    expect(net.writes()[0].url).toBe('https://example.supabase.co/rest/v1/expenses?id=eq.2');
    expect(net.writes()[0].body).toEqual({ status: 'approved', reviewed_by: 'me@x.test', reviewed_at: '2026-11-10T06:30:00.000Z' });
    await waitFor(() => expect(getStatus().msg).toBe('Expense approved'));
    expect(store.getState().expenses.find((e) => e.id === 2).status).toBe('approved');
  });

  it('Reject, and an empty answer (not an admin after all) is told', async () => {
    setup({ access: ADMIN, handler: (url, init) => (init.method === 'PATCH' ? okResponse([]) : undefined) });
    mount();
    fireEvent.click(screen.getByText('Reject'));
    await waitFor(() => expect(getStatus()).toMatchObject({ kind: 'error', msg: 'Only an admin can review expenses.' }));
    expect(store.getState().expenses.find((e) => e.id === 2).status).toBe('pending');
  });
});

describe('the cards manager (admin)', () => {
  const open = () => { fireEvent.click(screen.getByText('Manage cards')); return $('#mo-dyn.open'); };

  it('lists the cards with holder, limit and state', () => {
    setup({ access: ADMIN });
    mount();
    const dlg = open();
    expect($('.mti', dlg).textContent).toBe('Cards');
    expect(within(dlg).getByText('Only the last four digits are stored. Never enter a full card number.')).toBeTruthy();
    expect($$('tbody tr', dlg).map((r) => $$('td', r).map((c) => c.textContent))).toEqual([
      ['HDFC ••1234Visa credit · Acme', 'Me Myself', '₹2,000', 'Active Edit'],
      ['Axis ••9876RuPay debit', 'Shared', '—', 'Active Edit'],
      ['Old ••1111Visa credit', 'Shared', '—', 'Inactive Edit'],
    ]);
  });

  it('adds a card: validates, posts the exact payload, returns to the list', async () => {
    const net = setup({ access: ADMIN, handler: (url, init) => (init.method === 'POST' ? okResponse([{ id: 9, nickname: 'New', last4: '4321', active: true }]) : undefined) });
    mount();
    open();
    fireEvent.click(screen.getByText('Add a card'));
    expect($('.mti').textContent).toBe('Cards');
    fireEvent.click(screen.getByText('Add card'));
    expect($('#card-err').textContent).toBe('Give the card a nickname.');
    fill('f-nickname', 'New'); fill('f-last4', '43');
    fireEvent.click(screen.getByText('Add card'));
    expect($('#card-err').textContent).toBe('Enter exactly four digits.');
    fill('f-last4', '4321'); fill('f-monthly_limit', '5000'); fill('f-billing_day', '15'); fill('f-network', 'amex');
    fireEvent.click(screen.getByText('Add card'));
    await waitFor(() => expect(net.writes()).toHaveLength(1));
    expect(net.writes()[0].url).toBe('https://example.supabase.co/rest/v1/cards');
    expect(net.writes()[0].body).toEqual({
      nickname: 'New', last4: '4321', network: 'amex', card_type: 'credit', holder_code: null, company: null,
      active: true, monthly_limit: 5000, billing_day: 15,
    });
    await waitFor(() => expect($$('tbody tr', $('#mo-dyn')).length).toBe(4));        // back on the list, with the new card
    expect(getStatus().msg).toBe('Card saved');
  });

  it('edits a card (PATCH cards?id=eq.N), including switching it off', async () => {
    const net = setup({ access: ADMIN, handler: (url, init) => (init.method === 'PATCH' ? okResponse([{ ...CARDS[1], active: false }]) : undefined) });
    mount();
    open();
    fireEvent.click(within($$('tbody tr', $('#mo-dyn'))[1]).getByText('Edit'));
    expect($('.mti').textContent).toBe('Edit card');
    expect(document.getElementById('f-nickname').value).toBe('Axis');
    expect(document.getElementById('f-network').value).toBe('rupay');
    fireEvent.click($('input[name="active"]'));
    fireEvent.click(screen.getByText('Save card'));
    await waitFor(() => expect(net.writes()).toHaveLength(1));
    expect(net.writes()[0].url).toBe('https://example.supabase.co/rest/v1/cards?id=eq.2');
    expect(net.writes()[0].body).toMatchObject({ nickname: 'Axis', last4: '9876', network: 'rupay', active: false, monthly_limit: null });
    await waitFor(() => expect(store.getState().cards[1].active).toBe(false));
  });

  it('Back returns to the list without writing; Close closes', () => {
    const net = setup({ access: ADMIN });
    mount();
    open();
    fireEvent.click(screen.getByText('Add a card'));
    fireEvent.click(screen.getByText('Back'));
    expect(screen.getByText('Add a card')).toBeTruthy();
    fireEvent.click(screen.getByText('Close'));
    expect($('#mo-dyn')).toBeNull();
    expect(net.writes()).toHaveLength(0);
  });

  it('is for admins: no button for anyone else', () => {
    setup({ access: EDITOR });
    mount();
    expect(screen.queryByText('Manage cards')).toBeNull();
  });
});

describe('export', () => {
  it('downloads the rows on screen as expenses-<month>.csv', async () => {
    let blob = null;
    const created = vi.fn((b) => { blob = b; return 'blob:x'; });
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: created, revokeObjectURL: vi.fn() }));
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function download() { this.dataset.downloaded = this.download; });
    setup({ url: '/expenses?month=2026-10' });
    mount();
    fireEvent.click(screen.getByText('Export CSV'));
    expect(click).toHaveBeenCalledTimes(1);
    expect(click.mock.contexts[0].download).toBe('expenses-2026-10.csv');
    const text = await new Promise((resolve) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.readAsText(blob); });
    const lines = text.replace(/^﻿/, '').split('\n');
    expect(lines).toHaveLength(3);                                           // header + the two October rows
    expect(lines[1]).toBe('"2026-10-15","800","INR","Travel","","","Card","HDFC ••1234","Me Myself","","approved"');
  });
});

describe('people who may not write', () => {
  it('a viewer has no Add expense button and no admin buttons', () => {
    setup({ access: VIEWER });
    mount();
    expect(screen.queryByText('Add expense')).toBeNull();
    expect(screen.queryByText('Manage cards')).toBeNull();
    expect(screen.queryByText('Approve')).toBeNull();
    expect(screen.getByText('Export CSV')).toBeTruthy();
  });

  it('a viewer who opens Edit on an own pending row gets the view-only sentence and no form', () => {
    const net = setup({ access: VIEWER });
    mount();
    fireEvent.click(within($$('tbody tr', $('.split'))[1]).getByText('Edit'));
    expect(getStatus()).toMatchObject({ kind: 'error', msg: 'View-only access: you cannot add expenses.' });
    expect($('#mo-dyn')).toBeNull();
    expect(net.writes()).toHaveLength(0);
  });

  it('a write that gets through to the client is refused before any request', async () => {
    const net = setup({ access: VIEWER });
    await expect(saveExpense(null, { amount: 1 })).rejects.toThrow(READ_ONLY);
    expect(net.fn).not.toHaveBeenCalled();
  });

  it('an empty "No expenses here" offers a viewer nothing to add', () => {
    setup({ access: VIEWER, cards: [], expenses: [] });
    mount();
    expect(screen.getByText('No expenses here')).toBeTruthy();
    expect(screen.queryByText('Add expense')).toBeNull();
  });
});
