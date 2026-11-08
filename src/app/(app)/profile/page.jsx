'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { readStoredSegment } from '@/features/profile/model.js';

/**
 * /profile is an index route: it goes to the section last used (the old localStorage key
 * `rie_profile_tab`), else Profile (`general`). The query string goes along, so `/profile?pair=1`
 * still opens the "Sign in another device" overlay.
 */
export default function Page() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/profile/' + readStoredSegment() + window.location.search);
  }, [router]);
  return null;
}
