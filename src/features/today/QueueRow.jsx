'use client';

import { dueLabel } from '../../lib/format.js';

/**
 * A row you can act on, not just open (taskRow in the old today.js). The two things a
 * person actually does to a stale task are "it's done" and "not this week"; making both
 * cost one click here is the difference between a queue that gets worked and one that
 * gets looked at.
 *
 * A <div> rather than a <button>, because a button cannot legally contain the action
 * buttons and Safari drops the inner clicks entirely.
 *
 * Red is for P1 and overdue; everything else late is amber ("soft"), and it says the
 * date rather than shouting a day count.
 */
export default function QueueRow({ task: t, index, onOpen, onDone, onPushWeek, onKeyDown }) {
  const id = String(t.id);
  const meta = [t.company, t.func].filter(Boolean).join(' · ');
  return (
    <div
      className="td-row"
      tabIndex={0}
      role="button"
      data-id={id}
      data-idx={index}
      onClick={() => onOpen(id)}
      onKeyDown={(e) => onKeyDown(e, id)}
    >
      {t.priority === 'P1' ? <span className="td-p1">P1</span> : null}
      <span className="td-title">{t.title || 'Untitled'}</span>
      <span className="td-meta">{meta}</span>
      {t.overdue
        ? <span className={'td-late' + (t.priority === 'P1' ? '' : ' soft')}>{dueLabel(t.due_date)}</span>
        : <span className="td-due">{dueLabel(t.due_date)}</span>}
      <span className="td-acts">
        <button type="button" className="td-ax" title="Mark done (D)"
          onClick={(e) => { e.stopPropagation(); onDone(id); }}>✓</button>
        <button type="button" className="td-ax" title="Push a week (2)"
          onClick={(e) => { e.stopPropagation(); onPushWeek(id); }}>→</button>
      </span>
    </div>
  );
}
