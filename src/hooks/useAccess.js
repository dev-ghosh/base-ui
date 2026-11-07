'use client';

import { useEffect, useMemo } from 'react';
import { getSession } from '../lib/auth.js';
import { applyAccessMode, canWriteOf, isAdminOf, loadMyAccess, seesAssignedOnlyOf } from '../lib/access.js';
import { useStore } from '../store/useStore.js';

/**
 * What the signed-in user may do, from rie_my_access(). Reading it from any number of
 * components costs one request per sign-in (loadMyAccess shares it). Read-only: the
 * classes on <html> are applied once, by the shell, through useAccessMode().
 */
export function useAccess() {
  const access = useStore((s) => s.access);
  const loaded = useStore((s) => s.accessLoaded);

  useEffect(() => {
    if (getSession()) loadMyAccess();
  }, []);

  return useMemo(() => ({
    canWrite: canWriteOf(access),
    isAdmin: isAdminOf(access),
    seesAssignedOnly: seesAssignedOnlyOf(access),
    access,
    loaded,
  }), [access, loaded]);
}

/**
 * Mirror the answer onto <html> as `ro` / `is-admin` / `scoped` (C15). Call it once, in
 * the shell layout; the classes are removed again when the shell unmounts so nothing of
 * one user's rights lingers on /login.
 */
export function useAccessMode() {
  const access = useStore((s) => s.access);
  const loaded = useStore((s) => s.accessLoaded);

  useEffect(() => {
    applyAccessMode(access, loaded);
  }, [access, loaded]);

  useEffect(() => () => applyAccessMode(null, false), []);
}
