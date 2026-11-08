'use client';

import { useEffect, useMemo } from 'react';
import { useStore } from '../../../store/useStore.js';
import { loadTeam } from '../../../lib/team-actions.js';

/**
 * { employees, loaded, error, reload() }: the directory, loaded when the Team screen first uses it
 * (not at boot) and kept in the store. `error` is null, 'missing' (the migration has not been applied)
 * or the message of a failed load; `reload()` is the "Try again" button.
 */
export function useTeam() {
  const employees = useStore((s) => s.employees);
  const loaded = useStore((s) => s.teamLoaded);
  const error = useStore((s) => s.teamError);

  useEffect(() => {
    if (!loaded && !error) loadTeam();
  }, [loaded, error]);

  return useMemo(() => ({ employees, loaded, error, reload: () => loadTeam(true) }), [employees, loaded, error]);
}
