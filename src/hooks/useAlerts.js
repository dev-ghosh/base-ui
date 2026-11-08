'use client';

import { useMemo, useSyncExternalStore } from 'react';
import { useStore } from '../store/useStore.js';
import { alertsUi, readFor, seenFor } from '../features/notifications/alerts.js';
import { computeAlerts, todayIST } from '../features/notifications/model.js';

const useVersion = () => useSyncExternalStore(alertsUi.subscribe, () => alertsUi.getState().version, () => 0);

/**
 * My alerts, derived from the store: assigned to ME only (by person code, never team-wide, never by name).
 * `me` is the signed-in person's code; with none there are no alerts. Read-state changes (mark read, mark
 * all read) draw again through the alerts store's version.
 * @returns {object[]} alerts, most urgent first
 */
export function useAlerts(me) {
  const tasks = useStore((s) => s.tasks);
  const escalations = useStore((s) => s.escalations);
  const people = useStore((s) => s.people);
  const version = useVersion();
  const today = todayIST();
  return useMemo(
    () => (me ? computeAlerts({ me, tasks, escalations, people, today, ...seenFor(me) }) : []),
    // `version` stands for the localStorage lists read inside seenFor()
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [me, tasks, escalations, people, today, version],
  );
}

/** The alerts with the read list: { alerts, read: Set, unread: number }. */
export function useAlertState(me) {
  const alerts = useAlerts(me);
  const version = useVersion();
  return useMemo(() => {
    const read = me ? readFor(me) : new Set();
    return { alerts, read, unread: alerts.filter((a) => !read.has(a.key)).length };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alerts, me, version]);
}
