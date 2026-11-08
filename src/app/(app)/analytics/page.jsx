'use client';

import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ANALYTICS_TAB_KEY, tabOrDefault } from '@/features/analytics/model.js';

/**
 * /analytics is an index route: it goes to the default tab (docs/route-inventory.md section 12.1),
 * the one last used (the old `localStorage.rie_an_tab`; unknown values mean `overview`). Filters in
 * the address are kept.
 */
function Forward() {
  const router = useRouter();
  const search = useSearchParams()?.toString() ?? '';
  useEffect(() => {
    let stored = null;
    try { stored = localStorage.getItem(ANALYTICS_TAB_KEY); } catch { /* ignore */ }
    router.replace(`/analytics/${tabOrDefault(stored)}${search ? `?${search}` : ''}`);
  }, [router, search]);
  return null;
}

export default function Page() {
  return <Suspense fallback={null}><Forward /></Suspense>;
}
