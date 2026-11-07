'use client';

import { useEffect, useMemo } from 'react';
import { getSession } from '../lib/auth.js';
import { applyAccessMode, canWriteOf, isAdminOf, loadMyAccess, seesAssignedOnlyOf } from '../lib/access.js';
import { useStore } from '../store/useStore.js';

/**
 * What the signed-in user may do, from rie_my_access(). Reading it from any number of
 * components costs one request per sign-in (loadMyAccess shares it). Mirrors the
 * answer onto <html> as `ro` / `is-admin` / `scoped` (C15).
 */
export function useAccess() {
  const access = useStore((s) => s.access);
  const loaded = useStore((s) => s.accessLoaded);

  useEffect(() => {
    if (getSession()) loadMyAccess();
  }, []);

  useEffect(() => {
    applyAccessMode(access, loaded);
  }, [access, loaded]);

  return useMemo(() => ({
    canWrite: canWriteOf(access),
    isAdmin: isAdminOf(access),
    seesAssignedOnly: seesAssignedOnlyOf(access),
    access,
    loaded,
  }), [access, loaded]);
}
