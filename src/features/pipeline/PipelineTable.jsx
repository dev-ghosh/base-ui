'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { dueCls, fmtD } from '../../lib/format.js';
import { fmtAmt, isClosedStage, nextSort, sortLeadsForTable } from './model.js';
import { usePipelineList } from './hooks/usePipelineList.js';

const COLUMNS = [
  ['Lead', 'title', 220], ['Type', 'type', 110], ['Stage', 'stage', 140], ['Org / Contact', 'org', 170],
  ['Amount', 'amount', 110], ['Deadline', 'deadline', 100], ['Next Follow-up', 'nextFollowUp', 120],
];

/**
 * /pipeline/table: the same leads as a table, sorted by a column header (search params `sort`, `dir`;
 * the default is last updated, newest first). Won and Lost rows only show behind "Closed".
 */
export default function PipelineTable() {
  const router = useRouter();
  const { filters, update, leads } = usePipelineList();
  const { sort, showClosed } = filters;
  const rows = useMemo(() => sortLeadsForTable(leads, sort, showClosed), [leads, sort, showClosed]);

  const th = ([label, col, w]) => (
    <th key={col} style={{ width: w }} onClick={() => update({ sort: nextSort(sort, col) })}>
      {label} <span className="sort-arrow">{sort.col === col ? (sort.dir === 1 ? '↑' : '↓') : '↕'}</span>
    </th>
  );

  return (
    <div className="kb-board" id="lead-board">
      <div style={{ width: '100%', overflow: 'auto' }}>
        <table className="ctbl">
          <thead>
            <tr>
              {COLUMNS.map(th)}
              <th style={{ width: 180 }}>Next Step</th>
              <th style={{ width: 100 }}>Owner</th>
              <th style={{ width: 60 }}>Pr</th>
            </tr>
          </thead>
          <tbody>
            {rows.length ? rows.map((l) => {
              const dc = dueCls(l.nextFollowUp);
              const fuColor = isClosedStage(l.stage) ? 'var(--txd)'
                : dc === 'due-ov' ? 'var(--hot)' : dc === 'due-to' ? 'var(--warm)' : 'var(--tx)';
              return (
                <tr key={l.id} style={{ cursor: 'pointer' }} onClick={() => router.push(`/pipeline/leads/${l.id}`)}>
                  <td style={{ fontWeight: 600 }}>{l.title || 'Untitled'}</td>
                  <td>{l.type}</td>
                  <td>{l.stage}</td>
                  <td>{l.org || ''}{l.contactName ? <div style={{ fontSize: '.7rem', color: 'var(--txm)' }}>{l.contactName}</div> : null}</td>
                  <td>{fmtAmt(l.amount)}</td>
                  <td>{l.deadline ? fmtD(l.deadline) : '—'}</td>
                  <td style={{ color: fuColor }}>{l.nextFollowUp ? fmtD(l.nextFollowUp) : '—'}</td>
                  <td style={{ fontSize: '.74rem', color: 'var(--txm)' }}>{l.nextStep || ''}</td>
                  <td>{l.assignedTo || ''}</td>
                  <td>{l.priority || ''}</td>
                </tr>
              );
            }) : (
              <tr><td colSpan={10} style={{ textAlign: 'center', color: 'var(--txd)', padding: 30 }}>No leads match the current filters.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
