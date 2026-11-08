/* model.js — Expenses' pure logic. Port of the constants, rows(), sum(), the numbers on the page,
 * the card tiles, the save payloads and the CSV of rie-dashboard2/js/expenses.js, plus the page's
 * filters as URL search params (spec C7 rule 4: the old `month` and `f` were module state).
 *
 * Tables: cards, expenses. Cards hold the last four digits only (CHECK constraint). RLS decides who
 * sees what (admin: all; everyone else: their own); the page only shapes the view.
 *
 * No store, no DOM: plain Node can import it.
 */
import { normalizeForm, shiftMonth, thisMonth, todayIST } from '../../lib/ui-format.js';

export const CATEGORIES = ['Travel', 'Software & subscriptions', 'Meals & entertainment', 'Office & supplies', 'Marketing', 'Hardware', 'Utilities', 'Professional services', 'Fuel & transport', 'Other'];
export const METHODS = [['card', 'Card'], ['upi', 'UPI'], ['bank_transfer', 'Bank transfer'], ['cash', 'Cash'], ['other', 'Other']];
export const METHOD_LABEL = Object.fromEntries(METHODS);
export const NETWORK = { visa: 'Visa', mastercard: 'Mastercard', amex: 'Amex', rupay: 'RuPay', diners: 'Diners', other: 'Card' };
export const CARD_TYPES = [['credit', 'Credit'], ['debit', 'Debit'], ['virtual', 'Virtual'], ['prepaid', 'Prepaid']];
export const STATUS_TONE = { pending: 'warn', approved: 'success', rejected: 'danger' };
export const STATUS_CHOICES = ['pending', 'approved', 'rejected'];

/** "HDFC Ops ••1234" */
export const cardLabel = (c) => (c ? `${c.nickname} ••${c.last4}` : '');
export const cardById = (cards, id) => cards.find((c) => String(c.id) === String(id));

/** A rejected expense is listed but not counted. */
export const counted = (x) => x.status !== 'rejected';
export const sumOf = (list) => list.filter(counted).reduce((a, x) => a + Number(x.amount), 0);

/* ── the filter row as search params ───────────────────────────────────────────
 * month   YYYY-MM or "all"; missing = this month
 * card    a card id, or "none" for payments without a card
 * category, person (a person code), status */

const KEYS = ['month', 'card', 'category', 'person', 'status'];
const toParams = (s) => (s instanceof URLSearchParams ? s : new URLSearchParams(s || ''));
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export function parseExpenseParams(search) {
  const p = toParams(search);
  const month = p.get('month');
  const status = p.get('status') || '';
  return {
    month: month === 'all' || (month && MONTH_RE.test(month)) ? month : thisMonth(),
    card: p.get('card') || '',
    category: p.get('category') || '',
    person: p.get('person') || '',
    status: STATUS_CHOICES.includes(status) ? status : '',
  };
}

export function serializeExpenseParams(f) {
  const p = new URLSearchParams();
  if (f.month && f.month !== thisMonth()) p.set('month', f.month);
  if (f.card) p.set('card', String(f.card));
  if (f.category) p.set('category', f.category);
  if (f.person) p.set('person', f.person);
  if (f.status) p.set('status', f.status);
  return p.toString();
}

/** The current search string with the filter params replaced by `f`'s; other params are kept. */
export function mergeExpenseParams(currentSearch, f) {
  const next = new URLSearchParams();
  for (const [key, value] of toParams(currentSearch)) if (!KEYS.includes(key)) next.append(key, value);
  for (const [key, value] of new URLSearchParams(serializeExpenseParams(f))) next.append(key, value);
  return next.toString();
}

/** What the month buttons do: 'all', 'now', or a step of +-1 (ignored while on All time). */
export function nextMonth(month, v) {
  if (v === 'all') return 'all';
  if (v === 'now') return thisMonth();
  if (month !== 'all') return shiftMonth(month, v);
  return month;
}

/* ── the numbers ──────────────────────────────────────────────────────────── */

/** Rows after the page's filters, optionally ignoring the month or the card. */
export function filterExpenses(expenses, f, { ignoreMonth = false, ignoreCard = false } = {}) {
  return (expenses || []).filter((x) =>
    (ignoreMonth || f.month === 'all' || x.spent_on.startsWith(f.month))
    && (ignoreCard || !f.card || (f.card === 'none' ? !x.card_id : String(x.card_id) === String(f.card)))
    && (!f.category || x.category === f.category)
    && (!f.person || x.paid_by === f.person)
    && (!f.status || x.status === f.status));
}

/**
 * Everything the page shows besides the card tiles: the filtered list, the same ignoring the card
 * (the card tiles' base), the total, the change against last month, what awaits approval, the spend
 * by category (largest first), and the options of the Person / Category selects.
 */
export function summarize(expenses, f) {
  const all = expenses || [];
  const list = filterExpenses(all, f);
  const monthList = filterExpenses(all, f, { ignoreCard: true });
  const total = sumOf(list);
  const prev = f.month === 'all' ? null : sumOf(filterExpenses(all, f, { ignoreMonth: true }).filter((x) => x.spent_on.startsWith(shiftMonth(f.month, -1))));
  const pending = list.filter((x) => x.status === 'pending');
  const cat = {};
  list.filter(counted).forEach((x) => { cat[x.category] = (cat[x.category] || 0) + Number(x.amount); });
  const catRows = Object.entries(cat).sort((a, b) => b[1] - a[1]);
  return {
    list, monthList, total, pending, catRows,
    delta: prev ? Math.round(((total - prev) / prev) * 100) : null,
    people: [...new Set(all.map((x) => x.paid_by).filter(Boolean))],
    categories: [...new Set(all.map((x) => x.category))].sort(),
  };
}

/** The "vs September" line under Total spent: a count when there is nothing to compare with. */
export function deltaLine(delta, countedN, prevMonthName) {
  if (delta === null) return `${countedN} expenses`;
  return `${delta > 0 ? '↑' : delta < 0 ? '↓' : ''} ${Math.abs(delta)}% vs ${prevMonthName}`;
}

/**
 * The card rail: a tile for each active card (and each inactive one that has spend in this view), and
 * one for payments without a card. `monthList` is summarize().monthList (everything but the card filter).
 */
export function cardTiles(cards, monthList, selected) {
  const active = cards.filter((c) => c.active || monthList.some((x) => String(x.card_id) === String(c.id)));
  const other = monthList.filter((x) => !x.card_id);
  const tiles = active.map((c) => {
    const mine = monthList.filter((x) => String(x.card_id) === String(c.id));
    const spent = sumOf(mine);
    return {
      card: c, spent, count: mine.filter(counted).length,
      pct: c.monthly_limit ? Math.min(100, Math.round((spent / c.monthly_limit) * 100)) : null,
      on: String(selected) === String(c.id),
    };
  });
  return { tiles, other, otherSum: sumOf(other), none: !active.length && !other.length };
}

/** Can this person edit this expense? An admin always; anyone else only their own pending ones. */
export function canEditExpense(x, access, admin) {
  const mineEditable = x.status === 'pending' && x.created_by && access?.email && x.created_by.toLowerCase() === access.email.toLowerCase();
  return Boolean(admin || mineEditable);
}

/* ── the expense form ──────────────────────────────────────────────────────── */

/** Cards offered when logging an expense: active ones, plus the one this expense already uses. */
export const usableCards = (cards, x) => cards.filter((c) => c.active || (x && String(x.card_id) === String(c.id)));

/** The form's starting values (all strings). */
export function formFromExpense(x, { cards, me }) {
  return {
    spent_on: x?.spent_on || todayIST(),
    amount: x?.amount != null ? String(x.amount) : '',
    category: x?.category || '',
    vendor: x?.vendor || '',
    description: x?.description || '',
    payment_method: x?.payment_method || (usableCards(cards, x).length ? 'card' : 'upi'),
    card_id: x?.card_id != null ? String(x.card_id) : '',
    paid_by: x?.paid_by || me || '',
    company: x?.company || '',
    receipt_url: x?.receipt_url || '',
  };
}

/**
 * The payload saveExpense() wrote, or the sentence to show. Someone who is not an admin cannot pick
 * who spent it: it is always them (the old hidden input).
 */
export function expenseFromForm(form, { admin, me }) {
  const v = normalizeForm({ ...form, paid_by: admin ? form.paid_by : (me || '') });
  if (!v.spent_on || !v.amount || !v.category) return { error: 'Date, amount and category are required.' };
  if (Number(v.amount) <= 0) return { error: 'The amount must be more than zero.' };
  if (v.payment_method === 'card' && !v.card_id) return { error: 'Choose which card was used.' };
  if (!v.paid_by) return { error: 'Say who spent it.' };
  return {
    body: {
      spent_on: v.spent_on, amount: Number(v.amount), category: v.category, vendor: v.vendor,
      description: v.description, payment_method: v.payment_method,
      card_id: v.payment_method === 'card' ? Number(v.card_id) : null,
      paid_by: v.paid_by, company: v.company, receipt_url: v.receipt_url,
    },
  };
}

/** The sentence under the form for a failed save. */
export const expenseSaveError = (err) => (err?.message || String(err)).replace(/^(INSERT|UPDATE) expenses failed: /, '');

/* ── the card form ─────────────────────────────────────────────────────────── */

export function formFromCard(c) {
  return {
    nickname: c?.nickname || '', last4: c?.last4 || '',
    network: c?.network || 'visa', card_type: c?.card_type || 'credit',
    holder_code: c?.holder_code || '', company: c?.company || '',
    monthly_limit: c?.monthly_limit != null ? String(c.monthly_limit) : '',
    billing_day: c?.billing_day != null ? String(c.billing_day) : '',
    active: c?.active === false ? false : true,
  };
}

/** The payload saveCard() wrote, or the sentence to show. */
export function cardFromForm(form) {
  const v = normalizeForm(form);
  if (!v.nickname) return { error: 'Give the card a nickname.' };
  if (!/^[0-9]{4}$/.test(v.last4 || '')) return { error: 'Enter exactly four digits.' };
  return {
    body: {
      nickname: v.nickname, last4: v.last4, network: v.network, card_type: v.card_type,
      holder_code: v.holder_code, company: v.company, active: v.active,
      monthly_limit: v.monthly_limit ? Number(v.monthly_limit) : null,
      billing_day: v.billing_day ? Number(v.billing_day) : null,
    },
  };
}

export const cardSaveError = (err) => (err?.message || String(err)).replace(/^(INSERT|UPDATE) cards failed: /, '');

/* ── export ───────────────────────────────────────────────────────────────── */

/** The CSV text of the rows on screen (with a BOM so Excel reads the rupee sign), as the old export built it. */
export function expensesCsv(rows, cards, nameOf) {
  const q = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
  const head = ['Date', 'Amount', 'Currency', 'Category', 'Vendor', 'Description', 'Paid with', 'Card', 'Spent by', 'Company', 'Status'];
  const lines = rows.map((x) => {
    const c = cardById(cards, x.card_id);
    return [x.spent_on, x.amount, x.currency, x.category, x.vendor, x.description, METHOD_LABEL[x.payment_method], c ? cardLabel(c) : '', nameOf(x.paid_by), x.company, x.status].map(q).join(',');
  });
  return '﻿' + [head.map(q).join(','), ...lines].join('\n');
}
