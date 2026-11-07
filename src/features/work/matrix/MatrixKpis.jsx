'use client';

/**
 * The KPI row (renderKpis). Tiles are numbers in neutral ink; the label carries the meaning.
 * Under scope Mine the row is about my week; Unowned and P1 are team facts. Needs review and
 * Untagged are the two tiles that open the drill.
 */
export default function MatrixKpis({ model, onDrill }) {
  return (
    <div className="mx-kpis">
      {model.kpis().map((t) => {
        const body = (
          <>
            <div className="mx-kpi-n" style={{ color: t.n ? 'var(--tx)' : 'var(--txd)' }}>{t.n}</div>
            <div className="mx-kpi-l">{t.label}</div>
          </>
        );
        if (!t.drills) return <div key={t.k} className="mx-kpi">{body}</div>;
        return (
          <div
            key={t.k}
            className="mx-kpi clickable"
            tabIndex={0}
            role="button"
            onClick={(e) => onDrill('', '', t.k, e.currentTarget)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onDrill('', '', t.k, e.currentTarget); }
            }}
          >
            {body}
          </div>
        );
      })}
    </div>
  );
}
