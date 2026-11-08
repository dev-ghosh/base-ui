'use client';

import Modal from '../../components/Modal.jsx';
import { useModal } from '../../hooks/useModal.js';
import { activityKind, timeAgo } from '../../lib/activity.js';
import { useActivityFeed } from './hooks/useActivityFeed.js';

/** The id the sidebar item opens (openMo('mo-activity')). */
export const ACTIVITY_MODAL_ID = 'mo-activity';

/** The panel body (old renderActivityFeedPanel): the stream header and one row per event. */
export function ActivityPanel({ feed, now }) {
  if (!feed.length) {
    return <div style={{ padding: '28px', textAlign: 'center', color: 'var(--txd)' }}>No recent activity recorded yet.</div>;
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontFamily: 'inherit' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px', padding: '0 2px' }}>
        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--txm)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Live Audit Stream ({feed.length})</span>
        <span style={{ fontSize: '0.7rem', color: 'var(--txd)' }}>Auto-syncs on every action</span>
      </div>

      {feed.map((a, i) => {
        const { isCompleted, dotColor } = activityKind(a);
        return (
          <div key={`${a.id}:${i}`} style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', padding: '12px 14px', background: 'var(--sf2)', borderRadius: 'var(--rs)', border: '1px solid var(--bd)' }}>
            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: dotColor, marginTop: '5px', flexShrink: 0 }} />
            <div style={{ flex: 1, fontSize: '0.82rem', lineHeight: 1.45 }}>
              <span style={{ fontWeight: 600, color: 'var(--tx)' }}>{a.person}</span>
              <span style={{ color: 'var(--txm)' }}> {a.action} </span>
              <span style={{ fontWeight: 600, color: 'var(--tx)' }}>{a.target}</span>
              <div style={{ fontSize: '0.7rem', color: 'var(--txd)', marginTop: '3px', display: 'flex', gap: '8px', alignItems: 'center' }}>
                <span>{timeAgo(a.time, now)}</span>
                {isCompleted ? <span style={{ color: 'var(--ac)', fontWeight: 700, fontSize: '0.68rem', background: 'var(--acg)', padding: '1px 6px', borderRadius: 'var(--rt)' }}>Done</span> : null}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Body() {
  const { feed, now } = useActivityFeed();
  return <div id="activity-feed-content" style={{ maxHeight: '65vh', overflowY: 'auto' }}><ActivityPanel feed={feed} now={now} /></div>;
}

/**
 * Real-time Activity Timeline (old mo-activity), opened by the sidebar's "Activity" item. An overlay
 * (component state), not a route.
 */
export default function ActivityModal() {
  const { hide } = useModal(ACTIVITY_MODAL_ID);
  return (
    <Modal id={ACTIVITY_MODAL_ID} title="Real-time Activity Timeline" maxWidth="580px">
      <Body />
      <div className="mf"><button type="button" className="btn b-gh" onClick={hide}>Close</button></div>
    </Modal>
  );
}
