'use client';

import { Suspense } from 'react';
import ScopePill from '@/features/work/ScopePill.jsx';
import SurfaceTabs from '@/features/work/SurfaceTabs.jsx';
import '@/features/work/work.css';

/**
 * The Work frame (old `#tab-tasks` > `.tlay` > `.tbar`): the scope control and the surface
 * switcher above whichever surface is routed. Both read the URL (`?scope=`, the pathname), which
 * needs a Suspense boundary so the rest of the tree can still be prerendered.
 */
export default function WorkLayout({ children }) {
  return (
    <div className="tp active" id="tab-tasks">
      <div className="tlay">
        <Suspense fallback={null}>
          <div className="tbar">
            <ScopePill />
            <SurfaceTabs />
          </div>
        </Suspense>
        {children}
      </div>
    </div>
  );
}
