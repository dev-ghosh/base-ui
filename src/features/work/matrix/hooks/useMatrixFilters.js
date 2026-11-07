'use client';

import { useCallback, useMemo, useRef } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { parseMatrixParams, mergeMatrixParams } from '../params.js';

/**
 * The Matrix filter state, held in the URL (see params.js).
 *
 *   filters            parsed from the search params on every change of the URL
 *   update(patch)      replace the Matrix params (a partial filters object, or (current) => partial);
 *                      every other param (the Work `scope`) is kept. Changes use replace, as the old
 *                      writeHash used replaceState: the filters are a view, not a place to go back to.
 *
 * Two updates in the same tick compose: each starts from the URL the previous one asked for.
 */
export function useMatrixFilters() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const search = params?.toString() ?? '';
  const filters = useMemo(() => parseMatrixParams(search), [search]);

  const latest = useRef(search);
  latest.current = search;

  const update = useCallback((patch) => {
    const current = parseMatrixParams(latest.current);
    const next = { ...current, ...(typeof patch === 'function' ? patch(current) : patch) };
    const qs = mergeMatrixParams(latest.current, next);
    latest.current = qs;
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [router, pathname]);

  return { filters, update };
}
