'use client';

import { useMemo, useState } from 'react';
import { Badge, Dialog, EmptyCard, Field } from '../../components/ui.jsx';
import { useStore } from '../../store/useStore.js';
import { useAccess } from '../../hooks/useAccess.js';
import { internalPeople, personName } from '../../lib/mappers.js';
import { setStatus } from '../../lib/status.js';
import { downloadCsv, deleteExpense, reviewExpense, saveCard, saveExpense } from '../../lib/expense-actions.js';
import { fmtDate, inr, inrShort, monthLabel, shiftMonth, thisMonth, toneFor } from '../../lib/ui-format.js';
import {
  CARD_TYPES, CATEGORIES, METHODS, METHOD_LABEL, NETWORK, STATUS_CHOICES, STATUS_TONE,
  canEditExpense, cardById, cardFromForm, cardLabel, cardSaveError, cardTiles, counted, deltaLine,
  expenseFromForm, expenseSaveError, expensesCsv, formFromCard, formFromExpense, nextMonth, sumOf, summarize, usableCards,
} from './model.js';
import { useExpenseFilters } from './hooks/useExpenseFilters.js';
import { useExpenses } from './hooks/useExpenses.js';

const MISSING = 'An admin needs to apply the database migration 20261011_expenses_team.sql, then refresh.';

/** The distinct companies on tasks, for the Company select of both forms. */
const taskCompanies = (tasks) => [...new Set((tasks || []).map((t) => t.company).filter(Boolean))].sort();

/* ── add / edit an expense ────────────────────────────────────────────────── */

function ExpenseFormDialog({ expense: x, cards, tasks, admin, me, onClose, onSaved }) {
  const [form, setForm] = useState(() => formFromExpense(x, { cards, me }));
  const [err, setErr] = useState('');
  const set = (name) => (value) => setForm((f) => ({ ...f, [name]: value }));
  const f = (name, label, extra = {}) => <Field name={name} label={label} value={form[name]} onChange={set(name)} {...extra} />;
  const usable = usableCards(cards, x);
  const companies = taskCompanies(tasks);

  const save = async () => {
    setErr('');
    const out = expenseFromForm(form, { admin, me });
    if (out.error) { setErr(out.error); return; }
    try {
      await saveExpense(x ? x.id : null, out.body);
      onSaved();
    } catch (e) { setErr(expenseSaveError(e)); }
  };
  const remove = () => {
    if (!window.confirm('Delete this expense? This cannot be undone.')) return;
    deleteExpense(x.id).then((ok) => { if (ok) onSaved(); });
  };

  return (
    <Dialog
      open title={x ? 'Edit expense' : 'Add expense'} onClose={onClose}
      footer={(
        <>
          {x && admin ? <button type="button" className="btn b-dn" style={{ marginRight: 'auto' }} onClick={remove}>Delete</button> : null}
          <button type="button" className="btn b-pr" onClick={save}>{x ? 'Save changes' : 'Add expense'}</button>
          <button type="button" className="btn b-gh" onClick={onClose}>Cancel</button>
        </>
      )}
    >
      <div className="ui-form">
        <div className="two">
          {f('spent_on', 'Date', { type: 'date', required: true })}
          {f('amount', 'Amount (₹)', { type: 'number', required: true, inputProps: { min: '0.01', step: '0.01', inputMode: 'decimal' } })}
        </div>
        <div className="two">
          {f('category', 'Category', { required: true, inputProps: { list: 'exp-cats', autoComplete: 'off' } })}
          {f('vendor', 'Vendor / merchant')}
        </div>
        <datalist id="exp-cats">{CATEGORIES.map((c) => <option key={c} value={c} />)}</datalist>
        {f('description', 'What was it for?', { type: 'textarea' })}
        <div className="two">
          {f('payment_method', 'Paid by', { options: METHODS })}
          <div id="exp-card-wrap" hidden={form.payment_method !== 'card'}>
            {f('card_id', 'Which card', { options: [['', 'Choose a card…'], ...usable.map((c) => [c.id, cardLabel(c)])] })}
          </div>
        </div>
        <div className="two">
          {admin
            ? f('paid_by', 'Spent by', { options: [['', 'Choose…'], ...internalPeople().map((p) => [p.code, p.display_name || p.code])] })
            : <input type="hidden" name="paid_by" value={me || ''} />}
          {f('company', 'Company', { options: [['', 'Not specified'], ...companies.map((c) => [c, c])] })}
        </div>
        {f('receipt_url', 'Receipt link (optional)', { type: 'url', placeholder: 'https://…', hint: 'A link to the receipt in Drive, Dropbox or your e-mail.' })}
        <div className="ferr" id="exp-err" role="alert">{err}</div>
      </div>
    </Dialog>
  );
}

/* ── cards (admin) ────────────────────────────────────────────────────────── */

function CardForm({ card: c, tasks, onBack, onClose }) {
  const [form, setForm] = useState(() => formFromCard(c));
  const [err, setErr] = useState('');
  const set = (name) => (value) => setForm((f) => ({ ...f, [name]: value }));
  const f = (name, label, extra = {}) => <Field name={name} label={label} value={form[name]} onChange={set(name)} {...extra} />;

  const save = async () => {
    setErr('');
    const out = cardFromForm(form);
    if (out.error) { setErr(out.error); return; }
    try {
      await saveCard(c ? c.id : null, out.body);
      onBack();
    } catch (e) { setErr(cardSaveError(e)); }
  };

  return (
    <Dialog
      open wide title={c ? 'Edit card' : 'Cards'} onClose={onClose} contentKey="form"
      footer={(
        <>
          <button type="button" className="btn b-pr" onClick={save}>{c ? 'Save card' : 'Add card'}</button>
          <button type="button" className="btn b-gh" onClick={onBack}>Back</button>
        </>
      )}
    >
      <div className="ui-form">
        <div className="two">
          {f('nickname', 'Nickname', { required: true, placeholder: 'e.g. HDFC Ops Card' })}
          {f('last4', 'Last 4 digits', { required: true, hint: 'Only the last four. Nothing else is ever stored.', inputProps: { maxLength: 4, inputMode: 'numeric', pattern: '[0-9]{4}', autoComplete: 'off' } })}
        </div>
        <div className="two">
          {f('network', 'Network', { options: Object.entries(NETWORK) })}
          {f('card_type', 'Type', { options: CARD_TYPES })}
        </div>
        <div className="two">
          {f('holder_code', 'Cardholder', { options: [['', 'Shared / company'], ...internalPeople().map((p) => [p.code, p.display_name || p.code])] })}
          {f('company', 'Company', { options: [['', 'Not specified'], ...taskCompanies(tasks).map((x) => [x, x])] })}
        </div>
        <div className="two">
          {f('monthly_limit', 'Monthly limit (₹)', { type: 'number', inputProps: { min: '0', step: '1' } })}
          {f('billing_day', 'Statement day', { type: 'number', inputProps: { min: '1', max: '31' } })}
        </div>
        <label className="chk-line">
          <input type="checkbox" name="active" checked={form.active} onChange={(e) => set('active')(e.target.checked)} /> Active (shown when logging expenses)
        </label>
        <div className="ferr" id="card-err" role="alert">{err}</div>
      </div>
    </Dialog>
  );
}

function CardList({ cards, onEdit, onAdd, onClose }) {
  return (
    <Dialog
      open wide title="Cards" onClose={onClose} contentKey="list"
      footer={(
        <>
          <button type="button" className="btn b-pr" onClick={onAdd}>Add a card</button>
          <button type="button" className="btn b-gh" onClick={onClose}>Close</button>
        </>
      )}
    >
      <p className="muted" style={{ marginBottom: 12 }}>Only the last four digits are stored. Never enter a full card number.</p>
      <div className="table-scroll"><table className="ui-table">
        <thead><tr><th>Card</th><th>Holder</th><th className="r">Monthly limit</th><th></th></tr></thead>
        <tbody>
          {cards.map((k) => (
            <tr key={k.id}>
              <td><div className="cell-main">{cardLabel(k)}</div><div className="cell-sub">{NETWORK[k.network]} {k.card_type}{k.company ? ` · ${k.company}` : ''}</div></td>
              <td>{k.holder_code ? personName(k.holder_code) : 'Shared'}</td>
              <td className="r">{k.monthly_limit ? inr(k.monthly_limit) : '—'}</td>
              <td className="r nowrap">
                <Badge text={k.active ? 'Active' : 'Inactive'} tone={k.active ? 'success' : 'neutral'} />{' '}
                <button type="button" className="btn b-sm b-gh" onClick={() => onEdit(k.id)}>Edit</button>
              </td>
            </tr>
          ))}
          {cards.length ? null : <tr><td colSpan={4} className="muted">No cards yet.</td></tr>}
        </tbody>
      </table></div>
    </Dialog>
  );
}

/* ── the page ─────────────────────────────────────────────────────────────── */

function CardRail({ model, isAdmin, selected, onPick, onAddCard }) {
  if (model.none) {
    return (
      <section className="ui-card"><div className="ui-card-c">
        <EmptyCard title="No cards yet" text={isAdmin ? 'Add the company cards to see what each one was used for.' : 'No cards are assigned to you yet.'}>
          {isAdmin ? <button type="button" className="btn b-pr" onClick={onAddCard}>Add a card</button> : null}
        </EmptyCard>
      </div></section>
    );
  }
  return (
    <section className="cards-sec">
      <div className="sec-h"><h2>Cards</h2><p>Tap a card to see only what was paid with it</p></div>
      <div className="card-rail">
        {model.tiles.map(({ card: c, spent, count, pct, on }) => (
          <button
            type="button" key={c.id} className={`pay-card${on ? ' on' : ''}${c.active ? '' : ' off'}`}
            style={{ '--t': toneFor(c.nickname) }} onClick={() => onPick(c.id)} aria-pressed={on}
          >
            <span className="pc-top"><b>{c.nickname}</b><span>{NETWORK[c.network] || 'Card'} {c.card_type}</span></span>
            <span className="pc-num">•••• •••• •••• {c.last4}</span>
            <span className="pc-mid"><span>{c.holder_code ? personName(c.holder_code) : 'Shared'}</span>{c.company ? <span>{c.company}</span> : null}</span>
            <span className="pc-bot"><b>{inr(spent)}</b><span>{count} txns{pct !== null ? ` · ${pct}% of ${inrShort(c.monthly_limit)}` : ''}</span></span>
            {pct !== null ? <span className="pc-bar"><i className={pct >= 100 ? 'over' : pct >= 80 ? 'near' : ''} style={{ width: `${pct}%` }} /></span> : null}
          </button>
        ))}
        {model.other.length ? (
          <button type="button" className={`pay-card plain${selected === 'none' ? ' on' : ''}`} onClick={() => onPick('none')}>
            <span className="pc-top"><b>No card</b><span>cash, UPI, transfer</span></span>
            <span className="pc-bot"><b>{inr(model.otherSum)}</b><span>{model.other.length} txns</span></span>
          </button>
        ) : null}
      </div>
    </section>
  );
}

function Transactions({ list, cards, isAdmin, canWrite, access, onAdd, onEdit }) {
  if (!list.length) {
    return (
      <div className="ui-card-c">
        <EmptyCard title="No expenses here" text="Nothing matches this month and these filters.">
          {canWrite ? <button type="button" className="btn b-pr" onClick={onAdd}>Add expense</button> : null}
        </EmptyCard>
      </div>
    );
  }
  return (
    <div className="table-scroll"><table className="ui-table">
      <thead><tr><th>Date</th><th>Details</th><th>Paid with</th>{isAdmin ? <th>Paid by</th> : null}<th className="r">Amount</th><th>Status</th><th></th></tr></thead>
      <tbody>
        {list.map((x) => {
          const c = cardById(cards, x.card_id);
          return (
            <tr key={x.id}>
              <td className="nowrap">{fmtDate(x.spent_on)}</td>
              <td>
                <div className="cell-main">{x.vendor || x.description || x.category}</div>
                <div className="cell-sub"><Badge text={x.category} tone="outline" />{x.vendor && x.description ? ` ${x.description}` : ''}{x.company ? ` · ${x.company}` : ''}</div>
              </td>
              <td className="nowrap">
                {c ? <><span className="chip-card" style={{ '--t': toneFor(c.nickname) }} />{cardLabel(c)}</> : (METHOD_LABEL[x.payment_method] || x.payment_method)}
              </td>
              {isAdmin ? <td className="nowrap">{personName(x.paid_by) || '—'}</td> : null}
              <td className={`r nowrap amt${x.status === 'rejected' ? ' struck' : ''}`}>{inr(x.amount, true)}</td>
              <td><Badge text={x.status[0].toUpperCase() + x.status.slice(1)} tone={STATUS_TONE[x.status]} /></td>
              <td className="r nowrap row-actions">
                {isAdmin && x.status === 'pending' ? (
                  <>
                    <button type="button" className="btn b-sm b-ol" onClick={() => reviewExpense(x.id, 'approved')}>Approve</button>
                    <button type="button" className="btn b-sm b-gh" onClick={() => reviewExpense(x.id, 'rejected')}>Reject</button>
                  </>
                ) : null}
                {x.receipt_url ? <a className="btn b-sm b-gh" href={x.receipt_url} target="_blank" rel="noopener noreferrer">Receipt</a> : null}
                {canEditExpense(x, access, isAdmin) ? <button type="button" className="btn b-sm b-gh" onClick={() => onEdit(x.id)}>Edit</button> : null}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table></div>
  );
}

/**
 * The Expenses screen (old `#tab-expenses`): header actions, month and filters, the four numbers, the
 * card rail, the spend by category and the transactions. The filters and the month are search params
 * (see model.js); the expense form and the cards manager are component state (spec C7).
 */
export default function ExpensesScreen() {
  const { canWrite, isAdmin: admin, access } = useAccess();
  const { cards, expenses, loaded, error, reload } = useExpenses();
  const tasks = useStore((s) => s.tasks);
  useStore((s) => s.people);                    // names follow the people list
  const { filters: f, update } = useExpenseFilters();
  // null | { kind: 'expense', id } | { kind: 'cards', mode: 'list' } | { kind: 'cards', mode: 'form', id }
  const [dialog, setDialog] = useState(null);

  const sum = useMemo(() => summarize(expenses, f), [expenses, f]);
  const rail = useMemo(() => cardTiles(cards, sum.monthList, f.card), [cards, sum.monthList, f.card]);

  if (!loaded && !error) {
    return <Frame><div className="pg-wrap"><div className="empty-state sm"><p>Loading expenses…</p></div></div></Frame>;
  }
  if (error === 'missing') {
    return <Frame><div className="pg-wrap"><EmptyCard title="Expenses are not set up yet" text={MISSING} /></div></Frame>;
  }
  if (error) {
    return (
      <Frame><div className="pg-wrap">
        <EmptyCard title="Could not load expenses" text={error}>
          <button type="button" className="btn b-pr" onClick={reload}>Try again</button>
        </EmptyCard>
      </div></Frame>
    );
  }

  const { month } = f;
  const me = access?.person_code || null;
  const { list, total, pending, catRows, delta } = sum;
  const pickCard = (id) => update({ card: String(f.card) === String(id) ? '' : String(id) });
  const openExpense = (id) => {
    if (!canWrite) { setStatus('error', 'View-only access: you cannot add expenses.'); return; }
    setDialog({ kind: 'expense', id: id ?? null });
  };
  const openCards = (mode = 'list', id = null) => { if (admin) setDialog({ kind: 'cards', mode, id }); };
  const closeDialog = () => setDialog(null);
  const editing = dialog?.kind === 'expense' && dialog.id != null ? expenses.find((e) => String(e.id) === String(dialog.id)) : null;
  const editingCard = dialog?.kind === 'cards' && dialog.mode === 'form' && dialog.id != null ? cardById(cards, dialog.id) : null;
  const prevName = month === 'all' ? '' : monthLabel(shiftMonth(month, -1)).split(' ')[0];
  const exportCsv = () => downloadCsv(`expenses-${month}.csv`, expensesCsv(list, cards, personName));

  return (
    <Frame>
      <div className="pg-wrap wide">
        <header className="pg-head">
          <div>
            <h1>Expenses</h1>
            <p>{admin ? 'Every expense across the company, and which card paid for it.' : 'Your expenses and the cards you used.'}</p>
          </div>
          <div className="head-actions">
            {admin ? <button type="button" className="btn b-ol" onClick={() => openCards('list')}>Manage cards</button> : null}
            <button type="button" className="btn b-ol" onClick={exportCsv}>Export CSV</button>
            {canWrite ? <button type="button" className="btn b-pr" onClick={() => openExpense()}>Add expense</button> : null}
          </div>
        </header>

        <div className="toolbar">
          <div className="month-pick">
            <button type="button" className="icon-sq" onClick={() => update({ month: nextMonth(month, -1) })} aria-label="Previous month" disabled={month === 'all'}>‹</button>
            <span>{month === 'all' ? 'All time' : monthLabel(month)}</span>
            <button type="button" className="icon-sq" onClick={() => update({ month: nextMonth(month, 1) })} aria-label="Next month" disabled={month === 'all' || month >= thisMonth()}>›</button>
            <button type="button" className="btn b-gh b-sm" onClick={() => update({ month: nextMonth(month, month === 'all' ? 'now' : 'all') })}>{month === 'all' ? 'This month' : 'All time'}</button>
          </div>
          <div className="filters">
            <select className="ui-input sm" value={f.category} onChange={(e) => update({ category: e.target.value })} aria-label="Category">
              <option value="">All categories</option>
              {sum.categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            {admin ? (
              <select className="ui-input sm" value={f.person} onChange={(e) => update({ person: e.target.value })} aria-label="Person">
                <option value="">Everyone</option>
                {sum.people.map((p) => <option key={p} value={p}>{personName(p)}</option>)}
              </select>
            ) : null}
            <select className="ui-input sm" value={f.status} onChange={(e) => update({ status: e.target.value })} aria-label="Status">
              <option value="">Any status</option>
              {STATUS_CHOICES.map((s) => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}
            </select>
          </div>
        </div>

        <div className="stat-grid">
          <div className="ui-card stat"><div className="stat-l">Total spent</div><div className="stat-v">{inr(total)}</div><div className="stat-s">{deltaLine(delta, list.filter(counted).length, prevName)}</div></div>
          <div className="ui-card stat"><div className="stat-l">Awaiting approval</div><div className="stat-v">{pending.length}</div><div className="stat-s">{inr(sumOf(pending))}</div></div>
          <div className="ui-card stat"><div className="stat-l">Top category</div><div className="stat-v sm">{catRows[0]?.[0] || '—'}</div><div className="stat-s">{catRows[0] ? inr(catRows[0][1]) : 'Nothing yet'}</div></div>
          <div className="ui-card stat"><div className="stat-l">Cards used</div><div className="stat-v">{new Set(list.filter((x) => x.card_id).map((x) => x.card_id)).size}</div><div className="stat-s">of {cards.filter((c) => c.active).length} active</div></div>
        </div>

        <CardRail model={rail} isAdmin={admin} selected={String(f.card)} onPick={pickCard} onAddCard={() => openCards('form', null)} />

        <div className="split">
          <section className="ui-card">
            <div className="ui-card-h"><h2>By category</h2><p>Where the money went</p></div>
            <div className="ui-card-c">
              {catRows.length ? catRows.map(([c, v]) => (
                <div className="bar-row" key={c}>
                  <span className="bar-l">{c}</span>
                  <span className="bar-t"><i style={{ width: `${Math.max(3, (v / catRows[0][1]) * 100)}%` }} /></span>
                  <span className="bar-v">{inrShort(v)}</span>
                </div>
              )) : <p className="muted">No spending in this view.</p>}
            </div>
          </section>
          <section className="ui-card">
            <div className="ui-card-h">
              <h2>Transactions</h2>
              <p>
                {list.length} in this view
                {f.card ? (
                  <>
                    {' · filtered to '}{f.card === 'none' ? 'non-card payments' : cardLabel(cardById(cards, f.card))}{' '}
                    <a href="#" onClick={(e) => { e.preventDefault(); pickCard(f.card); }}>clear</a>
                  </>
                ) : null}
              </p>
            </div>
            <div className="ui-card-c flush">
              <Transactions
                list={list} cards={cards} isAdmin={admin} canWrite={canWrite} access={access}
                onAdd={() => openExpense()} onEdit={openExpense}
              />
            </div>
          </section>
        </div>
      </div>

      {dialog?.kind === 'expense' ? (
        <ExpenseFormDialog
          key={dialog.id ?? 'new'} expense={editing} cards={cards} tasks={tasks} admin={admin} me={me}
          onClose={closeDialog} onSaved={closeDialog}
        />
      ) : null}
      {dialog?.kind === 'cards' && admin && dialog.mode === 'list' ? (
        <CardList cards={cards} onEdit={(id) => openCards('form', id)} onAdd={() => openCards('form', null)} onClose={closeDialog} />
      ) : null}
      {dialog?.kind === 'cards' && admin && dialog.mode === 'form' ? (
        <CardForm
          key={dialog.id ?? 'new'} card={editingCard} tasks={tasks}
          onBack={() => openCards('list')} onClose={closeDialog}
        />
      ) : null}
    </Frame>
  );
}

/** The page frame: `.tp.page` with the old root id. */
function Frame({ children }) {
  return <div className="tp page active" id="tab-expenses"><div id="expenses-root">{children}</div></div>;
}
