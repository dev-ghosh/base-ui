'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import TodayPage from '../today/TodayPage.jsx';
import TriageOverlay from './TriageOverlay.jsx';

/** `?scope=mine|all` (default mine): whose overdue work Triage walks. */
function useScope() {
  return useSearchParams()?.get('scope') === 'all' ? 'all' : 'mine';
}

/** /today/triage intercepted into the @modal slot, over /today: closing goes back. */
export function TriageModalRoute() {
  const router = useRouter();
  return <TriageOverlay scope={useScope()} onClose={() => router.back()} />;
}

/** /today/triage on a direct visit: Today underneath, the overlay over it, closing lands on /today.
 *  An empty queue shows the overlay's empty state. */
export function TriagePageRoute() {
  const router = useRouter();
  return (
    <>
      <TodayPage />
      <TriageOverlay scope={useScope()} onClose={() => router.replace('/today')} />
    </>
  );
}
