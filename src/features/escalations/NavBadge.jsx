'use client';

import { badgeText } from '../notifications/model.js';
import { useWaitingCount } from './hooks/useEscalations.js';

/**
 * The sidebar item's count (`.nv-badge[data-badge="escalations"]`): how many open escalations wait on me.
 * Neutral by the Work-tab colour rule: a count is not an alarm. Hidden at zero; "9+" above nine.
 */
export default function NavBadge({ kind }) {
  const n = useWaitingCount();
  const count = kind === 'escalations' ? n : 0;
  return <span className="nv-badge" data-badge={kind} hidden={count === 0}>{badgeText(count)}</span>;
}
