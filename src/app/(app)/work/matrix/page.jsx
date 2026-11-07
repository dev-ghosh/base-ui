import { Suspense } from 'react';
import MatrixPage from '@/features/work/matrix/MatrixPage.jsx';

// The Matrix reads its filters from the URL (useSearchParams), which needs a Suspense boundary
// so the rest of the tree can still be prerendered.
export default function Page() {
  return (
    <Suspense fallback={null}>
      <MatrixPage />
    </Suspense>
  );
}
