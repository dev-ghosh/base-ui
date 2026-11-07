'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { SEARCH_DEBOUNCE_MS } from '../matrix/model.js';
import { UNASSIGNED } from './params.js';

const PRIORITY_OPTIONS = [
  { val: 'P1', label: 'P1 (Highest)', color: 'var(--hot)' },
  { val: 'P2', label: 'P2', color: 'var(--warm)' },
  { val: 'P3', label: 'P3 (Lowest)', color: 'var(--txm)' },
  { val: '', label: '— No priority', color: 'var(--txd)' },
];
const CREATED_LABELS = {
  all: 'Created', today: 'Created today', week: 'Created this week', month: 'Created this month',
  quarter: 'Created this quarter', custom: 'Created: custom range',
};
const CREATED_OPTIONS = [['today', 'Today'], ['week', 'This Week'], ['month', 'This Month'], ['quarter', 'This Quarter'], ['custom', 'Custom Range…']];
const DUE_BUTTONS = [['all', 'All'], ['overdue', 'Overdue'], ['today', 'Today'], ['3days', '3 Days']];

const dropStyle = (minWidth, extra) => ({
  position: 'absolute', top: '110%', left: 0, background: 'var(--sf)', border: '1px solid var(--bd)', borderRadius: 'var(--rs)',
  minWidth, padding: 8, zIndex: 100, boxShadow: 'var(--shadow-md)', ...extra,
});
const dropHead = {
  fontSize: '.65rem', color: 'var(--txd)', padding: '2px 4px 6px', borderBottom: '1px solid var(--bd)',
  marginBottom: 6, display: 'flex', justifyContent: 'space-between',
};
const clearLink = { cursor: 'pointer', color: 'var(--ac2)' };
const activeBtn = (active) => (active ? { borderColor: 'var(--ac)', color: 'var(--ac2)' } : undefined);

/** A dropdown that closes when you click outside it (toggleDropdown in js/utils.js). */
function useDropdown(closeOnOutside = true) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open || !closeOnOutside) return undefined;
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [open, closeOnOutside]);
  return { open, toggle: () => setOpen((o) => !o), ref };
}

/** The search box: typing is debounced into `q=`; the URL changing elsewhere (Clear) rewrites the box. */
function SearchBox({ q, onCommit }) {
  const [value, setValue] = useState(q);
  const written = useRef(q);
  const timer = useRef(null);
  useEffect(() => {
    if (q !== written.current) { written.current = q; setValue(q); }
  }, [q]);
  useEffect(() => () => clearTimeout(timer.current), []);
  const onChange = (e) => {
    const v = e.target.value;
    setValue(v);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => { written.current = v; onCommit(v); }, SEARCH_DEBOUNCE_MS);
  };
  return <input className="sbi" style={{ width: 150, flex: 'none' }} id="tf-task" placeholder="Search tasks…" value={value} onChange={onChange} />;
}

function AssignedDropdown({ filters, options, update }) {
  const dd = useDropdown();
  const n = filters.assignees.length;
  const toggle = (val, checked) => update((f) => ({
    assignees: checked ? [...f.assignees.filter((a) => a !== val), val] : f.assignees.filter((a) => a !== val),
  }));
  const row = (val, label, color) => (
    <label key={val} className="tf-opt" style={{ color }}>
      <input
        type="checkbox" value={val} checked={filters.assignees.includes(val)} onChange={(e) => toggle(val, e.target.checked)}
        style={{ accentColor: 'var(--ac)', width: 13, height: 13 }}
      />
      {label}
    </label>
  );
  return (
    <div style={{ position: 'relative' }} ref={dd.ref}>
      <button type="button" className="btn b-ol" style={{ fontSize: '.75rem', ...activeBtn(n > 0) }} id="tf-at-btn" onClick={dd.toggle}>
        {n > 0 ? `Assigned (${n}) ▾` : 'Assigned to ▾'}
      </button>
      <div id="tf-at-drop" style={dropStyle(180, { maxHeight: 220, overflowY: 'auto', display: dd.open ? 'block' : 'none' })}>
        <div style={dropHead}>
          <span>Filter by assignee</span>
          <span style={clearLink} onClick={() => update({ assignees: [] })}>Clear</span>
        </div>
        <div id="tf-at-options">
          {row(UNASSIGNED, <em>Unassigned</em>, 'var(--txd)')}
          {options.assignees.map((a) => row(a, a, 'var(--tx)'))}
        </div>
      </div>
    </div>
  );
}

function PriorityDropdown({ filters, update }) {
  const dd = useDropdown();
  const n = filters.priorities.length;
  const toggle = (val, checked) => update((f) => ({
    priorities: checked ? [...f.priorities.filter((p) => p !== val), val] : f.priorities.filter((p) => p !== val),
  }));
  return (
    <div style={{ position: 'relative' }} ref={dd.ref}>
      <button type="button" className="btn b-ol" style={{ fontSize: '.75rem', ...activeBtn(n > 0) }} id="tf-pr-btn" onClick={dd.toggle}>
        {n > 0 ? `Priority (${n}) ▾` : 'Priority ▾'}
      </button>
      <div id="tf-pr-drop" style={dropStyle(160, { display: dd.open ? 'block' : 'none' })}>
        <div style={dropHead}>
          <span>Filter by priority</span>
          <span style={clearLink} onClick={() => update({ priorities: [] })}>Clear</span>
        </div>
        <div id="tf-pr-options">
          {PRIORITY_OPTIONS.map((o) => (
            <label key={o.val || 'none'} className="tf-opt" style={{ color: 'var(--tx)' }}>
              <input
                type="checkbox" value={o.val} checked={filters.priorities.includes(o.val)} onChange={(e) => toggle(o.val, e.target.checked)}
                style={{ accentColor: o.color, width: 13, height: 13 }}
              />
              <span style={{ color: o.color, fontWeight: 600 }}>{o.label}</span>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}

const dateInput = { width: '100%', fontSize: '.75rem', padding: '4px 6px', border: '1px solid var(--bd)', borderRadius: 6, background: 'var(--bg)', color: 'var(--tx)' };

function CreatedDropdown({ filters, update }) {
  // The created dropdown has no click-outside close in the old code: only its button closes it.
  const dd = useDropdown(false);
  const [from, setFrom] = useState(filters.createdFrom);
  const [to, setTo] = useState(filters.createdTo);
  // The URL changing elsewhere (Clear, a link) rewrites the two date boxes.
  useEffect(() => { setFrom(filters.createdFrom); setTo(filters.createdTo); }, [filters.createdFrom, filters.createdTo]);
  const active = filters.created !== 'all';
  return (
    <div style={{ position: 'relative' }} ref={dd.ref}>
      <button type="button" className="btn b-ol" style={{ fontSize: '.75rem', ...activeBtn(active) }} id="tf-cr-btn" onClick={dd.toggle}>
        {CREATED_LABELS[filters.created] + ' ▾'}
      </button>
      <div id="tf-cr-drop" style={dropStyle(210, { display: dd.open ? 'block' : 'none' })}>
        <div style={dropHead}>
          <span>Filter by creation date</span>
          <span style={clearLink} onClick={() => update({ created: 'all', createdFrom: '', createdTo: '' })}>Clear</span>
        </div>
        <div id="tf-cr-options">
          {CREATED_OPTIONS.map(([val, label]) => (
            <div
              key={val}
              className="cr-opt"
              data-val={val}
              onClick={() => update({ created: val })}
              style={{
                padding: '5px 8px', borderRadius: 6, cursor: 'pointer', fontSize: '.75rem', transition: 'background .1s',
                background: filters.created === val ? 'var(--sf2)' : '', color: filters.created === val ? 'var(--ac2)' : 'var(--tx)',
              }}
            >
              {label}
            </div>
          ))}
        </div>
        <div
          id="tf-cr-custom-row"
          style={{ display: filters.created === 'custom' ? 'block' : 'none', marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--bd)' }}
        >
          <div style={{ fontSize: '.68rem', color: 'var(--txd)', marginBottom: 4 }}>From</div>
          <input type="date" id="tf-cr-from" aria-label="Created from" value={from} onChange={(e) => setFrom(e.target.value)} style={{ ...dateInput, marginBottom: 6 }} />
          <div style={{ fontSize: '.68rem', color: 'var(--txd)', marginBottom: 4 }}>To</div>
          <input type="date" id="tf-cr-to" aria-label="Created to" value={to} onChange={(e) => setTo(e.target.value)} style={{ ...dateInput, marginBottom: 8 }} />
          <button
            type="button" className="btn" style={{ width: '100%', fontSize: '.75rem' }}
            onClick={() => update({ created: 'custom', createdFrom: from, createdTo: to })}
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * The Board / Hierarchy controls in the Work toolbar: the Filters button, the legacy filter row
 * (project, search, category, assigned-to, priority, created, due), the Board <-> Hierarchy link and
 * Bulk edit. The filter row folds behind one button unless a filter is active (the Matrix audit measured
 * 322px of chrome before the first data cell). Every control writes the URL through `update`.
 */
export default function BoardFilters({ view, filters, options, activeCount, update, search, bulkOn, onBulk }) {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const showRow = filtersOpen || activeCount > 0;
  const other = view === 'hierarchy' ? { href: '/work/board', label: 'Kanban' } : { href: '/work/hierarchy', label: 'Hierarchy' };

  return (
    <>
      <button type="button" className={'btn b-gh tf-toggle' + (showRow ? ' on' : '')} id="tf-toggle" onClick={() => setFiltersOpen((o) => !o)}>
        {activeCount ? `Filters · ${activeCount}` : 'Filters'}
      </button>
      <Link className="btn b-gh tf-toggle" id="task-view-toggle" href={search ? `${other.href}?${search}` : other.href}>{other.label}</Link>
      <button type="button" className={'btn b-gh tf-toggle tf-bulk' + (bulkOn ? ' on' : '')} id="tf-bulk" aria-pressed={bulkOn} onClick={onBulk}>
        Bulk edit
      </button>
      <div className={'tbar-legacy' + (showRow ? '' : ' off')} id="tf-legacy">
        <select className="fsel" style={{ width: 130 }} id="tf-proj" aria-label="Project" value={filters.project} onChange={(e) => update({ project: e.target.value })}>
          <option value="">All Projects</option>
          {options.projects.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <SearchBox q={filters.q} onCommit={(q) => update({ q })} />
        <select className="fsel" style={{ width: 130 }} id="tf-cat" aria-label="Category" value={filters.category} onChange={(e) => update({ category: e.target.value })}>
          <option value="">All Categories</option>
          {options.categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <AssignedDropdown filters={filters} options={options} update={update} />
        <PriorityDropdown filters={filters} update={update} />
        <CreatedDropdown filters={filters} update={update} />
        <div className="fb">
          {DUE_BUTTONS.map(([val, label]) => (
            <button key={val} type="button" className={'fbb' + (filters.due === val ? ' active' : '')} onClick={() => update({ due: val })}>{label}</button>
          ))}
        </div>
      </div>
    </>
  );
}
