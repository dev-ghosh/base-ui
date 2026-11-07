'use client';

/**
 * The active-tags bar (`#tag-filter-bar`, renderTagFilterBar in js/tags.js): "Tag filter:" and one
 * removable chip per tag, with "Clear all ✕". Hidden while no tag is active. The tag set is owned by
 * the screen (Board and Hierarchy keep it in the `tg` search param); Contacts will reuse this bar.
 */
export default function TagFilterBar({ tags, onRemove, onClear }) {
  if (!tags.length) return null;
  return (
    <div
      id="tag-filter-bar"
      style={{
        display: 'flex', padding: '5px 20px', background: 'var(--acg)', borderBottom: '1px solid var(--ac-ring)',
        alignItems: 'center', gap: 8, flexWrap: 'wrap', flexShrink: 0, fontSize: '.72rem',
      }}
    >
      <span style={{ color: 'var(--txm)', fontWeight: 600 }}>Tag filter:</span>
      <div id="tag-filter-chips" style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
        {tags.map((tag) => (
          <span key={tag} className="tag-chip">
            {tag}
            <button type="button" className="tag-chip-x" title="Remove filter" onClick={() => onRemove(tag)}>✕</button>
          </span>
        ))}
      </div>
      <button type="button" className="btn b-gh" style={{ fontSize: '.68rem', padding: '2px 8px', marginLeft: 'auto' }} onClick={onClear}>
        Clear all ✕
      </button>
    </div>
  );
}
