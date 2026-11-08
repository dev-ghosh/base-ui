'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { TEAM_VIEW_KEY } from '@/features/team/model.js';

/**
 * /team is an index route: it goes to the default sub-view (docs/route-inventory.md section 12.1).
 * The default is the Cards view (the old 'grid'), unless the old localStorage key `rie_team_view`
 * says the person last used the Table.
 */
export default function Page() {
  const router = useRouter();
  useEffect(() => {
    let stored = null;
    try { stored = localStorage.getItem(TEAM_VIEW_KEY); } catch { /* ignore */ }
    router.replace(stored === 'table' ? '/team/table' : '/team/cards');
  }, [router]);
  return null;
}
