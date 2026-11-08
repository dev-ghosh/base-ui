'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useStore } from '@/store/useStore.js';
import { defaultView } from '@/features/escalations/model.js';

/**
 * /escalations is an index route: it goes to the default sub-view (docs/route-inventory.md section 12.1).
 * The default is dynamic, as in the old page: "Waiting on me" when anything waits on the signed-in person,
 * else "All open". It is decided once the escalations have loaded (not before: an empty list would always
 * say "All open").
 */
export default function Page() {
  const router = useRouter();
  const loaded = useStore((s) => s.escalationsLoaded);
  const escalations = useStore((s) => s.escalations);
  const me = useStore((s) => s.access?.person_code || null);

  useEffect(() => {
    if (loaded) router.replace(`/escalations/${defaultView(escalations, me)}`);
  }, [loaded, escalations, me, router]);

  return <div className="tp active" id="tab-escalations"></div>;
}
