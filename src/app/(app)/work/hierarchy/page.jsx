import { Suspense } from 'react';
import TaskSurface from '@/features/work/board/TaskSurface.jsx';

// Hierarchy reads its filters from the URL (useSearchParams), which needs a Suspense boundary so the
// rest of the tree can still be prerendered.
export default function Page() {
  return (
    <Suspense fallback={null}>
      <TaskSurface view="hierarchy" />
    </Suspense>
  );
}
