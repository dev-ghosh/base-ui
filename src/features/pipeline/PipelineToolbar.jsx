'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { SEARCH_DEBOUNCE_MS } from '../work/matrix/model.js';
import { LEAD_TYPES, filterQuery } from './model.js';
import { useLeadForm } from './hooks/useLeadForm.js';
import { usePipelineList } from './hooks/usePipelineList.js';

/** The search box: typing is debounced into `q=`; the URL changing elsewhere rewrites the box. */
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
  return <input className="sbi" style={{ width: 180, flex: 'none' }} id="lf-search" placeholder="Search leads…" value={value} onChange={onChange} />;
}

/**
 * The Pipeline toolbar (the old `#tab-leads .tbar`): search, type, owner, the Closed toggle, the
 * Kanban / Table switch and "+ Lead". Filters are search params (spec C7 rule 4); the Kanban / Table
 * switch is a link between the two sub-view routes, carrying the filters but not the table's sort.
 */
export default function PipelineToolbar() {
  const pathname = usePathname() ?? '';
  const { openAdd } = useLeadForm();
  const { filters, update, owners, nClosed } = usePipelineList();
  const onTable = pathname === '/pipeline/table' || pathname.startsWith('/pipeline/table/');
  const qs = filterQuery(filters);
  const other = onTable ? '/pipeline/board' : '/pipeline/table';
  const on = filters.showClosed;

  return (
    <div className="tbar">
      <SearchBox q={filters.q} onCommit={(q) => update({ q })} />
      <select className="fsel" style={{ width: 170 }} id="lf-type" aria-label="Type" value={filters.type} onChange={(e) => update({ type: e.target.value })}>
        <option value="">All Types</option>
        {LEAD_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
      </select>
      <select className="fsel" style={{ width: 140 }} id="lf-at" aria-label="Owner" value={filters.at} onChange={(e) => update({ at: e.target.value })}>
        <option value="">All Owners</option>
        {owners.map((n) => <option key={n} value={n}>{n}</option>)}
      </select>
      <button
        type="button" id="lead-closed-toggle" className="btn b-ol"
        style={{ fontSize: '.75rem', ...(on ? { borderColor: 'var(--ac)', color: 'var(--ac2)' } : {}) }}
        onClick={() => update({ showClosed: !on })}
      >
        {(on ? 'Hide closed' : 'Closed') + (nClosed ? ` (${nClosed})` : '')}
      </button>
      <Link id="lead-view-toggle" className="btn b-ol" style={{ fontSize: '.75rem', marginLeft: 'auto' }} href={qs ? `${other}?${qs}` : other}>
        {onTable ? 'Kanban' : 'Table'}
      </Link>
      <button type="button" className="btn b-pr" style={{ fontSize: '.75rem' }} onClick={openAdd}>+ Lead</button>
    </div>
  );
}
