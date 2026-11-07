'use client';

import { useEffect, useRef, useState } from 'react';
import { Icon } from '../../../components/Icon.jsx';
import { dueCls, dueLabel } from '../../../lib/format.js';
import { isMine } from '../../../lib/scope.js';
import { convertTaskToLead } from '../../../lib/seams.js';
import { KB_CLOSED, KB_LIVE, KB_SHOW, MUTED_STATUSES, closedThisWeek } from './model.js';

const CLOSED_KEY = 'rie_board_closed';
const readClosedOpen = () => { try { return localStorage.getItem(CLOSED_KEY) === '1'; } catch { return false; } };

/**
 * One card (kbCard). Colour rule for the whole Work tab: red only when it is P1, overdue AND mine;
 * overdue alone is amber; a closed or paused task is never late. Delete lives in the edit form.
 */
export function KbCard({ t, ctx, onDragStart, onDragEnd }) {
  const { me, readOnly, bulk } = ctx;
  const dc = dueCls(t.nextFollowUp);
  const muted = MUTED_STATUSES.has(t.status);
  const late = dc === 'due-ov' && !muted;
  const fire = late && t.priority === 'P1' && isMine(t, me);
  const dueCl = late ? (fire ? ' kb-due-ov' : ' kb-due-to') : muted ? ' kb-due-mute' : '';
  const selected = bulk.selected.has(t.id);
  return (
    <div
      className={'kb-card' + (selected ? ' kb-sel-on' : '')}
      draggable={!readOnly}
      data-id={t.id}
      onClick={() => ctx.openTask(t.id)}
      onDragStart={(e) => onDragStart(e, t)}
      onDragEnd={onDragEnd}
    >
      {bulk.mode ? (
        <input
          type="checkbox" className="kb-sel" aria-label={'Select ' + (t.task || 'Untitled')} checked={selected}
          onClick={(e) => e.stopPropagation()} onChange={() => bulk.toggle(t.id)}
        />
      ) : null}
      <div className="kb-actions">
        <button type="button" className="kb-act-btn" title="Convert to lead" aria-label="Convert to lead"
          onClick={(e) => { e.stopPropagation(); convertTaskToLead(t.id); }}><Icon name="chart" size={14} /></button>
        <button type="button" className="kb-act-btn" title="Edit" aria-label="Edit"
          onClick={(e) => { e.stopPropagation(); ctx.editTask(t.id); }}><Icon name="pencil" size={14} /></button>
      </div>
      <div className="kb-task">
        {t.legacyTaskId ? <span className="kb-tnum">#{t.legacyTaskId}</span> : null}
        {t.task || 'Untitled'}
      </div>
      <div className="kb-meta">
        <span className="kb-tag"><Icon name="user" size={12} />{t.assignedTo || 'Unassigned'}</span>
        <span className={'kb-tag' + dueCl}><Icon name="calendar" size={12} />{dueLabel(t.nextFollowUp, muted)}</span>
        {t.priority === 'P1' ? <span className={'kb-tag' + (fire ? ' kb-due-ov' : '')}>P1</span> : null}
      </div>
    </div>
  );
}

/**
 * Work > Board: the live columns (Pending, In Progress, On Hold) with eight cards each before a
 * "N more" fold, and closed work in a rail at the right that opens into its two columns. Cards drag
 * between columns (and onto the rail's Completed / Dropped buttons); the write is the shared status
 * write, so a failed one puts the card back. `list` is already scoped, filtered and ranked.
 */
export default function BoardView({ list, ctx }) {
  const [expanded, setExpanded] = useState(() => new Set());
  const [closedOpen, setClosedOpen] = useState(readClosedOpen);
  const [over, setOver] = useState(null);
  const [dragging, setDragging] = useState(false);
  const drag = useRef({ id: null, source: null });

  // The rail's drop buttons are only revealed while a card is in flight (body.kb-dragging in the old CSS).
  useEffect(() => {
    document.body.classList.toggle('kb-dragging', dragging);
    return () => document.body.classList.remove('kb-dragging');
  }, [dragging]);

  const toggleClosed = () => {
    const next = !closedOpen;
    try { localStorage.setItem(CLOSED_KEY, next ? '1' : '0'); } catch { /* ignore */ }
    setClosedOpen(next);
  };

  const onDragStart = (e, t) => {
    drag.current = { id: t.id, source: t.status };
    setDragging(true);
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', t.id);
    }
  };
  const onDragEnd = () => { setDragging(false); setOver(null); };
  const onDragOver = (e, key) => {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    setOver(key);
  };
  const onDragLeave = (key) => setOver((o) => (o === key ? null : o));
  const onDrop = (e, newStatus) => {
    e.preventDefault();
    setOver(null);
    setDragging(false);
    const { id, source } = drag.current;
    if (!id || newStatus === source) return;
    drag.current = { id: null, source: null };
    ctx.setStatus(id, newStatus, { notes: 'Kanban drag-drop', rollUp: true });
  };

  const column = (col) => {
    const cards = list.filter((t) => t.status === col.status);
    const shown = expanded.has(col.status) ? cards : cards.slice(0, KB_SHOW);
    const more = cards.length - shown.length;
    return (
      <div
        key={col.status}
        className={`kb-col ${col.cls}${over === col.status ? ' drag-over' : ''}`}
        data-status={col.status}
        onDragOver={(e) => onDragOver(e, col.status)}
        onDragLeave={() => onDragLeave(col.status)}
        onDrop={(e) => onDrop(e, col.status)}
      >
        <div className="kb-col-hdr">
          <span>{col.status}</span>
          <span className="kb-cnt">{cards.length}</span>
        </div>
        <div className="kb-cards">
          {shown.length
            ? shown.map((t) => <KbCard key={t.id} t={t} ctx={ctx} onDragStart={onDragStart} onDragEnd={onDragEnd} />)
            : <div className="kb-empty">Nothing here</div>}
          {more ? (
            <button type="button" className="kb-more" onClick={() => setExpanded((s) => new Set(s).add(col.status))}>{more} more</button>
          ) : null}
        </div>
      </div>
    );
  };

  const closedN = list.filter((t) => t.status === 'Completed' || t.status === 'Dropped').length;
  const week = closedThisWeek(list);
  return (
    <>
      {KB_LIVE.map(column)}
      {closedOpen ? (
        <>
          {KB_CLOSED.map(column)}
          <button type="button" className="kb-rail kb-rail-close" title="Fold closed work" onClick={toggleClosed}>‹</button>
        </>
      ) : (
        // The rail is also a drop target: while a card is in flight it offers the two closed statuses as buttons.
        <div
          className={'kb-rail' + (over === 'rail' ? ' drag-over' : '')}
          title="Show closed work"
          onClick={toggleClosed}
          onDragOver={(e) => onDragOver(e, 'rail')}
          onDragLeave={() => onDragLeave('rail')}
        >
          <span className="kb-rail-n">✓ {closedN} closed</span>
          {week ? <span className="kb-rail-w">{week} this week</span> : null}
          <span className="kb-rail-drop">
            {KB_CLOSED.map((c) => (
              <button
                key={c.status}
                type="button"
                data-status={c.status}
                className={over === 'rail:' + c.status ? 'drag-over' : undefined}
                onDragOver={(e) => onDragOver(e, 'rail:' + c.status)}
                onDragLeave={() => onDragLeave('rail:' + c.status)}
                onDrop={(e) => { e.stopPropagation(); onDrop(e, c.status); }}
              >
                {c.status}
              </button>
            ))}
          </span>
        </div>
      )}
    </>
  );
}
