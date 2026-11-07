'use client';

import { useRouter } from 'next/navigation';
import { allContactTags, contactTagClass } from '../../lib/tags.js';

/**
 * The card grid (`#cgrid`, contactCard): name, designation · organisation, the tag chips (click one to
 * filter by it), the first email and location, and the next step. Clicking a card opens the contact.
 */
export default function ContactCards({ rows, tasks, activeTags, onToggleTag, onScroll }) {
  const router = useRouter();
  const now = new Date();
  return (
    <div className="cgr" id="cgrid" onScroll={onScroll}>
      {rows.length ? rows.map((c) => (
        <div key={c.id} className="ccd" onClick={() => router.push(`/contacts/people/${c.id}`)}>
          <div className="ccn">{c.name || 'Unknown'}</div>
          <div className="cco">{c.designation || ''}{c.designation && c.org ? ' · ' : ''}{c.org || '—'}</div>
          <div className="bgs">
            {allContactTags(c, now, tasks).map((tag) => (
              <span
                key={tag}
                className={`auto-tag ${contactTagClass(c, tag, now, tasks)}${activeTags.includes(tag) ? ' tag-active' : ''}`}
                title={`Filter by '${tag}'`}
                onClick={(e) => { e.stopPropagation(); onToggleTag(tag); }}
              >{tag}</span>
            ))}
          </div>
          <div className="ccf">
            <span>{c.email ? '✉ ' + c.email.split(',')[0] : ''}</span>
            <span>{c.location || ''}</span>
          </div>
          {c.nextStep ? <div className="ccns">→ {c.nextStep}</div> : null}
        </div>
      )) : <div className="empty" style={{ gridColumn: '1/-1' }}>No contacts match</div>}
    </div>
  );
}
