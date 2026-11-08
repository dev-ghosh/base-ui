'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { fmtD } from '../../lib/format.js';
import { SEARCH_DEBOUNCE_MS } from '../work/matrix/model.js';
import { EVENT_STATUSES, EVENT_TYPES, cardCounts, statusClass } from './model.js';
import { useEventFilters } from './hooks/useEventFilters.js';
import { useEvents } from './hooks/useEvents.js';

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
  return <input className="sbi" style={{ width: 200, flex: 'none' }} id="ev-search" placeholder="Search events…" value={value} onChange={onChange} />;
}

/** One card (an `.ev-card` of applyEF): type, title, when and where, RSVP counts, status. */
function EventCard({ ev, guests, onOpen }) {
  const counts = cardCounts(guests);
  return (
    <div
      className="ev-card" role="button" tabIndex={0} onClick={() => onOpen(ev.id)}
      onKeyDown={(e) => { if (e.key === 'Enter' && e.target === e.currentTarget) onOpen(ev.id); }}
    >
      <div className="ev-type">{ev.type}</div>
      <div className="ev-title">{ev.title}</div>
      <div className="ev-meta">{ev.date ? fmtD(ev.date) + ' ' + ev.time : 'No date set'}{ev.venue ? ' · ' + ev.venue : ''}</div>
      <div className="ev-rsvp">
        {counts.yes ? <span className="rsvp-y">✓ {counts.yes}{counts.plusOnes ? ' +' + counts.plusOnes : ''}</span> : null}
        {counts.no ? <span className="rsvp-n">✗ {counts.no}</span> : null}
        {counts.maybe ? <span className="rsvp-m">? {counts.maybe}</span> : null}
        {counts.pending ? <span className="rsvp-p">{counts.pending} pending</span> : null}
      </div>
      <div style={{ fontSize: '.68rem' }} className={statusClass(ev.status)}>{ev.status}</div>
    </div>
  );
}

const NO_GUESTS = [];

/**
 * The Events screen (old `#tab-events`): the search / type / status bar above a grid of event cards. The
 * three filters are search params (spec C7 rule 4); a card opens the event at /events/<id>.
 */
export default function EventsScreen() {
  const router = useRouter();
  const { filters, update } = useEventFilters();
  const { events, guestsByEvent } = useEvents(filters);
  const open = (id) => router.push(`/events/${id}`);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
      <div className="etbar">
        <SearchBox q={filters.q} onCommit={(q) => update({ q })} />
        <select className="fsel" style={{ width: 130 }} id="ev-type-f" aria-label="Type" value={filters.type} onChange={(e) => update({ type: e.target.value })}>
          <option value="">All Types</option>
          {EVENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select className="fsel" style={{ width: 130 }} id="ev-status-f" aria-label="Status" value={filters.status} onChange={(e) => update({ status: e.target.value })}>
          <option value="">All Statuses</option>
          {EVENT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      <div className="ev-grid" id="ev-grid">
        {events.length
          ? events.map((ev) => <EventCard key={ev.id} ev={ev} guests={guestsByEvent[ev.id] ?? NO_GUESTS} onOpen={open} />)
          : <div className="empty" style={{ gridColumn: '1/-1' }}>No events yet — click + Event to create one</div>}
      </div>
    </div>
  );
}
