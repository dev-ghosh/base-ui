import { Suspense } from 'react';
import { TriagePageRoute } from '@/features/triage/TriageRoute.jsx';

// Direct visit (or refresh) of /today/triage. A soft navigation from Today is intercepted by
// @modal/(.)today/triage instead.
export default function Page() {
  return <Suspense fallback={null}><TriagePageRoute /></Suspense>;
}
