'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '../../components/Icon.jsx';
import { dueCls, fmtD } from '../../lib/format.js';
import { LEAD_STAGES, daysInStage, fmtAmt, isClosedStage, sortForBoard } from './model.js';
import { useLeadActions } from './hooks/useLeadActions.js';
import { useLeadForm } from './hooks/useLeadForm.js';
import { usePipelineList } from './hooks/usePipelineList.js';

/** One card (leadCard). */
function LeadCard({ l, dragging, onOpen, onEdit, onDelete, onDragStart, onDragEnd }) {
  const closed = isClosedStage(l.stage);
  const dc = dueCls(l.nextFollowUp);
  const dueCss = closed ? 'kb-due-mute' : dc === 'due-ov' ? 'kb-due-ov' : dc === 'due-to' ? 'kb-due-to' : 'kb-due-ok';
  const dis = daysInStage(l);
  const who = l.contactName || l.org;
  return (
    <div
      className={'kb-card' + (dragging ? ' dragging' : '')}
      draggable
      data-id={l.id}
      onClick={() => onOpen(l.id)}
      onDragStart={(e) => onDragStart(e, l)}
      onDragEnd={onDragEnd}
    >
      <div className="kb-actions">
        <button type="button" className="kb-act-btn" title="Edit" aria-label="Edit"
          onClick={(e) => { e.stopPropagation(); onEdit(l.id); }}><Icon name="pencil" size={14} /></button>
        <button type="button" className="kb-act-btn" style={{ color: 'var(--hot)' }} title="Delete" aria-label="Delete"
          onClick={(e) => { e.stopPropagation(); onDelete(l.id); }}><Icon name="trash" size={14} /></button>
      </div>
      <div className="kb-task">{l.title || 'Untitled'}</div>
      {who ? <div className="kb-contact">{who}{l.contactName && l.org ? ' · ' + l.org : ''}</div> : null}
      <div className="kb-meta">
        {l.nextFollowUp ? <span className={'kb-tag ' + dueCss}><Icon name="calendar" size={12} />{fmtD(l.nextFollowUp)}</span> : null}
        {l.type && l.type !== 'Other' ? <span className="kb-tag">{l.type}</span> : null}
        {l.amount != null ? <span className="kb-tag">{fmtAmt(l.amount)}</span> : null}
        {l.assignedTo ? <span className="kb-tag"><Icon name="user" size={12} />{l.assignedTo}</span> : null}
        {l.priority ? (
          <span className="kb-tag" style={{ fontWeight: 700, color: l.priority === 'P1' ? 'var(--hot)' : l.priority === 'P2' ? 'var(--warm)' : 'var(--txm)' }}>{l.priority}</span>
        ) : null}
        {dis != null && !closed ? <span className="kb-tag" style={dis >= 14 ? { color: 'var(--warm)' } : undefined}>{dis}d in stage</span> : null}
      </div>
      {l.nextStep ? <div className="kb-created" style={{ color: 'var(--txm)' }}>→ {l.nextStep}</div> : null}
      {l.deadline ? <div className="kb-created">Deadline {fmtD(l.deadline)}</div> : null}
    </div>
  );
}

/**
 * /pipeline/board: one column per stage (Won and Lost behind "Closed"), cards ordered by priority then
 * next follow-up, dragged between columns to change the stage. The move is optimistic and put back, with an
 * error in the status bar, if the write fails. Search, type, owner and "show closed" come from the URL.
 */
export default function PipelineBoard() {
  const router = useRouter();
  const { filters, byStage } = usePipelineList();
  const { moveStage } = useLeadActions();
  const { openEdit, confirmDelete } = useLeadForm();
  const [over, setOver] = useState(null);
  const [dragId, setDragId] = useState(null);
  const drag = useRef({ id: null, source: null });

  const onDragStart = (e, l) => {
    drag.current = { id: l.id, source: l.stage };
    setDragId(l.id);
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(l.id));
    }
  };
  const onDragEnd = () => { setDragId(null); setOver(null); };
  const onDragOver = (e, stage) => {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    setOver(stage);
  };
  const onDragLeave = (stage) => setOver((o) => (o === stage ? null : o));
  const onDrop = (e, newStage) => {
    e.preventDefault();
    setOver(null);
    const { id, source } = drag.current;
    if (id == null || newStage === source) return;
    drag.current = { id: null, source: null };
    moveStage(id, newStage);
  };

  const cols = LEAD_STAGES.filter((c) => filters.showClosed || !c.closed);
  return (
    <div className="kb-board" id="lead-board">
      {cols.map((col) => {
        const cards = sortForBoard(byStage[col.stage] || []);
        const total = cards.reduce((s, l) => s + (l.amount || 0), 0);
        return (
          <div
            key={col.stage}
            className={`kb-col ${col.cls}${over === col.stage ? ' drag-over' : ''}`}
            data-stage={col.stage}
            onDragOver={(e) => onDragOver(e, col.stage)}
            onDragLeave={() => onDragLeave(col.stage)}
            onDrop={(e) => onDrop(e, col.stage)}
          >
            <div className="kb-col-hdr">
              <span>{col.stage}</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {total ? <span style={{ fontSize: '.64rem', color: 'var(--txm)', fontWeight: 600, textTransform: 'none', letterSpacing: 0 }}>{fmtAmt(total)}</span> : null}
                <span className="kb-cnt">{cards.length}</span>
              </span>
            </div>
            <div className="kb-cards">
              {cards.length
                ? cards.map((l) => (
                  <LeadCard
                    key={l.id} l={l} dragging={dragId === l.id}
                    onOpen={(id) => router.push(`/pipeline/leads/${id}`)}
                    onEdit={openEdit}
                    onDelete={(id) => confirmDelete(id)}
                    onDragStart={onDragStart} onDragEnd={onDragEnd}
                  />
                ))
                : <div className="kb-empty">Drop leads here</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
