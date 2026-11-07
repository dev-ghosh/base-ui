'use client';

import { useRef, useState } from 'react';
import {
  STATUSES, PIVOT_AXES, KANBAN_PAGE_SIZE, LIST_COLS, statusColor, sortTasks,
} from './model.js';
import { CompositionBar } from './MatrixGrid.jsx';
import { fmtD } from '../../../lib/format.js';

// Colour rule for the whole Work tab: red only on a task that is P1, overdue AND mine; overdue
// alone is amber. One tone for the badge, one for the date.
const tone = (model, t) => (model.isFire(t) ? 'crit' : 'warn');
const ownerLabel = (t) => (t.assignedTo || '').trim();

/* ── Kanban ─────────────────────────────────────────────────────────────── */

function KbCard({ model, t, drill, open, onToggle, onDragStart, onDragEnd, dragging, actions }) {
  const overdue = model.isOverdue(t);
  const stop = (e) => e.stopPropagation();
  return (
    <div
      className={'mx-card' + (dragging ? ' dragging' : '')}
      draggable
      data-id={t.id}
      onDragStart={(e) => onDragStart(e, t)}
      onDragEnd={onDragEnd}
      onClick={() => onToggle(t.id)}
    >
      <div className="mx-card-t">{t.task}</div>
      <div className="mx-card-m">
        {t.priority ? <span className={`mx-badge ${t.priority === 'P1' ? tone(model, t) : 'warn'}`}>{t.priority}</span> : null}
        {overdue ? <span className={`mx-badge ${tone(model, t)}`}>overdue</span> : null}
        <span className="mx-id">#{String(t.id)}</span>
        {!drill.company && t.company ? <span className="mx-meta">{t.company}</span> : null}
        {!drill.func && t.func ? <span className="mx-meta">{t.func}</span> : null}
        <span className="mx-meta">{ownerLabel(t) || 'unowned'}</span>
        {t.funcReview ? <span className="mx-badge warn">review</span> : null}
      </div>
      {open ? (
        <div className="mx-card-x">
          {t.contactOrg || t.contactName ? <div><b>Counterparty</b> {[t.contactName, t.contactOrg].filter(Boolean).join(' / ')}</div> : null}
          {t.actionItem ? <div><b>Action</b> {t.actionItem}</div> : null}
          {t.keyInputs ? <div><b>Context</b> {t.keyInputs}</div> : null}
          <div><b>Next follow-up</b> {t.nextFollowUp ? fmtD(t.nextFollowUp) : '—'}</div>
          <div><b>Last meeting</b> {t.lastMtg ? fmtD(t.lastMtg) : '—'}</div>
          {t.funcReview ? (
            <div className="mx-revnote">
              <b>Needs review</b> {t.funcReviewNote || 'No note recorded.'}
              <button type="button" className="mx-btn" onClick={(e) => { stop(e); actions.confirmReview(t.id); }}>Confirm</button>
            </div>
          ) : null}
          {/* Clicking inside the controls must not collapse the card they live in. */}
          <div className="mx-card-sel" onClick={stop}>
            <label>Status
              <select value={t.status} onChange={(e) => actions.setStatus(t.id, e.target.value)}>
                {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
            <label>Function
              <select value={t.func || ''} onChange={(e) => actions.setFunc(t.id, e.target.value)}>
                <option value="">&mdash;</option>
                {model.activeFuncsFor(t.company).map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
            </label>
            <span className="mx-card-acts">
              <button type="button" className="mx-btn" onClick={(e) => { stop(e); actions.openTask(t.id); }}>Open</button>
              <button type="button" className="mx-btn mx-btn-dn" onClick={(e) => { stop(e); actions.deleteTask(t.id); }}>Delete</button>
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/**
 * All five statuses, in workflow order, matching the Board. Filtering the columns to the
 * selected statuses left a card nowhere to go when its status changed, which is what made the
 * status control look broken (old comment).
 */
function Kanban({ model, rows, drill, theme, expanded, onToggle, actions, onList }) {
  const drag = useRef(null);                       // the card being dragged: { id, status }
  const [over, setOver] = useState(null);
  const [dragging, setDragging] = useState(null);

  const onDragStart = (e, t) => {
    drag.current = { id: t.id, status: t.status };
    setDragging(t.id);
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      try { e.dataTransfer.setData('text/plain', String(t.id)); } catch { /* some browsers refuse */ }
    }
  };
  const onDragEnd = () => { setDragging(null); setOver(null); };
  const onDrop = (e, status) => {
    e.preventDefault();
    setOver(null);
    const d = drag.current;
    if (!d || status === d.status) return;
    drag.current = null;
    actions.setStatus(d.id, status);
  };

  return (
    <div className="mx-kb">
      {STATUSES.map((s) => {
        const items = rows.filter((t) => t.status === s);
        const shown = items.slice(0, KANBAN_PAGE_SIZE);
        const more = items.length - shown.length;
        return (
          <div
            key={s}
            className={'mx-kbcol' + (over === s ? ' drag-over' : '')}
            data-status={s}
            onDragOver={(e) => { e.preventDefault(); if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'; setOver(s); }}
            onDragLeave={() => setOver(null)}
            onDrop={(e) => onDrop(e, s)}
          >
            <div className="mx-kbh"><i style={{ background: statusColor(s, theme) }}></i>{s}<b>{items.length}</b></div>
            {shown.map((t) => (
              <KbCard
                key={t.id} model={model} t={t} drill={drill} open={expanded.has(t.id)} onToggle={onToggle}
                onDragStart={onDragStart} onDragEnd={onDragEnd} dragging={dragging === t.id} actions={actions}
              />
            ))}
            {more ? <div className="mx-more"><button type="button" onClick={onList}>+ {more} more &mdash; open as List</button></div> : null}
          </div>
        );
      })}
    </div>
  );
}

/* ── List ───────────────────────────────────────────────────────────────── */

function List({ model, rows, sort, onSort, actions }) {
  const sorted = sortTasks(rows, sort.col, sort.dir);
  return (
    <table className="mx-list">
      <thead>
        <tr>
          {LIST_COLS.map((c) => (
            <th key={c.key}><button type="button" onClick={() => onSort(c.key)}>{c.label}{sort.col === c.key ? (sort.dir === 1 ? ' ↑' : ' ↓') : ''}</button></th>
          ))}
        </tr>
      </thead>
      <tbody>
        {sorted.map((t) => {
          // Only the functions ACTIVE for THIS row's company, straight from the registry - never a
          // global function list (spec 7.7).
          const opts = t.company ? model.activeFuncsFor(t.company) : [];
          const sub = [t.contactName, t.contactOrg].filter(Boolean).join(' / ');
          const dueCls = !model.isOverdue(t) ? 'mx-due' : model.isFire(t) ? 'mx-due-od' : 'mx-due-warm';
          return (
            <tr key={t.id}>
              <td className="mx-id">#{String(t.id)}</td>
              <td>{t.company || ''}</td>
              <td>
                {t.company ? (
                  <select className="mx-inline" value={t.func || ''} onChange={(e) => actions.setFunc(t.id, e.target.value)}>
                    {t.func ? null : <option value="">-- none --</option>}
                    {opts.map((f) => <option key={f} value={f}>{f}</option>)}
                  </select>
                ) : <span className="mx-nocompany" title="No canonical company: cannot offer a function list">no company</span>}
              </td>
              <td className="mx-tcell">
                {/* The title opens the task, as it does on Board and Hierarchy. */}
                <button type="button" className="mx-tt mx-tt-btn" title={t.task} onClick={() => actions.openTask(t.id)}>{t.task}</button>
                {sub ? <div className="mx-sub">{sub}</div> : null}
                {t.funcReview ? <div className="mx-sub warn">{t.funcReviewNote || 'Needs review'}</div> : null}
              </td>
              <td>
                <select className="mx-inline" value={t.status} onChange={(e) => actions.setStatus(t.id, e.target.value)}>
                  {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </td>
              <td>{t.priority || ''}</td>
              <td>{ownerLabel(t)}</td>
              <td className={dueCls}>{t.nextFollowUp ? fmtD(t.nextFollowUp) : '—'}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/* ── Pivot ──────────────────────────────────────────────────────────────── */

function Pivot({ model, rows, axis, theme }) {
  const entries = model.pivotEntries(rows, axis);
  // Bar scale is relative to the largest group in this pivot, never fixed.
  const max = entries.reduce((m, e) => Math.max(m, e.items.length), 0);
  const ax = PIVOT_AXES.find((a) => a.key === axis);
  return (
    <table className="mx-pivot">
      <thead><tr><th>{ax ? ax.label : axis}</th><th>Tasks</th><th>Status mix</th><th>Risk</th></tr></thead>
      <tbody>
        {entries.map(({ label, items }) => {
          const od = items.filter(model.isOverdue).length;
          const p1 = items.filter((t) => t.priority === 'P1').length;
          return (
            <tr key={label}>
              <td className="mx-pv-l">{label}</td>
              <td className="mx-pv-b">
                <div className="mx-pvbar"><i style={{ width: `${max ? (items.length / max) * 100 : 0}%` }}></i></div>
                <span>{items.length}</span>
              </td>
              <td className="mx-pv-m"><CompositionBar segments={model.composition(items)} theme={theme} /></td>
              <td className="mx-pv-r">
                {od || p1 ? (
                  <>
                    {od ? <span className={items.some(model.isFire) ? 'crit' : 'warn'}>{od} overdue</span> : null}
                    {p1 ? <span className="warn">{p1} P1</span> : null}
                  </>
                ) : <span className="good">clear</span>}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/** The drill body for the current tab. The panel stays open on an empty scope; it never auto-closes (spec 7.10). */
export default function DrillBody({ model, rows, drill, tab, pivot, theme, expanded, onToggle, sort, onSort, actions, onList }) {
  if (!rows.length) return <div className="mx-empty">No tasks in this scope.</div>;
  if (tab === 'board') return <Kanban model={model} rows={rows} drill={drill} theme={theme} expanded={expanded} onToggle={onToggle} actions={actions} onList={onList} />;
  if (tab === 'list') return <List model={model} rows={rows} sort={sort} onSort={onSort} actions={actions} />;
  return <Pivot model={model} rows={rows} axis={pivot} theme={theme} />;
}
