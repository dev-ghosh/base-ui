'use client';

import Modal from '../../components/Modal.jsx';
import { useModal } from '../../hooks/useModal.js';
import { WORKLOAD_THRESHOLDS } from '../../lib/workload.js';
import { useWorkload } from './hooks/useWorkload.js';

/** The id the sidebar item opens (openMo('mo-workload')). */
export const WORKLOAD_MODAL_ID = 'mo-workload';

/** The panel body (old renderWorkloadPanel): the capacity line and one bar per person. */
export function WorkloadPanel({ list }) {
  if (!list.length) {
    return <div style={{ padding: '24px', textAlign: 'center', color: 'var(--txd)' }}>No active task distribution recorded.</div>;
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', fontFamily: 'inherit' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 2px' }}>
        <span style={{ fontSize: '0.75rem', color: 'var(--txm)' }}>Capacity standard: Max {WORKLOAD_THRESHOLDS.critical} open items</span>
        <span style={{ fontSize: '0.75rem', color: 'var(--txd)' }}>{list.length} Members Active</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {list.map((p) => (
          <div key={p.name} style={{ background: 'var(--sf2,rgba(255,255,255,0.03))', border: '1px solid var(--bd)', borderRadius: '10px', padding: '12px 14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontWeight: 600, fontSize: '0.86rem', color: 'var(--tx)' }}>{p.name}</span>
                <span style={{ fontSize: '0.68rem', padding: '2px 7px', borderRadius: '999px', background: p.statusBg, color: p.statusColor, fontWeight: 600 }}>{p.status}</span>
              </div>
              <div style={{ display: 'flex', gap: '10px', fontSize: '0.74rem' }}>
                {p.overdue > 0 ? <span style={{ color: 'var(--hot,#ef4444)', fontWeight: 600 }}>{p.overdue} Overdue</span> : null}
                {p.p1 > 0 ? <span style={{ color: 'var(--warm,#f97316)', fontWeight: 600 }}>{p.p1} P1</span> : null}
                <span style={{ color: 'var(--txm)' }}>{p.totalOpen} Open</span>
              </div>
            </div>
            <div style={{ width: '100%', height: '6px', background: 'var(--sf3,rgba(255,255,255,0.08))', borderRadius: '999px', overflow: 'hidden' }}>
              <div style={{ width: `${p.score}%`, height: '100%', background: p.barColor, transition: 'width 0.4s ease' }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Body() {
  const list = useWorkload();
  return <div id="workload-panel-content"><WorkloadPanel list={list} /></div>;
}

/**
 * Team Capacity & Workload Balance (old mo-workload), opened by the sidebar's "Team workload" item.
 * An overlay (component state), not a route. The body is mounted only while open, so the numbers
 * are worked out when it opens and follow the data while it stays open.
 */
export default function WorkloadModal() {
  const { hide } = useModal(WORKLOAD_MODAL_ID);
  return (
    <Modal id={WORKLOAD_MODAL_ID} title="Team Capacity & Workload Balance" wide maxWidth="680px">
      <Body />
      <div className="mf"><button type="button" className="btn b-gh" onClick={hide}>Close</button></div>
    </Modal>
  );
}
