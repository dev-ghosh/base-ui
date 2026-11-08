'use client';

import { useCallback, useMemo, useRef } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { mergeTeamParams, parseTeamParams } from '../model.js';

/**
 * The Team filter row, held in the URL (see model.js): search, department, company, status.
 *
 *   filters        parsed from the search params on every change of the URL
 *   search         the raw query string (carried across the Cards / Table switch)
 *   update(patch)  replace the filter params; every other param is kept. Uses replace: the filters
 *                  are a view, not a place to go back to. Two updates in one tick compose.
 */
export function useTeamFilters() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const search = params?.toString() ?? '';
  const filters = useMemo(() => parseTeamParams(search), [search]);

  const latest = useRef(search);
  latest.current = search;

  const update = useCallback((patch) => {
    const current = parseTeamParams(latest.current);
    const next = { ...current, ...patch };
    const qs = mergeTeamParams(latest.current, next);
    latest.current = qs;
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [router, pathname]);

  return { filters, search, update };
}
