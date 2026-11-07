'use client';

import { Suspense } from 'react';
import { usePathname } from 'next/navigation';
import PipelineToolbar from '@/features/pipeline/PipelineToolbar.jsx';

/**
 * The Pipeline frame (old `#tab-leads` > `.tlay`): the toolbar above whichever sub-view is routed. The
 * toolbar reads the URL (filters are search params), which needs a Suspense boundary so the rest of the
 * tree can still be prerendered. A lead opened by its own URL (/pipeline/leads/<id>) has no toolbar.
 */
export default function PipelineLayout({ children }) {
  const pathname = usePathname() ?? '';
  const withToolbar = pathname === '/pipeline/board' || pathname === '/pipeline/table';
  return (
    <div className="tp active" id="tab-leads">
      <div className="tlay">
        {withToolbar ? (
          <Suspense fallback={null}>
            <PipelineToolbar />
          </Suspense>
        ) : null}
        {children}
      </div>
    </div>
  );
}
