'use client';

import { useCallback, useMemo, useRef } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { mergeEventParams, parseEventParams } from '../model.js';

/**
 * The Events filter row, held in the URL (see model.js): search text, type and status.
 *
 *   filters            parsed from the search params on every change of the URL
 *   update(patch)      replace the filter params (a partial filters object); every other param is kept.
 *                      Changes use replace: the filters are a view, not a place to go back to.
 *
 * Two updates in the same tick compose: each starts from the URL the previous one asked for.
 */
export function useEventFilters() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const search = params?.toString() ?? '';
  const filters = useMemo(() => parseEventParams(search), [search]);

  const latest = useRef(search);
  latest.current = search;

  const update = useCallback((patch) => {
    const next = { ...parseEventParams(latest.current), ...patch };
    const qs = mergeEventParams(latest.current, next);
    latest.current = qs;
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [router, pathname]);

  return { filters, search, update };
}
