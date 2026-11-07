'use client';

import { useEffect, useRef, useState } from 'react';
import {
  STATUSES, LIVE_PRESET, CLOSED_PRESET, SEARCH_DEBOUNCE_MS, statusColor,
} from './model.js';
import { peopleNames } from '../../../lib/mappers.js';

/** The search box: typing is debounced into `q=`; the URL changing elsewhere (Reset) rewrites the box. */
function SearchBox({ q, resetKey, onCommit }) {
  const [value, setValue] = useState(q);
  const written = useRef(q);
  const timer = useRef(null);

  useEffect(() => {
    if (q !== written.current) { written.current = q; setValue(q); }
  }, [q]);
  const lastKey = useRef(resetKey);
  useEffect(() => {
    if (lastKey.current === resetKey) return;       // only a Reset, not the first render
    lastKey.current = resetKey;
    clearTimeout(timer.current);
    written.current = '';
    setValue('');
  }, [resetKey]);
  useEffect(() => () => clearTimeout(timer.current), []);

  const onChange = (e) => {
    const v = e.target.value;
    setValue(v);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => { written.current = v; onCommit(v); }, SEARCH_DEBOUNCE_MS);
  };
  return <input className="mx-search" id="mx-q" placeholder="Search tasks..." value={value} onChange={onChange} aria-label="Search" />;
}

/**
 * Status presets and chips, owner / priority / search, overdue-only, needs-review, Reset
 * (renderFilterBar in the old matrix.js). Every control writes the URL through `update`.
 */
export default function FilterBar({ model, filters, scope, theme, update }) {
  const [resetKey, setResetKey] = useState(0);
  const on = (s) => filters.statuses.includes(s);

  const toggleStatus = (s) => {
    const next = on(s) ? filters.statuses.filter((x) => x !== s) : [...filters.statuses, s];
    // Never allow an empty status set - that renders an empty matrix with no explanation,
    // so snap back to Live (spec 7.4).
    update({ statuses: next.length ? next : [...LIVE_PRESET] });
  };
  const reset = () => {
    setResetKey((k) => k + 1);
    // deliberately does not close an open drill (spec 7.4)
    update({ statuses: [...LIVE_PRESET], owner: '', priority: '', q: '', overdueOnly: false, reviewOnly: false });
  };

  const owners = peopleNames(model.ownerSource);   // everyone onboarded + legacy names

  return (
    <div className="mx-fbar">
      <div className="mx-frow">
        <span className="mx-lbl">Status</span>
        <div className="mx-seg">
          <button type="button" className={model.preset === 'live' ? 'on' : ''} onClick={() => update({ statuses: [...LIVE_PRESET] })}>Live</button>
          <button type="button" className={model.preset === 'all' ? 'on' : ''} onClick={() => update({ statuses: [...STATUSES] })}>All</button>
          <button type="button" className={model.preset === 'closed' ? 'on' : ''} onClick={() => update({ statuses: [...CLOSED_PRESET] })}>Closed</button>
        </div>
        <div className="mx-chips">
          {STATUSES.map((s) => {
            const checked = on(s);
            const sw = checked ? { background: statusColor(s, theme) } : { border: `1.5px dashed ${statusColor(s, theme)}` };
            return (
              <button key={s} type="button" className={'mx-chip' + (checked ? ' on' : '')} role="switch" aria-checked={checked} onClick={() => toggleStatus(s)}>
                <span className="mx-sw" style={sw}></span>
                <span className="mx-chip-l">{s}</span>
                <span className="mx-chip-n">{model.chipCounts[s]}</span>
              </button>
            );
          })}
        </div>
        <div className="mx-legend" aria-label="Status legend">
          {STATUSES.map((s) => <span key={s}><i style={{ background: statusColor(s, theme) }}></i>{s}</span>)}
        </div>
      </div>
      <div className="mx-frow">
        {scope === 'mine' ? null : (
          <select className="mx-sel" aria-label="Owner" value={filters.owner} onChange={(e) => update({ owner: e.target.value })}>
            <option value="">Anyone</option>
            {owners.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        )}
        <select className="mx-sel" aria-label="Priority" value={filters.priority} onChange={(e) => update({ priority: e.target.value })}>
          <option value="">Any</option>
          {model.prios.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <SearchBox q={filters.q} resetKey={resetKey} onCommit={(q) => update({ q })} />
        <label className="mx-check"><input type="checkbox" checked={filters.overdueOnly} onChange={(e) => update({ overdueOnly: e.target.checked })} /> Overdue only</label>
        {model.reviewCount ? (
          <label className="mx-check"><input type="checkbox" checked={filters.reviewOnly} onChange={(e) => update({ reviewOnly: e.target.checked })} /> Needs review</label>
        ) : null}
        <button type="button" className="mx-reset" onClick={reset}>Reset</button>
      </div>
    </div>
  );
}
