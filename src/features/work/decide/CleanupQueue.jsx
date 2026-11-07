'use client';

import { useRouter } from 'next/navigation';
import { resolveCleanup } from '../../../lib/decide.js';

const pill = { fontSize: '.7rem', color: 'var(--txm)' };
const small = { fontSize: '.75rem', padding: '5px 12px' };

/**
 * The cleanup queue (renderCleanupQueue in js/entities.js): possible duplicate pairs. Lives under
 * Decide's BASE-health stream. View A / View B open the initiative viewer for each side.
 */
export default function CleanupQueue({ cleanups }) {
  const router = useRouter();
  const view = (id) => router.push(`/work/initiatives/${id}`);

  if (!cleanups.length) {
    return <div className="empty" style={{ padding: '16px 0', color: 'var(--gr)' }}>No duplicates detected ✓</div>;
  }
  return cleanups.map((c) => {
    const action = c.recommendedAction || 'merge';
    return (
      <div key={c.id} style={{ background: 'var(--sf)', border: '1px solid var(--bd)', borderRadius: 'var(--r)', padding: '14px 16px', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <span style={{ fontSize: '.7rem', background: 'var(--hotb)', color: 'var(--hot)', padding: '2px 7px', borderRadius: 4 }}>{Math.round(c.similarityScore * 100)}% similar</span>
          <span style={pill}>{c.confidence} confidence</span>
          {c.sameFront ? <span style={pill}>same front</span> : null}
          {c.sameOwner ? <span style={pill}>same owner</span> : null}
        </div>
        {c.sharedKeywords?.length ? (
          <div style={{ fontSize: '.75rem', color: 'var(--txd)', marginBottom: 8 }}>Keywords: {c.sharedKeywords.join(', ')}</div>
        ) : null}
        <div style={{ fontSize: '.78rem', color: 'var(--txm)', marginBottom: 10 }}>
          Recommended: <strong style={{ color: 'var(--tx)' }}>{c.recommendedAction || 'review'}</strong>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="btn b-gr" style={small} onClick={() => resolveCleanup(c.id, 'approved', action)}>✓ Resolve: {action}</button>
          <button type="button" className="btn b-ol" style={small} onClick={() => resolveCleanup(c.id, 'rejected', 'leave_alone')}>Leave alone</button>
          <button type="button" className="btn b-ol" style={small} onClick={() => view(c.entityAId)}>View A</button>
          <button type="button" className="btn b-ol" style={small} onClick={() => view(c.entityBId)}>View B</button>
        </div>
      </div>
    );
  });
}
