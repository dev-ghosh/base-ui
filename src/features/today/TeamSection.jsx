'use client';

import { personName } from '../../lib/mappers.js';

/**
 * The collapsed Team section: one row per other owner, then "Nobody" for unowned work.
 * Open when nothing of mine is overdue (the old `<details class="td-team">`).
 * A row leads to the Matrix filtered to that person (todayGoto 'owner' / 'unowned').
 */
export default function TeamSection({ team, unowned, open, onOwner, onUnowned }) {
  return (
    <details className="td-team" open={open}>
      <summary>Team{unowned.length ? ` · ${unowned.length} unowned` : ''}</summary>
      {team.map((r) => (
        <button type="button" className="td-row" key={r.owner} onClick={() => onOwner(r.owner)}>
          <span className="td-title">{personName(r.owner) || r.owner}</span>
          <span className="td-meta">{r.open} open</span>
          <span className="td-late">{r.overdue} late</span>
        </button>
      ))}
      {unowned.length ? (
        <button type="button" className="td-row" onClick={onUnowned}>
          <span className="td-title">Nobody</span>
          <span className="td-meta">{unowned.length} open</span>
          <span className="td-late">{unowned.filter((t) => t.overdue).length} late</span>
        </button>
      ) : null}
    </details>
  );
}
