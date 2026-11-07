'use client';

import { useCallback, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useStore } from '../../../store/useStore.js';
import { buildQueue } from '../../../lib/queue.js';
import { SCOPES, resolveScope, scopeCounts } from '../../../lib/scope.js';
import { currentOwnerCode } from '../../../lib/today.js';

/** The old localStorage key (js/work.js): same value, same meaning. */
export const SCOPE_KEY = 'rie_work_scope';

function readStored() {
  try { return localStorage.getItem(SCOPE_KEY); } catch { return null; }
}

/**
 * The Work scope: 'mine' | 'team' | 'everyone', one value for every surface under /work.
 *
 * Source of truth is the search param `?scope=` (docs/route-inventory.md ruling 12.5). Without
 * it the default is the stored `rie_work_scope`, then Mine for a sign-in bound to a person and
 * Everyone otherwise (resolveScope, as js/work.js getScope). A `mine` that cannot be honoured
 * because no owner code resolves (URL or storage) falls back to Everyone: a Mine that can never
 * be non-empty is not a default anyone asked for (F1, F8).
 *
 * { scope, setScope(s), counts: {mine, team, everyone}, me, urlScope, mineUnavailable }
 *   urlScope         the valid `?scope=` in the URL, or null (surface links carry it so it persists)
 *   mineUnavailable  no owner code resolves, so Mine is disabled
 */
export function useScope() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const access = useStore((s) => s.access);
  const tasks = useStore((s) => s.tasks);

  const me = currentOwnerCode(access);
  const asked = params?.get('scope') ?? null;
  const urlScope = SCOPES.includes(asked) ? asked : null;
  const scope = resolveScope(urlScope ?? readStored(), me);
  const counts = useMemo(() => scopeCounts(buildQueue(tasks), me), [tasks, me]);

  const search = params?.toString() ?? '';
  const setScope = useCallback((next) => {
    if (!SCOPES.includes(next) || (next === 'mine' && !me)) return;
    try { localStorage.setItem(SCOPE_KEY, next); } catch { /* ignore */ }
    const p = new URLSearchParams(search);
    p.set('scope', next);
    router.replace(`${pathname}?${p.toString()}`);
  }, [me, pathname, router, search]);

  return { scope, setScope, counts, me, urlScope, mineUnavailable: !me };
}
