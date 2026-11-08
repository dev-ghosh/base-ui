'use client';

import { Suspense } from 'react';
import { useSelectedLayoutSegment } from 'next/navigation';
import TeamScreen from '@/features/team/TeamScreen.jsx';

/**
 * The Team frame. The screen (stats, filters, list, employee dialogs) lives here, not in the
 * cards/table pages, so switching between the two sub-views keeps the search box and an open
 * dialog. The screen reads the URL (filters are search params), which needs a Suspense boundary so
 * the rest of the tree can still be prerendered.
 */
export default function TeamLayout({ children }) {
  const segment = useSelectedLayoutSegment();
  // At /team itself (no sub-view yet) only the index page renders: it forwards to the right one.
  if (segment !== 'cards' && segment !== 'table') return children;
  return (
    <>
      <Suspense fallback={null}>
        <TeamScreen view={segment} />
      </Suspense>
      {children}
    </>
  );
}
