import { Suspense } from 'react';
import InitiativesView from '@/features/work/initiatives/InitiativesView.jsx';

// Initiatives reads the Work scope from the URL (useSearchParams), which needs a Suspense boundary so
// the rest of the tree can still be prerendered.
export default function Page() {
  return (
    <Suspense fallback={null}>
      <InitiativesView />
    </Suspense>
  );
}
