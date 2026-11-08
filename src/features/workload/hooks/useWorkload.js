'use client';

import { useMemo } from 'react';
import { useStore } from '../../../store/useStore.js';
import { computeWorkload } from '../../../lib/workload.js';

/** One row per person with open work, most loaded first; derived at render time from the store. */
export function useWorkload() {
  const tasks = useStore((s) => s.tasks);
  const people = useStore((s) => s.people);   // owner codes come from the people list
  return useMemo(() => computeWorkload(tasks), [tasks, people]);
}
