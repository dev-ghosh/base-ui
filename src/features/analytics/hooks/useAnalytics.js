'use client';

import { useMemo } from 'react';
import { useStore } from '../../../store/useStore.js';
import { computeAnalytics } from '../../../lib/analytics.js';

/**
 * { data, loaded, updatedAt }: the numbers for these filters, derived at render time from the
 * tasks, leads and escalations in the store (never cached), so a realtime change or a local write
 * shows at once (the old page re-rendered on every renderAll() / realtime apply).
 * `updatedAt` is the time of the last recompute, the "Updated 10:42" in the header.
 */
export function useAnalytics(filters) {
  const tasks = useStore((s) => s.tasks);
  const leads = useStore((s) => s.leads);
  const escalations = useStore((s) => s.escalations);
  const loaded = useStore((s) => s.dataLoaded);
  const { company, person, range } = filters;

  const { data, updatedAt } = useMemo(() => ({
    data: computeAnalytics({ tasks, leads, escalations }, { company, person, range }),
    updatedAt: new Date(),
  }), [tasks, leads, escalations, company, person, range]);
  return { data, loaded, updatedAt };
}
