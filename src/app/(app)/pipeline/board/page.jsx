import { Suspense } from 'react';
import PipelineBoard from '@/features/pipeline/PipelineBoard.jsx';

// The Kanban reads its filters from the URL (useSearchParams), which needs a Suspense boundary so the
// rest of the tree can still be prerendered.
export default function Page() {
  return (
    <div className="twrap" style={{ height: 'calc(100% - 53px)', background: 'var(--bg)' }}>
      <Suspense fallback={null}>
        <PipelineBoard />
      </Suspense>
    </div>
  );
}
