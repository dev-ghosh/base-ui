/* expense-actions.js — loading and every write of Expenses and Cards. Port of loadExpenses,
 * saveExpense, reviewExpense, deleteExpense, saveCard and the CSV download in
 * rie-dashboard2/js/expenses.js.
 *
 * The store is never mutated in place: a changed row is a new object in a new array. Writes go
 * through rest.js, whose assertCanWrite() refuses a view-only user before any request.
 *
 * Plain JS with relative imports so plain Node can import it.
 */
import { store } from '../store/store.js';
import { sbGet, sbInsert, sbUpdate, sbDelete } from './rest.js';
import { setStatus } from './status.js';
import { beginLoad, isCurrentLoad } from './user-data.js';
import { isAdminOf } from './access.js';
import { isMissingTable } from '../features/team/model.js';

const sameId = (a, b) => a != null && b != null && String(a) === String(b);

let inflight = null;

/**
 * Load the cards and the expenses once (the old `loaded` flag); `force` reloads. Never throws: a
 * failure sets `expError` ('missing' when the tables are not there, else the message) and keeps what
 * was loaded. A result that arrives after a sign-out is dropped (R25).
 */
export function loadExpenses(force = false) {
  const s = store.getState();
  if (s.expensesLoaded && !force) return Promise.resolve();
  if (inflight) return inflight;
  const token = beginLoad();
  const run = (async () => {
    try {
      const [cards, expenses] = await Promise.all([
        sbGet('cards', 'order=nickname.asc'),
        sbGet('expenses', 'order=spent_on.desc,id.desc&limit=3000'),
      ]);
      if (!isCurrentLoad(token)) return;
      store.setState({ cards, expenses, expError: null, expensesLoaded: true });
    } catch (err) {
      if (!isCurrentLoad(token)) return;
      store.setState((cur) => ({ expError: isMissingTable(err.message) ? 'missing' : err.message, cards: cur.cards || [], expenses: cur.expenses || [] }));
    }
  })();
  inflight = run;
  run.finally(() => { if (inflight === run) inflight = null; });
  return run;
}

const patchExpense = (id, row) => store.setState((s) => ({ expenses: s.expenses.map((e) => (sameId(e.id, id) ? { ...e, ...row } : e)) }));

/**
 * Add (no id) or change an expense. An admin's own entries are approved on the spot; everyone else's
 * wait for review (RLS enforces the second half; this just sets the first). Throws the raw error for
 * the form to show (see expenseSaveError).
 */
export async function saveExpense(id, body) {
  if (id) {
    const [row] = await sbUpdate('expenses', id, body);
    if (!row) throw new Error('You do not have permission to change this expense.');
    patchExpense(id, row);
  } else {
    const admin = isAdminOf(store.getState().access);
    const [row] = await sbInsert('expenses', { ...body, status: admin ? 'approved' : 'pending' });
    store.setState((s) => ({ expenses: [row, ...s.expenses] }));
  }
  setStatus('online', id ? 'Expense updated' : 'Expense added');
}

/** Approve or reject (admin; the database refuses anyone else and the row comes back empty). */
export async function reviewExpense(id, status) {
  try {
    const [row] = await sbUpdate('expenses', id, { status, reviewed_by: store.getState().access?.email || null, reviewed_at: new Date().toISOString() });
    if (!row) throw new Error('Only an admin can review expenses.');
    patchExpense(id, row);
    setStatus('online', `Expense ${status}`);
  } catch (e) { setStatus('error', e.message); }
}

/** Delete an expense. @returns {Promise<boolean>} true when deleted */
export async function deleteExpense(id) {
  try {
    await sbDelete('expenses', id);
    store.setState((s) => ({ expenses: s.expenses.filter((e) => !sameId(e.id, id)) }));
    setStatus('online', 'Expense deleted');
    return true;
  } catch (e) {
    setStatus('error', e.message);
    return false;
  }
}

/** Add (no id) or change a card (admin). Throws the raw error for the form to show. */
export async function saveCard(id, body) {
  if (id) {
    const [row] = await sbUpdate('cards', id, body);
    store.setState((s) => ({ cards: s.cards.map((c) => (sameId(c.id, id) ? { ...c, ...row } : c)) }));
  } else {
    const [row] = await sbInsert('cards', body);
    store.setState((s) => ({ cards: [...s.cards, row] }));
  }
  setStatus('online', 'Card saved');
}

/** Hand the browser a CSV file to save. */
export function downloadCsv(filename, text) {
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8' });
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: filename });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
