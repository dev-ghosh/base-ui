'use client';

import { SCOPES, SCOPE_LABEL } from '../../lib/scope.js';
import { useScope } from './hooks/useScope.js';

/**
 * The Mine · Team · Everyone pill (renderScopePill in js/work.js). Counts are open tasks
 * (buildQueue), the same definition Today and Triage use, so the number on the pill is the
 * number Today shows. The count is the honest fold: always visible even when the cards are not.
 */
export default function ScopePill() {
  const { scope, setScope, counts, mineUnavailable } = useScope();
  return (
    <div className="mx-seg work-scope" id="work-scope" role="tablist" aria-label="Whose work">
      {SCOPES.map((s) => {
        const disabled = s === 'mine' && mineUnavailable;
        return (
          <button
            key={s}
            type="button"
            role="tab"
            aria-selected={s === scope}
            className={s === scope ? 'on' : ''}
            disabled={disabled}
            title={disabled ? 'Your sign-in is not linked to a person yet. An admin can fix that under Account → Manage access.' : undefined}
            onClick={() => setScope(s)}
          >
            {SCOPE_LABEL[s]} <b>{counts[s]}</b>
          </button>
        );
      })}
    </div>
  );
}
