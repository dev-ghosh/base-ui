'use client';

import { Suspense } from 'react';
import { useSelectedLayoutSegment } from 'next/navigation';
import { useSession } from '@/hooks/useSession.js';
import ProfileScreen from '@/features/profile/ProfileScreen.jsx';
import { isProfileSegment } from '@/features/profile/model.js';

/**
 * The Profile frame. The screen (title, section nav, the section) lives here, not in the segment
 * pages, so switching between sections keeps the page. It reads the URL (`?pair=1`), which needs a
 * Suspense boundary so the rest of the tree can still be prerendered.
 */
export default function ProfileLayout({ children }) {
  const segment = useSelectedLayoutSegment();
  const { session } = useSession();
  // At /profile itself (no section yet) only the index page renders: it forwards to the right one.
  if (!isProfileSegment(segment)) return children;
  return (
    <>
      <Suspense fallback={null}>
        <ProfileScreen segment={segment} session={session} />
      </Suspense>
      {children}
    </>
  );
}
