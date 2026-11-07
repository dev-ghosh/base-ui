import { Suspense } from 'react';
import PipelineTable from '@/features/pipeline/PipelineTable.jsx';

// The table reads its filters and sort from the URL (useSearchParams), which needs a Suspense boundary so
// the rest of the tree can still be prerendered.
export default function Page() {
  return (
    <div className="twrap" style={{ height: 'calc(100% - 53px)', background: 'var(--bg)' }}>
      <Suspense fallback={null}>
        <PipelineTable />
      </Suspense>
    </div>
  );
}
