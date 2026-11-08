// Expenses pure logic: the filters, the numbers on the page, the card tiles, the URL params, the save
// payloads and the CSV. Expected values are worked out by hand from rie-dashboard2/js/expenses.js.
import {
  parseExpenseParams, serializeExpenseParams, mergeExpenseParams, nextMonth, filterExpenses, summarize, deltaLine,
  cardTiles, canEditExpense, formFromExpense, expenseFromForm, expenseSaveError, formFromCard, cardFromForm,
  cardSaveError, expensesCsv, sumOf, usableCards, cardLabel,
} from '../src/features/expenses/model.js';
import { thisMonth } from '../src/lib/ui-format.js';

let bad = 0;
const check = (c, m) => { console.log((c ? '  ok  ' : '  FAIL') + '  ' + m); if (!c) bad++; };
const same = (a, b, m) => {
  const ok = JSON.stringify(a) === JSON.stringify(b);
  check(ok, m + (ok ? '' : '  got ' + JSON.stringify(a)));
};

const ex = (id, spent_on, amount, category, card_id, paid_by, status, o = {}) => ({ id, spent_on, amount, category, card_id, paid_by, status, ...o });
const M = 'Meals & entertainment';
const S = 'Software & subscriptions';
const expenses = [
  ex(1, '2026-10-05', '1000', 'Travel', 1, 'A', 'approved'),
  ex(2, '2026-10-10', '500.50', M, 1, 'A', 'pending'),
  ex(3, '2026-10-12', '2000', 'Travel', null, 'B', 'rejected'),
  ex(4, '2026-10-20', '300', S, 2, 'B', 'approved'),
  ex(5, '2026-09-15', '800', 'Travel', 1, 'A', 'approved'),
  ex(6, '2026-09-20', '200', M, null, 'B', 'approved'),
];
const F = (o = {}) => ({ month: '2026-10', card: '', category: '', person: '', status: '', ...o });

// filters
same(filterExpenses(expenses, F()).map((x) => x.id), [1, 2, 3, 4], 'the month filter');
same(filterExpenses(expenses, F({ month: 'all' })).map((x) => x.id), [1, 2, 3, 4, 5, 6], 'All time');
same(filterExpenses(expenses, F({ card: '1' })).map((x) => x.id), [1, 2], 'card filter');
same(filterExpenses(expenses, F({ card: 'none' })).map((x) => x.id), [3], '"none" is payments without a card');
same(filterExpenses(expenses, F({ card: '1' }), { ignoreCard: true }).map((x) => x.id), [1, 2, 3, 4], 'ignoring the card');
same(filterExpenses(expenses, F({ person: 'B', status: 'approved', month: 'all' })).map((x) => x.id), [4, 6], 'person and status combine');
same(filterExpenses(expenses, F({ category: M })).map((x) => x.id), [2], 'category filter');
check(sumOf(expenses.slice(0, 4)) === 1800.5, 'a rejected expense is not counted: 1000 + 500.50 + 300');

// the numbers
let s = summarize(expenses, F());
check(s.total === 1800.5, 'total for October');
check(s.delta === 80, 'up 80% on September (1800.5 against 1000)');
same(s.pending.map((x) => x.id), [2], 'one awaiting approval');
same(s.catRows, [['Travel', 1000], [M, 500.5], [S, 300]], 'by category, largest first, rejected left out');
same(s.people, ['A', 'B'], 'people who spent');
same(s.categories, [M, S, 'Travel'], 'categories sorted');
same(s.monthList.map((x) => x.id), [1, 2, 3, 4], 'month list (without the card filter)');
s = summarize(expenses, F({ card: 'none' }));
check(s.total === 0 && s.delta === -100, 'non-card payments: 0 now against 200 last month = -100%');
s = summarize(expenses, F({ month: 'all' }));
check(s.total === 2800.5 && s.delta === null, 'All time has no comparison');
s = summarize(expenses, F({ month: '2026-01' }));
check(s.total === 0 && s.delta === null, 'a month with no spend and none before: no comparison (previous is 0)');
s = summarize(expenses, F({ month: '2025-12' }));
check(s.list.length === 0 && s.delta === null, 'December 2025 (September-style lookup crosses the year) is empty');

check(deltaLine(80, 4, 'September') === '↑ 80% vs September', 'delta line up');
check(deltaLine(-100, 4, 'September') === '↓ 100% vs September', 'delta line down');
check(deltaLine(0, 4, 'September') === ' 0% vs September', 'delta line flat keeps its leading space (as before)');
check(deltaLine(null, 3, '') === '3 expenses', 'no comparison: the count');

// months
check(nextMonth('2026-10', -1) === '2026-09' && nextMonth('2026-01', -1) === '2025-12' && nextMonth('2026-12', 1) === '2027-01', 'month steps');
check(nextMonth('all', 1) === 'all' && nextMonth('all', 'now') === thisMonth() && nextMonth('2026-10', 'all') === 'all', 'month: all, now');

// card tiles
const cards = [
  { id: 1, nickname: 'HDFC', last4: '1234', active: true, monthly_limit: 2000 },
  { id: 2, nickname: 'Axis', last4: '9876', active: true, monthly_limit: null },
  { id: 3, nickname: 'Old', last4: '1111', active: false },
  { id: 4, nickname: 'Retired', last4: '2222', active: false },
];
const monthList = summarize(expenses, F()).monthList;
let rail = cardTiles(cards, monthList, '1');
same(rail.tiles.map((t) => t.card.id), [1, 2], 'inactive cards without spend are not shown');
check(rail.tiles[0].spent === 1500.5 && rail.tiles[0].count === 2 && rail.tiles[0].pct === 75 && rail.tiles[0].on, 'HDFC: 1500.50 of 2000 = 75%, two transactions, selected');
check(rail.tiles[1].spent === 300 && rail.tiles[1].pct === null && !rail.tiles[1].on, 'a card without a limit has no percentage');
check(rail.other.length === 1 && rail.otherSum === 0, 'the rejected cash payment is listed but sums to 0');
rail = cardTiles(cards, [...monthList, ex(9, '2026-10-30', '50', 'Other', 4, 'A', 'approved')], '');
same(rail.tiles.map((t) => t.card.id), [1, 2, 4], 'an inactive card with spend in the view is shown');
rail = cardTiles([{ id: 1, nickname: 'Big', last4: '0000', active: true, monthly_limit: 100 }], [ex(1, '2026-10-01', '250', 'X', 1, 'A', 'approved')], '');
check(rail.tiles[0].pct === 100, 'the percentage caps at 100');
check(cardTiles([], [], '').none === true, 'no cards and nothing without a card: the empty state');
check(cardLabel(cards[0]) === 'HDFC ••1234' && cardLabel(undefined) === '', 'card label');

// edit rights
check(canEditExpense(ex(1, '', 1, '', null, 'A', 'approved'), null, true), 'an admin edits anything');
check(canEditExpense({ status: 'pending', created_by: 'Me@X.test' }, { email: 'me@x.test' }, false), 'you edit your own pending expense (e-mail compared without case)');
check(!canEditExpense({ status: 'approved', created_by: 'me@x.test' }, { email: 'me@x.test' }, false), 'not once it is reviewed');
check(!canEditExpense({ status: 'pending', created_by: 'other@x.test' }, { email: 'me@x.test' }, false), 'not someone else\'s');
check(!canEditExpense({ status: 'pending', created_by: null }, { email: 'me@x.test' }, false), 'not one without a creator');

// URL params
const now = thisMonth();
same(parseExpenseParams(''), { month: now, card: '', category: '', person: '', status: '' }, 'defaults: this month');
same(parseExpenseParams('month=all&card=none&category=Travel&person=A&status=pending'), { month: 'all', card: 'none', category: 'Travel', person: 'A', status: 'pending' }, 'every filter from the URL');
check(parseExpenseParams('month=2026-13').month === now && parseExpenseParams('month=junk').month === now, 'a bad month falls back to this month');
check(parseExpenseParams('month=2026-02').month === '2026-02', 'a good month');
check(parseExpenseParams('status=bogus').status === '', 'an unknown status is ignored');
check(serializeExpenseParams({ month: now, card: '', category: '', person: '', status: '' }) === '', 'defaults serialize to nothing');
check(serializeExpenseParams({ month: 'all', card: 3, category: 'A&B', person: 'P', status: 'pending' }) === 'month=all&card=3&category=A%26B&person=P&status=pending', 'params in a fixed order');
check(mergeExpenseParams('x=1&card=9&month=all', { month: now, card: '', category: '', person: '', status: 'rejected' }) === 'x=1&status=rejected', 'merge keeps other params');

// the expense form
const act = { code: 'A1', display_name: 'Ann' };
let form = formFromExpense(null, { cards, me: 'A1' });
check(form.payment_method === 'card' && form.paid_by === 'A1' && form.amount === '' && /^\d{4}-\d{2}-\d{2}$/.test(form.spent_on), 'a new expense: by card, by me, today');
check(formFromExpense(null, { cards: [cards[2]], me: null }).payment_method === 'upi', 'no usable card: UPI');
same(usableCards(cards, { card_id: 3 }).map((c) => c.id), [1, 2, 3], 'the card this expense already uses stays selectable');
form = formFromExpense({ spent_on: '2026-10-05', amount: 1000, category: 'Travel', payment_method: 'card', card_id: 1, paid_by: 'B', vendor: 'Air', company: 'Acme' }, { cards, me: 'A1' });
check(form.amount === '1000' && form.card_id === '1' && form.paid_by === 'B' && form.vendor === 'Air' && form.description === '', 'edit starts from the row');

const base = { ...formFromExpense(null, { cards, me: 'A1' }), spent_on: '2026-10-05', amount: '12.50', category: 'Travel', card_id: '2' };
let out = expenseFromForm(base, { admin: false, me: 'A1' });
same(out.body, {
  spent_on: '2026-10-05', amount: 12.5, category: 'Travel', vendor: null, description: null, payment_method: 'card',
  card_id: 2, paid_by: 'A1', company: null, receipt_url: null,
}, 'payload: numbers are numbers, blanks are null, the card id is a number');
same(Object.keys(out.body), ['spent_on', 'amount', 'category', 'vendor', 'description', 'payment_method', 'card_id', 'paid_by', 'company', 'receipt_url'], 'payload key order');
out = expenseFromForm({ ...base, payment_method: 'upi', vendor: ' Chai ' }, { admin: false, me: 'A1' });
check(out.body.card_id === null && out.body.vendor === 'Chai', 'not by card: card_id is null even if a card is still selected');
out = expenseFromForm({ ...base, paid_by: 'B' }, { admin: false, me: 'A1' });
check(out.body.paid_by === 'A1', 'a non-admin can only record their own');
out = expenseFromForm({ ...base, paid_by: 'B' }, { admin: true, me: 'A1' });
check(out.body.paid_by === 'B', 'an admin picks who spent it');
check(expenseFromForm({ ...base, amount: '' }, { admin: true, me: 'A1' }).error === 'Date, amount and category are required.', 'amount required');
check(expenseFromForm({ ...base, category: ' ' }, { admin: true, me: 'A1' }).error === 'Date, amount and category are required.', 'category required');
check(expenseFromForm({ ...base, spent_on: '' }, { admin: true, me: 'A1' }).error === 'Date, amount and category are required.', 'date required');
check(expenseFromForm({ ...base, amount: '0' }, { admin: true, me: 'A1' }).error === 'The amount must be more than zero.', 'zero amount');
check(expenseFromForm({ ...base, amount: '-5' }, { admin: true, me: 'A1' }).error === 'The amount must be more than zero.', 'negative amount');
check(expenseFromForm({ ...base, card_id: '' }, { admin: true, me: 'A1' }).error === 'Choose which card was used.', 'card required for a card payment');
check(expenseFromForm({ ...base, paid_by: '' }, { admin: true, me: 'A1' }).error === 'Say who spent it.', 'admin must pick who');
check(expenseFromForm(base, { admin: false, me: null }).error === 'Say who spent it.', 'a sign-in with no person cannot record one');
check(expenseSaveError(new Error('INSERT expenses failed: nope')) === 'nope' && expenseSaveError(new Error('UPDATE expenses failed: x')) === 'x', 'save error prefix dropped');

// the card form
let c = cardFromForm(formFromCard(null));
check(c.error === 'Give the card a nickname.', 'nickname required');
check(cardFromForm({ ...formFromCard(null), nickname: 'N', last4: '12a4' }).error === 'Enter exactly four digits.', 'four digits only');
check(cardFromForm({ ...formFromCard(null), nickname: 'N', last4: '123' }).error === 'Enter exactly four digits.', 'three digits is not enough');
c = cardFromForm({ ...formFromCard(null), nickname: ' N ', last4: '1234', monthly_limit: '5000', billing_day: '15' });
same(c.body, {
  nickname: 'N', last4: '1234', network: 'visa', card_type: 'credit', holder_code: null, company: null,
  active: true, monthly_limit: 5000, billing_day: 15,
}, 'card payload');
same(Object.keys(c.body), ['nickname', 'last4', 'network', 'card_type', 'holder_code', 'company', 'active', 'monthly_limit', 'billing_day'], 'card payload key order');
c = cardFromForm({ ...formFromCard(null), nickname: 'N', last4: '1234', active: false });
check(c.body.active === false && c.body.monthly_limit === null && c.body.billing_day === null, 'inactive, no limit, no day');
check(formFromCard({ active: false, monthly_limit: 0 }).active === false && formFromCard({}).active === true, 'a new card starts active; an inactive one stays inactive');
check(cardSaveError(new Error('INSERT cards failed: dup')) === 'dup', 'card save error prefix dropped');

// the CSV
const rows = [
  ex(1, '2026-10-05', '1000', 'Travel', 1, 'A', 'approved', { currency: 'INR', vendor: null, description: 'He said "hi"', payment_method: 'card', company: null }),
  ex(2, '2026-10-06', '5', 'Misc', null, 'B', 'pending', { currency: 'INR', vendor: 'Chai, Co', description: null, payment_method: 'cash', company: 'Acme' }),
];
const csv = expensesCsv(rows, cards, (code) => ({ A: 'Ann', B: 'Bo' }[code] || ''));
const lines = csv.split('\n');
check(csv.charCodeAt(0) === 0xFEFF, 'the file starts with a byte-order mark');
check(lines[0] === '﻿"Date","Amount","Currency","Category","Vendor","Description","Paid with","Card","Spent by","Company","Status"', 'header row');
check(lines[1] === '"2026-10-05","1000","INR","Travel","","He said ""hi""","Card","HDFC ••1234","Ann","","approved"', 'a row: quotes doubled, blanks empty, the card named');
check(lines[2] === '"2026-10-06","5","INR","Misc","Chai, Co","","Cash","","Bo","Acme","pending"', 'a cash row has no card; a comma stays inside the quotes');
check(lines.length === 3, 'one line per row, no trailing newline');

console.log(bad ? `\n${bad} FAILED\n` : '\nexpenses model ok\n');
process.exit(bad ? 1 : 0);
