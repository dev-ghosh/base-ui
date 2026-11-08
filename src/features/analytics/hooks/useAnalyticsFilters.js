'use client';

import { useCallback, useMemo, useRef } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { mergeAnalyticsParams, parseAnalyticsParams } from '../model.js';

/**
 * The Analytics filters, held in the URL (see model.js): range, company, person.
 *
 *   filters        parsed from the search params on every change of the URL
 *   search         the raw query string (carried across the tab links)
 *   update(patch)  replace the filter params; every other param is kept. Uses replace: the filters
 *                  are a view, not a place to go back to. Two updates in one tick compose.
 *   reset()        back to the defaults (the old analyticsReset)
 */
export function useAnalyticsFilters() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const search = params?.toString() ?? '';
  const filters = useMemo(() => parseAnalyticsParams(search), [search]);

  const latest = useRef(search);
  latest.current = search;

  const write = useCallback((next) => {
    const qs = mergeAnalyticsParams(latest.current, next);
    latest.current = qs;
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [router, pathname]);

  const update = useCallback((patch) => write({ ...parseAnalyticsParams(latest.current), ...patch }), [write]);
  const reset = useCallback(() => write({ range: '30', company: 'ALL', person: 'ALL' }), [write]);

  return { filters, search, update, reset };
}
