'use client';

import { useMemo, useSyncExternalStore } from 'react';
import { useStore } from '../../../store/useStore.js';
import { activityStore, buildActivityFeed, getStoredActivities } from '../../../lib/activity.js';

/**
 * { feed, now }: the activity feed (newest 60), derived at render time from the events recorded in
 * this browser, the tasks in the store and the contact history. Recording an event
 * (lib/activity.js recordActivity) redraws an open panel, as the old code did by hand.
 */
export function useActivityFeed() {
  const version = useSyncExternalStore(activityStore.subscribe, () => activityStore.getState().version, () => 0);
  const tasks = useStore((s) => s.tasks);
  const history = useStore((s) => s.history);
  return useMemo(() => {
    const now = new Date();
    return { feed: buildActivityFeed({ stored: getStoredActivities(), tasks, history, now }), now };
  }, [version, tasks, history]);
}
