'use client';

import '@/features/analytics/analytics.css';
import { Suspense } from 'react';
import { useSelectedLayoutSegment } from 'next/navigation';
import AnalyticsScreen from '@/features/analytics/AnalyticsScreen.jsx';
import { TAB_KEYS } from '@/features/analytics/model.js';

/**
 * The Analytics frame. The screen (header, tabs, filters, the tab's cards and the drill dialog)
 * lives here, not in the four tab pages, so switching tabs keeps the filters and an open dialog.
 * It reads the URL (filters are search params), which needs a Suspense boundary so the rest of the
 * tree can still be prerendered.
 */
export default function AnalyticsLayout({ children }) {
  const segment = useSelectedLayoutSegment();
  // At /analytics itself (no tab yet) only the index page renders: it forwards to the right tab.
  if (!TAB_KEYS.includes(segment)) return children;
  return (
    <>
      <Suspense fallback={null}>
        <AnalyticsScreen tab={segment} />
      </Suspense>
      {children}
    </>
  );
}
