import { Suspense } from 'react';
import DecideView from '@/features/work/decide/DecideView.jsx';

// Work > Decide, the `system` stream (a route segment, docs/route-inventory.md ruling 12.1). The scope comes
// from the URL (useSearchParams), which needs a Suspense boundary.
export default function Page() {
  return (
    <Suspense fallback={null}>
      <DecideView kind="system" />
    </Suspense>
  );
}
