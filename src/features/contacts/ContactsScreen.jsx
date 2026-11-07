'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import TagFilterBar from '../../components/TagFilterBar.jsx';
import { store } from '../../store/store.js';
import { useStore } from '../../store/useStore.js';
import { bulkDeleteContacts, linkedTasksFor } from '../../lib/contact-actions.js';
import { SEARCH_DEBOUNCE_MS } from '../work/matrix/model.js';
import { PRIORITIES, bulkDeleteMessage, serializeContactParams } from './model.js';
import { useBulkSelection } from './hooks/useBulkSelection.js';
import { useContacts } from './hooks/useContacts.js';
import ContactCards from './ContactCards.jsx';
import ContactTable from './ContactTable.jsx';

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
  return <input className="sbi" id="csearch" placeholder="Search contacts…" value={value} onChange={onChange} />;
}

/** One of the sidebar's All-... selects. */
function FilterSelect({ id, label, all, value, options, onChange }) {
  return (
    <div>
      <div className="sl">{label}</div>
      <select className="fsel" id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{all}</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

/**
 * The Contacts screen (old `#tab-contacts`): the filter sidebar (a slide-out drawer on a phone), the
 * search bar with the count and the Cards / Table switch, the bulk bar, the list, and the "N of M /
 * Show more" footer. `view` is the routed sub-view ('table' | 'cards'). Filters, sort and the window
 * are search params (useContacts); the selection and the drawer are component state.
 */
export default function ContactsScreen({ view }) {
  const router = useRouter();
  const tasks = useStore((s) => s.tasks);
  const list = useContacts();
  const { filters, contacts, total, shown, hasMore, options, update, sortBy, showMore, toggleTag, clearTags } = list;
  const visibleIds = useMemo(() => contacts.map((c) => c.id), [contacts]);
  const bulk = useBulkSelection(visibleIds);
  const [drawer, setDrawer] = useState(false);
  const cards = view === 'cards';

  // The window starts over, at the top, when the filters or the sort change (the old filter signature).
  const sig = serializeContactParams({ ...filters, page: 1 });
  const lastSig = useRef(sig);
  useEffect(() => {
    if (sig !== lastSig.current) { lastSig.current = sig; document.getElementById(cards ? 'cgrid' : 'ctbl-wrap')?.scrollTo?.({ top: 0 }); }
  }, [sig, cards]);

  // Grow one screen early, so the list never visibly runs out under the thumb.
  const onScroll = (e) => {
    const w = e.currentTarget;
    if (hasMore && w.scrollTop + w.clientHeight >= w.scrollHeight - 400) showMore();
  };

  const go = (path) => router.push(list.hrefFor(path));

  const runBulkDelete = async () => {
    if (!bulk.size) return;
    const ids = [...bulk.selected];
    const known = store.getState().contacts;
    const names = ids.map((id) => known.find((x) => x.id === id)?.name ?? id);
    const linked = linkedTasksFor(ids);
    if (!window.confirm(bulkDeleteMessage(names, ids.length, linked.length))) return;
    if (await bulkDeleteContacts(ids)) bulk.clear();
  };

  return (
    <>
      <TagFilterBar tags={filters.tags} onRemove={toggleTag} onClear={clearTags} />
      <div className="tp active" id="tab-contacts">
        <div className="cl">
          <div className={'sb-overlay' + (drawer ? ' open' : '')} id="sb-overlay" onClick={() => setDrawer(false)}></div>
          <div className={'sb' + (drawer ? ' open' : '')} id="contacts-sb">
            <FilterSelect id="f-proj" label="Project" all="All Projects" value={filters.project} options={options.projects} onChange={(v) => update({ project: v })} />
            <div>
              <div className="sl">ABC</div>
              <div className="fb">
                {PRIORITIES.map((p) => (
                  <button key={p} type="button" className={'fbb' + (filters.priority === p ? ' active' : '')} onClick={() => update({ priority: filters.priority === p ? '' : p })}>{p}</button>
                ))}
              </div>
            </div>
            <FilterSelect id="f-cat" label="Category" all="All Categories" value={filters.category} options={options.categories} onChange={(v) => update({ category: v })} />
            <FilterSelect id="f-loc" label="Location" all="All Locations" value={filters.location} options={options.locations} onChange={(v) => update({ location: v })} />
          </div>
          <div className="cm">
            {bulk.size ? (
              <div id="bulk-bar" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 16px', background: 'var(--acg)', borderBottom: '1px solid var(--bd)', fontSize: '.78rem', flexShrink: 0 }}>
                <span><strong>{bulk.size}</strong> selected</span>
                <button type="button" className="btn b-dn" style={{ fontSize: '.72rem', padding: '3px 9px' }} onClick={runBulkDelete}>🗑 Delete selected</button>
                <button type="button" className="btn b-ol" style={{ fontSize: '.72rem', padding: '3px 9px' }} onClick={bulk.clear}>✕ Clear</button>
              </div>
            ) : null}
            <div className="cbar">
              <button type="button" className="filter-toggle" onClick={() => setDrawer((o) => !o)}>☰ Filters</button>
              <SearchBox q={filters.q} onCommit={(q) => update({ q })} />
              <span className="cct" id="ccount">{total} contacts</span>
              <div className="view-toggle">
                <button type="button" className={'vt-btn' + (cards ? ' active' : '')} id="vt-card" onClick={() => go('/contacts/cards')} title="Card view">⊞</button>
                <button type="button" className={'vt-btn' + (cards ? '' : ' active')} id="vt-table" onClick={() => go('/contacts/table')} title="Table view">☰</button>
              </div>
            </div>
            {cards ? (
              <ContactCards rows={contacts} tasks={tasks} activeTags={filters.tags} onToggleTag={toggleTag} onScroll={onScroll} />
            ) : (
              <ContactTable rows={contacts} sort={filters.sort} onSort={sortBy} bulk={bulk} onScroll={onScroll} />
            )}
            {total ? (
              <div id="c-pagination" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '10px 16px', fontSize: '.75rem', color: 'var(--txd)', borderTop: '1px solid var(--bd)', flexShrink: 0 }}>
                {hasMore ? (
                  <>
                    <span>{shown} of {total}</span>
                    <button type="button" className="btn b-ol" style={{ padding: '3px 10px', fontSize: '.72rem' }} onClick={showMore}>Show more</button>
                  </>
                ) : <span>All {total} contacts</span>}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </>
  );
}
