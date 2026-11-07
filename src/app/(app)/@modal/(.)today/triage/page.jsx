import { Suspense } from 'react';
import { TriageModalRoute } from '@/features/triage/TriageRoute.jsx';

// Triage over /today on a soft navigation (the real URL is /today/triage[?scope=all]).
export default function Page() {
  return <Suspense fallback={null}><TriageModalRoute /></Suspense>;
}
